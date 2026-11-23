#!/usr/bin/env python3
"""Teste offline para migration 0010 sobre a estrutura real 4.5.5 e 3 anúncios."""
import sqlite3
from pathlib import Path
base=Path(__file__).resolve().parents[1]
conn=sqlite3.connect(':memory:')
conn.execute('PRAGMA foreign_keys=ON')
for f in sorted((base/'migrations').glob('*.sql')):
 if f.name.startswith('0010_'):continue
 conn.executescript(f.read_text(encoding='utf-8'))
for i,(ty,bed,area,bairro,city) in enumerate([
 ('Casa',3,150,'Manejo','Resende - RJ'),
 ('Comercial',0,120,'Campos Elíseos','Resende - RJ'),
 ('Terreno',0,450,'Jardim Jalisco','Resende - RJ')],1):
 conn.execute('INSERT INTO properties (type,bedrooms,area_m2,neighborhood,city,title,purpose,created_at,updated_at) VALUES (?,?,?,?,?,?,?, ?, ?)',(ty,bed,area,bairro,city,'Imóvel Teste '+str(i),'Comprar','2026-11-22','2026-11-22'))
conn.commit()
assert conn.execute('SELECT COUNT(*) FROM properties').fetchone()[0]==3
conn.executescript((base/'migrations/0010_seo_slug_4_6_0.sql').read_text(encoding='utf-8'))
rows=conn.execute('SELECT code,slug FROM properties ORDER BY id').fetchall()
expected=[('YTI-0001','casa-3-quartos-manejo-resende-rj-yti-0001'),('YTI-0002','comercial-120m2-campos-eliseos-resende-rj-yti-0002'),('YTI-0003','terreno-450m2-jardim-jalisco-resende-rj-yti-0003')]
assert rows==expected,(rows,expected)
conn.execute("UPDATE properties SET area_m2=500 WHERE id=3")
assert conn.execute('SELECT slug FROM properties WHERE id=3').fetchone()[0]=='terreno-500m2-jardim-jalisco-resende-rj-yti-0003'
conn.execute("UPDATE properties SET bedrooms=1,neighborhood='São José' WHERE id=1")
assert conn.execute('SELECT slug FROM properties WHERE id=1').fetchone()[0]=='casa-1-quarto-sao-jose-resende-rj-yti-0001'
conn.execute("INSERT INTO properties (type,area_m2,neighborhood,city,title,purpose,created_at,updated_at) VALUES ('Terreno',0,'Centro','Resende - RJ','Terreno teste','Comprar','2026','2026')")
assert conn.execute('SELECT slug FROM properties WHERE id=4').fetchone()[0]=='terreno-area-nao-informada-centro-resende-rj-yti-0004'
assert len(conn.execute('SELECT slug FROM properties').fetchall())==len(set(r[0] for r in conn.execute('SELECT slug FROM properties')))
assert not conn.execute('PRAGMA foreign_key_check').fetchall()
print('PASSOU: migration 0010 incremental sobre a migration 0009_public_url.sql real, backfill 3 imóveis, triggers, área, acentos, inserção e unicidade.')
