#!/usr/bin/env python3
"""Patch conservador para property-seo.js ATUAL: não sobrescreve o arquivo de versão recente.
Modo padrão apenas verifica. --apply cria backup fora do repo e faz alteração atômica.
"""
import argparse
import datetime
import os
from pathlib import Path
import re
import tempfile

PHOTO_MEDIA = '''  // Imagens responsivas com srcset real a partir das dimensões registradas no D1.
  const photoMedia = images.map(row => {
    const src = publicImage(row, property.id);
    if (!src) return null;
    const w = Number(row.width), h = Number(row.height);
    const tw = Number(row.thumb_width), th = Number(row.thumb_height);
    const valid = (a,b) => Number.isSafeInteger(a) && Number.isSafeInteger(b) && a > 0 && b > 0 && a <= 1600 && b <= 1600;
    const thumbKey = row.thumb_key;
    const thumbSafe = typeof thumbKey === 'string' && row.object_key.endsWith('.webp') &&
      thumbKey === row.object_key.slice(0,-5)+'-thumb.webp' && valid(tw,th) && valid(w,h) && tw < w;
    const thumb = thumbSafe ? '/api/media/file/' + thumbKey.split('/').map(encodeURIComponent).join('/') : '';
    const srcset = thumb ? `${thumb} ${tw}w, ${src} ${w}w` : '';
    return {src,srcset,width:valid(w,h)?w:1600,height:valid(w,h)?h:900};
  }).filter(Boolean);
  const photoSizes = '(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 800px';
'''

MEDIA_LINE = '''  const mediaTags = photo ? `<meta property="og:image" content="${escapeHtml(url.origin+photo)}"><meta name="twitter:card" content="summary_large_image"><link rel="preload" as="image" href="${escapeHtml(photo)}" ${photoMedia[0]?.srcset ? `imagesrcset="${escapeHtml(photoMedia[0].srcset)}" imagesizes="${escapeHtml(photoSizes)}"` : ''} fetchpriority="high">` : '';'''

SLIDES_LINE = '''  const photoSlides = photoMedia.length ? photoMedia.map((media,i)=>`<div class="seo-slide ${i?'hidden':''}" data-slide="${i}"><img src="${escapeHtml(media.src)}" ${media.srcset ? `srcset="${escapeHtml(media.srcset)}" sizes="${escapeHtml(photoSizes)}"` : ''} width="${media.width}" height="${media.height}" alt="Foto ${i+1} do imóvel ${safeTitle}" ${i?'loading="lazy"':'loading="eager" fetchpriority="high"'} decoding="async" draggable="false" class="w-full h-full object-cover"></div>`).join('') :'''


def apply(text):
    if 'const photoMedia = images.map(' in text:
        raise ValueError('Helper responsivo já encontrado; não aplicarei novamente')
    anchor = re.search(r'^\s*const mediaTags = photo \? .+$', text, re.M)
    slide = re.search(r'^\s*const photoSlides = photos\.length \? photos\.map\(\(path,i\)=>.+\.join\(\x27\x27\) :\s*$',text,re.M)
    if not anchor or not slide:
        raise ValueError('Padrão SSR 4.6 incompatível: necessário revisar manualmente (nenhuma alteração feita)')
    if '\n' in anchor.group(0).strip() or '\n' in slide.group(0).strip():
        raise ValueError('Padrão inesperado')
    text = text[:slide.start()] + SLIDES_LINE + text[slide.end():]
    anchor = re.search(r'^\s*const mediaTags = photo \? .+$', text, re.M)
    text = text[:anchor.start()] + '\n' + PHOTO_MEDIA + MEDIA_LINE + text[anchor.end():]
    return text


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--file',type=Path,default=Path('functions/_shared/property-seo.js'))
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    if not args.file.is_file(): parser.error('Arquivo SSR não encontrado')
    original=args.file.read_bytes()
    newline='\r\n' if b'\r\n' in original else '\n'
    text=original.decode('utf-8').replace('\r\n','\n')
    updated=apply(text)
    if not args.apply:
        print('VALIDADO: SSR compatível com o patch; execute com --apply para criar backup e editar. Nada foi alterado.')
        return
    name='Yolanda-property-seo-backup-'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')+'.js'
    backup=Path(tempfile.gettempdir())/name
    backup.write_bytes(original)
    result=updated.replace('\n',newline).encode('utf-8')
    tmp=args.file.with_suffix('.js.tmp')
    tmp.write_bytes(result)
    os.replace(tmp,args.file)
    print('ALTERADO:',args.file)
    print('BACKUP:',backup)
    print('Próximo teste: node --check functions/_shared/property-seo.js; git diff --check')


if __name__=='__main__': main()
