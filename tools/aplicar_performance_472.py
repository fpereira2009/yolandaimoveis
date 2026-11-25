#!/usr/bin/env python3
"""Yolanda 4.7.2 — patch fail-closed sobre a versão 4.7.1 (apenas vitrine).

    py tools/aplicar_performance_472.py --check
    py tools/aplicar_performance_472.py --apply

Não toca /app, banco D1, bucket R2, Pages Functions, URLs e SSR.
Não executar sobre 'main'. Cria backups fora do repositório antes de gravar.
"""
import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'public/index.html'
APP_PATH = ROOT / 'public/js/vitrine-app.js'
MINI_ICON_PATH = ROOT / 'public/js/lucide-vitrine-472.js'
CSS_PATH = ROOT / 'public/css/tailwind.min.css'
ICON_SET = {
    'lock', 'message-circle', 'menu', 'search', 'arrow-right', 'refresh-cw',
    'shield-check', 'map-pin', 'send', 'phone', 'check-circle-2', 'image-off',
    'share-2', 'chevron-left', 'chevron-right', 'x',
}


def replace_one(text, old, new, name):
    if text.count(old) != 1:
        raise ValueError(f'{name}: esperado 1 trecho exato, encontrados {text.count(old)}. Nenhum arquivo alterado.')
    return text.replace(old, new, 1)


def homepage_patch(text):
    if '/css/tailwind.min.css' not in text or 'cdn.tailwindcss.com' in text:
        raise ValueError('A homepage não está na base 4.7.1 com CSS estático; pare e atualize a branch dev.')
    old_js = '<script src="https://unpkg.com/lucide@0.469.0" defer></script>'
    new_js = '<script src="/js/lucide-vitrine-472.js?v=4.7.2" defer></script>'
    if new_js in text and 'unpkg.com/lucide' not in text:
        if '/img/favicon-32.png' not in text or '/img/apple-touch-icon-180.png' not in text:
            raise ValueError('4.7.2 parcialmente aplicada: revisar o index.html antes de continuar.')
        return None
    text = replace_one(text, old_js, new_js, 'Lucide na vitrine')
    text = replace_one(text,
        '<link rel="icon" type="image/png" href="/img/logo.png">',
        '<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">',
        'Favicon 32x32')
    text = replace_one(text,
        '<link rel="apple-touch-icon" href="/img/logo.png">',
        '<link rel="apple-touch-icon" sizes="180x180" href="/img/apple-touch-icon-180.png">',
        'Ícone iOS')
    if 'unpkg.com/lucide' in text or '<script src="https://cdn.tailwindcss' in text:
        raise ValueError('Permanece dependência bloqueante; alteração cancelada.')
    return text


def vitrine_patch(text):
    old = 'const BROKER_AVATAR = "/img/fotocorretora.jpeg";'
    new = 'const BROKER_AVATAR = "/img/fotocorretora-480.webp";'
    if new in text and old not in text: return None
    if 'responsiveCoverAttributes' not in text or 'safeRefreshIcons()' not in text:
        raise ValueError('Vitrine não tem base 4.7.0/4.7.1 esperada; não alterar o JavaScript.')
    return replace_one(text, old, new, 'Avatar do modal da vitrine')


def verify_icon_coverage(html, js):
    names = set(re.findall(r'data-lucide=[\'\"]([^\'\"]+)', html + '\n' + js))
    unknown = names - ICON_SET
    if unknown:
        raise ValueError('Ícones ausentes no subconjunto: ' + ', '.join(sorted(unknown)) +
                         '. Não prosseguir sem ampliar o renderer e os testes.')
    if len(names) < 12:
        raise ValueError('Lista de ícones inesperadamente pequena; verificar versão da vitrine.')
    return names


def verify_assets():
    required = [MINI_ICON_PATH, CSS_PATH,
                ROOT / 'public/img/favicon-32.png',
                ROOT / 'public/img/apple-touch-icon-180.png',
                ROOT / 'public/img/fotocorretora-480.webp']
    for p in required:
        if not p.is_file() or p.stat().st_size < 1000:
            raise ValueError(f'Asset ausente/inválido: {p.relative_to(ROOT)}')
    bundle = MINI_ICON_PATH.read_text(encoding='utf-8')
    for name in ICON_SET:
        if f"'{name}':" not in bundle:
            raise ValueError(f'Ícone {name} faltando no JS compacto')
    if MINI_ICON_PATH.stat().st_size > 25000:
        raise ValueError('JS compacto inesperadamente grande (>25KB)')


def git_branch():
    if not (ROOT / '.git').exists(): return None
    r = subprocess.run(['git', 'branch', '--show-current'], cwd=ROOT, capture_output=True,
                       text=True, check=False)
    return r.stdout.strip() if r.returncode == 0 else None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    choice = ap.add_mutually_exclusive_group(required=True)
    choice.add_argument('--check', action='store_true')
    choice.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    branch = git_branch()
    if branch == 'main':
        raise ValueError('Branch main/Production bloqueada. Crie perf/otimizacao-vitrine-472 a partir de dev.')
    html = HTML_PATH.read_text(encoding='utf-8')
    js = APP_PATH.read_text(encoding='utf-8')
    verify_assets()
    names = verify_icon_coverage(html, js)
    new_html = homepage_patch(html)
    new_js = vitrine_patch(js)
    print(f'Branch: {branch or "não detectada"}. Ícones cobertos: {len(names)}/16.')
    print(f'CSS compilado: {CSS_PATH.stat().st_size} bytes; renderer local: {MINI_ICON_PATH.stat().st_size} bytes.')
    if new_html is None and new_js is None:
        print('JÁ APLICADO: o código contém as mudanças da 4.7.2.'); return
    if args.check:
        print('CHECK OK: nenhuma alteração salva. Arquivos candidatos:',
              ', '.join(x for x, changed in [('index.html', new_html), ('vitrine-app.js', new_js)] if changed is not None))
        return
    backup_dir = Path(tempfile.gettempdir()) / 'Yolanda-4.7.2-backups' / datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup_dir.mkdir(parents=True, exist_ok=True)
    for path in [HTML_PATH, APP_PATH]:
        shutil.copy2(path, backup_dir / path.name)
    try:
        if new_html is not None: HTML_PATH.write_text(new_html, encoding='utf-8', newline='\n')
        if new_js is not None: APP_PATH.write_text(new_js, encoding='utf-8', newline='\n')
    except BaseException:
        shutil.copy2(backup_dir / HTML_PATH.name, HTML_PATH)
        shutil.copy2(backup_dir / APP_PATH.name, APP_PATH)
        raise
    print('APLICADO com sucesso no workspace. Backup:', backup_dir)
    print('Próximos passos: node --test tests/performance-4.7.2.test.mjs && npm test && git diff --check')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as e:
        print('BLOQUEADO:', e, file=sys.stderr)
        sys.exit(1)
