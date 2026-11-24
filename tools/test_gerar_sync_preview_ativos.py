"""Teste offline sem Cloudflare; executar: py tools/test_gerar_sync_preview_ativos.py"""
import importlib.util, json, sqlite3, tempfile
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
        if not preview and m.name.startswith('0010_'):
            continue
        c.executescript(m.read_text('utf-8-sig'))
    now='2026-11-22T12:00:00Z'
    if preview:
        c.execute("INSERT INTO clients (id,name,phone,modality,profile,regions,created_at,updated_at) VALUES (99,'Cliente Preview','5524999880099','Compra','Comprador','Resende',?,?)", (now,now))
        c.execute("INSERT INTO properties (id,title,purpose,type,neighborhood,city,price,area_m2,bedrooms,created_at,updated_at) VALUES (99,'Imóvel de homologação','Comprar','Casa','Centro','Resende - RJ',100000,50,2,?,?)", (now,now))
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
                          (prop,f'properties/{prop}/foto-{i}.webp',i,1 if i==0 else 0,now))
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
    photos=(t/'saida'/'r2_prod_manifest.csv').read_text('utf-8')
    assert photos.count('properties/')==35
    assert 'properties/1/' not in photos
    sql=(t/'saida'/'SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql').read_text('utf-8')
    assert sql.count('INSERT INTO "properties"')==4
    assert sql.count('INSERT INTO "leads"')==1
    assert 'INSERT INTO "d1_migrations"' not in sql
    assert 'DROP TABLE' not in sql
    print('APROVADO: 4 imóveis / 35 fotos / 1 cliente / 1 lead / 1 evento; sem registros excluídos.')
    try:
        sync.run(prod,prev,t/'blocked',permitir_um_cliente=True,esperar_imoveis_ativos=3,esperar_leads_ativos=1,esperar_fotos=35)
    except ValueError as exc:
        assert 'Contagem inesperada de properties' in str(exc)
    else:
        raise AssertionError('deveria bloquear contagem incorreta')
    assert not (t/'blocked'/'SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql').exists()
    print('APROVADO: bloqueio de contagem divergente sem gerar SQL destino.')
