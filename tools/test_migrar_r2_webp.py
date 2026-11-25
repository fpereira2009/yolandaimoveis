"""Teste offline (sem rede/credenciais) de conversão e consistência R2-D1."""
import importlib.util
import io
import json
import sqlite3
import tempfile
from pathlib import Path
from PIL import Image
from botocore.exceptions import ClientError

script=Path(__file__).with_name('migrar_r2_webp.py')
spec=importlib.util.spec_from_file_location('migrate',script)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class FakeS3:
    class exceptions:
        ClientError=ClientError
    def __init__(self): self.files={}
    def put_object(self,**kw):
        self.files[kw['Key']]=dict(body=kw['Body'],type=kw['ContentType'],meta=kw['Metadata']);return {}
    def head_object(self,**kw):
        k=kw['Key']
        if k not in self.files:raise ClientError({'Error':{'Code':'404'},'ResponseMetadata':{'HTTPStatusCode':404}},'HeadObject')
        obj=self.files[k]
        return {'ContentLength':len(obj['body']),'Metadata':obj['meta'],'ContentType':obj['type']}
    def get_object(self,**kw):return {'Body':io.BytesIO(self.files[kw['Key']]['body'])}
    def delete_object(self,**kw):self.files.pop(kw['Key'])

with tempfile.TemporaryDirectory() as tmp:
    tmp=Path(tmp)
    sql=tmp/'old.sql'
    database=sqlite3.connect(':memory:')
    database.executescript('''CREATE TABLE property_images(id INTEGER PRIMARY KEY, property_id INTEGER, object_key TEXT, thumb_key TEXT, size_bytes INTEGER, content_type TEXT, width INTEGER, height INTEGER, thumb_width INTEGER, thumb_height INTEGER);
    CREATE TABLE image_url_aliases(old_key TEXT PRIMARY KEY,image_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO property_images(id,property_id,object_key,thumb_key,size_bytes,content_type) VALUES(1,6,'properties/6/11111111-1111-4111-8111-111111111111.jpg',NULL,256,'image/jpeg');''')
    sql.write_text('\n'.join(database.iterdump()),encoding='utf8')
    image=Image.new('RGB',(2400,1350),(45,75,70));f=io.BytesIO();image.save(f,format='JPEG',quality=90)
    s3=FakeS3();s3.files['properties/6/11111111-1111-4111-8111-111111111111.jpg']={'body':f.getvalue(),'type':'image/jpeg','meta':{}}
    mod.cli_r2=lambda _:s3
    class Args:pass
    args=Args();args.bucket=mod.PREVIEW;args.confirm_production=None;args.d1_export=sql;args.output=tmp/'out';args.delete_old=False
    mod.run_convert(args)
    manifest=json.loads((args.output/'manifesto_r2_webp.json').read_text())
    assert len(manifest['entries'])==1
    record=manifest['entries'][0]
    assert record['width']==1600 and record['thumb_width']==480
    assert len(s3.files)==3
    mod.run_convert(args)
    assert len(s3.files)==3,'Idempotência: não cria chaves duplicadas'
    database.executescript((args.output/'APLICAR_SOMENTE_APOS_VALIDACAO_D1.sql').read_text())
    newexport=tmp/'new.sql';newexport.write_text('\n'.join(database.iterdump()),encoding='utf8')
    args.d1_export=newexport;args.manifest=args.output/'manifesto_r2_webp.json'
    mod.run_verify(args)
    assert database.execute('SELECT COUNT(*) FROM image_url_aliases').fetchone()[0]==1
    assert len(s3.files)==3,'Verificação não remove originais'
    print('PASSOU: 2 variantes WebP, SHA, upload idempotente, UPDATE CAS e verificação offline sem excluir originais.')
