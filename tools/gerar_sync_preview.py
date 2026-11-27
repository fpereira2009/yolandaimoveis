#!/usr/bin/env python3
"""Gera SQL de substituição APENAS das tabelas de negócio no D1 Preview.
Não contém credenciais, não acessa Cloudflare, NÃO executa escrita remota.
As entradas são backups SQL feitos com `wrangler d1 export`.
"""
import argparse
import csv
import json
import re
import sqlite3
import sys
import tempfile
from pathlib import Path

TABLES = ('clients', 'properties', 'leads', 'lead_events', 'property_images')
DROP_ORDER = ('lead_events', 'leads', 'property_images', 'properties', 'clients')
INSERT_ORDER = ('clients', 'properties', 'leads', 'lead_events', 'property_images')
ALIASES = 'image_url_aliases'
INTERNAL_TABLES = ('d1_migrations', '_cf_KV')
MEDIA_KEY = re.compile(r'properties/([0-9]+)/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(-thumb)?\.(webp|jpg)')


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


def table_exists(conn, table):
    return conn.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?", (table,)).fetchone() is not None


def alias_count(conn):
    return conn.execute('SELECT COUNT(*) FROM image_url_aliases').fetchone()[0] if table_exists(conn, ALIASES) else 0


def schema_signature(conn):
    tables = (*TABLES, ALIASES)
    metadata = [(conn.execute(f'PRAGMA table_xinfo("{table}")').fetchall(),
                 conn.execute(f'PRAGMA foreign_key_list("{table}")').fetchall()) for table in tables]
    definitions = conn.execute(
        "SELECT type, name, sql FROM sqlite_schema WHERE type IN ('table','index','trigger') "
        "AND sql IS NOT NULL AND tbl_name IN ('clients','properties','leads',"
        "'lead_events','property_images','image_url_aliases')"
    ).fetchall()
    return metadata, sorted((kind, name, ' '.join(sql.split())) for kind, name, sql in definitions)


def validate_schema(conn, label, versions):
    allowed = set(TABLES) | {ALIASES, *INTERNAL_TABLES}
    others = {row[0] for row in conn.execute(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*'"
    )} - allowed
    if others:
        raise ValueError(f'Tabelas não reconhecidas no banco {label}: {sorted(others)}')
    actual = schema_signature(conn)
    reference = sqlite3.connect(':memory:')
    try:
        for migration in sorted((Path(__file__).resolve().parents[1] / 'migrations').glob('*.sql')):
            revision = int(migration.name.split('_', 1)[0])
            if revision > max(versions):
                break
            reference.executescript(migration.read_text(encoding='utf-8-sig'))
            if revision in versions and schema_signature(reference) == actual:
                return
    finally:
        reference.close()
    raise ValueError(f'Schema incompatível em {label}; revisões aceitas: {versions}')


def internal_snapshot(conn):
    return {table: sorted(conn.execute(f'SELECT * FROM "{table}"').fetchall(), key=repr)
            for table in INTERNAL_TABLES if table_exists(conn, table)}


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


def media_inventory(values, fields, name):
    data, keys = [], set()
    for values_row in values:
        row = dict(zip(fields, values_row))
        for key, variant in ((row['object_key'], 'principal'), (row.get('thumb_key'), 'miniatura')):
            if variant == 'miniatura' and key is None:
                continue
            match = MEDIA_KEY.fullmatch(key) if isinstance(key, str) else None
            if (not match or match[1] != str(row['property_id'])
                    or bool(match[2]) != (variant == 'miniatura') or key in keys):
                raise ValueError(f'Chave R2 inválida ou duplicada em {name}')
            mime = 'image/webp' if match[3] == 'webp' else 'image/jpeg'
            size = row['size_bytes'] if variant == 'principal' else None
            if variant == 'principal' and (
                row['content_type'] != mime or type(size) is not int or not 0 < size <= 6291456
            ):
                raise ValueError(f'Objeto principal com metadados inválidos em {name}')
            if variant == 'miniatura' and row['content_type'] != mime:
                raise ValueError(f'Miniatura com MIME inconsistente em {name}')
            keys.add(key)
            data.append((key, mime, size, variant))
    return data


