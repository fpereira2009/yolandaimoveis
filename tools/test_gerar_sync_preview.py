"""Teste isolado com dados fictícios; não toca Cloudflare."""
import importlib.util
import tempfile
from pathlib import Path
import sqlite3

path=Path(__file__).with_name('gerar_sync_preview.py')
spec=importlib.util.spec_from_file_location('sync_tool',path)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
root=Path(__file__).resolve().parents[1]/'migrations'

def build(revision, has_old, *, client=True, lead=True):
    c=sqlite3.connect(':memory:')
    c.execute('PRAGMA foreign_keys=ON')
    for f in sorted(root.glob('*.sql')):
        if int(f.name.split('_', 1)[0]) > revision:
            break
        c.executescript(f.read_text(encoding='utf8'))
    now='2026-11-22T12:00:00Z'
    if has_old:
        c.execute("INSERT INTO clients (name, phone, modality, profile, regions, created_at, updated_at) VALUES ('Cliente de preview', '5524987654321','Compra','Comprador','Resende',?,?)",(now,now))
        c.execute("INSERT INTO properties (title,purpose,type,neighborhood,city,price,area_m2,bedrooms,created_at,updated_at) VALUES ('Imovel antigo preview','Comprar','Casa','Centro','Resende - RJ',50000,80,2,?,?)",(now,now))
    else:
        if client:
            c.execute("INSERT INTO clients (name, phone, modality, profile, regions, created_at, updated_at) VALUES ('Cliente sintético', '5524000000001','Compra','Comprador','Resende',?,?)", (now,now))
        if lead:
            c.execute("INSERT INTO leads (name,phone,modality,stage,temp,property,value,created_at,updated_at,client_id) VALUES ('Lead sintético','5524000000002','Compra','Novo Lead','Morno','',0,?,?,?)", (now,now,1 if client else None))
        for i,(typ,area,bed) in enumerate([('Terreno',450,0),('Casa',180,3),('Comercial',120,0)],1):
            c.execute('INSERT INTO properties (title,purpose,type,neighborhood,city,price,area_m2,bedrooms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', (f'Imovel {i} em Production','Comprar',typ,'Manejo','Resende - RJ',50000*i,area,bed,now,now))
        c.execute("INSERT INTO property_images (property_id,object_key,content_type,size_bytes,position,is_cover,created_at) VALUES (1,'properties/1/11111111-1111-4111-8111-111111111111.webp','image/webp',123,0,1,?)",(now,))
    return c

with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp)
    p=build(9,False);q=build(12,True)
    prod=d/'prod.sql'; prev=d/'prev.sql'
    prod.write_text('\n'.join(p.iterdump()),encoding='utf8')
    prev.write_text('\n'.join(q.iterdump()),encoding='utf8')
    options = dict(permitir_um_cliente=True, esperar_imoveis_ativos=3, esperar_leads_ativos=1, esperar_fotos=1)
    mod.run(prod,prev,d/'out',**options)
    sql=(d/'out/SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql').read_text(encoding='utf-8')
    assert sql.count('INSERT INTO "clients"') == 1
    assert 'INSERT INTO "properties"' in sql and sql.count('INSERT INTO "properties"')==3
    assert 'INSERT INTO \"d1_migrations\"' not in sql and 'DELETE FROM \"d1_migrations\"' not in sql
    assert 'DROP TABLE' not in sql
    q.executescript(sql)
    assert q.execute('SELECT DISTINCT status FROM properties').fetchall() == [('Disponível',)]
    assert q.execute('SELECT COUNT(DISTINCT slug) FROM properties').fetchone()[0] == 3
    assert not q.execute('PRAGMA foreign_key_check').fetchall()
    for client, lead, expected in (
        (False, False, 'Clientes ativos=0'),
        (True, False, 'Contagem inesperada de leads'),
    ):
        blocked = d/f'blocked-{client}'
        with build(9,False,client=client,lead=lead) as src:
            prod.write_text('\n'.join(src.iterdump()),encoding='utf8')
        try:
            mod.run(prod,prev,blocked,**options)
        except ValueError as exc:
            assert expected in str(exc), exc
        else:
            raise AssertionError('deveria bloquear snapshot incompatível')
        assert not (blocked/'SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql').exists()
    print('PASSOU: origem 0009, destino 0012, slugs gerados, 3 imóveis e bloqueios de cliente/lead.')
