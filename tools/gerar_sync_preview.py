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


def run(prod_file, preview_file, outdir, execute_selftest=True):
    outdir.mkdir(parents=True,exist_ok=True)
    prod=sql_connection(prod_file)
    preview=sql_connection(preview_file)
    check_fk(prod,'Production')
    check_fk(preview,'Preview')
    sql=['-- GERADO APENAS PARA O D1 PREVIEW yolanda-crm-dev',
         '-- Fonte: backup do Production, sem criar/modificar esquema e sem alterar d1_migrations.',
         '-- NÃO execute em yolanda-crm; inclua sempre --env preview --remote no wrangler.',
         '-- Fonte de verdade: Production. Primeiro COPIE os objetos R2 referenciados.',
         '-- Não há BEGIN/COMMIT: d1 execute --file pode processar em lotes.',
         '']
    pc={};pv={};table_fields={}
    allowed=set(TABLES) | {'d1_migrations','_cf_KV'}
    for label,db in [('Production',prod),('Preview',preview)]:
        others={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}-allowed
        if others: raise ValueError(f'Tabelas não reconhecidas no banco {label}: {sorted(others)}. Não é seguro substituir parcialmente.')
    for table in TABLES:
        sc=[c for c in cols(prod,table) if c['hidden']==0]
        tc=[c for c in cols(preview,table) if c['hidden']==0]
        source_names={c['name'] for c in sc}
        target_names={c['name'] for c in tc}
        missing = source_names - target_names
        if missing:
            raise ValueError(f'Colunas Production ausentes no Preview, tabela {table}: {sorted(missing)}')
        # Preview pode ter campos extras, como slug, desde que sejam opcionais ou tenham default.
        extras=[c for c in tc if c['name'] not in source_names]
        for c in extras:
            if c['nonnull'] and c['default'] is None and not c['pk']:
                raise ValueError(f'Coluna de Preview obrigatória sem default: {table}.{c["name"]}')
        fields=[c['name'] for c in sc]
        table_fields[table]=fields
        pc[table]=len(rows(prod,table,['id']))
        pv[table]=len(rows(preview,table,['id']))
    if pc['clients'] != 0: raise ValueError('Clientes de Production não estão vazios: interrompido para reavaliar escopo e LGPD.')
    if pc['properties'] != 3: raise ValueError(f'Production contém {pc["properties"]} imóveis, e não os 3 informados: reavaliar antes da sincronização.')
    for table in DROP_ORDER:
        sql.append(f'DELETE FROM "{table}";')
    sql.append('')
    for table in INSERT_ORDER:
        fields=table_fields[table]
        col_sql=', '.join(f'"{f}"' for f in fields)
        for values in rows(prod,table,fields):
            val_sql=', '.join(lit(prod,val) for val in values)
            sql.append(f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql});')
    sql.append('')
    sql.append('PRAGMA foreign_key_check;')
    out=(outdir/'SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql')
    out.write_text('\n'.join(sql)+'\n',encoding='utf-8')
    prod_photos=manifest(prod,'Production',outdir/'r2_prod_manifest.csv')
    preview_photos=manifest(preview,'Preview',outdir/'r2_preview_antigo_manifest.csv')
    if execute_selftest:
        # Mesma transformação aplicada somente ao snapshot local de Preview.
        clone=sql_connection(preview_file)
        try:
            clone.executescript(out.read_text(encoding='utf-8'))
        except sqlite3.Error as exc:
            raise ValueError(f'Autoteste falhou: não aplique ao D1 remoto. Motivo: {exc}') from exc
        check_fk(clone,'resultado gerado')
        for table in TABLES:
            count=clone.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            if count != pc[table]:
                raise ValueError(f'Contagem divergente em {table}: {count} vs {pc[table]}')
            fields=table_fields[table]
            if rows(clone,table,fields) != rows(prod,table,fields):
                raise ValueError(f'Dados divergentes em {table} após clone local')
        clone.close()
    summary={'fonte':'Production, somente leitura','destino':'Preview, não executado','tabelas':TABLES,'contagens_producao':pc,'contagens_preview_antes':pv,'fotos_producao':prod_photos,'fotos_preview_antes':preview_photos,'validacao':'PASSOU: clone e integridade FK em SQLite local'}
    (outdir/'manifesto_sem_dados_pessoais.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
    print('PASSOU: SQL gerado e aplicado ao snapshot local (nenhuma gravação Cloudflare).')
    for name in TABLES:
        print(f'{name}: Production={pc[name]}, Preview anterior={pv[name]}')
    print(f'Fotos R2 referenciadas: Production={prod_photos}; Preview anterior={preview_photos}')
    print(f'Saída privada: {outdir}')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Gera script seguro de substituição só do banco D1 dev, a partir de backups')
    parser.add_argument('--production-export',required=True,type=Path)
    parser.add_argument('--preview-export',required=True,type=Path)
    parser.add_argument('--out-dir',required=True,type=Path)
    args=parser.parse_args()
    try:
        run(args.production_export,args.preview_export,args.out_dir)
    except (ValueError,sqlite3.Error,FileNotFoundError) as exc:
        print('ERRO / NENHUM ARQUIVO DESTINO DEVE SER APLICADO:',exc,file=sys.stderr)
        sys.exit(2)
