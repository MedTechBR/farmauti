#!/usr/bin/env python3
"""Monta os dados do FarmaUTI a partir dos lotes escritos pelos agentes.

Entrada:  docs/curriculo.json, docs/farmacos.json, lotes/a*.json, lotes/bulario-*.json,
          lotes/interacoes.json, lotes/casos.json, conteudo/<slug>.html
Saída:    dados/estudo.js      (áreas, leituras, semanas, cartões, questões, casos, índice de busca)
          dados/referencia.js  (fármacos, bulário, interações)

Nunca editar os arquivos de dados/ à mão: editar o lote e rodar de novo.
Ids de cartão e questão nascem do CONTEÚDO (leitura + texto), não da posição: reordenar um lote
não desalinha o progresso gravado. Corrigir o texto de uma questão gera id novo (a resposta antiga
deixa de contar para ela), o que é o comportamento certo.
"""
import glob, hashlib, html, json, os, re, sys

R = os.path.dirname(os.path.abspath(__file__))
# FU_TESTE=<pasta> monta a partir de uma pasta com lotes/ e conteudo/ de teste (a saída continua em dados/)
T = os.path.join(R, os.environ["FU_TESTE"]) if os.environ.get("FU_TESTE") else R
BASE = (os.environ["FU_TESTE"].strip("/") + "/conteudo/") if os.environ.get("FU_TESTE") else "conteudo/"
def j(p): return json.load(open(os.path.join(R, p), encoding="utf-8"))
def h8(*partes): return hashlib.md5("|".join(partes).encode("utf-8")).hexdigest()[:10]

cur = j("docs/curriculo.json")
farm = j("docs/farmacos.json")
ordem = {l["slug"]: i for i, l in enumerate(cur["leituras"])}
semana_de = {s: w["n"] for w in cur["semanas"] for s in w["leituras"]}

leituras = {l["slug"]: dict(l) for l in cur["leituras"]}
cartoes, questoes, casos, bulario, interacoes = [], [], [], [], []
avisos = []

def carrega(p):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception as e:
        avisos.append(f"{os.path.basename(p)} ignorado: {e}")
        return None

for p in sorted(glob.glob(os.path.join(T, "lotes", "a*.json"))):
    d = carrega(p)
    if not d: continue
    for l in d.get("leituras", []):
        s = l.get("slug")
        if s in leituras:
            for k in ("dek", "palavras", "fontes", "titulo"):
                if l.get(k): leituras[s][k] = l[k]
    vistos = set()
    for c in d.get("cartoes", []):
        s = c.get("leitura")
        if s not in leituras or not c.get("frente") or not c.get("verso"): continue
        i = "c" + h8(s, c["frente"])
        if i in vistos: continue
        vistos.add(i)
        cartoes.append({"id": i, "l": s, "f": c["frente"].strip(), "v": c["verso"].strip()})
    for q in d.get("questoes", []):
        s = q.get("leitura")
        if s not in leituras or len(q.get("alts", [])) != 5 or not isinstance(q.get("gab"), int): continue
        i = "q" + h8(s, q["enun"])
        if i in vistos: continue
        vistos.add(i)
        questoes.append({"id": i, "l": s, "n": q.get("nivel", "intermediario"), "e": q["enun"].strip(),
                         "a": [a.strip() for a in q["alts"]], "g": q["gab"], "c": q.get("coment", ""),
                         "p": q.get("porAlt", []), "b": q.get("base", "")})

# conteúdo: existência, palavras, títulos de seção para a busca
indice = []
for s, l in leituras.items():
    p = os.path.join(T, "conteudo", s + ".html")
    l["ok"] = os.path.exists(p)
    l["sem"] = semana_de.get(s)
    l["ord"] = ordem[s]
    if not l["ok"]: continue
    h = open(p, encoding="utf-8").read()
    txt = re.sub(r"<pre class=\"mermaid\">.*?</pre>", " ", h, flags=re.S)
    txt = re.sub(r"<[^>]+>", " ", txt)
    n = len(re.findall(r"\w+", txt))
    l["palavras"] = n
    l["min"] = max(5, round(n / 150))
    for k, m in enumerate(re.finditer(r"<h2[^>]*>(.*?)</h2>", h, flags=re.S)):
        t = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
        if t in ("Referências", "Perguntas de revisão"): continue
        indice.append([s, k, t])
    if not l.get("dek"):
        m = re.search(r'<p class="dek">(.*?)</p>', h, flags=re.S)
        if m: l["dek"] = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()

p = os.path.join(T, "lotes", "casos.json")
if os.path.exists(p):
    d = carrega(p) or []
    for c in d:
        if not c.get("id") or not c.get("gabarito"): continue
        c["leituras"] = [s for s in c.get("leituras", []) if s in leituras]
        c["sem"] = max([semana_de[s] for s in c["leituras"]] or [len(cur["semanas"])])
        casos.append(c)
# os casos dependem de leituras do fim do plano; sem limite, caíam 6 na mesma semana.
# No máximo 3 por semana, empurrando o excedente para a seguinte (a última recebe o resto).
ult = len(cur["semanas"]); carga = {}
for c in sorted(casos, key=lambda c: (c["sem"], c["id"])):
    w = c["sem"]
    while carga.get(w, 0) >= 3 and w < ult: w += 1
    c["sem"] = w; carga[w] = carga.get(w, 0) + 1

ids = {f["id"] for f in farm}
for p in sorted(glob.glob(os.path.join(T, "lotes", "bulario-*.json"))):
    for f in carrega(p) or []:
        if f.get("id") in ids: bulario.append(f)
p = os.path.join(T, "lotes", "interacoes.json")
if os.path.exists(p):
    vistos = set()
    for x in carrega(p) or []:
        par = tuple(sorted((x.get("a", ""), x.get("b", ""))))
        if par[0] in ids and par[1] in ids and par not in vistos:
            vistos.add(par); interacoes.append(x)

cartoes.sort(key=lambda c: ordem[c["l"]])
questoes.sort(key=lambda q: ordem[q["l"]])
lista = sorted(leituras.values(), key=lambda l: l["ord"])
for l in lista: l.pop("agente", None)

estudo = {"versao": 1, "conteudo": BASE, "areas": cur["areas"], "leituras": lista, "semanas": cur["semanas"],
          "residencia": cur["residencia"], "cartoes": cartoes, "questoes": questoes,
          "casos": casos, "indice": indice}
ref = {"farmacos": farm, "bulario": bulario, "interacoes": interacoes}

os.makedirs(os.path.join(R, "dados"), exist_ok=True)
def grava(nome, var, obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    open(os.path.join(R, "dados", nome), "w", encoding="utf-8").write(f"window.{var}={s};\n")
    return len(s.encode("utf-8"))
t1 = grava("estudo.js", "FU_ESTUDO", estudo)
t2 = grava("referencia.js", "FU_REF", ref)

prontas = [l for l in lista if l["ok"]]
print(f"leituras: {len(prontas)}/{len(lista)} com conteúdo, {sum(l.get('palavras', 0) for l in prontas):,} palavras".replace(",", ".").replace("conteúdo.", "conteúdo,"))
print(f"cartões: {len(cartoes)} · questões: {len(questoes)} · casos: {len(casos)}")
print(f"bulário: {len(bulario)}/{len(farm)} · interações: {len(interacoes)}")
print(f"dados/estudo.js {t1 / 1024:.0f} KB · dados/referencia.js {t2 / 1024:.0f} KB")
for a in avisos: print("AVISO", a)
