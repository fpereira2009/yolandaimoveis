#!/usr/bin/env python3
"""Comparação legível de indicadores Lighthouse Mobile. Não altera arquivos."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('json_report',type=Path);x=p.parse_args()
r=json.loads(x.json_report.read_text(encoding='utf8'))
print('URL:',r.get('finalUrl'))
print('Lighthouse:',r.get('lighthouseVersion'),'data:',r.get('fetchTime'))
print('Desempenho: ', round((r['categories']['performance'].get('score') or 0)*100))
for a in ('first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index'):
 v=r.get('audits',{}).get(a,{});print(f'{a:27s} {v.get("displayValue","indisponível")}')
print('INP não é inferido do teste de navegação. Requer medições em campo ou instrumentação apropriada.')
