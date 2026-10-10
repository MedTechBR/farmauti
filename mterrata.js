/* mterrata.js — erratas das questões e respostas às sinalizações, nos apps de estudo MedTech (10/10/2026).
   Fonte única: ~/Documents/Claude/_mterrata/ (mesmo esquema do _mtsinal). Mexeu? Copie para os 6 apps.

   A administração corrige ou tira do ar uma questão sinalizada no painel (admin.html → Sinalizações). O servidor
   guarda a errata (mtSinal op "erratas", pública) e este módulo a traz para o app, guarda em cache local e
   entrega ao app, que aplica ANTES de desenhar as questões. Também mostra ao usuário a resposta da administração
   à sinalização dele (op "meusAvisos"), num aviso discreto e fechável.

   REGRA ABSOLUTA: este módulo nunca apaga nem reescreve progresso. Ele só lê e grava as próprias chaves
   ("mterr:<app>" = cache das erratas, "mterr:lidos:<app>" = avisos já fechados neste aparelho).

   const ER = MTErrata.cria({
     app: "clinicamed",                 // id do app no servidor (o mesmo do mtsinal central)
     nome: "ClínicaMed",
     token: () => idToken | null,       // opcional (Promise ok): conta MedTech, para os avisos
     aplica: (mapa, ER) => {...},       // o app aplica as erratas ao banco: mapa = Map(qid → errata); ER = este objeto
                                        //   (chamado já na criação, com o cache, e de novo quando a lista muda)
     depois: () => {...},               // opcional: lista NOVA veio da rede e já foi aplicada (redesenhar)
     abreQuestao: chave => {...},       // opcional: botão "Abrir questão" no aviso de resposta
     avisos: true                       // opcional: false desliga os avisos de resposta
   });
   ER.mapa            → Map(qid → {qid, tipo: "corrige"|"oculta", em, dados?})
   ER.oculta(qid)     → true se a questão saiu do ar (filtrar na EXIBIÇÃO; nunca tirar do array base)
   ER.corrigida(qid)  → a errata "corrige" da questão, ou null
   ER.gabaritoMudou(qid) → true se a errata trocou o gabarito (reavaliar respostas antigas na exibição)
   ER.selo(qid)       → HTML do selo "corrigida em DD/MM" (ou "")
   ER.atualiza()      → busca agora (o módulo já busca ao abrir, a cada 30 min e ao voltar ao app)

   Errata.dados (só os campos que mudaram; formato neutro, ordem do BANCO, nunca a da tela):
     enunciado, alternativas[], porAlt[], gabarito (índice no banco; -1 = anulada), comentario, verso (cartão)
   Tudo é TEXTO. Use MTErrata.aplicaCampos(obj, errata, CAMPOS) para trocar os campos de um objeto do banco:
     guarda o original (propriedade invisível ao JSON) e desfaz sozinho quando a errata some.
     CAMPOS = {enunciado: "q", alternativas: "alts", gabarito: "gab", comentario: "coment", porAlt: "porAlt"}
     ou {comentario: {k: "c", fmt: MTErrata.paraHtml}} quando o app desenha aquele campo como HTML. */
