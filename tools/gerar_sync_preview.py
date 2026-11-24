#!/usr/bin/env python3
"""Gera SQL de substituição APENAS das tabelas de negócio no D1 Preview.
Não contém credenciais, não acessa Cloudflare, NÃO executa escrita remota.
As entradas são backups SQL feitos com `wrangler d1 export`.
"""
import argparse
import csv
import io
import json
import sqlite3
import sys
from pathlib import Path

TABLES = ('clients', 'properties', 'leads', 'lead_events', 'property_images')
DROP_ORDER = ('lead_events', 'leads', 'property_images', 'properties', 'clients')
INSERT_ORDER = ('clients', 'properties', 'leads', 'lead_events', 'property_images')


def sql_connection(path: Path):
    if not path.is_file() or path.stat().st_size < 30:
        raise ValueError(f'Arquivo SQL inexistente ou vazio: {path}')
    conn = sqlite3.connect(':memory:')
    conn.execute('PRAGMA foreign_keys = OFF')
    try:
        conn.executescript(path.read_text(encoding='utf-8-sig'))
    except sqlite3.Error as exc:
        raise ValueError(f'Backup SQL não pode ser lido pelo SQLite: {path.name}: {exc}') from exc
    finally:
        conn.execute('PRAGMA foreign_keys = ON')
    return conn


def cols(conn, table):
    exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    if not exists:
        raise ValueError(f'Tabela requerida ausente no backup: {table}')
    return [dict(name=r[1], type=r[2], nonnull=bool(r[3]), default=r[4], pk=r[5], hidden=r[6]) for r in conn.execute(f'PRAGMA table_xinfo("{table}")')]


def rows(conn, table, fields):
    col_sql = ','.join('"'+col+'"' for col in fields)
    return conn.execute(f'SELECT {col_sql} FROM "{table}" ORDER BY id').fetchall()


def lit(conn, value):
    return conn.execute('SELECT quote(?)', (value,)).fetchone()[0]


def check_fk(conn, label):
    problems=conn.execute('PRAGMA foreign_key_check').fetchall()
    if problems:
        raise ValueError(f'FK inválida no backup {label}: {len(problems)} inconsistência(s).')


def manifest(conn, name, out):
    data=conn.execute(f'SELECT object_key, content_type, size_bytes FROM property_images ORDER BY id').fetchall()
    for key, mime, size in data:
        if not isinstance(key,str) or not key.startswith('properties/') or '..' in key or '\\' in key or any(ord(ch)<32 for ch in key):
            raise ValueError(f'Chave R2 inválida no {name}: operação interrompida')
        if mime not in ('image/jpeg','image/webp') or not isinstance(size,int) or size<=0 or size>6291456:
            raise ValueError(f'Arquivo R2 com metadados inválidos no {name}')
    with out.open('w',encoding='utf-8',newline='') as f:
        writer=csv.writer(f)
        writer.writerow(['object_key','content_type','size_bytes'])
        writer.writerows(data)
    return len(data)


def active_rows(conn, table, fields):
    """Seleciona registros não excluídos logicamente. IDs originais são mantidos."""
    if 'deleted_at' not in fields:
        raise ValueError(f'Campo {table}.deleted_at ausente: filtro seguro indisponível')
    i = fields.index('deleted_at')
    return [r for r in rows(conn, table, fields) if r[i] is None]


def subset_by_reference(conn, table, fields, key, valid_ids):
    """Mantém apenas os dependentes dos registros incluídos no snapshot."""
    if key not in fields:
        raise ValueError(f'Campo {table}.{key} ausente: integridade não verificável')
    i = fields.index(key)
    return [r for r in rows(conn, table, fields) if r[i] in valid_ids]


def validate_lead_links(leads, lead_fields, client_ids, property_ids):
    ic = lead_fields.index('client_id')
    ip = lead_fields.index('property_id')
    for row in leads:
        client = row[ic]
        prop = row[ip]
        if client is not None and client not in client_ids:
            raise ValueError('Lead ATIVO aponta para cliente excluído/inexistente: interrompido sem desvincular')
        if prop is not None and prop not in property_ids:
            raise ValueError('Lead ATIVO aponta para imóvel excluído/inexistente: interrompido sem desvincular')


