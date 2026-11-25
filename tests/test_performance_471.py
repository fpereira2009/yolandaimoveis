#!/usr/bin/env python3
"""Smoke test 4.7.1: não consulta redes/Cloudflare e não altera dados."""
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('aplicar_performance_471', ROOT/'tools/aplicar_performance_471.py')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Perf471Tests(unittest.TestCase):
    def test_transformacao_nao_remove_dados_estruturados(self):
        html='''<head>
<!-- Tailwind CSS CDN -->
<script src="https://cdn.tailwindcss.com/3.4.17"></script>
<script src="https://unpkg.com/lucide@0.469.0"></script>
<!-- Configuração da Paleta 'Moderno & Acolhedor' -->
<script>
tailwind.config = { theme: { extend: { colors: { moss: '#2C4A3E' } } } };
</script>
<script type="application/ld+json">{"@type":"RealEstateAgent"}</script>
</head><body>
<img src="/img/logo.png" alt="Yolanda">
<img src="/img/960px-A_cidade_de_Resende_RJ,_aos_pés_da_Serra_da_Mantiqueira.jpg" alt="Resende">
<img src="/img/fotocorretora.jpeg" class="w-24 h-24 sm:w-28 sm:h-28">
<img src="/img/fotocorretora.jpeg" class="w-full h-full aspect-square">
<img src="/img/fotocorretora.jpeg" class="w-12 h-12">
<img src="/img/fotocorretora.jpeg" class="w-10 h-10">
<script src="/js/property-description.js?v=4.3.1"></script>
<script src="/js/crm-input-masks.js?v=4.5.3"></script>
<script src="/js/vitrine-app.js?v=4.6.0"></script>
</body>'''
        result=mod.make_changes(html)
        self.assertNotIn('cdn.tailwindcss.com',result)
        self.assertNotIn('tailwind.config =',result)
        self.assertIn('<link rel="stylesheet" href="/css/tailwind.min.css">',result)
        self.assertIn('type="application/ld+json">{"@type":"RealEstateAgent"}',result)
        self.assertEqual(result.count('defer></script>'),4)
        self.assertIn('/img/logo-128.webp',result)
        self.assertEqual(result.count('src="/img/fotocorretora-480.webp"'),4)
        self.assertIn('/img/resende-hero-480.webp',result)
        self.assertIsNone(mod.make_changes(result))
        self.assertIn('alt="Yolanda"',result)

    def test_fail_closed(self):
        with self.assertRaises(ValueError):mod.make_changes('<html>site diferente</html>')

    def test_arquivos_de_midia(self):
        from PIL import Image
        wanted={'logo-128.webp':128,'fotocorretora-160.webp':160,
                'fotocorretora-480.webp':480,'fotocorretora-800.webp':800}
        for name,limit in wanted.items():
            path=ROOT/'public/img'/name
            self.assertTrue(path.is_file(),name)
            with Image.open(path) as im:
                self.assertEqual(im.format,'WEBP')
                self.assertLessEqual(max(im.size),limit)
        self.assertLess((ROOT/'public/img/logo-128.webp').stat().st_size,50000)

    def test_html_de_branch_atual_quando_existir(self):
        html_file=ROOT/'public/index.html'
        if not html_file.is_file():return
        html=html_file.read_text(encoding='utf8')
        out=mod.make_changes(html)
        if out is None:
            self.assertNotIn('cdn.tailwindcss.com',html)
            self.assertIn('href="/css/tailwind.min.css"',html)
            self.assertEqual(html.count('defer></script>')>=4,True)
        else:
            self.assertIn('/css/tailwind.min.css',out)
            self.assertEqual(out.count('type="application/ld+json"'),html.count('type="application/ld+json"'))

if __name__=='__main__':
    unittest.main(verbosity=2)