def write_manifest(data, out):
    with out.open('w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(('object_key', 'content_type', 'size_bytes', 'variant'))
        writer.writerows(data)


def run(prod_file, preview_file, outdir, *, permitir_um_cliente=False,
        esperar_imoveis_ativos=None, esperar_leads_ativos=None, esperar_fotos=None):
    if outdir.exists() and (not outdir.is_dir() or any(outdir.iterdir())):
        raise ValueError('Informe um diretório de saída novo ou vazio')
    prod = sql_connection(prod_file)
    preview = sql_connection(preview_file)
    check_fk(prod,'Production')
    check_fk(preview,'Preview')

    validate_schema(prod, 'Production', (9, 12))
    validate_schema(preview, 'Preview', (12,))
    aliases_source = alias_count(prod)
    aliases_preview = alias_count(preview)
    preview_internal = internal_snapshot(preview)

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

    property_fields = fields_by_table['properties']
    source_has_slug = 'slug' in property_fields
    if source_has_slug:
        id_index = property_fields.index('id')
        slug_index = property_fields.index('slug')
        source_slugs = [(row[id_index], row[slug_index]) for row in selected['properties']]
        defined = [slug for _, slug in source_slugs if slug is not None]
        if len(defined) != len(set(defined)):
            raise ValueError('Slugs duplicados na origem')

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
        insert_fields = [field for field in fields if table != 'properties' or field != 'slug']
        col_sql=', '.join(f'"{f}"' for f in insert_fields)
        for vals in selected[table]:
            val_sql=', '.join(lit(prod, val) for field, val in zip(fields, vals) if field in insert_fields)
            sql.append(f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql});')
        if table == 'properties' and source_has_slug:
            # O trigger de INSERT gera slugs temporários. Limpe-os antes de restaurar
            # o snapshot para evitar colisões com slugs históricos de outros imóveis.
            sql.append('UPDATE properties SET slug = NULL;')
            for property_id, slug in source_slugs:
                sql.append(f'UPDATE properties SET slug = {lit(prod, slug)} WHERE id = {lit(prod, property_id)};')
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
    if alias_count(clone) != 0:
        raise ValueError('Aliases antigos sobreviveram à reposição das imagens')
    if internal_snapshot(clone) != preview_internal:
        raise ValueError('Tabelas internas divergentes após a sincronização')
    result_slugs = clone.execute('SELECT id, slug FROM properties ORDER BY id').fetchall()
    defined = [slug for _, slug in result_slugs if slug is not None]
    if len(defined) != len(set(defined)) or (source_has_slug and result_slugs != source_slugs):
        raise ValueError('Slugs divergentes ou duplicados no resultado')
    if not source_has_slug and len(defined) != counts['properties']:
        raise ValueError('O destino não gerou todos os slugs')
    for table in TABLES:
        row_count=clone.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        if row_count != counts[table]:
            raise ValueError(f'Contagem divergente no autoteste em {table}: {row_count} != {counts[table]}')
        fields=fields_by_table[table]
        if rows(clone,table,fields) != selected[table]:
            raise ValueError(f'Conteúdo divergente no autoteste em {table}')
    clone.close()

    old_fields = [col['name'] for col in cols(preview, 'property_images') if col['hidden'] == 0]
    inventory = media_inventory(selected['property_images'], fields_by_table['property_images'], 'origem')
    old_inventory = media_inventory(rows(preview, 'property_images', old_fields), old_fields, 'Preview anterior')
    r2_count, old_count = len(inventory), len(old_inventory)
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
        'fotos_r2_selecionadas':counts['property_images'],
        'fotos_preview_anteriores':counts_before['property_images'],
        'registros_imagens_selecionados':counts['property_images'],
        'registros_imagens_preview_anteriores':counts_before['property_images'],
        'objetos_r2_selecionados':r2_count,
        'objetos_r2_preview_anteriores':old_count,
        'aliases_descartados_origem':aliases_source,
        'aliases_removidos_preview_simulado':aliases_preview,
        'integridade':'PASSOU: SQL aplicado a clone offline e foreign_key_check sem erros',
    }
    outdir.mkdir(parents=True, exist_ok=True)
    publication = outdir/'.publicacao-sync'
    publication.mkdir()
    try:
        if any(child != publication for child in outdir.iterdir()):
            raise ValueError('Diretório de saída deixou de estar vazio')
        with tempfile.TemporaryDirectory(dir=publication) as temp:
            pending = Path(temp)
            write_manifest(inventory, pending/'r2_prod_manifest.csv')
            write_manifest(old_inventory, pending/'r2_preview_antigo_manifest.csv')
            (pending/'manifesto_sem_dados_pessoais.json').write_text(
                json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
            sql_name = 'SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql'
            (pending/sql_name).write_text(sql_content, encoding='utf-8')
            for artifact in ('r2_prod_manifest.csv', 'r2_preview_antigo_manifest.csv',
                             'manifesto_sem_dados_pessoais.json', sql_name):
                (pending/artifact).replace(outdir/artifact)
    finally:
        publication.rmdir()
    print('PASSOU: autoteste SQL + integridade FK offline; sem escrita Cloudflare')
    print(f'Production: imóveis {prod_totals["properties"]} total / {counts["properties"]} ativos; '
          f'clientes {prod_totals["clients"]} total / {counts["clients"]} ativos; '
          f'leads {prod_totals["leads"]} total / {counts["leads"]} ativos')
    for name in TABLES:
        print(f'{name}: selecionados={counts[name]}, Preview antigo={counts_before[name]}')
    print(f'Objetos R2 para copiar: {r2_count} em {counts["property_images"]} registros de imagem')
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
    except (ValueError, sqlite3.Error, OSError) as exc:
        print('ERRO / NENHUM ARQUIVO DESTINO DEVE SER APLICADO:',exc,file=sys.stderr)
        sys.exit(2)
