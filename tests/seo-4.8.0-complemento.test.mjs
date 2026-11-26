import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {slugFor, publicDescription, propertySeoText, makeHtml} from '../functions/_shared/property-seo.js';
import {propPublic,propOut} from '../functions/_shared/api/serialization.js';
import {onRequestGet} from '../functions/imoveis/[slug].js';
const p={id:1,type:'Kitnet',title:'Teste',purpose:'Alugar',neighborhood:'Manejo',city:'Resende - RJ',bedrooms:0,bathrooms:1,parking:0,area_m2:80,price:1500,status:'Disponível'};
const auto=propertySeoText(p).description;
for(const description of [null,undefined,'','  ','<p><br></p>','<div>&nbsp;</div>']) {
 const row={...p,description}; assert.equal(publicDescription(row),auto); assert.equal(propPublic(row).descricao,auto); assert.equal(propOut(row).description,description); assert.ok(makeHtml(row,[],'https://dev.example/').includes(auto));
}
assert.equal(publicDescription({...p,description:'**Original**'}),'**Original**');
assert.equal(propPublic({...p,description:'**Original**'}).descricao,'**Original**');
assert.match(auto,/0 vagas/);assert.match(auto,/por mês/);
const db=new DatabaseSync(':memory:');
const dir=new URL('../migrations/',import.meta.url);
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')&&!x.startsWith('0012')).sort()) db.exec(fs.readFileSync(new URL(f,dir),'utf8'));
const insert=db.prepare("INSERT INTO properties(type,bedrooms,area_m2,neighborhood,city,title,purpose,created_at,updated_at) VALUES (?,?,?,?,?,?, 'Alugar','2026','2026')");
insert.run('Kitnet',0,80,'Manejo','Resende - RJ','Teste');
const get=id=>db.prepare('SELECT * FROM properties WHERE id=?').get(id);
const old=get(1).slug;assert.match(old,/0-quartos/);
db.exec(fs.readFileSync(new URL('0012_slug_sem_zero_quartos.sql',dir),'utf8'));assert.equal(get(1).slug,old);
insert.run('Kitnet',0,80,'Manejo','Resende - RJ','Teste');assert.equal(get(2).slug,slugFor(get(2)));assert.doesNotMatch(get(2).slug,/0-quartos/);
db.exec("UPDATE properties SET type='Galpão' WHERE id=1");const updated=get(1);assert.equal(updated.slug,slugFor(updated));assert.match(updated.slug,/^galpao-manejo/);
const env={MEDIA_ENV:'preview',MEDIA_BUCKET:{},DB:{prepare:()=>({bind:()=>({first:async()=>({...updated,status:'Disponível'})})})}};
const res=await onRequestGet({env,params:{slug:old},request:new Request('https://dev.example/imoveis/'+old)});assert.equal(res.status,301);assert.ok(res.headers.get('Location').endsWith(updated.slug));
insert.run('Terreno',0,450,'Manejo','Resende - RJ','Teste');assert.equal(get(3).slug,slugFor(get(3)));assert.match(get(3).slug,/450m2/);
insert.run('Casa',1,80,'Manejo','Resende - RJ','Teste');assert.equal(get(4).slug,slugFor(get(4)));assert.match(get(4).slug,/1-quarto/);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
