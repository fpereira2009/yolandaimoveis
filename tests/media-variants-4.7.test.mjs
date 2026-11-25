// Teste integrado local de upload multipart, autenticacao e galeria.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {configureTestAuth, authHeaders} from './helpers/access-fixture.mjs';
import {onRequest} from '../functions/api/media/[[path]].js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const db=new DatabaseSync(':memory:');
for (const file of fs.readdirSync(path.join(root,'migrations')).filter(n=>n.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
db.exec('PRAGMA foreign_keys = ON');
const now=new Date().toISOString();
db.prepare('INSERT INTO properties(id,title,purpose,type,neighborhood,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(1,'Apartamento Teste','Comprar','Apartamento','Centro',now,now);
const DB={
  prepare(sql) {
    return {
      bind(...args) {
        return {
          async first(){return db.prepare(sql).get(...args)||null;},
          async all(){return {results:db.prepare(sql).all(...args)};}
        };
      }
    };
  },
  async batch(queries) {
    db.exec('BEGIN');
    try {for(const q of queries) db.prepare(q.sql).run(...q.params); db.exec('COMMIT');}
    catch(e){db.exec('ROLLBACK');throw e;}
  }
};
const bucket=new Map();
const R2={
 async put(key,bytes,options){bucket.set(key,{body:bytes,httpMetadata:options.httpMetadata,httpEtag:'"local-etag"'});},
 async get(key){return bucket.get(key)||null},
 async head(key){return bucket.get(key)||null},
 async delete(key){bucket.delete(key)}
};
const env=configureTestAuth({DB,MEDIA_BUCKET:R2,MEDIA_ENV:'preview'});
const tiny=Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=','base64');
const form=new FormData();
form.append('main',new Blob([tiny],{type:'image/webp'}),'full.webp');
form.append('thumb',new Blob([tiny],{type:'image/webp'}),'thumb.webp');
for(const [k,v] of Object.entries({width:1,height:1,thumbWidth:1,thumbHeight:1})) form.append(k,String(v));
const request=new Request('https://preview.example.test/api/media/properties/YTI-0001/images',{method:'PUT',headers:authHeaders(),body:form});
let res=await onRequest({request,env,params:{path:['properties','YTI-0001','images']}});
assert.equal(res.status,201,await res.text());
const row=db.prepare('SELECT * FROM property_images').get();
assert.equal(row.content_type,'image/webp');
assert.ok(row.thumb_key && row.thumb_key.endsWith('-thumb.webp'));
assert.equal(bucket.size,2);
assert.equal(bucket.get(row.object_key).httpMetadata.cacheControl,'public, max-age=31536000, immutable');
res=await onRequest({env,params:{path:['file',...row.thumb_key.split('/')]},request:new Request('https://preview.example.test/api/media/file/'+row.thumb_key)});
assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/webp');
res=await onRequest({env,params:{path:['file','properties','1','not-exists-thumb.webp']},request:new Request('https://preview.example.test/api/media/file/properties/1/not-exists-thumb.webp')});
assert.equal(res.status,404);
console.log('PASSOU: multipart WebP principal + thumb R2, metadata, GET seguro, 404 chave inválida');
