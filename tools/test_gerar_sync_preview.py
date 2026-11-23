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

def build(migrated, has_old):
    c=sqlite3.connect(':memory:')
    c.execute('PRAGMA foreign_keys=ON')
    for f in sorted(root.glob('*.sql')):
        if f.name.startswith('0010_') and not migrated:continue
        c.executescript(f.read_text(encoding='utf8'))
    now='2026-11-22T12:00:00Z'
    if has_old:
        c.execute("INSERT INTO clients (name, phone, modality, profile, regions, created_at, updated_at) VALUES ('Cliente de preview', '5524987654321','Compra','Comprador','Resende',?,?)",(now,now))
        c.execute("INSERT INTO properties (title,purpose,type,neighborhood,city,price,area_m2,bedrooms,created_at,updated_at) VALUES ('Imovel antigo preview','Comprar','Casa','Centro','Resende - RJ',50000,80,2,?,?)",(now,now))
    else:
        for i,(typ,area,bed) in enumerate([('Terreno',450,0),('Casa',180,3),('Comercial',120,0)],1):
            c.execute('INSERT INTO properties (title,purpose,type,neighborhood,city,price,area_m2,bedrooms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', (f'Imovel {i} em Production','Comprar',typ,'Manejo','Resende - RJ',50000*i,area,bed,now,now))
        c.execute("INSERT INTO property_images (property_id,object_key,content_type,size_bytes,position,is_cover,created_at) VALUES (1,'properties/1/foto-teste.webp','image/webp',123,0,1,?)",(now,))
    return c

with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp)
    p=build(False,False);q=build(True,True)
    prod=d/'prod.sql'; prev=d/'prev.sql'
    prod.write_text('\n'.join(p.iterdump()),encoding='utf8')
    prev.write_text('\n'.join(q.iterdump()),encoding='utf8')
    mod.run(prod,prev,d/'out')
    sql=(d/'out/SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql').read_text()
    assert 'INSERT INTO "clients"' not in sql
    assert 'INSERT INTO "properties"' in sql and sql.count('INSERT INTO "properties"')==3
    assert 'INSERT INTO \"d1_migrations\"' not in sql and 'DELETE FROM \"d1_migrations\"' not in sql
    assert 'DROP TABLE' not in sql
    print('PASSOU: dados produção fictícios, cliente vazio, 3 imóveis, foto R2, migration 0010 preservada.')
