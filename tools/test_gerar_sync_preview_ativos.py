"""Teste offline sem Cloudflare; executar: py tools/test_gerar_sync_preview_ativos.py"""
import csv, importlib.util, json, sqlite3, tempfile
from pathlib import Path

script = Path(__file__).with_name('gerar_sync_preview.py')
spec = importlib.util.spec_from_file_location('sync', script)
sync = importlib.util.module_from_spec(spec); spec.loader.exec_module(sync)
base = Path(__file__).resolve().parent
# Este teste usa o conjunto de migrations do projeto ao ser extraído na raiz.
root = base.parent / 'migrations'
if not root.is_dir():
    raise SystemExit('Execute o teste na raiz do projeto com a pasta migrations')

def backup(target, preview):
    c = sqlite3.connect(':memory:')
    c.execute('PRAGMA foreign_keys=ON')
    for m in sorted(root.glob('*.sql')):
        c.executescript(m.read_text('utf-8-sig'))
    c.executescript("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT); "
                    "INSERT INTO d1_migrations VALUES(12,'0012_slug_sem_zero_quartos.sql');")
    now='2026-11-22T12:00:00Z'
    if preview:
        c.execute("INSERT INTO clients (id,name,phone,modality,profile,regions,created_at,updated_at) VALUES (99,'Cliente Preview','5524999880099','Compra','Comprador','Resende',?,?)", (now,now))
        c.execute("INSERT INTO properties (id,title,purpose,type,neighborhood,city,price,area_m2,bedrooms,created_at,updated_at) VALUES (99,'Imóvel de homologação','Comprar','Casa','Centro','Resende - RJ',100000,50,2,?,?)", (now,now))
        c.execute("INSERT INTO property_images (id,property_id,object_key,content_type,size_bytes,position,is_cover,created_at) VALUES (1,99,'properties/99/11111111-1111-4111-8111-111111111111.webp','image/webp',123,0,1,?)", (now,))
        c.execute("INSERT INTO image_url_aliases(old_key,image_id) VALUES ('properties/99/11111111-1111-4111-8111-111111111111.jpg',1)")
    else:
        for i in range(1,9):
            c.execute('''INSERT INTO clients(id,name,phone,modality,profile,regions,created_at,updated_at,deleted_at)
                         VALUES(?, ?, ?, 'Compra', 'Comprador', 'Resende', ?, ?, ?)''',
                      (i,f'Cliente Teste {i}',f'552499991{i:04d}',now,now,None if i==8 else now))
        for i in range(1,10):
            kind='Apartamento' if i==6 else 'Terreno' if i==7 else 'Casa' if i==8 else 'Comercial' if i==9 else 'Casa'
            c.execute('''INSERT INTO properties(id,title,purpose,type,neighborhood,city,price,area_m2,bedrooms,created_at,updated_at,deleted_at)
                         VALUES(?,?,'Comprar',?,'Manejo','Resende - RJ',100000,120,3,?,?,?)''',
                      (i,f'Imóvel teste número {i}',kind,now,now,None if i>=6 else now))
        for i in range(1,10):
            c.execute('''INSERT INTO leads(id,name,phone,modality,stage,temp,property,value,created_at,updated_at,deleted_at,client_id)
                         VALUES(?, ?, ?, 'Compra', 'Novo Lead','Morno','',0,?,?,?,?)''',
                      (i,f'Lead Teste {i}',f'552499990{i:04d}',now,now,None if i==9 else now,8 if i==9 else (i if i<=7 else None)))
            c.execute("INSERT INTO lead_events(lead_id,kind,text,created_at) VALUES (?,'criado','Evento de teste',?)", (i,now))
        for prop,count in [(6,10),(7,6),(8,10),(9,9),(1,2)]:
            for i in range(count):
                c.execute('''INSERT INTO property_images(property_id,object_key,content_type,size_bytes,position,is_cover,created_at)
                             VALUES (?,?,'image/webp',123,?,?,?)''',
                          (prop,f'properties/{prop}/11111111-1111-4111-8111-{i:012d}.webp',i,1 if i==0 else 0,now))
        c.execute("UPDATE properties SET bedrooms=0 WHERE id=8")
        c.execute("UPDATE properties SET slug='casa-0-quartos-manejo-resende-rj-yti-0008' WHERE id=8")
        c.execute("UPDATE property_images SET thumb_key='properties/6/11111111-1111-4111-8111-000000000000-thumb.webp' WHERE id=1")
        c.execute("INSERT INTO image_url_aliases(old_key,image_id) VALUES ('properties/6/11111111-1111-4111-8111-000000000000.jpg',1)")
    target.write_text('\n'.join(c.iterdump())+'\n',encoding='utf-8')
    c.close()

