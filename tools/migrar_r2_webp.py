#!/usr/bin/env python3
"""Migração segura R2 -> WebP: upload antes de UPDATE D1; rollback preservado.

Dependências: pip install boto3 Pillow
O script NUNCA executa SQL remoto; só cria SQL local com update condicional.
Fluxo: exportação SQL D1 -> converter/copy R2 -> validar HEAD -> escrever SQL+manifesto.
Depois: aplicar SQL D1 Preview via Wrangler -> nova exportação D1 -> verify/cleanup.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

PREVIEW = 'yolanda-imoveis-dev'
PROD = 'yolanda-imoveis-prod'
CACHE = 'public, max-age=31536000, immutable'
MAX_BYTES = 6 * 1024 * 1024


def err(message):
    raise SystemExit('ERRO (nenhuma alteração no D1): ' + message)


def connection(sql_path):
    con = sqlite3.connect(':memory:')
    con.row_factory = sqlite3.Row
    con.executescript(Path(sql_path).read_text(encoding='utf-8-sig'))
    return con


def table_columns(con):
    return {r['name'] for r in con.execute("PRAGMA table_info('property_images')")}


def cli_r2(args):
    required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'R2_ENDPOINT_URL']
    missing = [n for n in required if not os.getenv(n)]
    if missing:
        err('Variáveis de ambiente ausentes: ' + ', '.join(missing))
    import boto3
    return boto3.client('s3',endpoint_url=os.environ['R2_ENDPOINT_URL'],region_name='auto',
                        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'])


def bucket_check(args):
    if args.bucket not in {PREVIEW,PROD}:err('Nome de bucket desconhecido; interrompido')
    if args.bucket == PROD and args.confirm_production != 'SIM-PRODUCTION':
        err('Production requer --confirm-production SIM-PRODUCTION. Valide Preview primeiro')


def img_variants(original):
    from PIL import Image, ImageOps, UnidentifiedImageError
    Image.MAX_IMAGE_PIXELS = 60_000_000
    try:
        with Image.open(io.BytesIO(original)) as image:
            image = ImageOps.exif_transpose(image)
            image.load()
            if image.width*image.height > 60_000_000: err('Foto excede limite de pixels')
            if image.mode not in ('RGB','RGBA'):
                image = image.convert('RGBA')
            if image.mode == 'RGBA':
                background = Image.new('RGB',image.size,'white');background.paste(image,mask=image.getchannel('A'))
                image = background
            image = image.convert('RGB')
            def convert(max_side,quality):
                resize = image.copy()
                resize.thumbnail((max_side,max_side), Image.Resampling.LANCZOS)
                out = io.BytesIO();resize.save(out,format='WEBP',quality=quality,method=5)
                return out.getvalue(),resize.size
            return convert(1600,82),convert(480,80)
    except (OSError,UnidentifiedImageError,ValueError) as exc:
        err('Falha ao decodificar a imagem: ' + type(exc).__name__)


def object_ok(s3,bucket,key,data):
    try:
        head = s3.head_object(Bucket=bucket,Key=key)
    except s3.exceptions.ClientError as exc:
        status = int(exc.response.get('ResponseMetadata',{}).get('HTTPStatusCode',0))
        if status in (404,):return False
        raise
    expected = hashlib.sha256(data).hexdigest()
    actual = head.get('Metadata',{}).get('sha256')
    if actual != expected or int(head.get('ContentLength',0)) != len(data):
        err('Chave já existente com conteúdo diferente: '+key)
    if head.get('ContentType') != 'image/webp':err('Metadata MIME não confere para '+key)
    return True


def upload_variant(s3,bucket,key,data,variant):
    if len(data)>MAX_BYTES:err('WebP excede 6 MB em '+key)
    if not object_ok(s3,bucket,key,data):
        s3.put_object(Bucket=bucket,Key=key,Body=data,ContentType='image/webp',
                      CacheControl=CACHE, Metadata={'sha256':hashlib.sha256(data).hexdigest(),'variant':variant})
    if not object_ok(s3,bucket,key,data):err('HEAD não confirmou upload '+key)


def sql_lit(value):
    return "'"+str(value).replace("'","''")+"'"


def run_convert(args):
    bucket_check(args)
    con = connection(args.d1_export)
    if not {'thumb_key','width','height','thumb_width','thumb_height'}.issubset(table_columns(con)):
        err('Exportação D1 não contém migration 0011_media_variants_4_7_0')
    rows = con.execute('SELECT id,property_id,object_key,thumb_key FROM property_images ORDER BY id').fetchall()
    s3 = cli_r2(args)
    entries = []
    for row in rows:
        if row['thumb_key']:
            continue  # rerun idempotente após UPDATE D1
        oldkey=row['object_key']; pid=row['property_id']
        if not oldkey.startswith(f'properties/{pid}/') or not oldkey.endswith(('.jpg','.webp')):
            err('Chave da fonte fora do padrão, id='+str(row['id']))
        source=s3.get_object(Bucket=args.bucket,Key=oldkey)['Body'].read()
        if not source or len(source)>MAX_BYTES:err('Imagem de origem inválida: '+oldkey)
        full,thumb=img_variants(source)
        raw, (w,h)=full
        small,(tw,th)=thumb
        if any(len(d)==0 for d in (raw,small)):err('Saída de imagem vazia')
        # Chave baseada em hash do conteúdo e da política, não na hora de execução:
        # reexecuções não geram novos objetos nem reescrevem os existentes.
        fingerprint=hashlib.sha256(source).hexdigest()
        name=uuid.uuid5(uuid.NAMESPACE_URL, 'Yolanda-WebP-v1:'+oldkey+':'+fingerprint)
        newkey=f'properties/{pid}/{name}.webp'
        thkey=f'properties/{pid}/{name}-thumb.webp'
        if oldkey==newkey:err('Tentativa de sobrescrever origem; interrompido')
        upload_variant(s3,args.bucket,newkey,raw,'full')
        upload_variant(s3,args.bucket,thkey,small,'thumb')
        entries.append({'id':row['id'],'property_id':pid,'old':oldkey,'new':newkey,'thumb':thkey,
                        'size_bytes':len(raw),'width':w,'height':h,'thumb_width':tw,'thumb_height':th,
                        'source_sha256':fingerprint})
        print(f'CONFIRMADO objeto {row["id"]}: {len(source)} -> {len(raw)} + {len(small)} bytes')
    args.output.mkdir(parents=True,exist_ok=True)
    manifest={'bucket':args.bucket,'created':datetime.now(timezone.utc).isoformat(),
              'source_d1_export':str(args.d1_export),'entries':entries}
    (args.output/'manifesto_r2_webp.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf8')
    sql=['-- SQL APENAS PARA '+args.bucket+'. NÃO EXECUTAR EM OUTRO AMBIENTE!',
         '-- Verifique backup + IDs + caminhos antes de usar o Wrangler.',
         '-- Atualizações condicionais: nunca apagam dados ou objetos antigos.']
    for entry in entries:
        # Publicação sem ruptura: URLs antigas ficam autorizadas via tabela de aliases.
        sql.append('INSERT OR IGNORE INTO image_url_aliases(old_key,image_id) '
                   f'SELECT {sql_lit(entry["old"])}, id FROM property_images '
                   f'WHERE id={int(entry["id"])} AND object_key={sql_lit(entry["old"])};')
        sql.append('UPDATE property_images SET '
          f'object_key={sql_lit(entry["new"])}, thumb_key={sql_lit(entry["thumb"])}, '
          f'content_type=\'image/webp\', size_bytes={entry["size_bytes"]}, '
          f'width={entry["width"]}, height={entry["height"]}, thumb_width={entry["thumb_width"]}, thumb_height={entry["thumb_height"]} '
          f'WHERE id={int(entry["id"])} AND object_key={sql_lit(entry["old"])} AND thumb_key IS NULL;')
    (args.output/'APLICAR_SOMENTE_APOS_VALIDACAO_D1.sql').write_text('\n'.join(sql)+'\n',encoding='utf8')
    con.close()
    print('GERADO SQL OFFLINE:', args.output/'APLICAR_SOMENTE_APOS_VALIDACAO_D1.sql')
    print('Nenhuma consulta D1 remota nem exclusão R2 executada.')


def run_verify(args):
    bucket_check(args)
    data=json.loads(Path(args.manifest).read_text(encoding='utf8'))
    if data.get('bucket')!=args.bucket:err('Bucket diferente do registrado no manifesto')
    con=connection(args.d1_export)
    cols=table_columns(con)
    if not {'thumb_key','width','height','thumb_width','thumb_height'}.issubset(cols):err('Banco exportado sem schema 0011')
    s3=cli_r2(args)
    count=0
    for entry in data['entries']:
        row=con.execute('SELECT object_key,thumb_key,size_bytes,width,height,thumb_width,thumb_height FROM property_images WHERE id=?',(entry['id'],)).fetchone()
        if not row or any(row[k]!=entry[new] for k,new in [('object_key','new'),('thumb_key','thumb'),('size_bytes','size_bytes'),('width','width'),('height','height'),('thumb_width','thumb_width'),('thumb_height','thumb_height')]):
            err(f'Integridade D1 divergente no registro {entry["id"]}; NÃO apagar origem')
        other=con.execute('SELECT COUNT(*) FROM property_images WHERE object_key=? OR thumb_key=?',(entry['old'],entry['old'])).fetchone()[0]
        if other:err('Chave original ainda como foto principal: '+entry['old'])
        alias=con.execute('SELECT image_id FROM image_url_aliases WHERE old_key=?',(entry['old'],)).fetchone()
        if not alias or alias['image_id']!=entry['id']:
            err('Alias de compatibilidade ausente: '+entry['old'])
        for key in ('new','thumb'):
            head=s3.head_object(Bucket=args.bucket,Key=entry[key])
            if head.get('ContentType')!='image/webp' or int(head.get('ContentLength',0))==0:
                err('Objeto WebP não íntegro: '+entry[key])
        count+=1
    print('VALIDADO:', count, 'registros D1 atualizados e objetos novos disponíveis.')
    if not args.delete_old:
        print('DRY RUN: nenhum objeto antigo removido. Execute verificação de UI/SEO primeiro.')
        return
    if args.confirm_delete != f'EXCLUIR-ORIGINAIS-{args.bucket}':err('Confirmação de exclusão inválida')
    # Prazo de carência ajuda rollback e visitação: 7 dias após a migração.
    migrated=datetime.fromisoformat(data['created'])
    if (datetime.now(timezone.utc)-migrated).total_seconds()<7*86400:
        err('É necessário aguardar 7 dias após a criação do manifesto para apagar originais')
    for entry in data['entries']:
        s3.delete_object(Bucket=args.bucket,Key=entry['old'])
    cleanup=['-- Remover aliases somente APÓS confirmar limpeza R2. Aplicar no D1 do mesmo ambiente.']
    for entry in data['entries']:
        cleanup.append(f'DELETE FROM image_url_aliases WHERE old_key={sql_lit(entry["old"])} AND image_id={int(entry["id"])};')
    path=Path(args.manifest).parent/'REMOVER_ALIASES_APOS_LIMPEZA.sql'
    path.write_text('\n'.join(cleanup)+'\n',encoding='utf8')
    print('LIMPEZA EXECUTADA:',count,'originais. Objetos novos preservados.')
    print('Para limpeza completa do D1, avalie SQL de remoção de aliases:',path)


def main():
    p=argparse.ArgumentParser(description='Migração R2 WebP idempotente; D1 sempre offline')
    p.add_argument('mode',choices=['convert','verify'])
    p.add_argument('--bucket',required=True,choices=[PREVIEW,PROD])
    p.add_argument('--d1-export',required=True,type=Path)
    p.add_argument('--output',type=Path,default=Path('migration_output'))
    p.add_argument('--manifest',type=Path)
    p.add_argument('--delete-old',action='store_true')
    p.add_argument('--confirm-delete')
    p.add_argument('--confirm-production')
    args=p.parse_args()
    if not args.d1_export.is_file():err('Arquivo de export D1 não encontrado')
    if args.mode=='verify' and (not args.manifest or not args.manifest.is_file()):err('Informe --manifest no modo verify')
    if args.mode=='convert':run_convert(args)
    else:run_verify(args)


if __name__=='__main__':main()