(function () {
  "use strict";
  if (window.MTErrata) return;

  const URL_CENTRAL = "https://southamerica-east1-medtech-c658c.cloudfunctions.net/mtSinal";
  const CACHE_MAX = 120 * 1024;          // não deixa o cache das erratas competir com o progresso pelo espaço
  const INTERVALO = 30 * 60e3, VOLTA = 10 * 60e3, TEMPO_REDE = 12e3;

  const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const paraHtml = t => esc(t).replace(/\n/g, "<br>");
  const ddmm = iso => { const d = new Date(iso); return isNaN(d) ? "" : String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); };
  const dataLonga = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR"); };
  const trecho = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  const lsLe = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsGrava = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  const ESTILO = `
.mterr-selo,.mterr-aviso{--mterr-ac:var(--mterr-cor,var(--ac,var(--brand,var(--primary,#2563eb))));
  --mterr-sup:var(--mterr-superficie,var(--sup,var(--pan,var(--card,var(--surface,#fff)))));
  --mterr-tinta:var(--mterr-texto,var(--ink,var(--tinta,var(--text,#16181d))));
  --mterr-fio:var(--mterr-borda,var(--fio,var(--line,var(--border,rgba(0,0,0,.16)))));}
.mterr-selo{display:inline-flex;align-items:center;gap:4px;font-size:.78em;font-weight:600;line-height:1.2;padding:2px 8px;
  border-radius:999px;border:1px solid var(--mterr-fio);color:var(--mterr-tinta);opacity:.85;white-space:nowrap;vertical-align:middle}
.mterr-selo svg{width:13px;height:13px;flex:none}
.mterr-aviso{display:block;box-sizing:border-box;position:fixed;z-index:99990;left:50%;translate:-50% 0;bottom:calc(var(--mterr-baixo,16px) + env(safe-area-inset-bottom,0px));
  width:min(520px,calc(100vw - 24px));max-height:min(60vh,420px);overflow:auto;background:var(--mterr-sup);color:var(--mterr-tinta);
  border:1px solid var(--mterr-fio);border-left:4px solid var(--mterr-ac);border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.22);
  padding:12px 12px 12px 14px;font-size:15px;line-height:1.45}
.mterr-aviso h2{margin:0 36px 4px 0;font-size:1em;font-weight:700}
.mterr-aviso .mterr-q{margin:0 0 6px;font-size:.85em;opacity:.78}
.mterr-aviso .mterr-txt{margin:0;white-space:pre-wrap}
.mterr-aviso .mterr-pe{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:10px}
.mterr-aviso button{min-height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--mterr-fio);background:transparent;color:inherit;font:inherit;font-size:.92em;font-weight:600;cursor:pointer}
.mterr-aviso button:focus-visible{outline:3px solid var(--mterr-ac);outline-offset:2px}
.mterr-aviso .mterr-x{position:absolute;top:6px;right:6px;min-width:40px;min-height:40px;padding:0;border-color:transparent;font-size:1.3em;line-height:1}
.mterr-aviso .mterr-mais{font-size:.8em;opacity:.7;margin:8px 0 0}
@media (max-width:640px){.mterr-aviso{bottom:calc(var(--mterr-baixo-cel,76px) + env(safe-area-inset-bottom,0px))}}
@media (prefers-reduced-motion:no-preference){.mterr-aviso{animation:mterr-entra .25s ease-out}
  @keyframes mterr-entra{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}
`;
  function injetaCss() {
    if (document.getElementById("mterr-css")) return;
    const s = document.createElement("style");
    s.id = "mterr-css"; s.textContent = ESTILO;
    document.head.insertBefore(s, document.head.firstChild);
  }
  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';

  /* chamada à função mtSinal (protocolo onCall por HTTP, como o mtsinal.js) */
  async function chama(dados, tok) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), TEMPO_REDE) : 0;
    try {
      const r = await fetch(URL_CENTRAL, {
        method: "POST", signal: ctl ? ctl.signal : undefined,
        headers: Object.assign({"Content-Type": "application/json"}, tok ? {Authorization: "Bearer " + tok} : {}),
        body: JSON.stringify({data: dados})
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j && j.error && j.error.message) || ("HTTP " + r.status));
      return j.result;
    } finally { clearTimeout(t); }
  }

  /* ---------- erratas válidas (o cache pode ser de outra versão ou ter sido mexido) ---------- */
  function valida(e) {
    if (!e || typeof e !== "object" || typeof e.qid !== "string" || !e.qid) return null;
    if (e.tipo === "oculta") return {qid: e.qid, tipo: "oculta", em: String(e.em || "")};
    if (e.tipo !== "corrige" || !e.dados || typeof e.dados !== "object") return null;
    const d = {}, s = e.dados;
    if (typeof s.enunciado === "string" && s.enunciado.trim()) d.enunciado = s.enunciado;
    if (Array.isArray(s.alternativas) && s.alternativas.length >= 2 && s.alternativas.every(a => typeof a === "string")) d.alternativas = s.alternativas.slice();
    if (Array.isArray(s.porAlt) && s.porAlt.every(a => typeof a === "string")) d.porAlt = s.porAlt.slice();
    if (Number.isInteger(s.gabarito) && s.gabarito >= -1 && s.gabarito < (d.alternativas ? d.alternativas.length : 6)) d.gabarito = s.gabarito;
    if (typeof s.comentario === "string") d.comentario = s.comentario;
    if (typeof s.verso === "string" && s.verso.trim()) d.verso = s.verso;
    return Object.keys(d).length ? {qid: e.qid, tipo: "corrige", em: String(e.em || ""), dados: d} : null;
  }
  const paraMapa = itens => { const m = new Map(); (Array.isArray(itens) ? itens : []).forEach(x => { const e = valida(x); if (e) m.set(e.qid, e); }); return m; };

  /* ---------- troca de campos com o original guardado (reversível, invisível ao JSON) ---------- */
  const ORIG = "__mterrOrig";
  function aplicaCampos(obj, errata, campos) {
    if (!obj || typeof obj !== "object") return false;
    let mudou = false;
    const orig = obj[ORIG];
    /* 1) desfaz o que uma errata anterior trocou */
    if (orig) {
      Object.keys(orig).forEach(k => {
        if (orig[k].tinha) obj[k] = orig[k].v; else delete obj[k];
      });
      delete obj[ORIG];
      mudou = true;
    }
    /* 2) aplica a errata atual */
    if (errata && errata.tipo === "corrige" && errata.dados) {
      const guard = {};
      Object.keys(campos || {}).forEach(nome => {
        if (!(nome in errata.dados)) return;
        const c = typeof campos[nome] === "string" ? {k: campos[nome]} : campos[nome];
        if (!c || !c.k) return;
        let v = errata.dados[nome];
        if (c.fmt) v = Array.isArray(v) ? v.map(c.fmt) : c.fmt(v);
        else if (Array.isArray(v)) v = v.slice();
        if (!(c.k in guard)) guard[c.k] = {tinha: Object.prototype.hasOwnProperty.call(obj, c.k), v: obj[c.k]};
        obj[c.k] = v;
      });
      if (Object.keys(guard).length) {
        Object.defineProperty(obj, ORIG, {value: guard, enumerable: false, configurable: true, writable: true});
        mudou = true;
      }
    }
    return mudou;
  }
  /* o valor ORIGINAL de um campo (antes da errata) — p.ex. para calcular a chave pelo enunciado do banco */
  const original = (obj, k) => (obj && obj[ORIG] && k in obj[ORIG]) ? obj[ORIG][k].v : (obj ? obj[k] : undefined);

  function cria(cfg) {
    cfg = cfg || {};
    const app = String(cfg.app || "");
    const KC = "mterr:" + app, KL = "mterr:lidos:" + app;
    let mapa = new Map(), versao = "", ultima = 0, buscando = null;

    function entrega(m, daRede) {
      mapa = m;
      try { if (cfg.aplica) cfg.aplica(mapa, api); } catch (e) { console.warn("mterrata: aplica falhou", e); }
      if (daRede && cfg.depois) { try { cfg.depois(); } catch (e) { console.warn("mterrata: depois falhou", e); } }
    }
    const assinatura = itens => JSON.stringify(itens || []);

    let assinaturaAtual = "";

    /* 2) rede: ao abrir, a cada 30 min e ao voltar ao app (se passou 10 min) */
    async function atualiza() {
      if (buscando) return buscando;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
      buscando = (async () => {
        ultima = Date.now();
        try {
          const r = await chama({op: "erratas", app});
          if (!r || !Array.isArray(r.itens)) return false;
          const ass = assinatura(r.itens);
          const corpo = {v: String(r.v || ""), at: Date.now(), itens: r.itens};
          const txt = JSON.stringify(corpo);
          if (txt.length <= CACHE_MAX) lsGrava(KC, corpo);
          else { try { localStorage.removeItem(KC); } catch (e) {} }   /* só a chave do PRÓPRIO cache */
          if (ass === assinaturaAtual) return false;
          assinaturaAtual = ass; versao = corpo.v;
          entrega(paraMapa(r.itens), true);
          return true;
        } catch (e) { return false; }                                  /* sem rede: fica o cache */
        finally { buscando = null; }
      })();
      return buscando;
    }

    /* ---------- avisos: a administração respondeu a sua sinalização ---------- */
    let fila = [], mostrando = null, ultimaAv = 0;
    const lidos = () => { const l = lsLe(KL); return Array.isArray(l) ? l : []; };
    const marcaLidoLocal = id => { const l = lidos().filter(x => x !== id); l.push(id); lsGrava(KL, l.slice(-60)); };
    function dispositivo() { try { const d = localStorage.getItem("msn_dispositivo") || ""; return /^[A-Za-z0-9_-]{12,64}$/.test(d) ? d : ""; } catch (e) { return ""; } }
    async function credencial() {
      let tok = null;
      try { tok = cfg.token ? await cfg.token() : null; } catch (e) { tok = null; }
      if (tok) return {tok};
      const d = dispositivo();
      return d ? {dispositivo: d} : null;
    }
    async function buscaAvisos() {
      if (cfg.avisos === false) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      ultimaAv = Date.now();
      const cr = await credencial(); if (!cr) return;
      try {
        const r = await chama(Object.assign({op: "meusAvisos", app}, cr.dispositivo ? {dispositivo: cr.dispositivo} : {}), cr.tok);
        const ja = new Set(lidos());
        (r && Array.isArray(r.itens) ? r.itens : []).forEach(a => {
          if (!a || typeof a.id !== "string" || typeof a.texto !== "string" || ja.has(a.id)) return;
          if (fila.some(x => x.id === a.id) || (mostrando && mostrando.id === a.id)) return;
          fila.push(a);
        });
        /* foi lido aqui mas o servidor ainda não soube: avisa de novo */
        (r && Array.isArray(r.itens) ? r.itens : []).forEach(a => { if (a && ja.has(a.id)) lido(a.id, cr); });
        proximo();
      } catch (e) {}
    }
    function lido(id, cr) {
      marcaLidoLocal(id);
      (cr ? Promise.resolve(cr) : credencial()).then(c2 => {
        if (!c2) return;
        return chama(Object.assign({op: "avisoLido", id}, c2.dispositivo ? {dispositivo: c2.dispositivo} : {}), c2.tok);
      }).catch(() => {});
    }
    function proximo() {
      if (mostrando || !fila.length || !document.body) return;
      const a = fila.shift(); mostrando = a;
      injetaCss();
      const el = document.createElement("div");   /* div, não section: há app que esconde toda section fora da aba ativa */
      el.className = "mterr-aviso";
      el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.setAttribute("aria-labelledby", "mterr-tit");
      const abre = cfg.abreQuestao && a.chave;
      el.innerHTML = `<h2 id="mterr-tit">Sua sinalização foi respondida</h2>
        ${a.q ? `<p class="mterr-q">Questão: ${esc(trecho(a.q, 140))}</p>` : ""}
        <p class="mterr-txt">${esc(a.texto)}</p>
        ${fila.length ? `<p class="mterr-mais">Mais ${fila.length} ${fila.length === 1 ? "resposta" : "respostas"} depois desta.</p>` : ""}
        <div class="mterr-pe">${abre ? `<button type="button" data-mterr="abre">Abrir a questão</button>` : ""}<button type="button" data-mterr="ok">Entendi</button></div>
        <button type="button" class="mterr-x" data-mterr="ok" aria-label="Fechar o aviso">×</button>`;
      document.body.appendChild(el);
      const fecha = () => { el.remove(); mostrando = null; lido(a.id); setTimeout(proximo, 300); };
      el.querySelectorAll('[data-mterr="ok"]').forEach(b => b.onclick = fecha);
      const ba = el.querySelector('[data-mterr="abre"]');
      if (ba) ba.onclick = () => { fecha(); try { cfg.abreQuestao(a.chave); } catch (e) {} };
      el.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); fecha(); } });
    }

    const api = {
      get mapa() { return mapa; },
      oculta: qid => { const e = mapa.get(qid); return !!(e && e.tipo === "oculta"); },
      corrigida: qid => { const e = mapa.get(qid); return e && e.tipo === "corrige" ? e : null; },
      gabaritoMudou: qid => { const e = mapa.get(qid); return !!(e && e.tipo === "corrige" && e.dados && "gabarito" in e.dados); },
      selo(qid) {
        const e = mapa.get(qid);
        if (!e || e.tipo !== "corrige") return "";
        injetaCss();
        const d = ddmm(e.em);
        return `<span class="mterr-selo" title="Questão revisada e corrigida pela equipe${d ? " em " + esc(dataLonga(e.em)) : ""}">${ICONE}corrigida${d ? " em " + d : ""}</span>`;
      },
      atualiza, avisos: buscaAvisos,
      get versao() { return versao; }
    };

    /* 1) cache, na hora (síncrono: o app aplica antes de desenhar) */
    const c = lsLe(KC);
    if (c && Array.isArray(c.itens)) { versao = String(c.v || ""); assinaturaAtual = assinatura(c.itens); entrega(paraMapa(c.itens), false); }
    else entrega(new Map(), false);

    setTimeout(atualiza, 0);
    setTimeout(buscaAvisos, 5000);                         /* dá tempo de o login restaurar a sessão */
    setInterval(() => { if (document.visibilityState !== "hidden") atualiza(); }, INTERVALO);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultima > VOLTA) atualiza();
      if (Date.now() - ultimaAv > VOLTA) buscaAvisos();
    });
    addEventListener("online", () => { atualiza(); });
    return api;
  }

  window.MTErrata = {cria, aplicaCampos, original, paraHtml, esc, valida, versao: 1};
})();