def manifest_rows(values, fields, name, out):
    key_i = fields.index('object_key')
    mime_i = fields.index('content_type')
    size_i = fields.index('size_bytes')
    data = [(r[key_i], r[mime_i], r[size_i]) for r in values]
    for key, mime, size in data:
        if not isinstance(key,str) or not key.startswith('properties/') or '..' in key or "\\" in key or any(ord(ch)<32 for ch in key):
            raise ValueError(f'Chave R2 inválida em {name}: operação interrompida')
        if mime not in ('image/jpeg','image/webp') or not isinstance(size,int) or size<=0 or size>6291456:
            raise ValueError(f'Objeto R2 com metadados inválidos em {name}')
    with out.open('w',encoding='utf-8',newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['object_key','content_type','size_bytes'])
        writer.writerows(data)
    return len(data)


def run(prod_file, preview_file, outdir, *, permitir_um_cliente=False,
        esperar_imoveis_ativos=None, esperar_leads_ativos=None, esperar_fotos=None):
    prod = sql_connection(prod_file)
    preview = sql_connection(preview_file)
    check_fk(prod,'Production')
    check_fk(preview,'Preview')

    # Bloqueia mudanças inesperadas no escopo das tabelas comerciais.
    allowed=set(TABLES) | {'d1_migrations','_cf_KV'}
    for label,db in [('Production',prod),('Preview',preview)]:
        others={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}-allowed
        if others:
            raise ValueError(f'Tabelas não reconhecidas no banco {label}: {sorted(others)}')

    fields_by_table = {}
    selected = {}
    counts_before = {}
    prod_totals = {}
    for table in TABLES:
        sc=[c for c in cols(prod,table) if c['hidden']==0]
        tc=[c for c in cols(preview,table) if c['hidden']==0]
        source_names={c['name'] for c in sc}
        target_names={c['name'] for c in tc}
        missing=source_names-target_names
        if missing:
            raise ValueError(f'Colunas de Production ausentes no Preview em {table}: {sorted(missing)}')
        for c in tc:
            if c['name'] not in source_names and c['nonnull'] and c['default'] is None and not c['pk']:
                raise ValueError(f'Coluna obrigatória sem default no Preview: {table}.{c["name"]}')
        fields_by_table[table]=[c['name'] for c in sc]
        prod_totals[table] = prod.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        counts_before[table] = preview.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]

    selected['clients']=active_rows(prod,'clients',fields_by_table['clients'])
    selected['properties']=active_rows(prod,'properties',fields_by_table['properties'])
    selected['leads']=active_rows(prod,'leads',fields_by_table['leads'])
    client_ids={r[fields_by_table['clients'].index('id')] for r in selected['clients']}
    property_ids={r[fields_by_table['properties'].index('id')] for r in selected['properties']}
    lead_ids={r[fields_by_table['leads'].index('id')] for r in selected['leads']}
    validate_lead_links(selected['leads'],fields_by_table['leads'],client_ids,property_ids)
    selected['lead_events']=subset_by_reference(prod,'lead_events',fields_by_table['lead_events'],'lead_id',lead_ids)
    selected['property_images']=subset_by_reference(prod,'property_images',fields_by_table['property_images'],'property_id',property_ids)
    counts={t:len(selected[t]) for t in TABLES}
    if counts['clients'] != 1 or not permitir_um_cliente:
        raise ValueError(f'Clientes ativos={counts["clients"]}; requer exatamente 1 e --permitir-um-cliente')
    for field, expected, table in [
        ('--esperar-imoveis-ativos',esperar_imoveis_ativos,'properties'),
        ('--esperar-leads-ativos',esperar_leads_ativos,'leads'),
        ('--esperar-fotos',esperar_fotos,'property_images'),
    ]:
        if expected is None:
            raise ValueError(f'Informe {field} explicitamente para impedir refresh com contagens inesperadas')
        if counts[table] != expected:
            raise ValueError(f'Contagem inesperada de {table}: {counts[table]}, esperado {expected}')
    if counts['properties']==0:
        raise ValueError('Nenhum imóvel ativo encontrado em Production')
    if counts['leads']==0:
        raise ValueError('Nenhum lead ativo encontrado; confira o backup de Production')

    sql=['-- APENAS D1 PREVIEW yolanda-crm-dev; NUNCA executar em yolanda-crm.',
         '-- Substitui SOMENTE cinco tabelas comerciais; preserva schema e d1_migrations.',
         '-- Copie previamente todos os arquivos do manifesto R2 para yolanda-imoveis-dev.',
         '-- O comando de apply pode ter efeito parcial se interrompido: mantenha backup válido.',
         '']
    for table in DROP_ORDER:
        sql.append(f'DELETE FROM "{table}";')
    sql.append('')
    for table in INSERT_ORDER:
        fields=fields_by_table[table]
        col_sql=', '.join(f'"{f}"' for f in fields)
        for vals in selected[table]:
            val_sql=', '.join(lit(prod,val) for val in vals)
            sql.append(f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql});')
    sql.append('')
    sql.append('PRAGMA foreign_key_check;')
    sql_content='\n'.join(sql)+'\n'

    # AUTOTESTE obrigatório antes de criar qualquer artefato final utilizável.
    clone=sql_connection(preview_file)
    try:
        clone.executescript(sql_content)
    except sqlite3.Error as exc:
        raise ValueError(f'Autoteste falhou. NÃO aplique ao D1 remoto: {exc}') from exc
    check_fk(clone,'resultado de sincronização')
    for table in TABLES:
        row_count=clone.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        if row_count != counts[table]:
            raise ValueError(f'Contagem divergente no autoteste em {table}: {row_count} != {counts[table]}')
        fields=fields_by_table[table]
        if rows(clone,table,fields) != selected[table]:
            raise ValueError(f'Conteúdo divergente no autoteste em {table}')
    clone.close()

    outdir.mkdir(parents=True,exist_ok=True)
    source_file=outdir/'SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql'
    r2_count=manifest_rows(selected['property_images'],fields_by_table['property_images'],
                           'imagens selecionadas',outdir/'r2_prod_manifest.csv')
    old_images=rows(preview,'property_images',fields_by_table['property_images'])
    old_count=manifest_rows(old_images,fields_by_table['property_images'],
                            'imagens antigas Preview',outdir/'r2_preview_antigo_manifest.csv')
    source_file.write_text(sql_content,encoding='utf-8')
    summary={
        'fonte':'Exportação SQL Production, leitura local',
        'destino':'Gerado offline; nenhuma escrita no Preview remoto',
        'clientes_producao_total':prod_totals['clients'],
        'clientes_ativos_selecionados':counts['clients'],
        'clientes_excluidos_omitidos':prod_totals['clients']-counts['clients'],
        'imoveis_producao_total':prod_totals['properties'],
        'imoveis_ativos_selecionados':counts['properties'],
        'imoveis_excluidos_omitidos':prod_totals['properties']-counts['properties'],
        'leads_producao_total':prod_totals['leads'],
        'leads_ativos_selecionados':counts['leads'],
        'leads_excluidos_omitidos':prod_totals['leads']-counts['leads'],
        'contagens_producao_selecionadas':counts,
        'contagens_preview_antes':counts_before,
        'fotos_r2_selecionadas':r2_count,
        'fotos_preview_anteriores':old_count,
        'integridade':'PASSOU: SQL aplicado a clone offline e foreign_key_check sem erros',
    }
    (outdir/'manifesto_sem_dados_pessoais.json').write_text(
        json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASSOU: autoteste SQL + integridade FK offline; sem escrita Cloudflare')
    print(f'Production: imóveis {prod_totals["properties"]} total / {counts["properties"]} ativos; '
          f'clientes {prod_totals["clients"]} total / {counts["clients"]} ativos; '
          f'leads {prod_totals["leads"]} total / {counts["leads"]} ativos')
    for name in TABLES:
        print(f'{name}: selecionados={counts[name]}, Preview antigo={counts_before[name]}')
    print(f'Imagens referenciadas no R2 para copiar: {r2_count}')
    print(f'Arquivos privados gerados em: {outdir}')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Gera script seguro de substituição só do banco D1 dev, a partir de backups')
    parser.add_argument('--production-export',required=True,type=Path)
    parser.add_argument('--preview-export',required=True,type=Path)
    parser.add_argument('--out-dir',required=True,type=Path)
    parser.add_argument('--permitir-um-cliente',action='store_true',
                        help='Autoriza copiar exatamente 1 cliente ATIVO de Production; ignora excluídos logicamente.')
    parser.add_argument('--esperar-imoveis-ativos',type=int,required=True)
    parser.add_argument('--esperar-leads-ativos',type=int,required=True)
    parser.add_argument('--esperar-fotos',type=int,required=True)
    args=parser.parse_args()
    try:
        run(args.production_export,args.preview_export,args.out_dir,permitir_um_cliente=args.permitir_um_cliente,
            esperar_imoveis_ativos=args.esperar_imoveis_ativos,esperar_leads_ativos=args.esperar_leads_ativos,
            esperar_fotos=args.esperar_fotos)
    except (ValueError,sqlite3.Error,FileNotFoundError) as exc:
        print('ERRO / NENHUM ARQUIVO DESTINO DEVE SER APLICADO:',exc,file=sys.stderr)
        sys.exit(2)