with tempfile.TemporaryDirectory() as tmp:
    t=Path(tmp); prod=t/'prod.sql'; prev=t/'preview.sql'
    backup(prod,False); backup(prev,True)
    sync.run(prod,prev,t/'saida',permitir_um_cliente=True,esperar_imoveis_ativos=4,esperar_leads_ativos=1,esperar_fotos=35)
    summary=json.loads((t/'saida'/'manifesto_sem_dados_pessoais.json').read_text('utf-8'))
    assert summary['contagens_producao_selecionadas']=={'clients':1,'properties':4,'leads':1,'lead_events':1,'property_images':35},summary
    assert summary['clientes_excluidos_omitidos']==7
    assert summary['imoveis_excluidos_omitidos']==5
    assert summary['leads_excluidos_omitidos']==8
    with (t/'saida'/'r2_prod_manifest.csv').open(newline='', encoding='utf-8') as manifest:
        photos = list(csv.DictReader(manifest))
    assert len(photos) == 36
    assert summary['registros_imagens_selecionados'] == 35
    assert summary['objetos_r2_selecionados'] == 36
    assert summary['aliases_descartados_origem'] == 1
    assert summary['aliases_removidos_preview_simulado'] == 1
    assert sum(row['variant'] == 'principal' for row in photos) == 35
    assert [(row['content_type'], row['size_bytes']) for row in photos if row['variant'] == 'miniatura'] == [('image/webp', '')]
    assert not any(row['object_key'].startswith(('properties/1/', 'properties/99/')) or row['object_key'].endswith('.jpg') for row in photos)
    sql=(t/'saida'/'SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql').read_text('utf-8')
    assert sql.count('INSERT INTO "properties"')==4
    assert sql.count('INSERT INTO "leads"')==1
    assert 'INSERT INTO "d1_migrations"' not in sql
    assert 'DROP TABLE' not in sql
    assert 'INSERT INTO "image_url_aliases"' not in sql
    assert 'DELETE FROM "d1_migrations"' not in sql
    clone = sync.sql_connection(prev)
    before_internal = clone.execute('SELECT * FROM d1_migrations').fetchall()
    clone.executescript(sql)
    assert clone.execute('SELECT * FROM d1_migrations').fetchall() == before_internal
    assert clone.execute('SELECT property_id FROM property_images WHERE id=1').fetchone() == (6,)
    assert clone.execute('SELECT COUNT(*) FROM image_url_aliases').fetchone() == (0,)
    assert clone.execute('SELECT slug FROM properties WHERE id=8').fetchone() == ('casa-0-quartos-manejo-resende-rj-yti-0008',)
    assert clone.execute('SELECT COUNT(DISTINCT slug) FROM properties').fetchone() == (4,)
    assert not clone.execute('PRAGMA foreign_key_check').fetchall()
    print('APROVADO: 4 imóveis / 35 fotos / 1 cliente / 1 lead / 1 evento; sem registros excluídos.')
    try:
        sync.run(prod,prev,t/'blocked',permitir_um_cliente=True,esperar_imoveis_ativos=3,esperar_leads_ativos=1,esperar_fotos=35)
    except ValueError as exc:
        assert 'Contagem inesperada de properties' in str(exc)
    else:
        raise AssertionError('deveria bloquear contagem incorreta')
    assert not (t/'blocked'/'SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql').exists()
    print('APROVADO: bloqueio de contagem divergente sem gerar SQL destino.')
    original = prod.read_text('utf-8')
    for idx, (extra_sql, expected) in enumerate((
        ("UPDATE leads SET client_id=1 WHERE id=9;", 'Lead ATIVO aponta para cliente excluído'),
        ("INSERT INTO image_url_aliases(old_key,image_id) VALUES ('órfão',999);", 'FK inválida'),
        ("CREATE TABLE desconhecida(id INTEGER);", 'Tabelas não reconhecidas'),
        ("ALTER TABLE properties ADD COLUMN extra TEXT;", 'Schema incompatível'),
        ("UPDATE property_images SET object_key='properties/99/11111111-1111-4111-8111-000000000000.webp' WHERE id=1;", 'Chave R2 inválida'),
    )):
        prod.write_text(original + extra_sql, encoding='utf-8')
        dest = t/f'blocked-{idx}'
        try:
            sync.run(prod,prev,dest,permitir_um_cliente=True,esperar_imoveis_ativos=4,esperar_leads_ativos=1,esperar_fotos=35)
        except ValueError as exc:
            assert expected in str(exc), exc
        else:
            raise AssertionError('deveria bloquear antes de publicar o SQL')
        assert not (dest/'SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql').exists()
