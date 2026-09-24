#!/usr/bin/env python3
"""Sobe a versão em todos os lugares de uma vez (sw.js CACHE e V, ?v= das tags do index.html).
Sem isso o deploy fica invisível: a cache HTTP do navegador seguraria app.js e dados/*.js antigos."""
import re, os
R = os.path.dirname(os.path.abspath(__file__))
sw = open(os.path.join(R, "sw.js"), encoding="utf-8").read()
n = int(re.search(r'const V = "(\d+)"', sw).group(1)) + 1
sw = re.sub(r'const CACHE = "fu-v\d+"', f'const CACHE = "fu-v{n}"', sw)
sw = re.sub(r'const V = "\d+"', f'const V = "{n}"', sw)
open(os.path.join(R, "sw.js"), "w", encoding="utf-8").write(sw)
ix = open(os.path.join(R, "index.html"), encoding="utf-8").read()
ix = re.sub(r'\?v=\d+"', f'?v={n}"', ix)
open(os.path.join(R, "index.html"), "w", encoding="utf-8").write(ix)
print(f"versão {n}")
