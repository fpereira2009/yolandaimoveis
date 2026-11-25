#!/usr/bin/env python3
"""Yolanda 4.7.1: otimiza a homepage sobre a branch ATUAL, sem sobrescrever index.html.

Uso:
    py tools/aplicar_performance_471.py --check
    py tools/aplicar_performance_471.py --apply

Fail-closed: não altera o site se o cabeçalho da homepage divergir do padrão conhecido,
ou se o CSS compilado/assets não existirem. Backup guardado em pasta temporária.
"""
import argparse
import re
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / 'public' / 'index.html'
CSS = ROOT / 'public' / 'css' / 'tailwind.min.css'
STATIC_ASSETS = [
    'logo-128.webp', 'fotocorretora-160.webp', 'fotocorretora-480.webp',
    'fotocorretora-800.webp', 'resende-hero.webp', 'resende-hero-480.webp',
]

def one(pattern, replacement, text, description, flags=0):
    out, n = re.subn(pattern, replacement, text, count=0, flags=flags)
    if n != 1:
        raise ValueError(f'{description}: esperado 1 trecho, encontrado {n}. Nenhuma mudança foi salva.')
    return out

def make_changes(text):
    # Idempotência: --check posterior não modifica o arquivo já transformado.
    if 'href="/css/tailwind.min.css"' in text and 'cdn.tailwindcss.com' not in text:
        return None

    if 'cdn.tailwindcss.com' not in text:
        raise ValueError('Não foi encontrado o Tailwind CDN esperado. Faça uma revisão manual.')

    text = one(r'(?m)^[ \t]*<!-- Tailwind CSS CDN -->[ \t]*\r?\n[ \t]*<script src="https://cdn\.tailwindcss\.com/3\.4\.17"></script>',
               '    <!-- CSS compilado e servido localmente pelo Cloudflare Pages -->\n    <link rel="stylesheet" href="/css/tailwind.min.css">',
               text, 'Tailwind CDN')
    text = one(r'(?s)[ \t]*<!-- Configuração da Paleta[^\n]*-->\s*<script>\s*tailwind\.config\s*=\s*\{.*?\};\s*</script>\s*',
               '\n',text,'Config Tailwind inline')
    # Exige compatibilidade entre biblioteca de ícones e os scripts da vitrine.
    text = one(r'<script src="(https://unpkg\.com/lucide@0\.469\.0(?:/dist/umd/lucide\.min\.js)?)"></script>',
               r'<script src="\1" defer></script>',text,'Lucide head')
    for filename in ('property-description','crm-input-masks','vitrine-app'):
        text = one(r'<script src="(/js/'+re.escape(filename)+r'\.js[^"<>]*)"></script>',
                   r'<script src="\1" defer></script>',text,filename+' script')

    # Não muda o favicon/apple-touch-icon: navegador usa o PNG de marca original.
    text = one(r'<img\s+src="/img/logo\.png"',
               '<img src="/img/logo-128.webp" width="128" height="128" decoding="async"',
               text,'Logotipo header')

    hero_old='960px-A_cidade_de_Resende_RJ,_aos_pés_da_Serra_da_Mantiqueira.jpg'
    text = one(r'<img\s+src="/img/'+re.escape(hero_old)+r'"',
               ('<img src="/img/resende-hero.webp" '
                'srcset="/img/resende-hero-480.webp 480w, /img/resende-hero.webp 960w" '
                'sizes="(max-width: 640px) calc(100vw - 32px), 480px" '
                'width="960" height="640" loading="lazy" decoding="async" fetchpriority="low"'),
               text,'Foto Resende')

    avatar_pat=r'<img\s+src="/img/fotocorretora\.jpeg"(?P<attrs>[^>]*?)>'
    count=0
    def avatar_change(m):
        nonlocal count
        count+=1
        attrs=m.group('attrs')
        if 'w-full h-full' in attrs: # retrato de apresentação na seção Sobre
            sizes='(min-width: 1024px) 448px, calc(100vw - 48px)'
        elif 'w-24 h-24' in attrs:
            sizes='(min-width: 640px) 112px, 96px'
        elif 'w-12 h-12' in attrs:
            sizes='48px'
        elif 'w-10 h-10' in attrs:
            sizes='40px'
        else:
            raise ValueError('Foto da corretora com classe não reconhecida; alteração cancelada')
        return ('<img src="/img/fotocorretora-480.webp" '
                'srcset="/img/fotocorretora-160.webp 160w, '
                '/img/fotocorretora-480.webp 480w, /img/fotocorretora-800.webp 800w" '
                f'sizes="{sizes}" width="800" height="875" '
                'loading="lazy" decoding="async"'+attrs+'>')
    text=re.sub(avatar_pat, avatar_change, text,flags=re.S)
    if count!=4:
        raise ValueError(f'Fotos da corretora: esperadas 4, encontradas {count}; nada foi salvo.')
    if 'cdn.tailwindcss.com' in text or re.search(r'\btailwind\.config\s*=',text):
        raise ValueError('Ainda há Tailwind runtime no index, alteração cancelada')
    return text

def check_static():
    problems=[]
    if not CSS.exists():
        problems.append('CSS compilado ausente: '+str(CSS))
    else:
        css=CSS.read_text(encoding='utf8')
        if len(css)<10000:
            problems.append('CSS muito pequeno (<10 KB); confira o build Tailwind')
        for token in ('.bg-moss','.text-moss','.font-heading','.rounded-3xl'):
            if token not in css:problems.append(f'Classe obrigatória ausente no CSS: {token}')
    for filename in STATIC_ASSETS:
        if not (ROOT/'public'/'img'/filename).is_file():problems.append('Imagem ausente: '+filename)
    return problems

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    mode=ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check',action='store_true',help='Mostra somente pré-condições, sem escrita')
    mode.add_argument('--apply',action='store_true',help='Atualiza homepage após validar CSS e imagens')
    args=ap.parse_args()
    original=HOME.read_text(encoding='utf8')
    changed=make_changes(original)
    if changed is None:
        print('JÁ APLICADO: homepage utiliza Tailwind CSS estático. Nenhuma alteração.');return
    problems=check_static()
    if problems:
        print('PENDÊNCIAS DE BUILD:')
        for x in problems:print(' -',x)
        if args.apply:raise ValueError('Não aplicar sem CSS compilado e imagens completas')
    else:print('CSS e 6 imagens otimizadas disponíveis.')
    print('Pré-condições HTML OK. Tailwind runtime, Lucide, 3 scripts da vitrine e 6 imagens identificados.')
    if args.check:
        print('CHECK: nenhum arquivo alterado.');return
    assert args.apply
    backups=Path(tempfile.gettempdir())/'Yolanda-4.7.1-backups'
    backups.mkdir(parents=True,exist_ok=True)
    destination=backups/('index-pre-4.7.1-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.html')
    shutil.copy2(HOME,destination)
    HOME.write_text(changed,encoding='utf8',newline='\n')
    print('APLICADO. Backup:',destination)
    print('Confira: git diff -- public/index.html && npm test && Lighthouse Mobile no Preview.')

if __name__=='__main__':
    try:main()
    except (ValueError,OSError) as e:
        print('BLOQUEADO:',e,file=sys.stderr)
        sys.exit(1)
