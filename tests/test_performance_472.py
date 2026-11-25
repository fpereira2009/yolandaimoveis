#!/usr/bin/env python3
"""Testes unitários de alterações do HTML/JS 4.7.2, sem tocar banco ou rede."""
import importlib.util
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'tools/aplicar_performance_472.py'
spec = importlib.util.spec_from_file_location('apply472', path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Tests472(unittest.TestCase):
    def test_transformacao_idempotente(self):
        html = '''<html><head>
<link rel="icon" type="image/png" href="/img/logo.png">
<link rel="apple-touch-icon" href="/img/logo.png">
<link rel="stylesheet" href="/css/tailwind.min.css">
<script src="https://unpkg.com/lucide@0.469.0" defer></script>
<script type="application/ld+json">{"@type":"RealEstateAgent"}</script>
</head></html>'''
        result = mod.homepage_patch(html)
        self.assertIn('/js/lucide-vitrine-472.js', result)
        self.assertIn('"@type":"RealEstateAgent"', result)
        self.assertNotIn('unpkg.com',result)
        self.assertIn('/css/tailwind.min.css',result)
        self.assertIsNone(mod.homepage_patch(result))
    def test_falha_sem_base_471(self):
        with self.assertRaises(ValueError):mod.homepage_patch('<script src="https://cdn.tailwindcss.com"></script>')
    def test_nunca_remove_icone_desconhecido(self):
        with self.assertRaises(ValueError):mod.verify_icon_coverage('<i data-lucide="novo-icone"/>', '<i data-lucide="x"/>')
    def test_avatar_dinamico(self):
        text='''const BROKER_AVATAR = "/img/fotocorretora.jpeg";
function responsiveCoverAttributes(){}
function safeRefreshIcons(){}'''
        result=mod.vitrine_patch(text)
        self.assertIn('/img/fotocorretora-480.webp',result)
        self.assertIsNone(mod.vitrine_patch(result))
        self.assertIn('responsiveCoverAttributes',result)
    def test_check_realiza_leitura_dos_recursos(self):
        mod.verify_assets()
        html=(ROOT/'public/index.html').read_text(encoding='utf8')
        js=(ROOT/'public/js/vitrine-app.js').read_text(encoding='utf8')
        names=mod.verify_icon_coverage(html,js)
        self.assertEqual(len(names),16)

if __name__=='__main__':unittest.main(verbosity=2)
