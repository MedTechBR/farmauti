#!/usr/bin/env python3
"""Confere um lote de conteúdo do FarmaUTI antes de ele entrar no app.

Uso: python3 docs/checa_lote.py lotes/a1.json [lotes/a2.json ...]
     python3 docs/checa_lote.py lotes/bulario-a.json      (detecta o tipo pelo nome)
     python3 docs/checa_lote.py lotes/interacoes.json
     python3 docs/checa_lote.py lotes/casos.json

Erro = precisa corrigir. Aviso = conferir.
"""
import json, re, sys, os, statistics

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUR = json.load(open(os.path.join(RAIZ, "docs/curriculo.json"), encoding="utf-8"))
SLUGS = {l["slug"]: l for l in CUR["leituras"]}
FARM = {f["id"] for f in json.load(open(os.path.join(RAIZ, "docs/farmacos.json"), encoding="utf-8"))}
TAGS = {"qt", "serotonina", "sangramento", "hipercalemia", "hipocalemia", "snc", "nefrotox", "ototox",
        "bradicardia", "hipotensao", "convulsao", "anticolinergico", "hipoglicemia", "mielotox",
        "hepatotox", "sub3a4", "inib3a4", "ind3a4", "quelante", "quelavel"}
GRAV = {"contraindicada", "grave", "moderada", "menor"}

erros, avisos = [], []
def E(m): erros.append(m)
def A(m): avisos.append(m)

