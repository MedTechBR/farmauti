#!/usr/bin/env python3
"""Servidor de teste do FarmaUTI.

Existe por um motivo específico: `python3 -m http.server` entrega .js como `text/javascript`
SEM charset, e o Chrome então decodifica o script externo como latin-1 — todo acento vira
mojibake ("Emergência" → "EmergÃªncia") mesmo com <meta charset="utf-8"> na página, porque o
encoding do documento não se aplica ao script externo. O GitHub Pages, onde o app roda de
verdade, manda `charset=utf-8`. Testar sem isso é testar outro app.

Uso: python3 servir.py [porta]   (o launch.json aponta para cá)
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    def guess_type(self, path):
        t = super().guess_type(path)
        if isinstance(t, tuple):          # Python devolve (tipo, encoding) em algumas versões
            t = t[0]
        if t and t.split(";")[0].strip() in (
            "text/html", "text/javascript", "application/javascript",
            "text/css", "application/json", "application/manifest+json"):
            return t.split(";")[0].strip() + "; charset=utf-8"
        return t
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # nunca depurar contra cache velho
        super().end_headers()

porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
raiz = __file__.rsplit("/", 1)[0]
print(f"FarmaUTI em http://localhost:{porta} (charset=utf-8, sem cache)")
ThreadingHTTPServer(("", porta), partial(Handler, directory=raiz)).serve_forever()
