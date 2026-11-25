#!/usr/bin/env python3
"""Hotfix 4.7.7: executar na raiz do checkout atualizado da branch dev.
Faz checagens de compatibilidade antes de gravar qualquer arquivo.
"""
from pathlib import Path
import sys

root = Path.cwd()
files = {
 'public/js/crm-properties.js': [],
 'public/app/index.html': [],
 'functions/api/media/[[path]].js': [],
}
def add(file, old, new): files[file].append((old,new))
add('public/js/crm-properties.js',
"""                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                    showToast('Use fotos JPEG, PNG ou WebP.'); continue;
                }
""",
"""                const mime = (file.type || '').toLowerCase();
                const extension = file.name.split('.').pop().toLowerCase();
                const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime)
                    || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension);
                if (!accepted) {
                    showToast('Use fotos JPG, PNG, WebP ou HEIC.'); continue;
                }
""")
start='        // Engine 4.7: WebP + miniatura separada, sem aumentar imagens menores.'
end='        // Preserva tipos personalizados já existentes no banco ao editar um imóvel.'
replacement='''        // Converte fotos JPG, PNG, WebP e HEIC legíveis pelo navegador para JPG.
        // 1600 px principal / 480 px miniatura; nunca amplia a foto original.
        async function optimizePropertyPhoto(file) {
            let objectUrl;
            try {
                objectUrl = URL.createObjectURL(file);
                const img = await new Promise((resolve, reject) => {
                    const el = new Image();
                    el.onload = () => resolve(el);
                    el.onerror = () => reject(new Error(
                        'Não foi possível abrir esta foto. Se for HEIC, exporte como JPG ou use o Safari atualizado.'
                    ));
                    el.src = objectUrl;
                });
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                if (!w || !h || w * h > 60_000_000)
                    throw new Error('Imagem muito grande ou inválida.');
                const make = async (maxSide) => {
                    const ratio = Math.min(1, maxSide / Math.max(w, h));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(w * ratio));
                    canvas.height = Math.max(1, Math.round(h * ratio));
                    const ctx = canvas.getContext('2d', {alpha:false});
                    if (!ctx) throw new Error('Canvas indisponível.');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.80));
                    if (!blob || blob.type !== 'image/jpeg')
                        throw new Error('Navegador não conseguiu gerar JPG.');
                    return {blob, width:canvas.width, height:canvas.height};
                };
                const full = await make(1600);
                const thumb = await make(480);
                if (full.blob.size > 6 * 1024 * 1024 || thumb.blob.size > 2 * 1024 * 1024)
                    throw new Error('Foto muito grande após otimização.');
                return {full, thumb};
            } finally {
                if (objectUrl) URL.revokeObjectURL(objectUrl);
            }
        }
        async function sendPropertyImage(code, optimized) {
            const form = new FormData();
            form.append('main', optimized.full.blob, 'full.jpg');
            form.append('thumb', optimized.thumb.blob, 'thumb.jpg');
            form.append('width', String(optimized.full.width));
            form.append('height', String(optimized.full.height));
            form.append('thumbWidth', String(optimized.thumb.width));
            form.append('thumbHeight', String(optimized.thumb.height));
            const resp = await fetch('/api/media/properties/' + encodeURIComponent(code) + '/images', {
                method:'PUT', credentials:'same-origin', headers:{'Accept':'application/json'}, body:form
            });
            const result = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(result.error || `Falha no upload (HTTP ${resp.status}).`);
            return result.item;
        }

'''
add('public/app/index.html','accept="image/jpeg,image/png,image/webp"', 'accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"')
api='functions/api/media/[[path]].js'
add(api,"if (!match || (match[3] && match[4] !== 'webp'))", "if (!match)")
add(api,"if (main.type !== 'image/webp' || small.type !== 'image/webp') throw new ApiError(415, 'Apenas WebP otimizado é permitido nesse fluxo.');",
"const accepted = new Set(['image/jpeg', 'image/webp']);\n  if (!accepted.has(main.type) || !accepted.has(small.type) || main.type !== small.type)\n    throw new ApiError(415, 'Envie principal e miniatura no mesmo formato JPEG ou WebP.');")
add(api,"checkMime('image/webp', full); checkMime('image/webp', thumb);", "const ext = checkMime(main.type, full); checkMime(small.type, thumb);")
add(api,"return {full, thumb, mainMime:'image/webp', ext:'webp', dims:{w,h,tw,th}};", "return {full, thumb, mainMime:main.type, ext, dims:{w,h,tw,th}};")
add(api,'${uuid}-thumb.webp', '${uuid}-thumb.${ext}')
add(api,"httpMetadata:{contentType:'image/webp', cacheControl:IMAGE_CACHE}", "httpMetadata:{contentType:mainMime, cacheControl:IMAGE_CACHE}")

out={}
try:
 for filename, patches in files.items():
  path=root/filename
  content=path.read_text(encoding='utf-8')
  if filename.endswith('crm-properties.js'):
   if content.count(start)!=1 or content.count(end)!=1: raise ValueError(f'{filename}: delimitadores inesperados')
   i=content.index(start); j=content.index(end)
   if i>=j: raise ValueError(f'{filename}: ordem inesperada')
   original=content[i:j]
   if 'full.webp' not in original or "'image/webp'" not in original: raise ValueError('Motor de upload mudou')
   content=content[:i]+replacement+content[j:]
  for old,new in patches:
   if content.count(old)!=1: raise ValueError(f'{filename}: esperado 1 ocorrência, encontrado {content.count(old)}: {old[:50]}')
   content=content.replace(old,new)
  out[path]=content
except (OSError, ValueError) as err:
 print('ABORTADO: arquivo não alterado:',err,file=sys.stderr);sys.exit(1)
if '--check' in sys.argv:
 print('Compatível com o hotfix. Nenhum arquivo alterado.');sys.exit(0)
for path, content in out.items():
 path.write_text(content,encoding='utf-8')
 print('ATUALIZADO:',path.relative_to(root))
print('Execute: node --check public/js/crm-properties.js')
print('Execute: node --check "functions/api/media/[[path]].js"')
print('Execute: npm test')