def palavras_html(h):
    t = re.sub(r"<pre class=\"mermaid\">.*?</pre>", " ", h, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return len(re.findall(r"\w+", t))

def checa_html(slug):
    p = os.path.join(RAIZ, "conteudo", slug + ".html")
    if not os.path.exists(p):
        E(f"{slug}: falta conteudo/{slug}.html"); return 0
    h = open(p, encoding="utf-8").read()
    n = palavras_html(h)
    if n < 2500: E(f"{slug}: só {n} palavras (mínimo 2.800)")
    if not h.lstrip().startswith('<p class="dek">'): E(f"{slug}: não começa com <p class=\"dek\">")
    for t in ("<html", "<head", "<body", "<style", "<script"):
        if t in h.lower(): E(f"{slug}: contém {t}>")
    if h.count('class="cx farma"') < 2: E(f"{slug}: menos de 2 caixas 'Na prática do farmacêutico'")
    if "<h2>Perguntas de revisão</h2>" not in h: E(f"{slug}: falta h2 'Perguntas de revisão'")
    if "<h2>Erros frequentes</h2>" not in h: A(f"{slug}: falta h2 'Erros frequentes'")
    if 'class="fontes"' not in h: E(f"{slug}: falta <section class=\"fontes\">")
    tabs = len(re.findall(r"<table", h)); emb = len(re.findall(r'<div class="tab">\s*<table', h))
    if tabs != emb: E(f"{slug}: {tabs - emb} tabela(s) sem <div class=\"tab\">")
    trav = h.count("—")
    if n and trav / n * 1000 > 3: A(f"{slug}: {trav} travessões ({trav / n * 1000:.1f}/mil palavras)")
    for f in ("Neste texto", "Nesta leitura", "Vale lembrar", "É importante ressaltar", "Em resumo"):
        if f in h: A(f"{slug}: metanarração '{f}'")
    if re.search(r"<h2>\s*\d", h): E(f"{slug}: h2 numerado")
    classes = set(re.findall(r'class="([^"]+)"', h))
    ok = {"dek", "tab", "cx chave", "cx alerta", "cx farma", "cx calculo", "fluxo", "leg", "mermaid", "rev", "fontes"}
    for c in classes - ok: A(f"{slug}: classe não prevista '{c}'")
    if h.count("<details") != h.count("</details>"): E(f"{slug}: <details> desbalanceado")
    if h.count("<div") != h.count("</div>"): E(f"{slug}: <div> desbalanceado ({h.count('<div')}/{h.count('</div>')})")
    return n

def checa_questao(q, rot):
    for k in ("leitura", "nivel", "enun", "alts", "gab", "coment", "porAlt", "base"):
        if k not in q: E(f"{rot}: falta '{k}'"); return None
    if q["nivel"] not in ("basico", "intermediario", "avancado"): E(f"{rot}: nivel inválido")
    if len(q["alts"]) != 5: E(f"{rot}: {len(q['alts'])} alternativas"); return None
    if len(q["porAlt"]) != 5: E(f"{rot}: porAlt com {len(q['porAlt'])}")
    if not isinstance(q["gab"], int) or not 0 <= q["gab"] <= 4: E(f"{rot}: gab inválido"); return None
    if len(q["coment"]) < 200: A(f"{rot}: comentário curto ({len(q['coment'])})")
    if not re.search(r"(19|20)\d\d", q["base"]): E(f"{rot}: base sem ano")
    if len(set(a.strip().lower() for a in q["alts"])) < 5: E(f"{rot}: alternativas repetidas")
    L = [len(a) for a in q["alts"]]; c = L[q["gab"]]
    outros = [l for i, l in enumerate(L) if i != q["gab"]]
    fora = [i for i, l in enumerate(L) if i != q["gab"] and not (0.85 * c <= l <= 1.15 * c)]
    if fora and c > 25: A(f"{rot}: alternativas fora de 85–115% da correta ({c}): " + ",".join("ABCDE"[i] + "=" + str(L[i]) for i in fora))
    folga = (c - max(outros)) / max(outros) if max(outros) else 0
    return folga, c == max(L)

def checa_leituras(d, nome):
    ls = d.get("leituras", []); cs = d.get("cartoes", []); qs = d.get("questoes", [])
    total = 0
    for l in ls:
        s = l.get("slug")
        if s not in SLUGS: E(f"slug desconhecido: {s}"); continue
        for k in ("titulo", "dek", "palavras", "fontes"):
            if k not in l: E(f"{s}: metadado sem '{k}'")
        n = checa_html(s); total += n
        nc = sum(1 for c in cs if c.get("leitura") == s); nq = sum(1 for q in qs if q.get("leitura") == s)
        if nc < 12: E(f"{s}: {nc} cartões (pedidos 14)")
        if nq < 6: E(f"{s}: {nq} questões (pedidas 6)")
        print(f"  {s}: {n} palavras, {nc} cartões, {nq} questões")
    for i, c in enumerate(cs):
        if not c.get("frente") or not c.get("verso"): E(f"cartão {i}: vazio")
        if c.get("leitura") not in SLUGS: E(f"cartão {i}: leitura inválida {c.get('leitura')}")
        if len(c.get("verso", "")) > 480: A(f"cartão {i}: verso longo ({len(c['verso'])})")
    folgas, maior, pos = [], 0, [0] * 5
    for i, q in enumerate(qs):
        r = checa_questao(q, f"questão {i} ({q.get('leitura')})")
        if r: folgas.append(r[0]); maior += r[1]; pos[q["gab"]] += 1
    if qs:
        print(f"  gabarito por posição A–E: {pos}")
        print(f"  correta é a mais longa em {maior}/{len(qs)} ({maior / len(qs) * 100:.0f}%); folga mediana {statistics.median(folgas) * 100:.1f}%")
        if maior / len(qs) > 0.45: E("viés de tamanho: correta é a mais longa em mais de 45% das questões")
    print(f"  total: {total} palavras em {len(ls)} leituras")

def checa_bulario(d):
    ids = set()
    req = ("id", "nome", "classe", "mecanismo", "indicacoes", "dose", "renal", "hepatico", "administracao",
           "monitorizacao", "efeitos", "interacoes", "perolas", "altaVigilancia", "tags", "fonte")
    for f in d:
        i = f.get("id")
        if i not in FARM: E(f"id fora da lista canônica: {i}")
        if i in ids: E(f"id repetido: {i}")
        ids.add(i)
        for k in req:
            if k not in f: E(f"{i}: falta '{k}'")
        for t in f.get("tags", []):
            if t not in TAGS: E(f"{i}: tag inválida '{t}'")
        if not re.search(r"(19|20)\d\d", str(f.get("fonte", ""))): A(f"{i}: fonte sem ano")
    print(f"  {len(d)} fármacos")

def checa_interacoes(d):
    vistos = set()
    for k, x in enumerate(d):
        a, b = x.get("a"), x.get("b")
        for v in (a, b):
            if v not in FARM: E(f"interação {k}: id desconhecido {v}")
        par = tuple(sorted((a or "", b or "")))
        if par in vistos: E(f"par repetido {par}")
        vistos.add(par)
        if x.get("grav") not in GRAV: E(f"{par}: gravidade inválida {x.get('grav')}")
        for c in ("tipo", "mecanismo", "efeito", "manejo", "fonte"):
            if not x.get(c): E(f"{par}: falta '{c}'")
    g = {}
    for x in d: g[x.get("grav")] = g.get(x.get("grav"), 0) + 1
    print(f"  {len(d)} pares; por gravidade: {g}")

def checa_casos(d):
    for c in d:
        i = c.get("id")
        for k in ("id", "titulo", "area", "nivel", "resumo", "paciente", "historia", "sinais", "labs",
                  "prescricao", "tarefa", "gabarito", "discussao", "leituras", "fontes"):
            if k not in c: E(f"caso {i}: falta '{k}'")
        for s in c.get("leituras", []):
            if s not in SLUGS: E(f"caso {i}: leitura desconhecida {s}")
        if len(c.get("gabarito", [])) < 4: A(f"caso {i}: gabarito com menos de 4 problemas")
    print(f"  {len(d)} casos")

for arq in sys.argv[1:]:
    print(arq)
    try:
        d = json.load(open(arq, encoding="utf-8"))
    except Exception as ex:
        E(f"{arq}: JSON inválido: {ex}"); continue
    b = os.path.basename(arq)
    if b.startswith("bulario"): checa_bulario(d)
    elif b.startswith("interacoes"): checa_interacoes(d)
    elif b.startswith("casos"): checa_casos(d)
    else: checa_leituras(d, b)

for m in avisos: print("AVISO", m)
for m in erros: print("ERRO ", m)
print(f"{len(erros)} erro(s), {len(avisos)} aviso(s)")
sys.exit(1 if erros else 0)
