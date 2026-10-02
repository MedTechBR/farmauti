#!/usr/bin/env python3
"""Aplica a auditoria das interações (lotes/revisao-int/parte-*.json) sobre lotes/interacoes*.json.

Cada par auditado substitui o original (casado por par ordenado); `remover: true` tira o par da base.
Campos internos da auditoria (`mudou`, `motivo_remocao`, `remover`) vão para docs/auditoria_interacoes_log.json,
não para a base. Rodar uma vez, depois de todas as partes estarem validadas.
"""
import glob, json, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chave = lambda x: tuple(sorted((x["a"], x["b"])))
aud = {}
for p in sorted(glob.glob(os.path.join(R, "lotes/revisao-int/parte-*.json"))):
    for x in json.load(open(p, encoding="utf-8")):
        aud[chave(x)] = x
log, total, removidos, mudaram = [], 0, 0, 0
CAMPOS = ("a", "b", "precipitante", "objeto", "grav", "tipo", "mecanismo", "efeito", "manejo", "evidencia", "fonte")
vistos = set()
for p in sorted(glob.glob(os.path.join(R, "lotes/interacoes*.json"))):
    orig = json.load(open(p, encoding="utf-8")); novo = []
    for x in orig:
        k = chave(x); total += 1; vistos.add(k)
        y = aud.get(k)
        if not y: novo.append(x); continue
        if y.get("remover"):
            removidos += 1; log.append({"par": k, "acao": "removido", "motivo": y.get("motivo_remocao", "")}); continue
        if y.get("mudou"): mudaram += 1; log.append({"par": k, "acao": "corrigido", "motivo": y["mudou"], "grav_antes": x.get("grav"), "grav_depois": y.get("grav")})
        novo.append({c: y[c] for c in CAMPOS if c in y})
    json.dump(novo, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
faltam = [k for k in aud if k not in vistos]
json.dump(log, open(os.path.join(R, "docs/auditoria_interacoes_log.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{total} pares; auditados {len(aud)}; corrigidos no conteúdo {mudaram}; removidos {removidos}; auditados sem par na base {len(faltam)}")
