#!/usr/bin/env python3
"""Confere as revisões essenciais (conteudo/revisao/<slug>.html). Uso: python3 docs/checa_revisao.py <slug>... ou --todas"""
import json, os, re, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUR = json.load(open(os.path.join(R, "docs/curriculo.json"), encoding="utf-8"))
SLUGS = [l["slug"] for l in CUR["leituras"]]
H2 = ["O que é e por que importa", "Como funciona", "O essencial em números", "Como aparece na prescrição",
      "Como cai nas questões e nos casos", "Teste rápido"]
OK = {"dek", "gl", "passos", "tab", "cx chave", "cx alerta", "cx farma", "cx calculo", "rev"}
erros = 0
alvo = SLUGS if sys.argv[1:] == ["--todas"] else sys.argv[1:]
for s in alvo:
    e = []
    if s not in SLUGS: print("ERRO slug desconhecido", s); erros += 1; continue
    p = os.path.join(R, "conteudo", "revisao", s + ".html")
    if not os.path.exists(p): print("ERRO falta", p); erros += 1; continue
    h = open(p, encoding="utf-8").read()
    n = len(re.findall(r"\w+", re.sub(r"<[^>]+>", " ", h)))
    if not h.lstrip().startswith('<p class="dek">'): e.append("não começa com dek")
    hs = [re.sub(r"<[^>]+>", "", x).strip() for x in re.findall(r"<h2>(.*?)</h2>", h)]
    if hs != H2: e.append(f"h2 fora da estrutura: {hs}")
    if not 1200 <= n <= 2600: e.append(f"{n} palavras (1.400 a 2.200)")
    for t in ("<html", "<head", "<body", "<style", "<script"):
        if t in h.lower(): e.append("contém " + t)
    if '<dl class="gl">' not in h: e.append("sem glossário dl.gl")
    if 'class="passos"' not in h: e.append("sem ol.passos")
    if h.count('class="rev"') < 6: e.append("menos de 6 perguntas no teste rápido")
    if h.count("<strong>Se aparecer") < 4: e.append("menos de 4 armadilhas 'Se aparecer'")
    if 'class="cx farma"' not in h: e.append("sem caixa farma")
    if "—" in h: e.append(f"{h.count('—')} travessões")
    tabs = len(re.findall(r"<table", h)); emb = len(re.findall(r'<div class="tab">\s*<table', h))
    if tabs != emb: e.append("tabela sem div.tab")
    for c in set(re.findall(r'class="([^"]+)"', h)) - OK: e.append(f"classe não prevista '{c}'")
    for t in ("div", "details", "dl", "ol", "ul", "table"):
        if h.count("<" + t) != h.count("</" + t + ">"): e.append(f"<{t}> desbalanceado")
    for f in ("Nesta revisão", "Neste texto", "Vale lembrar", "Em resumo", "É importante ressaltar"):
        if f in h: e.append(f"metanarração '{f}'")
    print(("ERRO " if e else "ok   ") + f"{s}: {n} palavras" + ("; " + "; ".join(e) if e else ""))
    erros += bool(e)
print(f"{erros} com erro")
sys.exit(1 if erros else 0)
