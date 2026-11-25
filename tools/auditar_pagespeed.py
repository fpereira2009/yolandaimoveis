#!/usr/bin/env python3
"""Consulta PSI v5 e grava baseline JSON local. Pode exigir chave por limite de quota."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

p=argparse.ArgumentParser()
p.add_argument('url')
p.add_argument('--output',type=Path,default=Path('pagespeed-mobile.json'))
p.add_argument('--key',default=None)
a=p.parse_args()
params={'url':a.url,'strategy':'mobile','category':'performance'}
if a.key:params['key']=a.key
endpoint='https://www.googleapis.com/pagespeedonline/v5/runPagespeed?'+urlencode(params)
with urlopen(endpoint,timeout=60) as response:
    data=json.load(response)
a.output.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
result=data.get('lighthouseResult',{})
items=result.get('audits',{})
print('URL:',a.url)
print('Lighthouse mobile (laboratório):',result.get('categories',{}).get('performance',{}).get('score'))
for key in ('largest-contentful-paint','cumulative-layout-shift','total-blocking-time','server-response-time'):
    print(key,':',items.get(key,{}).get('displayValue','sem medição'))
crux=data.get('loadingExperience',{})
for field in ('LARGEST_CONTENTFUL_PAINT_MS','INTERACTION_TO_NEXT_PAINT','CUMULATIVE_LAYOUT_SHIFT_SCORE'):
    v=crux.get('metrics',{}).get(field,{})
    print('CrUX 28 dias',field,':',v.get('percentile','não disponível'))
print('Relatório completo:',a.output)
