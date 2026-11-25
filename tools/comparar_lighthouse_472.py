#!/usr/bin/env python3
"""Compara dois JSON Lighthouse Mobile sem enviar dados para a rede.

Uso: py tools/comparar_lighthouse_472.py --antes "relatorio-471.json" --depois "relatorio-472.json"
"""
import argparse
import json
import sys
from pathlib import Path

METRICS = [
    ('first-contentful-paint', 'FCP', 'ms'),
    ('largest-contentful-paint', 'LCP', 'ms'),
    ('total-blocking-time', 'TBT', 'ms'),
    ('cumulative-layout-shift', 'CLS', ''),
    ('speed-index', 'Speed Index', 'ms'),
]

def load(path):
    with Path(path).open(encoding='utf-8-sig') as f:
        obj = json.load(f)
    if 'audits' not in obj or 'categories' not in obj:
        raise ValueError(f'JSON não parece ser um relatório Lighthouse: {path}')
    return obj

def inspect(obj):
    audits = obj['audits']
    req = audits.get('network-requests', {}).get('details', {}).get('items', [])
    urls = [x.get('url','') for x in req]
    return {
        'score': round(100*obj['categories'].get('performance',{}).get('score',0)),
        'url': obj.get('finalUrl',''),
        'benchmark': obj.get('environment',{}).get('benchmarkIndex'),
        'values': {k: audits.get(k,{}).get('numericValue') for k,_,_ in METRICS},
        'mini': any('/js/lucide-vitrine-472.js' in u for u in urls),
        'unpkg': any('unpkg.com/lucide' in u for u in urls),
        'favicon': any('/img/logo.png' in u for u in urls),
        'network_present': bool(urls),
    }

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--antes',required=True)
    p.add_argument('--depois',required=True)
    a=p.parse_args()
    before=inspect(load(a.antes));after=inspect(load(a.depois))
    print(f"ANTES {before['score']}/100 | DEPOIS {after['score']}/100 | URL {after['url']}")
    print(f"{'Métrica':<15}{'4.7.1':>13}{'4.7.2':>13}{'Mudança':>14}")
    for k,name,unit in METRICS:
        v1=before['values'].get(k);v2=after['values'].get(k)
        if v1 is None or v2 is None: continue
        if unit=='ms':
            fmt=lambda x:f'{x/1000:.2f} s' if k!='total-blocking-time' else f'{x:.0f} ms'
        else:fmt=lambda x:f'{x:.3f}'
        print(f'{name:<15}{fmt(v1):>13}{fmt(v2):>13}{(v2-v1)/max(v1,1)*100:+13.1f}%')
    if not after['network_present']:
        print('ATENÇÃO: relatório sem auditoria de rede, não é possível verificar recursos.')
    else:
        print('Mini Lucide local:', 'SIM' if after['mini'] else 'NÃO')
        print('Lucide CDN antigo:', 'PRESENTE' if after['unpkg'] else 'AUSENTE')
        print('logo.png ainda requisitado:', 'SIM' if after['favicon'] else 'NÃO')
    b1,b2=before['benchmark'],after['benchmark']
    if isinstance(b1,(int,float)) and isinstance(b2,(int,float)) and abs(b2-b1)>b1*.15:
        print(f'AVISO: benchmark de CPU diferente ({b1} vs {b2}); pontuações não são diretamente comparáveis.')
    print('Repetir 3 vezes nas mesmas condições e comparar medianas. NÃO publicar em Production com apenas 1 medição.')

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,json.JSONDecodeError) as e:
        print('ERRO:',e,file=sys.stderr)
        sys.exit(1)
