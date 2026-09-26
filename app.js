/* FarmaUTI — app de preparação para a residência em Farmácia em Terapia Intensiva.
   Single-page sem framework. Dados em dados/estudo.js e dados/referencia.js (gerados por monta.py);
   leituras em conteudo/<slug>.html, buscadas sob demanda. Progresso no aparelho (localStorage com
   espelho em IndexedDB) e backup por arquivo em Ajustes. */
"use strict";
const E = window.FU_ESTUDO || {areas:[],leituras:[],semanas:[],cartoes:[],questoes:[],casos:[],prescricoes:[],indice:[],conteudo:"conteudo/",residencia:"2027-03-01"};
const RF = window.FU_REF || {farmacos:[],bulario:[],interacoes:[]};
const VERSAO = "1.0";
const PREF = "fu_";

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const p2 = n => String(n).padStart(2, "0");
const iso = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const dt = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
const addD = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
const difD = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const MESL = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const DSEM = ["dom","seg","ter","qua","qui","sex","sáb"];
const fmtD = s => { const d = dt(s); return `${d.getDate()} ${MES[d.getMonth()]}`; };
const fmtDL = s => { const d = dt(s); return `${DSEM[d.getDay()]}, ${d.getDate()} ${MES[d.getMonth()]}`; };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const num = (v, c = 1) => (Math.round(v * 10 ** c) / 10 ** c).toLocaleString("pt-BR", {maximumFractionDigits: c});
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clone = o => JSON.parse(JSON.stringify(o));
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function embaralha(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/* Fisher-Yates por grupo e sorteio PONDERADO do próximo grupo: sort(()=>Math.random()-.5) é
   enviesado e o determinístico degenera em pingue-pongue entre os dois maiores grupos. */
function espalha(lista, chave) {
  const g = new Map(); lista.forEach(x => { const k = chave(x); if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
  g.forEach(v => embaralha(v));
  const out = []; let ant = null;
  while (out.length < lista.length) {
    const cand = []; let peso = 0;
    g.forEach((v, k) => { if (v.length && k !== ant) { cand.push([k, v.length]); peso += v.length; } });
    let e = null;
    if (cand.length) { let r = Math.random() * peso; for (const [k, n] of cand) { r -= n; if (r <= 0) { e = k; break; } } e = e ?? cand[cand.length - 1][0]; }
    else g.forEach((v, k) => { if (v.length) e = k; });
    out.push(g.get(e).pop()); ant = e;
  }
  return out;
}
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

/* ---------- armazenamento ---------- */
const PADRAO = {
  cfg: {meta: {q: 20, c: 30, min: 60}, novos: 20, inicio: null, fonte: 1, nome: "", instalado: false},
  lidas: {}, prog: {}, notas: {}, resp: {}, fav: {}, srs: {}, ativ: {}, tarefas: {}, casos: {}, presc: {}, sims: [],
  pos: {}, tema: "auto", recentes: []
};
const CHAVES = Object.keys(PADRAO);
const ST = {};
function carrega() {
  let algum = false;
  for (const k of CHAVES) {
    let raw = null;
    try { raw = localStorage.getItem(PREF + k); } catch (e) {}
    if (raw == null) { ST[k] = clone(PADRAO[k]); continue; }
    try { ST[k] = JSON.parse(raw); algum = true; }
    catch (e) {
      /* não sobrescrever em silêncio: guarda o texto corrompido antes de voltar ao padrão */
      try { localStorage.setItem(PREF + k + "_corrompido", raw); } catch (e2) {}
      ST[k] = clone(PADRAO[k]);
    }
  }
  ST.cfg = Object.assign(clone(PADRAO.cfg), ST.cfg || {});
  ST.cfg.meta = Object.assign(clone(PADRAO.cfg.meta), ST.cfg.meta || {});
  return algum;
}
function salva(k) {
  try { localStorage.setItem(PREF + k, JSON.stringify(ST[k])); }
  catch (e) { aviso("Não foi possível gravar no aparelho. Exporte um backup em Ajustes."); }
  espelha();
}
function idb(cb) {
  try {
    const r = indexedDB.open("farmauti", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("s");
    r.onsuccess = () => cb(r.result);
  } catch (e) {}
}
const espelha = debounce(() => idb(db => { try { db.transaction("s", "readwrite").objectStore("s").put(JSON.stringify(ST), "estado"); } catch (e) {} }), 1500);
function restauraDoEspelho() {
  return new Promise(ok => idb(db => {
    try {
      const r = db.transaction("s").objectStore("s").get("estado");
      r.onsuccess = () => {
        if (!r.result) return ok(false);
        const d = JSON.parse(r.result);
        for (const k of CHAVES) if (d[k] !== undefined) { ST[k] = d[k]; salva(k); }
        ok(true);
      };
      r.onerror = () => ok(false);
    } catch (e) { ok(false); }
  }));
}

/* ---------- dados derivados ---------- */
const AREA = Object.fromEntries(E.areas.map(a => [a.id, a]));
const COR = {azul:"var(--c-azul)", ciano:"var(--c-ciano)", verde:"var(--c-verde)", violeta:"var(--c-violeta)", laranja:"var(--c-laranja)", vermelho:"var(--c-vermelho)", indigo:"var(--c-indigo)", ambar:"var(--c-ambar)", rosa:"var(--c-rosa)", teal:"var(--c-teal)", cinza:"var(--c-cinza)", lima:"var(--c-lima)"};
const corA = a => COR[AREA[a]?.cor] || COR.indigo;
const icA = a => AREA[a]?.icone || "book";
const LEIT = Object.fromEntries(E.leituras.map(l => [l.slug, l]));
const CPL = {}, QPL = {};
E.cartoes.forEach(c => (CPL[c.l] ||= []).push(c));
E.questoes.forEach(q => (QPL[q.l] ||= []).push(q));
const CID = Object.fromEntries(E.cartoes.map(c => [c.id, c]));
const QID = Object.fromEntries(E.questoes.map(q => [q.id, q]));
const CASO = Object.fromEntries(E.casos.map(c => [c.id, c]));
E.prescricoes ||= [];
const RX = Object.fromEntries(E.prescricoes.map(r => [r.id, r]));
const FARM = Object.fromEntries(RF.farmacos.map(f => [f.id, f]));
const BUL = Object.fromEntries(RF.bulario.map(b => [b.id, b]));
const par = (a, b) => a < b ? a + "|" + b : b + "|" + a;
const INTER = new Map(RF.interacoes.map(x => [par(x.a, x.b), x]));
const INTER_DE = {};
RF.interacoes.forEach(x => { (INTER_DE[x.a] ||= []).push(x); (INTER_DE[x.b] ||= []).push(x); });

/* ---------- abas ---------- */
const ABAS = [
  {id:"inicio", nome:"Início", ic:"home", cor:"indigo", g:"Estudo"},
  {id:"cronograma", nome:"Cronograma", ic:"calendar-event", cor:"verde", g:"Estudo"},
  {id:"leituras", nome:"Leituras", ic:"book-2", cor:"violeta", g:"Estudo"},
  {id:"cartoes", nome:"Cartões", ic:"cards", cor:"ambar", g:"Estudo"},
  {id:"questoes", nome:"Questões", ic:"checklist", cor:"azul", g:"Estudo"},
  {id:"casos", nome:"Casos clínicos", ic:"clipboard-heart", cor:"rosa", g:"Estudo"},
  {id:"prescricoes", nome:"Prescrições", ic:"prescription", cor:"lima", g:"Estudo"},
  {id:"interacoes", nome:"Interações", ic:"arrows-exchange", cor:"vermelho", g:"Ferramentas"},
  {id:"bulario", nome:"Bulário", ic:"pill", cor:"teal", g:"Ferramentas"},
  {id:"calculadoras", nome:"Calculadoras", ic:"calculator", cor:"laranja", g:"Ferramentas"},
  {id:"desempenho", nome:"Desempenho", ic:"chart-dots-3", cor:"ciano", g:"Acompanhamento"},
  {id:"ajustes", nome:"Ajustes", ic:"settings", cor:"cinza", g:"Acompanhamento"}
];
const ABA = Object.fromEntries(ABAS.map(a => [a.id, a]));
const BARRA = ["inicio", "leituras", "cartoes", "questoes"];
const ESTUDO = ["leituras", "cartoes", "questoes", "casos", "prescricoes", "cronograma", "interacoes", "bulario", "calculadoras"];
let abaAtual = "inicio", paramAtual = "";

function montaNav() {
  let g = "", h = "";
  for (const a of ABAS) {
    if (a.g !== g) { g = a.g; h += `<div class="navGrupo">${g}</div>`; }
    h += `<button data-ir="${a.id}" style="--c:${COR[a.cor]}" title="${a.nome}"><i class="ti ti-${a.ic}" aria-hidden="true"></i><span>${a.nome}</span><b class="cont" data-cont="${a.id}" hidden></b></button>`;
  }
  $("#abas").innerHTML = h;
  $("#barra").innerHTML = BARRA.map(id => { const a = ABA[id]; return `<button data-ir="${id}" style="--c:${COR[a.cor]}"><i class="ti ti-${a.ic}" aria-hidden="true"></i>${a.nome}</button>`; }).join("")
    + `<button data-acao="mais" style="--c:var(--c-indigo)"><i class="ti ti-dots-circle-horizontal" aria-hidden="true"></i>Mais</button>`;
}
function contadores() {
  const d = devidos().length;
  const b = $('[data-cont="cartoes"]'); if (b) { b.hidden = !d; b.textContent = d; }
}

/* ---------- roteamento por hash (o botão voltar do celular funciona) ---------- */
function ir(aba, param) {
  const h = "#" + aba + (param ? "/" + encodeURIComponent(param) : "");
  if (location.hash === h) rota(); else location.hash = h;
}
function rota() {
  const [a, ...r] = (location.hash.slice(1) || "inicio").split("/");
  const aba = ABA[a] ? a : "inicio";
  mostra(aba, decodeURIComponent(r.join("/") || ""));
}
function mostra(aba, param) {
  const mudou = aba !== abaAtual || param !== paramAtual;
  abaAtual = aba; paramAtual = param;
  document.body.dataset.aba = aba;
  $$("main>section").forEach(s => s.hidden = s.id !== "sec-" + aba);
  $$("[data-ir]").forEach(b => b.setAttribute("aria-current", b.dataset.ir === aba ? "true" : "false"));
  const mais = $('#barra [data-acao="mais"]'); if (mais) mais.setAttribute("aria-current", BARRA.includes(aba) ? "false" : "true");
  $("#progTopo").hidden = true;
  fechaCamada();
  try { PINTA[aba](param); } catch (e) { console.error(e); $("#sec-" + aba).innerHTML = `<div class="cx vazio"><i class="ti ti-bug"></i>Algo falhou ao montar esta tela.<br><small>${esc(e.message)}</small></div>`; }
  if (mudou) scrollTo(0, 0);
  contadores();
}
function titulo(ic, h1, p, acoes = "") {
  const t = $("#pgTitulo");
  t.hidden = false;
  t.innerHTML = `<div class="selo"><i class="ti ti-${ic}" aria-hidden="true"></i></div><h1>${h1}</h1>${p ? `<p>${p}</p>` : "<p></p>"}${acoes ? `<div class="acoes">${acoes}</div>` : ""}`;
}
const semTitulo = () => { $("#pgTitulo").hidden = true; };

/* ---------- movimento ---------- */
function vivo(el) {
  if (!el) return;
  $$(".anima", el).forEach(g => [...g.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 12))));
  /* valor final já no texto: se a animação não rodar (aba em segundo plano), o número continua certo */
  $$("[data-conta]", el).forEach(n => n.textContent = (+n.dataset.conta).toLocaleString("pt-BR") + (n.dataset.suf || ""));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$("[data-w]", el).forEach(b => b.style.width = b.dataset.w + "%");
    $$("[data-h]", el).forEach(b => b.style.height = b.dataset.h + "%");
    $$("[data-off]", el).forEach(c => c.style.strokeDashoffset = c.dataset.off);
    $$("[data-conta]", el).forEach(n => {
      const alvo = +n.dataset.conta, suf = n.dataset.suf || "", t0 = performance.now();
      if (matchMedia("(prefers-reduced-motion: reduce)").matches || !alvo) { n.textContent = alvo.toLocaleString("pt-BR") + suf; return; }
      const passo = t => { const k = Math.min(1, (t - t0) / 900), v = Math.round(alvo * (1 - Math.pow(1 - k, 3))); n.textContent = v.toLocaleString("pt-BR") + suf; if (k < 1) requestAnimationFrame(passo); };
      requestAnimationFrame(passo);
    });
  }));
}
function confete() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"); c.className = "confete"; document.body.appendChild(c);
  const x = c.getContext("2d"), W = c.width = innerWidth, H = c.height = innerHeight;
  const cores = ["#5B5BF0", "#2F7BF6", "#F76E1E", "#11A870", "#8E5AF2", "#E89A00", "#E8468E", "#0AA5C2"];
  const ps = [...Array(140)].map(() => ({x: W / 2 + (Math.random() - .5) * 200, y: H * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, c: cores[Math.floor(Math.random() * cores.length)], a: Math.random() * 6, va: (Math.random() - .5) * .3}));
  const t0 = performance.now();
  const passo = t => {
    x.clearRect(0, 0, W, H);
    ps.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.a += p.va; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore(); });
    if (t - t0 < 2200) requestAnimationFrame(passo); else c.remove();
  };
  requestAnimationFrame(passo);
}
let avisoT;
function aviso(txt) {
  let a = $("#aviso"); if (!a) { a = document.createElement("div"); a.id = "aviso"; a.className = "aviso"; a.setAttribute("role", "status"); document.body.appendChild(a); }
  a.textContent = txt; a.hidden = false; a.style.animation = "none"; a.offsetHeight; a.style.animation = "";
  clearTimeout(avisoT); avisoT = setTimeout(() => a.hidden = true, 3200);
}

/* ---------- atividade, meta e sequência ---------- */
function ativ(d = iso()) { return ST.ativ[d] ||= {q: 0, qa: 0, c: 0, cn: 0, min: 0, seg: 0, l: 0}; }
function marca(campo, n = 1) { const a = ativ(); a[campo] = (a[campo] || 0) + n; salva("ativ"); checaMeta(); }
function progMeta(d = iso()) {
  const a = ST.ativ[d] || {}, m = ST.cfg.meta;
  const f = (v, g) => g ? Math.min(1, (v || 0) / g) : 1;
  const q = f(a.q, m.q), c = f(a.c, m.c), t = f(a.min, m.min);
  return {q, c, t, tot: (q + c + t) / 3};
}
function checaMeta() {
  const a = ativ();
  if (!a.meta && progMeta().tot >= 1) { a.meta = 1; salva("ativ"); confete(); aviso("Meta do dia cumprida. Bom trabalho."); }
}
const estudou = d => { const a = ST.ativ[d]; return !!a && ((a.q || 0) + (a.c || 0) > 0 || (a.min || 0) >= 10 || (a.l || 0) > 0); };
function sequencia() {
  let n = 0, d = iso();
  if (!estudou(d)) d = addD(d, -1);
  while (estudou(d)) { n++; d = addD(d, -1); }
  return n;
}
/* tempo de estudo: conta só com a página visível, numa aba de estudo e com interação recente */
let ultInter = Date.now();
["pointerdown", "keydown", "scroll", "touchstart", "wheel"].forEach(e => addEventListener(e, () => ultInter = Date.now(), {passive: true, capture: true}));
setInterval(() => {
  if (document.visibilityState !== "visible" || Date.now() - ultInter > 150000 || !ESTUDO.includes(abaAtual)) return;
  const a = ativ(); a.seg = (a.seg || 0) + 15;
  if (a.seg >= 60) { a.min += Math.floor(a.seg / 60); a.seg %= 60; salva("ativ"); checaMeta(); }
}, 15000);

/* ---------- estatística de questões ---------- */
function ultimaResp(id) { const h = ST.resp[id]; return h && h.length ? h[h.length - 1] : null; }
function estatQ(filtro = () => true) {
  let resp = 0, ok = 0, tent = 0, acTent = 0;
  for (const q of E.questoes) {
    if (!filtro(q)) continue;
    const h = ST.resp[q.id]; if (!h || !h.length) continue;
    resp++; if (h[h.length - 1].ok) ok++;
    tent += h.length; acTent += h.filter(x => x.ok).length;
  }
  return {resp, ok, tent, acTent, taxa: pct(acTent, tent)};
}
function estatArea(a) {
  const qs = E.questoes.filter(q => LEIT[q.l]?.area === a);
  const e = estatQ(q => LEIT[q.l]?.area === a);
  const ls = E.leituras.filter(l => l.area === a);
  return {...e, total: qs.length, lidas: ls.filter(l => ST.lidas[l.slug]).length, nl: ls.length};
}

/* ---------- cronograma ---------- */
let PL = null;
function plano() {
  const ini = ST.cfg.inicio || E.semanas[0]?.inicio || iso();
  const assin = ini + "|" + E.casos.length + "|" + E.prescricoes.length;
  if (PL && PL.assin === assin) return PL;
  const n = E.semanas.length;
  const semanas = E.semanas.map((w, wi) => {
    const seg = addD(ini, wi * 7);
    const dias = [...Array(7)].map((_, d) => ({data: addD(seg, d), t: []}));
    const L = w.leituras;
    const slots = L.length <= 2 ? [0, 2] : L.length === 3 ? [0, 2, 4] : [0, 1, 3, 4];
    L.forEach((s, k) => dias[slots[k]].t.push({k: "L:" + s, tipo: "L", s}, {k: "C:" + s, tipo: "C", s}, {k: "Q:" + s, tipo: "Q", s}));
    if (wi > 0) [1, 3].forEach(di => { if (!slots.includes(di)) dias[di].t.push({k: `M:${w.n}:${di}`, tipo: "M", n: 10, ate: w.n - 1}); });
    E.casos.filter(c => Math.min(c.sem, n) === w.n).forEach((c, k) => dias[[3, 1, 5, 2, 4][k % 5]].t.push({k: "K:" + c.id, tipo: "K", id: c.id}));
    E.prescricoes.filter(r => r.sem === w.n).forEach((r, k) => dias[[1, 3, 5, 2, 4, 0][k % 6]].t.push({k: "P:" + r.id, tipo: "P", id: r.id}));
    dias[5].t.push({k: `R:${w.n}`, tipo: "R", n: 20, sem: w.n});
    if (w.n === 12) dias[5].t.push({k: "X:12", tipo: "X", n: 30});
    if (w.n === n) dias[4].t.push({k: "X:final", tipo: "X", n: 60});
    return {...w, seg, dias};
  });
  const todas = semanas.flatMap(w => w.dias.flatMap(d => d.t.map(t => ({...t, data: d.data, sem: t.sem ?? w.n}))));
  PL = {assin, ini, fim: addD(ini, n * 7 - 1), semanas, todas};
  return PL;
}
function semanaIdx(pl = plano(), d = iso()) {
  const k = Math.floor(difD(pl.ini, d) / 7);
  return k < 0 ? -1 : Math.min(k, pl.semanas.length - 1);
}
function semanaLiberada() { const k = semanaIdx(); return Math.max(1, k + 1); }
function feitaAuto(t) {
  switch (t.tipo) {
    case "L": return !!ST.lidas[t.s];
    case "C": { const cs = CPL[t.s] || []; return cs.length > 0 && cs.every(c => ST.srs[c.id]); }
    case "Q": { const qs = QPL[t.s] || []; return qs.length > 0 && qs.every(q => ST.resp[q.id]?.length); }
    case "K": return !!ST.casos[t.id]?.feito;
    case "P": return !!ST.presc[t.id]?.feito;
    case "M": case "R": { const a = ST.ativ[t.data]; return !!a && (a.q || 0) >= t.n; }
    case "X": return (ST.sims || []).some(s => s.tarefa === t.k);
  }
  return false;
}
const feita = t => ST.tarefas[t.k] === true || feitaAuto(t);
function descTarefa(t) {
  const l = t.s && LEIT[t.s];
  switch (t.tipo) {
    case "L": return {ic: "book-2", k: corA(l.area), tt: `Ler: ${l.titulo}`, ds: `${l.min ? l.min + " min" : "leitura"} · ${AREA[l.area].nome}`};
    case "C": return {ic: "cards", k: "var(--c-ambar)", tt: `Fixar com ${(CPL[t.s] || []).length} cartões`, ds: l.titulo};
    case "Q": return {ic: "checklist", k: "var(--c-azul)", tt: `Resolver ${(QPL[t.s] || []).length} questões`, ds: l.titulo};
    case "M": return {ic: "arrows-shuffle", k: "var(--c-azul)", tt: `${t.n} questões intercaladas`, ds: `revisão das semanas 1 a ${t.ate}`};
    case "R": return {ic: "repeat", k: "var(--c-verde)", tt: `Revisão da semana ${t.sem}`, ds: `${t.n} questões da semana e caderno de erros`};
    case "P": { const r = RX[t.id]; return {ic: "prescription", k: "var(--c-lima)", tt: `Avaliar prescrição: ${r ? r.titulo : t.id}`, ds: r ? `${r.setor} · ${r.itens.length} itens` : ""}; }
    case "K": { const c = CASO[t.id]; return {ic: "clipboard-heart", k: "var(--c-rosa)", tt: `Caso clínico: ${c ? c.titulo : t.id}`, ds: "acompanhamento farmacoterapêutico"}; }
    case "X": return {ic: "stopwatch", k: "var(--c-laranja)", tt: t.k === "X:final" ? `Simulado final de ${t.n} questões` : `Simulado de meio de percurso (${t.n} questões)`, ds: "com cronômetro, correção no fim"};
  }
  return {ic: "circle", k: "var(--ink3)", tt: t.k, ds: ""};
}
function irTarefa(t) {
  switch (t.tipo) {
    case "L": return ir("leituras", t.s);
    case "C": return ir("cartoes", t.s);
    case "Q": QS.filtro = {...FILTRO0, l: t.s}; QS.misturar = false; return ir("questoes");
    case "M": QS.filtro = {...FILTRO0, ate: t.ate}; QS.misturar = true; return ir("questoes");
    case "R": QS.filtro = {...FILTRO0, sem: t.sem}; QS.misturar = true; return ir("questoes");
    case "K": return ir("casos", t.id);
    case "P": return ir("prescricoes", t.id);
    case "X": SIM.cfg = {n: t.n, escopo: "liberadas", tarefa: t.k}; return ir("questoes", "simulado");
  }
}
function htmlTarefa(t) {
  const d = descTarefa(t), ok = feita(t);
  return `<div class="tarefa${ok ? " feita" : ""}" style="--k:${d.k}" data-tk="${esc(t.k)}">
    <button class="chk" data-acao="tarefa" data-tk="${esc(t.k)}" aria-label="${ok ? "Desmarcar" : "Marcar como feita"}"><i class="ti ti-check"></i></button>
    <div><div class="tt">${esc(d.tt)}</div><div class="ds"><span>${esc(d.ds)}</span></div></div>
    <button class="ir" data-acao="irTarefa" data-tk="${esc(t.k)}" aria-label="Abrir"><i class="ti ti-arrow-right"></i></button></div>`;
}
function achaTarefa(k) { return plano().todas.find(t => t.k === k); }
function alternaTarefa(k) {
  const t = achaTarefa(k); if (!t) return;
  if (feitaAuto(t)) { aviso("Concluída automaticamente pelo que você já fez."); return; }
  if (ST.tarefas[k]) delete ST.tarefas[k]; else ST.tarefas[k] = true;
  salva("tarefas"); rota();
}
function pendencias() { const h = iso(); return plano().todas.filter(t => t.data < h && ["L", "C", "Q", "K", "P", "X"].includes(t.tipo) && !feita(t)); }

/* ======================================================================
   INÍCIO
   ====================================================================== */
function anel(v, tam = 150, cor = "#fff", fundo = "rgba(255,255,255,.2)", esp = 12) {
  const r = (tam - esp) / 2, c = 2 * Math.PI * r;
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${fundo}" stroke-width="${esp}"/>
    <circle class="arco" cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${cor}" stroke-width="${esp}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${c * (1 - Math.min(1, v))}"/></svg>`;
}
function saudacao() { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; }
function pintaInicio() {
  semTitulo();
  const s = $("#sec-inicio"), hoje = iso(), pl = plano(), wi = semanaIdx(pl), m = progMeta(), a = ST.ativ[hoje] || {};
  const faltam = difD(hoje, E.residencia), due = devidos().length;
  const tHoje = pl.todas.filter(t => t.data === hoje);
  const pend = pendencias();
  const antes = difD(hoje, pl.ini) > 0;
  const w = wi >= 0 ? pl.semanas[wi] : null;
  const eq = estatQ(), seq = sequencia();
  const lidas = Object.keys(ST.lidas).filter(k => LEIT[k]).length;
  const dom = E.cartoes.filter(c => (ST.srs[c.id]?.i || 0) >= 21).length;
  const nome = ST.cfg.nome ? ", " + esc(ST.cfg.nome) : "";
  const kick = antes ? `<i class="ti ti-calendar"></i> O cronograma começa ${fmtDL(pl.ini)}` : w && difD(hoje, pl.fim) >= 0 ? `<i class="ti ti-calendar"></i> Semana ${w.n} de ${pl.semanas.length} · ${esc(w.tema)}` : `<i class="ti ti-flag"></i> Cronograma concluído`;
  const pendH = tHoje.filter(t => !feita(t));
  const frase = antes
    ? `Faltam ${faltam} dias para a residência. Dá para adiantar a primeira leitura ou explorar o app antes de segunda.`
    : `Faltam ${faltam} dias para a residência. Hoje: ${pendH.length ? pendH.length + (pendH.length > 1 ? " tarefas" : " tarefa") + " no cronograma" : "cronograma em dia"}${due ? ` e ${due} ${due > 1 ? "cartões" : "cartão"} para revisar` : ""}.`;
  const prox = pendH[0] || pend[0];
  const dias7 = [...Array(7)].map((_, k) => addD(hoje, k - 6));
  s.innerHTML = `<div class="vIni anima">
   <div class="vHero"><span class="bola b1"></span><span class="bola b2"></span><span class="bola b3"></span>
     <div class="txt"><small>${kick}</small><h2>${saudacao()}${nome}</h2><p>${frase}</p>
      <div class="linhaBt">${prox ? `<button class="bt" data-acao="irTarefa" data-tk="${esc(prox.k)}"><i class="ti ti-player-play"></i>${pendH.length ? "Começar o dia" : "Pôr em dia"}</button>` : `<button class="bt" data-ir="leituras"><i class="ti ti-book-2"></i>Abrir leituras</button>`}
      <button class="bt sec" data-ir="cartoes"><i class="ti ti-cards"></i>Revisar cartões${due ? ` (${due})` : ""}</button></div></div>
     <div class="vAnel">${anel(m.tot)}<div class="val"><b data-conta="${Math.round(m.tot * 100)}" data-suf="%">0%</b><span>da meta de hoje</span></div></div>
   </div>
   <div class="vMeta"><h3>Meta de hoje</h3><div class="sub">ajuste em Ajustes</div>
     ${[["q", "checklist", "var(--c-azul)", "Questões", a.q || 0, ST.cfg.meta.q], ["c", "cards", "var(--c-ambar)", "Cartões", a.c || 0, ST.cfg.meta.c], ["t", "clock", "var(--c-verde)", "Minutos de estudo", a.min || 0, ST.cfg.meta.min]]
       .map(([k, ic, cor, nm, v, g]) => `<div class="metaItem" style="--k:${cor}"><span class="ic"><i class="ti ti-${ic}"></i></span><div><b>${nm}</b><div class="barra"><i data-w="${pct(Math.min(v, g), g)}"></i></div></div><em>${v}/${g}</em></div>`).join("")}
     <div class="vSemana">${dias7.map(d => { const p = progMeta(d).tot; return `<div><i class="${d === hoje ? "hoje" : p >= 1 ? "cheio" : p > 0 ? "parcial" : ""}" data-h="${Math.max(6, Math.round(p * 100))}"></i><span>${DSEM[dt(d).getDay()]}</span></div>`; }).join("")}</div>
   </div>
   <div class="vStats">
     <button class="vStat fogo" style="--k:var(--c-laranja)" data-ir="desempenho"><span class="ic"><i class="ti ti-flame"></i></span><div><b data-conta="${seq}">0</b><span>${seq === 1 ? "dia seguido" : "dias seguidos"}</span></div></button>
     <button class="vStat" style="--k:var(--c-azul)" data-ir="questoes"><span class="ic"><i class="ti ti-target-arrow"></i></span><div><b data-conta="${eq.taxa}" data-suf="%">0</b><span>acerto em ${eq.tent} respostas</span></div></button>
     <button class="vStat" style="--k:var(--c-violeta)" data-ir="leituras"><span class="ic"><i class="ti ti-book-2"></i></span><div><b data-conta="${lidas}">0</b><span>de ${E.leituras.length} leituras</span></div></button>
     <button class="vStat" style="--k:var(--c-verde)" data-ir="cartoes"><span class="ic"><i class="ti ti-brain"></i></span><div><b data-conta="${dom}">0</b><span>cartões dominados</span></div></button>
   </div>
   <div class="vHoje"><div class="vTit"><i class="ti ti-calendar-check bolinha" style="--k:var(--c-verde)"></i><h3>${antes ? "Primeira semana" : "Hoje no cronograma"}</h3><button data-ir="cronograma">Ver cronograma</button></div>
     ${antes ? pl.semanas[0].dias.filter(d => d.t.length).slice(0, 3).map(d => `<div class="sub" style="margin:10px 0 2px;font-weight:650">${fmtDL(d.data)}</div>` + d.t.map(htmlTarefa).join("")).join("")
       : tHoje.length ? tHoje.map(htmlTarefa).join("") : `<div class="vazio" style="padding:18px"><i class="ti ti-mood-smile"></i>Dia livre no cronograma. Revise os cartões pendentes.</div>`}
     ${pend.length ? `<div class="sep"></div><div class="vTit" style="margin-bottom:4px"><i class="ti ti-alert-circle bolinha" style="--k:var(--c-laranja)"></i><h3>${pend.length} ${pend.length > 1 ? "tarefas atrasadas" : "tarefa atrasada"}</h3></div>${pend.slice(0, 4).map(htmlTarefa).join("")}${pend.length > 4 ? `<div class="sub" style="margin-top:8px">e mais ${pend.length - 4} no cronograma.</div>` : ""}` : ""}
   </div>
   <div class="vFoco"><div class="vTit"><i class="ti ti-target bolinha" style="--k:var(--c-rosa)"></i><h3>Onde focar</h3><button data-ir="desempenho">Desempenho</button></div>
     ${E.areas.map(ar => { const e = estatArea(ar.id); const cob = pct(e.lidas, e.nl); const tx = e.tent ? e.taxa : null; return {ar, e, cob, tx, pri: (tx == null ? 60 : 100 - tx) + (100 - cob) * .6}; })
        .sort((x, y) => y.pri - x.pri).slice(0, 5).map(({ar, e, cob, tx}) => `<button class="vArea" style="--k:${corA(ar.id)}" data-acao="focoArea" data-area="${ar.id}"><span class="dot"><i class="ti ti-${ar.icone}"></i></span><div><div class="nm">${esc(ar.nome)}</div><div class="barra"><i data-w="${cob}"></i></div></div><span class="tx">${tx == null ? "–" : tx + "%"}</span></button>`).join("")}
     <div class="sub" style="margin-top:6px">Barra: leituras concluídas da área. Número: acerto nas questões.</div>
   </div>
   <div class="vLer"><div class="vTit"><i class="ti ti-bookmark bolinha" style="--k:var(--c-violeta)"></i><h3>Continuar lendo</h3><button data-ir="leituras">Todas as leituras</button></div>
     <div class="vLeit">${leiturasSugeridas().map(l => `<button style="--k:${corA(l.area)}" data-ir-l="${l.slug}"><small>${esc(AREA[l.area].nome)}</small><b>${esc(l.titulo)}</b><div class="barra"><i data-w="${ST.lidas[l.slug] ? 100 : ST.prog[l.slug] || 0}"></i></div><em>${ST.lidas[l.slug] ? "Concluída" : ST.prog[l.slug] ? ST.prog[l.slug] + "% lido" : "Semana " + l.sem + " · " + (l.min || "–") + " min"}</em></button>`).join("")}</div>
   </div>
  </div>`;
  vivo(s);
}
function leiturasSugeridas() {
  const vistos = new Set(), out = [];
  const add = l => { if (l && l.ok && !vistos.has(l.slug)) { vistos.add(l.slug); out.push(l); } };
  (ST.recentes || []).map(s => LEIT[s]).filter(l => l && !ST.lidas[l.slug]).forEach(add);
  const pl = plano();
  pl.todas.filter(t => t.tipo === "L" && !ST.lidas[t.s]).forEach(t => add(LEIT[t.s]));
  return out.slice(0, 8);
}

/* ======================================================================
   CRONOGRAMA
   ====================================================================== */
function pintaCronograma() {
  const pl = plano(), hoje = iso(), wi = semanaIdx(pl);
  const cont = pl.todas.filter(t => t.tipo !== "M"), feitas = cont.filter(feita).length;
  const pend = pendencias();
  titulo("calendar-event", "Cronograma", `${fmtD(pl.ini)} a ${fmtD(pl.fim)} · ${pl.semanas.length} semanas até a residência em ${fmtD(E.residencia)}`,
    `<button class="bt sec mini" data-acao="irHoje"><i class="ti ti-calendar-down"></i>Ir para hoje</button>`);
  /* projeção: ritmo das últimas duas semanas */
  const d14 = addD(hoje, -14);
  const recentes = cont.filter(t => feita(t) && t.data >= d14 && t.data <= hoje).length;
  const restantes = cont.length - feitas;
  let proj = "";
  if (wi >= 1 && recentes > 0) { const dias = Math.ceil(restantes / (recentes / 14)); const fim = addD(hoje, dias); proj = `No ritmo das últimas duas semanas, você termina em ${fmtD(fim)}${fim > E.residencia ? ", depois do início da residência" : ""}.`; }
  const s = $("#sec-cronograma");
  s.innerHTML = `<div class="grade g3 anima" style="margin-bottom:18px">
     <div class="kpi" style="--k:var(--c-verde)"><b data-conta="${pct(feitas, cont.length)}" data-suf="%">0</b><span>${feitas} de ${cont.length} tarefas concluídas</span></div>
     <div class="kpi" style="--k:var(--c-violeta)"><b data-conta="${Object.keys(ST.lidas).filter(k => LEIT[k]).length}">0</b><span>de ${E.leituras.length} leituras</span></div>
     <div class="kpi" style="--k:${pend.length ? "var(--c-laranja)" : "var(--c-azul)"}"><b data-conta="${pend.length}">0</b><span>${pend.length === 1 ? "tarefa atrasada" : "tarefas atrasadas"}</span></div>
   </div>
   <p class="sub" style="margin:-4px 0 18px">Segunda, quarta e sexta são dias de leitura (com os cartões e as questões do texto). Terça, quinta e sábado têm uma prescrição para avaliar; terça e quinta também trazem revisão intercalada e casos clínicos, e o sábado fecha a semana com a revisão. Domingo é livre. As tarefas de leitura, cartões, questões e casos se marcam sozinhas quando você as faz.${proj ? " " + proj : ""}</p>
   ${pend.length ? `<div class="cx" style="margin-bottom:18px;--ac:var(--c-laranja)"><h3><i class="ti ti-alert-circle"></i>Atrasadas</h3>${pend.slice(0, 8).map(htmlTarefa).join("")}${pend.length > 8 ? `<p class="sub">e mais ${pend.length - 8} nas semanas abaixo.</p>` : ""}</div>` : ""}
   <div id="semanas">${pl.semanas.map((w, i) => htmlSemana(w, i, wi, hoje)).join("")}</div>`;
  vivo(s);
}
function htmlSemana(w, i, wi, hoje) {
  const ts = w.dias.flatMap(d => d.t.map(t => ({...t, data: d.data}))).filter(t => t.tipo !== "M");
  const f = ts.filter(feita).length, p = pct(f, ts.length);
  const atual = i === wi, fim = addD(w.seg, 6);
  return `<details class="cx semana${atual ? " atual" : ""}${p === 100 ? " feita" : ""}" id="sem-${w.n}" ${atual || (wi < 0 && i === 0) ? "open" : ""}>
   <summary><span class="num">${p === 100 ? '<i class="ti ti-check"></i>' : w.n}</span>
    <div><h3>${esc(w.tema)}</h3><div class="quando">Semana ${w.n} · ${fmtD(w.seg)} a ${fmtD(fim)} · ${w.leituras.length} leituras</div></div>
    <div class="prog"><div class="barra"><i style="width:${p}%"></i></div><div class="sub" style="text-align:right;margin-top:4px">${f}/${ts.length}</div></div>
    <i class="ti ti-chevron-down seta"></i></summary>
   ${w.nota ? `<div class="nota"><i class="ti ti-info-circle"></i> ${esc(w.nota)}</div>` : ""}
   <div class="dias">${w.dias.map(d => `<div class="dia${d.data === hoje ? " hoje" : d.data < hoje ? " passado" : ""}"><h4><span>${fmtDL(d.data)}</span>${d.data === hoje ? "<span>hoje</span>" : ""}</h4>
     ${d.t.length ? d.t.map(t => htmlTarefa({...t, data: d.data})).join("") : `<div class="desc">Livre. Se quiser, revise os cartões do dia.</div>`}</div>`).join("")}</div>
  </details>`;
}

/* ======================================================================
   LEITURAS
   ====================================================================== */
const LF = {area: "", st: "", q: "", modo: "area"};
function pintaLeituras(slug) {
  if (slug) return abreLeitura(slug);
  titulo("book-2", "Leituras", `${E.leituras.length} textos em ${E.areas.length} áreas, do básico ao avançado, escritos para a rotina do farmacêutico na UTI`);
  const s = $("#sec-leituras");
  s.innerHTML = `<div class="filtros">
     <div class="busca"><i class="ti ti-search"></i><input type="search" id="lfBusca" placeholder="Filtrar leituras" value="${esc(LF.q)}"></div>
     <div class="tabs2"><button data-lf-modo="area" aria-pressed="${LF.modo === "area"}">Por área</button><button data-lf-modo="semana" aria-pressed="${LF.modo === "semana"}">Por semana</button></div>
     <div class="tabs2"><button data-lf-st="" aria-pressed="${!LF.st}">Todas</button><button data-lf-st="nao" aria-pressed="${LF.st === "nao"}">A ler</button><button data-lf-st="lidas" aria-pressed="${LF.st === "lidas"}">Lidas</button></div>
   </div>
   <div class="chips" style="margin-bottom:6px"><button class="chip" data-lf-area="" aria-pressed="${!LF.area}">Todas as áreas</button>${E.areas.map(a => `<button class="chip" data-lf-area="${a.id}" aria-pressed="${LF.area === a.id}" style="--ac:${corA(a.id)}"><i class="ti ti-${a.icone}"></i>${esc(a.nome)}</button>`).join("")}</div>
   <div id="listaLeituras"></div>`;
  listaLeituras();
  $("#lfBusca").addEventListener("input", debounce(e => { LF.q = e.target.value; listaLeituras(); }, 150));
}
function listaLeituras() {
  const q = norm(LF.q);
  const ls = E.leituras.filter(l => (!LF.area || l.area === LF.area) && (!LF.st || (LF.st === "lidas") === !!ST.lidas[l.slug]) && (!q || norm(l.titulo + " " + (l.dek || "")).includes(q)));
  const grupos = LF.modo === "area"
    ? E.areas.map(a => ({k: a.id, nome: a.nome, ic: a.icone, cor: corA(a.id), ls: ls.filter(l => l.area === a.id)}))
    : plano().semanas.map(w => ({k: w.n, nome: `Semana ${w.n} · ${w.tema}`, ic: "calendar", cor: "var(--c-verde)", sub: `${fmtD(w.seg)} a ${fmtD(addD(w.seg, 6))}`, ls: w.leituras.map(s => ls.find(l => l.slug === s)).filter(Boolean)}));
  const h = grupos.filter(g => g.ls.length).map(g => `<h2 class="grupoL" style="--k:${g.cor}"><i class="ti ti-${g.ic}"></i>${esc(g.nome)} <small>${g.sub || g.ls.filter(l => ST.lidas[l.slug]).length + "/" + g.ls.length + " lidas"}</small></h2>
     <div class="listaL anima">${g.ls.map(itemLeitura).join("")}</div>`).join("");
  $("#listaLeituras").innerHTML = h || `<div class="cx vazio"><i class="ti ti-search-off"></i>Nenhuma leitura com esse filtro.</div>`;
  vivo($("#listaLeituras"));
}
function itemLeitura(l) {
  const lida = !!ST.lidas[l.slug], p = lida ? 100 : ST.prog[l.slug] || 0;
  return `<button class="itemL${l.ok ? "" : " indisp"}" style="--k:${corA(l.area)}" ${l.ok ? `data-ir-l="${l.slug}"` : "disabled"}>
    <div class="meta"><span>Semana ${l.sem}</span><span>·</span><span>${l.ok ? (l.min || "–") + " min" : "em preparação"}</span></div>
    <h3>${esc(l.titulo)}</h3><p>${esc(l.dek || "")}</p>
    <div class="rod"><div class="barra"><i data-w="${p}"></i></div>${lida ? '<i class="ti ti-circle-check-filled ok" aria-label="lida"></i>' : `<span class="sub">${p}%</span>`}</div></button>`;
}
let leituraObs = null, mermaidP = null;
async function abreLeitura(slug) {
  const l = LEIT[slug];
  if (!l) return ir("leituras");
  semTitulo();
  const s = $("#sec-leituras");
  ST.recentes = [slug, ...(ST.recentes || []).filter(x => x !== slug)].slice(0, 12); salva("recentes");
  const i = E.leituras.indexOf(l), ant = E.leituras[i - 1], prox = E.leituras[i + 1];
  const nc = (CPL[slug] || []).length, nq = (QPL[slug] || []).length;
  s.innerHTML = `<div class="leitorTopo"><button class="bt sec mini" data-ir="leituras"><i class="ti ti-arrow-left"></i>Leituras</button>
     <span class="kick" style="--k:${corA(l.area)}"><i class="ti ti-${icA(l.area)}"></i>${esc(AREA[l.area].nome)}</span><span class="sub">Semana ${l.sem} · ${l.min || "–"} min</span>
     <span style="flex:1"></span>
     <button class="bt sec mini" data-acao="fonte" data-d="-1" aria-label="Diminuir letra">A−</button><button class="bt sec mini" data-acao="fonte" data-d="1" aria-label="Aumentar letra">A+</button>
     <button class="bt mini ${ST.lidas[slug] ? "sec" : ""}" data-acao="lida" data-s="${slug}"><i class="ti ti-${ST.lidas[slug] ? "circle-check" : "check"}"></i>${ST.lidas[slug] ? "Lida" : "Marcar como lida"}</button></div>
   <div class="leitor" style="--k:${corA(l.area)}">
    <article class="texto" id="texto"><h1 class="titL">${esc(l.titulo)}</h1><div class="vazio"><i class="ti ti-loader-2"></i>Carregando…</div></article>
    <aside class="lado">
     <div class="cx tocBox"><h3><i class="ti ti-list"></i>Nesta leitura</h3><nav class="toc" id="toc"></nav></div>
     <div class="cx"><h3><i class="ti ti-bolt"></i>Praticar</h3><div class="linhaBt">
       <button class="bt mini" style="--ac:var(--c-ambar)" data-ir-c="${slug}" ${nc ? "" : "disabled"}><i class="ti ti-cards"></i>${nc} cartões</button>
       <button class="bt mini" style="--ac:var(--c-azul)" data-acao="qLeitura" data-s="${slug}" ${nq ? "" : "disabled"}><i class="ti ti-checklist"></i>${nq} questões</button></div></div>
     <div class="cx"><h3><i class="ti ti-notes"></i>Minhas anotações</h3><textarea id="notaL" placeholder="Resumos, dúvidas para o preceptor, doses para decorar…">${esc(ST.notas[slug] || "")}</textarea><div class="sub" style="margin-top:6px">Ficam só neste aparelho e entram no backup.</div></div>
    </aside></div>`;
  $("#notaL").addEventListener("input", debounce(e => { if (e.target.value.trim()) ST.notas[slug] = e.target.value; else delete ST.notas[slug]; salva("notas"); }, 500));
  let html = "";
  try {
    const r = await fetch(E.conteudo + slug + ".html");
    if (!r.ok) throw new Error(r.status);
    html = await r.text();
  } catch (e) {
    $("#texto").innerHTML = `<h1 class="titL">${esc(l.titulo)}</h1><div class="vazio"><i class="ti ti-wifi-off"></i>Não foi possível abrir esta leitura agora. Sem internet, só abrem as leituras já baixadas (Ajustes, "Baixar para usar sem internet").</div>`;
    return;
  }
  if (abaAtual !== "leituras" || paramAtual !== slug) return;
  const t = $("#texto");
  t.innerHTML = `<h1 class="titL">${esc(l.titulo)}</h1>` + html + `<div class="fimL">
     ${ant ? `<button class="bt sec" data-ir-l="${ant.slug}"><i class="ti ti-arrow-left"></i>Anterior</button>` : "<span></span>"}
     <button class="bt" data-acao="lida" data-s="${slug}" data-fim="1"><i class="ti ti-check"></i>${ST.lidas[slug] ? "Leitura concluída" : "Concluir leitura"}</button>
     ${prox ? `<button class="bt sec" data-ir-l="${prox.slug}">Próxima<i class="ti ti-arrow-right"></i></button>` : "<span></span>"}</div>`;
  const ICX = {chave: "bulb", alerta: "alert-triangle", farma: "stethoscope", calculo: "calculator"};
  $$(".cx", t).forEach(c => { const b = c.querySelector(":scope>b"); const tipo = Object.keys(ICX).find(k => c.classList.contains(k)); if (b && tipo) b.insertAdjacentHTML("afterbegin", `<i class="ti ti-${ICX[tipo]}"></i>`); });
  const h2s = $$("h2", t).filter(h => !h.closest(".fontes"));
  h2s.forEach((h, k) => h.id = "s-" + k);
  $("#toc").innerHTML = h2s.map((h, k) => `<a href="#" data-sec="${k}">${esc(h.textContent)}</a>`).join("");
  if (LER_SECAO != null) { const alvo = $("#s-" + LER_SECAO); LER_SECAO = null; if (alvo) setTimeout(() => alvo.scrollIntoView({behavior: "smooth"}), 60); }
  else if (ST.prog[slug] && !ST.lidas[slug] && ST.prog[slug] > 5) {
    const y = t.offsetTop + (t.offsetHeight - innerHeight) * ST.prog[slug] / 100;
    setTimeout(() => scrollTo({top: y - 80}), 60);
    aviso(`Continuando de onde você parou (${ST.prog[slug]}%).`);
  }
  if (t.querySelector(".mermaid")) desenhaMermaid(t);
  acompanhaLeitura(slug, t, h2s);
}
let LER_SECAO = null;
function acompanhaLeitura(slug, t, h2s) {
  const barra = $("#progTopo"); barra.hidden = false;
  if (leituraObs) removeEventListener("scroll", leituraObs);
  const grava = debounce(() => salva("prog"), 1200);
  leituraObs = () => {
    if (abaAtual !== "leituras" || paramAtual !== slug) { removeEventListener("scroll", leituraObs); barra.hidden = true; return; }
    const tot = t.offsetHeight - innerHeight + 120;
    const p = Math.max(0, Math.min(100, Math.round((scrollY - t.offsetTop + 100) / tot * 100)));
    barra.firstElementChild.style.width = p + "%";
    if (p > (ST.prog[slug] || 0)) { ST.prog[slug] = p; grava(); }
    let at = 0; h2s.forEach((h, k) => { if (h.getBoundingClientRect().top < 140) at = k; });
    $$("#toc a").forEach((a, k) => a.classList.toggle("on", k === at));
  };
  addEventListener("scroll", leituraObs, {passive: true});
  leituraObs();
}
function escuro() { const t = document.documentElement.dataset.tema; return t === "escuro" || (!t && matchMedia("(prefers-color-scheme: dark)").matches); }
async function desenhaMermaid(t) {
  try {
    mermaidP ||= new Promise((ok, er) => { const sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"; sc.onload = () => ok(window.mermaid); sc.onerror = er; document.head.appendChild(sc); });
    const m = await mermaidP;
    m.initialize({startOnLoad: false, theme: escuro() ? "dark" : "neutral", securityLevel: "strict", fontFamily: getComputedStyle(document.body).fontFamily, flowchart: {htmlLabels: true, curve: "basis"}});
    await m.run({nodes: $$("pre.mermaid", t)});
    /* no celular o diagrama encolhido fica ilegível: mantém a largura natural e rola de lado */
    $$("pre.mermaid svg", t).forEach(svg => { const w = svg.viewBox?.baseVal?.width || 0, cab = svg.closest(".fluxo").clientWidth - 28; if (w > cab && innerWidth < 760) { svg.style.maxWidth = "none"; svg.style.width = Math.round(Math.min(w, 820) * .9) + "px"; const box = svg.closest(".fluxo"); box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2; } });
  } catch (e) { /* offline: o texto do diagrama continua legível */ }
}
function marcaLida(slug) {
  if (ST.lidas[slug]) { delete ST.lidas[slug]; salva("lidas"); aviso("Leitura desmarcada."); rota(); return; }
  ST.lidas[slug] = iso(); ST.prog[slug] = 100; salva("lidas"); salva("prog"); marca("l");
  aviso("Leitura concluída. Agora os cartões e as questões fixam o conteúdo.");
  confete();
  rota();
}

/* ======================================================================
   CARTÕES (repetição espaçada, variante do SM-2)
   ====================================================================== */
function devidos() { const h = iso(); return Object.entries(ST.srs).filter(([id, s]) => CID[id] && s.d <= h).sort((a, b) => a[1].d < b[1].d ? -1 : 1).map(([id]) => CID[id]); }
function novosLiberados() {
  const w = semanaLiberada();
  return E.cartoes.filter(c => !ST.srs[c.id] && (ST.lidas[c.l] || (LEIT[c.l]?.sem || 99) <= w));
}
function cotaNovos() { return Math.max(0, ST.cfg.novos - (ativ().cn || 0)); }
function prever(c, nota) {
  const s = ST.srs[c.id]; let e = s?.e ?? 2.5; const i = s?.i ?? 0;
  if (nota === 1) return {e: Math.max(1.3, e - .2), i: 0};
  if (!s || i === 0) return {e: nota === 2 ? Math.max(1.3, e - .15) : nota === 4 ? e + .15 : e, i: nota === 4 ? 4 : 1};
  if (nota === 2) return {e: Math.max(1.3, e - .15), i: Math.max(i + 1, Math.round(i * 1.2))};
  if (nota === 3) return {e, i: i === 1 ? 3 : Math.round(i * e)};
  return {e: e + .15, i: Math.round(Math.max(i + 2, i * e * 1.3))};
}
const rotInt = i => i === 0 ? "10 min" : i === 1 ? "1 dia" : i < 30 ? i + " dias" : i < 365 ? Math.round(i / 30) + (Math.round(i / 30) > 1 ? " meses" : " mês") : num(i / 365) + " ano";
let SES = null;
function pintaCartoes(slug) {
  if (slug === "sessao" && SES) return pintaSessao();
  if (slug && slug !== "sessao") { iniciaSessao(slug); return; }
  SES = null;
  const due = devidos(), nov = novosLiberados(), cota = cotaNovos();
  const dom = E.cartoes.filter(c => (ST.srs[c.id]?.i || 0) >= 21).length, vistos = E.cartoes.filter(c => ST.srs[c.id]).length;
  titulo("cards", "Cartões", `${E.cartoes.length} cartões com repetição espaçada: o app agenda cada um para o dia em que você está prestes a esquecer`);
  const s = $("#sec-cartoes");
  s.innerHTML = `<div class="painelCartoes anima">
     <div class="kpi" style="--k:var(--c-ambar)"><b data-conta="${due.length}">0</b><span>para revisar hoje</span></div>
     <div class="kpi" style="--k:var(--c-azul)"><b data-conta="${Math.min(cota, nov.length)}">0</b><span>novos liberados para hoje (${nov.length} no total)</span></div>
     <div class="kpi" style="--k:var(--c-verde)"><b data-conta="${dom}">0</b><span>dominados (intervalo de 21 dias ou mais) · ${vistos} vistos</span></div></div>
   <div class="cx" style="margin-bottom:18px"><div class="linhaBt">
     <button class="bt" data-acao="sessao" ${due.length + Math.min(cota, nov.length) ? "" : "disabled"}><i class="ti ti-player-play"></i>Estudar agora (${due.length + Math.min(cota, nov.length)})</button>
     <span class="sub">Revisões vencidas primeiro, depois até ${ST.cfg.novos} novos por dia. Os novos vêm das leituras já lidas e das semanas liberadas do cronograma.</span></div></div>
   ${E.areas.map(a => { const ls = E.leituras.filter(l => l.area === a.id && (CPL[l.slug] || []).length); if (!ls.length) return "";
     return `<h2 class="grupoL" style="--k:${corA(a.id)}"><i class="ti ti-${a.icone}"></i>${esc(a.nome)}</h2><div class="cx" style="padding:8px 22px">${ls.map(l => {
       const cs = CPL[l.slug], v = cs.filter(c => ST.srs[c.id]).length, d = cs.filter(c => (ST.srs[c.id]?.i || 0) >= 21).length, dv = cs.filter(c => ST.srs[c.id] && ST.srs[c.id].d <= iso()).length;
       return `<div class="tarefa" style="--k:${corA(a.id)}"><span class="chk" style="border:0;background:color-mix(in srgb,var(--k) 14%,var(--sup));color:var(--k)"><i class="ti ti-cards"></i></span>
        <div><div class="tt">${esc(l.titulo)}</div><div class="ds"><span>${cs.length} cartões · ${v} vistos · ${d} dominados</span>${dv ? `<span class="pil av">${dv} para hoje</span>` : ""}</div></div>
        <button class="ir" data-ir-c="${l.slug}" aria-label="Estudar"><i class="ti ti-player-play"></i></button></div>`; }).join("")}</div>`; }).join("")}`;
  vivo(s);
}
function iniciaSessao(slug) {
  let fila;
  if (slug && LEIT[slug]) fila = [...(CPL[slug] || [])];
  else { const due = embaralha(devidos()); fila = [...due, ...novosLiberados().slice(0, cotaNovos())]; }
  if (!fila.length) { aviso("Nada para estudar agora."); return ir("cartoes"); }
  SES = {fila, i: 0, virada: false, feitos: 0, erros: 0, slug: slug || "", t0: Date.now()};
  if (location.hash !== "#cartoes/sessao") history.replaceState(null, "", "#cartoes/sessao");
  paramAtual = "sessao";
  pintaSessao();
}
function pintaSessao() {
  const s = $("#sec-cartoes");
  if (!SES) return ir("cartoes");
  if (SES.i >= SES.fila.length) {
    semTitulo();
    s.innerHTML = `<div class="flash"><div class="cx vazio anima"><i class="ti ti-confetti" style="color:var(--c-ambar)"></i><h2 style="margin-bottom:8px">Sessão concluída</h2>
      <p>${SES.feitos} respostas · ${SES.erros} ${SES.erros === 1 ? "cartão voltou" : "cartões voltaram"} para a fila · ${Math.max(1, Math.round((Date.now() - SES.t0) / 60000))} min</p>
      <div class="linhaBt" style="justify-content:center;margin-top:16px"><button class="bt" data-ir="cartoes">Voltar aos cartões</button><button class="bt sec" data-ir="inicio">Início</button></div></div></div>`;
    vivo(s); SES = null; return;
  }
  const c = SES.fila[SES.i], l = LEIT[c.l], st = ST.srs[c.id];
  semTitulo();
  const notas = [[1, "Errei", "var(--c-vermelho)"], [2, "Difícil", "var(--c-laranja)"], [3, "Bom", "var(--c-verde)"], [4, "Fácil", "var(--c-azul)"]];
  s.innerHTML = `<div class="flash">
    <div class="flashTopo"><button class="bt sec mini" data-acao="sairSessao"><i class="ti ti-x"></i>Sair</button>
      <span>${st ? "Revisão" : '<b style="color:var(--c-azul)">Novo</b>'} · ${SES.i + 1} de ${SES.fila.length}</span>
      <span class="barra" style="width:160px"><i style="width:${pct(SES.i, SES.fila.length)}%"></i></span></div>
    <div class="carta${SES.virada ? " virada" : ""}" id="carta" style="--k:${corA(l.area)}" role="button" tabindex="0" aria-label="Virar cartão">
     <div class="in"><div class="face frente"><div class="rot"><i class="ti ti-${icA(l.area)}"></i>${esc(l.titulo)}</div><div class="conteudo">${esc(c.f)}</div><div class="dica">toque ou barra de espaço para ver a resposta</div></div>
      <div class="face verso"><div class="rot"><i class="ti ti-bulb"></i>Resposta</div><div class="conteudo">${esc(c.v)}</div><div class="dica"><a href="#leituras/${c.l}">abrir a leitura</a></div></div></div></div>
    <div class="notas4" ${SES.virada ? "" : "hidden"}>${notas.map(([n, nm, cor]) => `<button style="--k:${cor}" data-nota="${n}">${nm}<small>${rotInt(prever(c, n).i)}</small></button>`).join("")}</div>
    <p class="sub" style="text-align:center;margin-top:12px">Atalhos: espaço vira · 1 errei · 2 difícil · 3 bom · 4 fácil</p></div>`;
}
function viraCarta() { if (!SES || SES.virada) return; SES.virada = true; $("#carta")?.classList.add("virada"); const n = $(".notas4"); if (n) n.hidden = false; }
function avalia(nota) {
  if (!SES || !SES.virada) return;
  const c = SES.fila[SES.i], novo = !ST.srs[c.id];
  const r = prever(c, nota), s = ST.srs[c.id] || {r: 0, l: 0};
  s.e = +r.e.toFixed(2); s.i = r.i; s.d = addD(iso(), r.i); s.r = (s.r || 0) + 1; s.u = iso();
  if (nota === 1) { s.l = (s.l || 0) + 1; SES.erros++; SES.fila.splice(Math.min(SES.fila.length, SES.i + 4), 0, c); }
  ST.srs[c.id] = s; salva("srs");
  SES.feitos++; SES.i++; SES.virada = false;
  const a = ativ(); a.c = (a.c || 0) + 1; if (novo) a.cn = (a.cn || 0) + 1; salva("ativ"); checaMeta();
  pintaSessao(); contadores();
}

/* ======================================================================
   QUESTÕES (treino e simulado)
   ====================================================================== */
/* areas: lista de áreas (vazia = todas), via mtfiltro.js. Até 25/09/2026 era `area` (uma string só):
   normFiltro() converte o estado antigo. A lista é congelada porque {...FILTRO0} a compartilha. */
const FILTRO0 = {areas: Object.freeze([]), l: "", nivel: "", st: "", ate: null, sem: null};
const QS = {filtro: {...FILTRO0}, misturar: false, lista: [], i: 0, assin: "", resp: null, combo: 0, dir: 1};
const listaAreas = v => (window.MTTemas ? MTTemas.lista(v) : Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
/* ordem fixa (a de E.areas) para a mesma escolha dar a mesma assinatura */
const ordenaAreas = ids => { const k = new Set(listaAreas(ids)); return E.areas.map(a => a.id).filter(id => k.has(id)); };
function normFiltro(f) {
  const o = {...FILTRO0, ...(f || {})};
  o.areas = ordenaAreas(f ? (f.areas ?? f.area) : []);
  delete o.area;
  return o;
}
const assinQ = () => JSON.stringify(QS.filtro) + QS.misturar;
/* recarregar mantém o filtro: vem de ST.pos.q.f; no formato antigo (sem f) sai da própria assinatura */
function restauraFiltroQ() {
  const p = ST.pos && ST.pos.q; if (!p || typeof p !== "object") return;
  let f = p.f, m = p.m;
  if (!f && typeof p.assin === "string") { const r = /^(\{.*\})(true|false)$/.exec(p.assin); if (r) try { f = JSON.parse(r[1]); m = r[2] === "true"; } catch (e) {} }
  if (!f || typeof f !== "object") return;
  QS.filtro = normFiltro(f); QS.misturar = !!m;
  p.assin = assinQ(); /* mesma escolha, formato novo: a ordem e a posição gravadas continuam valendo */
}
const QPA = {}; E.questoes.forEach(q => { const a = LEIT[q.l]?.area; if (a) QPA[a] = (QPA[a] || 0) + 1; });
const NIVEL = {basico: "Básico", intermediario: "Intermediário", avancado: "Avançado"};
function ordemAlts(q) {
  const o = [0, 1, 2, 3, 4]; let h = hash(q.id);
  for (let i = 4; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}
function filtraQ(f) {
  return E.questoes.filter(q => {
    const l = LEIT[q.l]; if (!l) return false;
    if (f.areas && f.areas.length && !f.areas.includes(l.area)) return false;
    if (f.l && q.l !== f.l) return false;
    if (f.nivel && q.n !== f.nivel) return false;
    if (f.ate && l.sem > f.ate) return false;
    if (f.sem && l.sem !== f.sem) return false;
    const u = ultimaResp(q.id);
    if (f.st === "nao" && u) return false;
    if (f.st === "erradas" && (!u || u.ok)) return false;
    if (f.st === "fav" && !ST.fav[q.id]) return false;
    return true;
  });
}
function montaListaQ() {
  const f = QS.filtro, assin = assinQ();
  if (assin === QS.assin && QS.lista.length) return;
  const salvo = ST.pos.q;
  let base = filtraQ(f);
  if (salvo && salvo.assin === assin) {
    const set = new Set(base.map(q => q.id));
    const ord = salvo.ordem.filter(id => set.has(id));
    const novos = base.filter(q => !ord.includes(q.id)).map(q => q.id);
    QS.lista = [...ord, ...novos]; QS.i = Math.min(salvo.i || 0, Math.max(0, QS.lista.length - 1));
  } else {
    QS.lista = (QS.misturar ? espalha(base, q => q.l) : base).map(q => q.id);
    QS.i = 0;
  }
  QS.assin = assin; QS.resp = null;
  guardaPosQ();
}
const guardaPosQ = () => { ST.pos.q = {assin: QS.assin, ordem: QS.lista, i: QS.i, f: QS.filtro, m: QS.misturar}; salva("pos"); };
function pintaQuestoes(param) {
  if (param === "simulado") return pintaSimulado();
  if (SIM.ativo) { SIM.ativo = null; }
  montaListaQ();
  const f = QS.filtro;
  const eq = estatQ();
  titulo("checklist", "Questões", `${E.questoes.length} questões comentadas alternativa por alternativa · ${eq.resp} respondidas · ${eq.taxa}% de acerto`,
    `<button class="bt mini" style="--ac:var(--c-laranja)" data-acao="abreSimulado"><i class="ti ti-stopwatch"></i>Simulado</button>`);
  const ls = E.leituras.filter(l => (!f.areas.length || f.areas.includes(l.area)) && (QPL[l.slug] || []).length);
  const extra = f.ate ? `<span class="chipF">Semanas 1 a ${f.ate}<button data-acao="limpaQ" data-k="ate" aria-label="Remover">×</button></span>` : f.sem ? `<span class="chipF">Semana ${f.sem}<button data-acao="limpaQ" data-k="sem" aria-label="Remover">×</button></span>` : "";
  const s = $("#sec-questoes");
  const resumo = [f.areas.length === 1 ? AREA[f.areas[0]]?.nome : f.areas.length > 1 && f.areas.length + " áreas", f.l && LEIT[f.l]?.titulo, f.nivel && NIVEL[f.nivel], f.st && {nao: "não respondidas", erradas: "caderno de erros", fav: "marcadas"}[f.st], f.ate && "semanas 1 a " + f.ate, f.sem && "semana " + f.sem, QS.misturar && "misturadas"].filter(Boolean).join(" · ") || "todas";
  s.innerHTML = `<div class="qWrap"><details class="fDet" ${innerWidth > 640 || QS.fAberto ? "open" : ""}><summary><i class="ti ti-adjustments-horizontal"></i>Filtros<span class="resumo">${esc(resumo)}</span></summary><div class="filtroQ">
     <button type="button" id="qfAreas"></button>
     <select data-qf="l" aria-label="Leitura"><option value="">Todas as leituras</option>${ls.map(l => `<option value="${l.slug}" ${f.l === l.slug ? "selected" : ""}>${esc(l.titulo)}</option>`).join("")}</select>
     <select data-qf="nivel" aria-label="Nível"><option value="">Todos os níveis</option>${Object.entries(NIVEL).map(([k, v]) => `<option value="${k}" ${f.nivel === k ? "selected" : ""}>${v}</option>`).join("")}</select>
     <select data-qf="st" aria-label="Situação"><option value="">Todas</option><option value="nao" ${f.st === "nao" ? "selected" : ""}>Não respondidas</option><option value="erradas" ${f.st === "erradas" ? "selected" : ""}>Caderno de erros</option><option value="fav" ${f.st === "fav" ? "selected" : ""}>Marcadas</option></select>
     <button class="chip" data-acao="misturar" aria-pressed="${QS.misturar}"><i class="ti ti-arrows-shuffle"></i>Misturar</button>${extra}
     <span class="sub" style="margin-left:auto">${QS.lista.length} ${QS.lista.length === 1 ? "questão" : "questões"}</span></div></details>
   <div id="qArea"></div></div>`;
  $(".fDet", s).addEventListener("toggle", e => { if (innerWidth <= 640) QS.fAberto = e.target.open; });
  montaFiltroAreas($("#qfAreas", s), {
    selecionados: f.areas,
    conta: ids => filtraQ({...QS.filtro, areas: ids, l: ""}).length,
    aoMudar: ids => { QS.filtro = {...QS.filtro, areas: ordenaAreas(ids), l: ""}; pintaQuestoes(); $("#qfAreas")?.focus({preventScroll: true}); }
  });
  pintaQuestao();
}
function pintaQuestao(anim) {
  const box = $("#qArea"); if (!box) return;
  if (!QS.lista.length) { box.innerHTML = `<div class="cx vazio"><i class="ti ti-filter-off"></i>Nenhuma questão com esse filtro.${QS.filtro.st === "erradas" ? " Caderno de erros vazio: bom sinal." : ""}</div>`; return; }
  const q = QID[QS.lista[QS.i]];
  if (!q) { QS.lista.splice(QS.i, 1); return pintaQuestao(); }
  const l = LEIT[q.l], ord = ordemAlts(q), r = QS.resp, u = ultimaResp(q.id);
  const alts = ord.map((oi, pos) => {
    let cls = "";
    if (r) { if (oi === q.g) cls = " certa"; else if (oi === r.a) cls = " errada"; }
    const ex = r && q.p[oi] ? `<span class="expl">${esc(q.p[oi])}</span>` : "";
    return `<button class="alt${cls}" data-alt="${oi}" ${r ? "disabled" : ""}><span class="let">${"ABCDE"[pos]}</span><span class="tx">${esc(q.a[oi])}${ex}</span></button>`;
  }).join("");
  box.innerHTML = `<div class="qCard${anim ? " entra" + (QS.dir < 0 ? " volta" : "") : ""}" style="--k:${corA(l.area)}">
    <div class="qTopo"><span class="qNum">Questão <b>${QS.i + 1}</b> de ${QS.lista.length}</span>
     ${u && !r ? `<span class="pil ${u.ok ? "ok" : "er"}">última vez: ${u.ok ? "acertou" : "errou"}</span>` : ""}
     ${QS.combo >= 3 && r?.ok ? `<span class="qCombo"><i class="ti ti-flame"></i>${QS.combo} seguidas</span>` : ""}
     <button class="btMarca${ST.fav[q.id] ? " on" : ""}" data-acao="fav" data-q="${q.id}" aria-label="Marcar para revisar" title="Marcar"><i class="ti ti-star${ST.fav[q.id] ? "-filled" : ""}"></i></button></div>
    <p class="enun">${esc(q.e)}</p><div class="alts">${alts}</div>
    ${r ? `<div class="coment ${r.ok ? "ok" : "er"}"><div class="cab"><i class="ti ti-${r.ok ? "circle-check" : "circle-x"}"></i>${r.ok ? "Resposta certa" : "Resposta errada: a correta é a " + "ABCDE"[ord.indexOf(q.g)]}
       <span class="pil cor" style="--k:${corA(l.area)}">${esc(AREA[l.area].nome)}</span><span class="pil">${NIVEL[q.n] || q.n}</span></div>
       <div>${esc(q.c)}</div><div class="base"><i class="ti ti-book"></i> ${esc(q.b)} · <a href="#leituras/${q.l}">${esc(l.titulo)}</a></div></div>` : ""}
    <div class="qPe"><button class="bt sec" data-acao="qNav" data-d="-1" ${QS.i ? "" : "disabled"}><i class="ti ti-arrow-left"></i>Anterior</button>
     <span class="sub" style="align-self:center">${r ? "" : "Atalhos: A a E · setas"}</span>
     <button class="bt" data-acao="qNav" data-d="1" ${QS.i < QS.lista.length - 1 ? "" : "disabled"}>Próxima<i class="ti ti-arrow-right"></i></button></div></div>`;
}
function responde(oi) {
  if (QS.resp) return;
  const q = QID[QS.lista[QS.i]]; const ok = oi === q.g;
  (ST.resp[q.id] ||= []).push({t: Date.now(), a: oi, ok}); salva("resp");
  const a = ativ(); a.q = (a.q || 0) + 1; if (ok) a.qa = (a.qa || 0) + 1; salva("ativ");
  QS.combo = ok ? QS.combo + 1 : 0;
  QS.resp = {a: oi, ok};
  pintaQuestao(); checaMeta();
}
function navQ(d) {
  const n = QS.i + d; if (n < 0 || n >= QS.lista.length) return;
  QS.i = n; QS.resp = null; QS.dir = d; guardaPosQ(); pintaQuestao(true);
  const c = $(".qCard"); if (c && c.getBoundingClientRect().top < 0) c.scrollIntoView({behavior: "smooth"});
}

/* simulado */
const SIM = {cfg: {n: 20, escopo: "liberadas", areas: [], tarefa: ""}, ativo: null};
/* botão de várias áreas (mtfiltro.js); sem o componente, cai num aviso em vez de quebrar a tela */
function montaFiltroAreas(el, o) {
  if (!el) return null;
  if (!window.MTTemas) { el.textContent = "Filtro de áreas indisponível: recarregue a página"; el.disabled = true; return null; }
  return MTTemas.monta(el, {
    opcoes: E.areas.map(a => ({id: a.id, nome: a.nome, n: QPA[a.id] || 0})),
    selecionados: listaAreas(o.selecionados), rotuloTodos: "Todas as áreas", titulo: "Áreas",
    item: ["área", "áreas"], verbo: o.verbo || "Mostrar",
    conta: o.conta, aoMudar: o.aoMudar
  });
}
function pintaSimulado() {
  const s = $("#sec-questoes");
  if (SIM.ativo?.fim) return pintaResultadoSim();
  if (SIM.ativo) return pintaQuestaoSim();
  titulo("stopwatch", "Simulado", "Questões sorteadas e intercaladas por tema, com cronômetro e correção só no fim");
  const c = SIM.cfg;
  const disp = poolSim().length;
  s.innerHTML = `<div class="cx" style="max-width:720px">
    <label class="campo">Quantidade de questões</label><div class="chips" style="margin:8px 0 16px">${[10, 20, 30, 40, 60].map(n => `<button class="chip" data-sim-n="${n}" aria-pressed="${c.n === n}">${n}</button>`).join("")}</div>
    <label class="campo">De onde sortear</label><div class="chips" style="margin:8px 0 16px">
      <button class="chip" data-sim-e="liberadas" aria-pressed="${c.escopo === "liberadas"}">Semanas já liberadas (1 a ${semanaLiberada()})</button>
      <button class="chip" data-sim-e="todas" aria-pressed="${c.escopo === "todas"}">Todo o banco</button>
      <button class="chip" data-sim-e="erradas" aria-pressed="${c.escopo === "erradas"}">Caderno de erros</button></div>
    <div class="campo"><span>Áreas</span><div><button type="button" id="simAreas"></button></div></div>
    <p class="sub" style="margin:14px 0">${disp} questões disponíveis nesse recorte. Tempo sugerido: ${Math.round(Math.min(c.n, disp) * 2.5)} min (2,5 min por questão).</p>
    <div class="linhaBt"><button class="bt" style="--ac:var(--c-laranja)" data-acao="comecaSim" ${disp ? "" : "disabled"}><i class="ti ti-player-play"></i>Começar</button><button class="bt sec" data-ir="questoes">Voltar ao treino</button></div></div>
   ${(ST.sims || []).length ? `<div class="cx" style="max-width:720px"><h3><i class="ti ti-history"></i>Simulados anteriores</h3>${ST.sims.slice(-8).reverse().map(x => `<div class="tarefa" style="--k:var(--c-laranja)"><span class="chk" style="border:0;background:var(--acSup);color:var(--acInk)"><b style="font-size:12px">${pct(x.ok, x.n)}%</b></span><div><div class="tt">${x.ok}/${x.n} acertos</div><div class="ds">${new Date(x.ts).toLocaleDateString("pt-BR")} · ${Math.round(x.dur / 60)} min</div></div><span></span></div>`).join("")}</div>` : ""}`;
  montaFiltroAreas($("#simAreas", s), {
    selecionados: c.areas,
    conta: ids => poolSim({...SIM.cfg, areas: ids}).length, verbo: "Usar",
    aoMudar: ids => { SIM.cfg.areas = ordenaAreas(ids); pintaSimulado(); $("#simAreas")?.focus({preventScroll: true}); }
  });
}
function poolSim(c = SIM.cfg) {
  const w = semanaLiberada(), ars = listaAreas(c.areas ?? c.area);
  return E.questoes.filter(q => { const l = LEIT[q.l]; if (!l) return false; if (ars.length && !ars.includes(l.area)) return false;
    if (c.escopo === "liberadas" && l.sem > w && !ST.lidas[q.l]) return false;
    if (c.escopo === "erradas") { const u = ultimaResp(q.id); if (!u || u.ok) return false; }
    return true; });
}
function comecaSim() {
  const pool = espalha(poolSim(), q => q.l).slice(0, SIM.cfg.n);
  SIM.ativo = {ids: pool.map(q => q.id), resp: {}, i: 0, t0: Date.now(), tarefa: SIM.cfg.tarefa || ""};
  SIM.cfg.tarefa = "";
  pintaSimulado();
}
let simRelogio = null;
function pintaQuestaoSim() {
  const A = SIM.ativo, q = QID[A.ids[A.i]], ord = ordemAlts(q);
  titulo("stopwatch", "Simulado em andamento", `Questão ${A.i + 1} de ${A.ids.length} · <span id="relogio"></span>`,
    `<button class="bt mini" style="--ac:var(--c-laranja)" data-acao="fimSim"><i class="ti ti-flag"></i>Entregar</button>`);
  $("#sec-questoes").innerHTML = `<div class="qWrap"><div class="qCard" style="--ac:var(--c-laranja)">
    <p class="enun">${esc(q.e)}</p><div class="alts">${ord.map((oi, pos) => `<button class="alt${A.resp[q.id] === oi ? " marcada" : ""}" data-simalt="${oi}"><span class="let">${"ABCDE"[pos]}</span><span class="tx">${esc(q.a[oi])}</span></button>`).join("")}</div>
    <div class="qPe"><button class="bt sec" data-acao="simNav" data-d="-1" ${A.i ? "" : "disabled"}><i class="ti ti-arrow-left"></i>Anterior</button>
     <button class="bt" style="--ac:var(--c-laranja)" data-acao="simNav" data-d="1">${A.i < A.ids.length - 1 ? 'Próxima<i class="ti ti-arrow-right"></i>' : 'Entregar<i class="ti ti-flag"></i>'}</button></div></div>
   <div class="cx" style="margin-top:16px"><div class="chips">${A.ids.map((id, k) => `<button class="chip" data-simir="${k}" aria-pressed="${k === A.i}" style="min-width:44px;justify-content:center${A.resp[id] != null && k !== A.i ? ";background:var(--acSup);border-color:transparent" : ""}">${k + 1}</button>`).join("")}</div></div></div>`;
  clearInterval(simRelogio);
  const tick = () => { const r = $("#relogio"); if (!r || !SIM.ativo || SIM.ativo.fim) return clearInterval(simRelogio); const sg = Math.floor((Date.now() - A.t0) / 1000); r.textContent = `${p2(Math.floor(sg / 60))}:${p2(sg % 60)}`; };
  tick(); simRelogio = setInterval(tick, 1000);
}
function fimSim() {
  const A = SIM.ativo; if (!A) return;
  const falt = A.ids.filter(id => A.resp[id] == null).length;
  if (falt && !confirm(`${falt} ${falt > 1 ? "questões sem resposta" : "questão sem resposta"}. Entregar mesmo assim?`)) return;
  clearInterval(simRelogio);
  A.fim = Date.now();
  let ok = 0; const porArea = {};
  for (const id of A.ids) {
    const q = QID[id], a = A.resp[id], certo = a === q.g, ar = LEIT[q.l].area;
    porArea[ar] ||= [0, 0]; porArea[ar][1]++;
    if (a != null) { (ST.resp[id] ||= []).push({t: A.fim, a, ok: certo, sim: 1}); }
    if (certo) { ok++; porArea[ar][0]++; }
  }
  const resp = A.ids.filter(id => A.resp[id] != null).length;
  const at = ativ(); at.q = (at.q || 0) + resp; at.qa = (at.qa || 0) + ok;
  ST.sims.push({ts: A.fim, n: A.ids.length, ok, dur: Math.round((A.fim - A.t0) / 1000), porArea, tarefa: A.tarefa});
  salva("resp"); salva("ativ"); salva("sims"); checaMeta();
  A.ok = ok; A.porArea = porArea;
  pintaResultadoSim();
}
function pintaResultadoSim() {
  const A = SIM.ativo, p = pct(A.ok, A.ids.length);
  titulo("flag", "Resultado do simulado", `${A.ok} de ${A.ids.length} · ${Math.round((A.fim - A.t0) / 60000)} min`);
  const s = $("#sec-questoes");
  s.innerHTML = `<div class="grade g2 anima" style="max-width:980px">
    <div class="cx" style="display:flex;gap:22px;align-items:center"><div class="vAnel" style="width:130px;height:130px">${anel(p / 100, 130, "var(--c-laranja)", "var(--sup3)", 12)}<div class="val"><b data-conta="${p}" data-suf="%" style="color:var(--c-laranja)">0</b><span class="sub">acerto</span></div></div>
     <div><h3 style="margin-bottom:6px">${p >= 80 ? "Excelente" : p >= 65 ? "Bom resultado" : p >= 50 ? "No caminho" : "Vale revisar a base"}</h3><p class="sub">As erradas entraram no caderno de erros. Revise pelo gabarito abaixo, com o comentário de cada alternativa.</p></div></div>
    <div class="cx"><h3><i class="ti ti-chart-bar"></i>Por área</h3>${Object.entries(A.porArea).map(([ar, [o, n]]) => `<div class="vArea" style="--k:${corA(ar)};cursor:default"><span class="dot"><i class="ti ti-${icA(ar)}"></i></span><div><div class="nm">${esc(AREA[ar].nome)}</div><div class="barra"><i data-w="${pct(o, n)}"></i></div></div><span class="tx">${o}/${n}</span></div>`).join("")}</div></div>
   <div class="cx" style="max-width:980px;margin-top:16px"><h3><i class="ti ti-list-check"></i>Gabarito</h3>${A.ids.map((id, k) => { const q = QID[id], ord = ordemAlts(q), a = A.resp[id], ok = a === q.g;
     return `<details class="inter" style="--k:${ok ? "var(--ok)" : "var(--err)"}"><summary><span class="gv"><i class="ti ti-${ok ? "check" : "x"}"></i></span><div><div class="par">Questão ${k + 1}</div><div class="ef">${esc(q.e.slice(0, 140))}${q.e.length > 140 ? "…" : ""}</div></div><i class="ti ti-chevron-down"></i></summary>
       <div class="corpo"><p>${esc(q.e)}</p>${ord.map((oi, pos) => `<p style="${oi === q.g ? "color:var(--ok);font-weight:650" : oi === a ? "color:var(--err)" : ""}">${"ABCDE"[pos]}) ${esc(q.a[oi])}${q.p[oi] ? `<br><span class="sub">${esc(q.p[oi])}</span>` : ""}</p>`).join("")}
       <p><b>Comentário.</b> ${esc(q.c)}</p><p class="sub">${esc(q.b)} · <a href="#leituras/${q.l}">${esc(LEIT[q.l].titulo)}</a></p></div></details>`; }).join("")}
    <div class="linhaBt" style="margin-top:16px"><button class="bt" style="--ac:var(--c-laranja)" data-acao="novoSim">Novo simulado</button><button class="bt sec" data-acao="sairSim">Voltar ao treino</button></div></div>`;
  vivo(s);
  if (p >= 70) confete();
}

/* ======================================================================
   CASOS CLÍNICOS
   ====================================================================== */
function pintaCasos(id) {
  if (id && CASO[id]) return pintaCaso(id);
  titulo("clipboard-heart", "Casos clínicos", `${E.casos.length} casos de acompanhamento farmacoterapêutico: leia o prontuário, avalie a prescrição, ache os problemas e proponha as intervenções`);
  const s = $("#sec-casos");
  if (!E.casos.length) { s.innerHTML = `<div class="cx vazio"><i class="ti ti-clipboard-heart"></i>Os casos clínicos estão em preparação.</div>`; return; }
  const NV = {basico: 1, intermediario: 2, avancado: 3};
  s.innerHTML = `<div class="listaL anima">${[...E.casos].sort((a, b) => a.sem - b.sem || NV[a.nivel] - NV[b.nivel]).map(c => { const st = ST.casos[c.id] || {};
    return `<button class="itemL" style="--k:${corA(c.area)}" data-ir-k="${c.id}"><div class="meta"><span>Semana ${c.sem}</span><span>·</span><span>${NIVEL[c.nivel] || c.nivel}</span></div>
      <h3>${esc(c.titulo)}</h3><p>${esc(c.resumo)}</p>
      <div class="rod">${st.feito ? `<span class="pil ok"><i class="ti ti-check"></i>${st.marc?.length || 0}/${c.gabarito.length} problemas identificados</span>` : st.txt ? '<span class="pil av">em andamento</span>' : `<span class="sub">${c.gabarito.length} problemas para achar</span>`}</div></button>`; }).join("")}</div>`;
  vivo(s);
}
function pintaCaso(id) {
  const c = CASO[id], st = ST.casos[id] ||= {};
  const pac = c.paciente || {};
  const tfg = pac.idade && c.labs ? null : null;
  titulo("clipboard-heart", esc(c.titulo), `${esc(AREA[c.area]?.nome || "")} · ${NIVEL[c.nivel] || c.nivel} · semana ${c.sem} do cronograma`,
    `<button class="bt sec mini" data-ir="casos"><i class="ti ti-arrow-left"></i>Casos</button>`);
  const s = $("#sec-casos");
  const marc = new Set(st.marc || []);
  s.innerHTML = `<div class="grade" style="max-width:1000px">
   <div class="cx"><div class="casoCab"><h3 style="margin:0"><i class="ti ti-user"></i>Paciente</h3><div class="dadoPac">
     ${pac.idade ? `<span class="pil">${pac.idade} anos</span>` : ""}${pac.sexo ? `<span class="pil">${pac.sexo === "F" ? "feminino" : "masculino"}</span>` : ""}${pac.peso ? `<span class="pil">${num(pac.peso)} kg</span>` : ""}${pac.altura ? `<span class="pil">${pac.altura} cm</span>` : ""}${pac.alergias ? `<span class="pil ${/nega|nenhuma|sem alerg/i.test(pac.alergias) ? "" : "er"}">alergias: ${esc(pac.alergias)}</span>` : ""}</div></div>
     <p style="margin:14px 0 0;line-height:1.7">${esc(c.historia)}</p></div>
   <div class="grade g2">
    <div class="cx"><h3><i class="ti ti-heart-rate-monitor"></i>Sinais e monitorização</h3><div class="tabWrap"><table class="tabela">${(c.sinais || []).map(([a, b]) => `<tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join("")}</table></div></div>
    <div class="cx"><h3><i class="ti ti-test-pipe"></i>Exames</h3><div class="tabWrap"><table class="tabela"><tr><th>Exame</th><th>Resultado</th><th>Referência</th></tr>${(c.labs || []).map(([a, b, r]) => `<tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td><td class="sub">${esc(r || "")}</td></tr>`).join("")}</table></div></div>
   </div>
   <div class="cx"><h3><i class="ti ti-prescription"></i>Prescrição do dia</h3><div class="tabWrap"><table class="tabela"><tr><th>Item</th><th>Dose</th><th>Via</th><th>Frequência</th><th>Observação</th></tr>
     ${(c.prescricao || []).map(p => `<tr><td><b>${esc(p.item)}</b></td><td>${esc(p.dose)}</td><td>${esc(p.via)}</td><td>${esc(p.freq)}</td><td class="sub">${esc(p.obs || "")}</td></tr>`).join("")}</table></div></div>
   <div class="cx"><h3><i class="ti ti-pencil"></i>Sua análise</h3><p class="sub" style="margin:-4px 0 10px">${esc(c.tarefa)} Escreva antes de abrir o gabarito: é o que treina o round.</p>
     <textarea id="casoTxt" style="min-height:160px" placeholder="Problema 1: …&#10;Intervenção: …">${esc(st.txt || "")}</textarea>
     <div class="linhaBt" style="margin-top:12px">${st.rev ? "" : `<button class="bt" data-acao="revelaCaso" data-k="${id}"><i class="ti ti-eye"></i>Ver o gabarito</button>`}<span class="sub">Anotações ficam salvas neste aparelho.</span></div></div>
   ${st.rev ? `<div class="cx"><h3><i class="ti ti-list-check"></i>Gabarito: ${c.gabarito.length} problemas</h3><p class="sub" style="margin:-4px 0 6px">Marque os que você tinha identificado. A nota do caso é a proporção marcada.</p>
     ${c.gabarito.map((g, k) => `<div class="prob${marc.has(k) ? " on" : ""}" data-acao="marcaProb" data-k="${id}" data-i="${k}" role="checkbox" aria-checked="${marc.has(k)}" tabindex="0"><span class="chk"><i class="ti ti-check"></i></span>
       <div><b>${esc(g.problema)}</b> <span class="pil ${g.prioridade === "alta" ? "er" : g.prioridade === "média" || g.prioridade === "media" ? "av" : ""}">prioridade ${esc(g.prioridade || "")}</span>
       <dl><dt>Tipo</dt><dd>${esc(g.tipo)}</dd><dt>Evidência</dt><dd>${esc(g.evidencia)}</dd><dt>Intervenção</dt><dd>${esc(g.intervencao)}</dd></dl></div></div>`).join("")}
     <div class="linhaBt" style="margin-top:16px"><button class="bt" data-acao="concluiCaso" data-k="${id}"><i class="ti ti-check"></i>${st.feito ? "Atualizar nota" : "Concluir caso"} (${marc.size}/${c.gabarito.length})</button></div></div>
   <div class="cx"><h3><i class="ti ti-message-2"></i>Discussão</h3><div style="line-height:1.75;white-space:pre-line">${esc(c.discussao)}</div>
     ${c.leituras?.length ? `<div class="chips" style="margin-top:14px">${c.leituras.map(sl => LEIT[sl] ? `<a class="chip" href="#leituras/${sl}" style="text-decoration:none"><i class="ti ti-book-2"></i>${esc(LEIT[sl].titulo)}</a>` : "").join("")}</div>` : ""}
     ${c.fontes?.length ? `<p class="sub" style="margin-top:14px"><b>Fontes:</b> ${c.fontes.map(esc).join(" · ")}</p>` : ""}</div>` : ""}
  </div>`;
  $("#casoTxt").addEventListener("input", debounce(e => { ST.casos[id].txt = e.target.value; salva("casos"); }, 500));
}

/* ======================================================================
   AVALIAÇÃO DE PRESCRIÇÕES
   Triagem rápida, como no plantão: tocar nas linhas com problema, dizer o tipo, corrigir.
   Nota = (problemas achados − metade dos falsos alarmes) ÷ total de problemas. O tipo certo é
   informado à parte, porque achar o problema já é o que mais pesa na prática.
   ====================================================================== */
const TIPOS_RX = [
  ["dose", "Dose"], ["renal", "Ajuste renal ou hepático"], ["intervalo", "Frequência ou duração"], ["interacao", "Interação"],
  ["via", "Via ou forma farmacêutica"], ["admin", "Diluição, velocidade ou compatibilidade"], ["duplicidade", "Duplicidade"],
  ["semindicacao", "Sem indicação"], ["contraindicacao", "Contraindicação ou alergia"], ["redacao", "Redação ou ambiguidade"],
  ["monitorizacao", "Falta monitorização"]
];
const TIPO_RX = Object.fromEntries(TIPOS_RX);
const RXS = {id: "", marc: {}, t0: 0, omiTxt: "", semFiltro: "liberadas"};
function notaRx(r, st) {
  const probs = r.itens.map((it, i) => it.problema ? i : -1).filter(i => i >= 0);
  const marc = st.marc || {};
  const tp = probs.filter(i => i in marc).length, fn = probs.length - tp;
  const fp = Object.keys(marc).filter(i => !r.itens[i]?.problema).length;
  const tipoOk = probs.filter(i => i in marc && marc[i] && r.itens[i].problema.tipos.includes(marc[i])).length;
  const om = (st.omi || []).filter(Boolean).length, tot = probs.length + (r.omissoes || []).length;
  const nota = Math.max(0, Math.round(100 * (tp + om - fp / 2) / Math.max(1, tot)));
  return {tp, fn, fp, tipoOk, om, tot, nota, nprob: probs.length};
}
function estatRx() {
  let n = 0, soma = 0, tp = 0, fn = 0, fp = 0; const perd = {};
  for (const r of E.prescricoes) {
    const st = ST.presc[r.id]; if (!st?.feito) continue;
    const x = notaRx(r, st); n++; soma += x.nota; tp += x.tp; fn += x.fn; fp += x.fp;
    r.itens.forEach((it, i) => { if (it.problema && !(i in (st.marc || {}))) it.problema.tipos.forEach(t => perd[t] = (perd[t] || 0) + 1); });
  }
  return {n, media: n ? Math.round(soma / n) : 0, sens: pct(tp, tp + fn), fpPor: n ? fp / n : 0, perd};
}
function pintaPrescricoes(id) {
  if (id && RX[id]) return pintaRx(id);
  const w = semanaLiberada(), e = estatRx();
  titulo("prescription", "Avaliação de prescrições", `${E.prescricoes.length} prescrições fictícias de UTI com erros plantados: marque as linhas com problema, diga o tipo e compare com o gabarito`);
  const s = $("#sec-prescricoes");
  if (!E.prescricoes.length) { s.innerHTML = `<div class="cx vazio"><i class="ti ti-prescription"></i>As prescrições estão em preparação.</div>`; return; }
  const lista = E.prescricoes.filter(r => RXS.semFiltro === "todas" || r.sem <= w || ST.presc[r.id]);
  const porSem = {}; lista.forEach(r => (porSem[r.sem] ||= []).push(r));
  s.innerHTML = `<div class="kpis anima">
     <div class="kpi" style="--k:var(--c-lima)"><b data-conta="${e.n}">0</b><span>de ${E.prescricoes.length} avaliadas</span></div>
     <div class="kpi" style="--k:var(--c-azul)"><b data-conta="${e.media}" data-suf="%">0</b><span>nota média</span></div>
     <div class="kpi" style="--k:var(--c-verde)"><b data-conta="${e.sens}" data-suf="%">0</b><span>dos problemas encontrados</span></div>
     <div class="kpi" style="--k:var(--c-laranja)"><b>${num(e.fpPor, 1)}</b><span>falsos alarmes por prescrição</span></div></div>
   <div class="filtros"><div class="tabs2"><button data-rx-f="liberadas" aria-pressed="${RXS.semFiltro === "liberadas"}">Liberadas até a semana ${w}</button><button data-rx-f="todas" aria-pressed="${RXS.semFiltro === "todas"}">Todas</button></div>
     <span class="sub">Como no plantão: leia em 3 a 5 minutos, toque nas linhas com problema e só então corrija.</span></div>
   ${Object.keys(porSem).map(Number).sort((a, b) => a - b).map(sm => `<h2 class="grupoL" style="--k:var(--c-lima)"><i class="ti ti-calendar"></i>Semana ${sm} <small>${esc(E.semanas[sm - 1]?.tema || "")}</small></h2>
     <div class="listaL anima">${porSem[sm].map(r => { const st = ST.presc[r.id]; const x = st?.feito ? notaRx(r, st) : null;
       return `<button class="itemL" style="--k:var(--c-lima)" data-ir-rx="${r.id}"><div class="meta"><span>${esc(r.setor)}</span><span>·</span><span>${NIVEL[r.nivel] || r.nivel}</span></div>
        <h3>${esc(r.titulo)}</h3><p>${r.paciente.idade} anos, ${r.paciente.sexo === "F" ? "feminino" : "masculino"}, ${num(r.paciente.peso)} kg · ${r.itens.length} itens na prescrição</p>
        <div class="rod">${x ? `<span class="pil ${x.nota >= 70 ? "ok" : x.nota >= 40 ? "av" : "er"}">nota ${x.nota}% · ${x.tp + x.om}/${x.tot} problemas</span>` : `<span class="sub">não avaliada</span>`}</div></button>`; }).join("")}</div>`).join("")}`;
  vivo(s);
}
function pintaRx(id) {
  const r = RX[id], st = ST.presc[id] || {};
  if (RXS.id !== id) { RXS.id = id; RXS.marc = st.feito && !st.refazer ? {...(st.marc || {})} : {}; RXS.t0 = Date.now(); RXS.omiTxt = st.omiTxt || ""; }
  const corrigida = !!st.feito && !st.refazer;
  const i0 = E.prescricoes.indexOf(r), prox = E.prescricoes[i0 + 1];
  titulo("prescription", esc(r.titulo), `${esc(r.setor)} · ${NIVEL[r.nivel] || r.nivel} · semana ${r.sem} do cronograma`,
    `<button class="bt sec mini" data-ir="prescricoes"><i class="ti ti-arrow-left"></i>Prescrições</button>`);
  const p = r.paciente, x = corrigida ? notaRx(r, st) : null;
  const linha = (it, i) => {
    const m = i in RXS.marc, pr = it.problema;
    let est = "", ex = "";
    if (corrigida) {
      if (pr && m) { est = " tp"; const tOk = RXS.marc[i] && pr.tipos.includes(RXS.marc[i]);
        ex = `<div class="rxEx"><b><i class="ti ti-circle-check"></i> Problema encontrado</b>${RXS.marc[i] ? ` · você marcou <i>${esc(TIPO_RX[RXS.marc[i]])}</i>${tOk ? "" : `; o tipo esperado era <i>${pr.tipos.map(t => esc(TIPO_RX[t])).join(" ou ")}</i>`}` : ` · tipo: <i>${pr.tipos.map(t => esc(TIPO_RX[t])).join(" ou ")}</i>`}<p>${esc(pr.explicacao)}</p><p><b>Intervenção:</b> ${esc(pr.correcao)}</p></div>`; }
      else if (pr) { est = " fn"; ex = `<div class="rxEx"><b><i class="ti ti-alert-circle"></i> Problema não marcado</b> · <i>${pr.tipos.map(t => esc(TIPO_RX[t])).join(" ou ")}</i><p>${esc(pr.explicacao)}</p><p><b>Intervenção:</b> ${esc(pr.correcao)}</p></div>`; }
      else if (m) { est = " fp"; ex = `<div class="rxEx"><b><i class="ti ti-info-circle"></i> Falso alarme:</b> esta linha está adequada para o paciente.</div>`; }
      else est = " ok";
    }
    return `<div class="rxLinha${m ? " marcada" : ""}${est}" ${corrigida ? "" : `data-rxl="${i}" role="button" tabindex="0" aria-pressed="${m}"`}>
      <span class="n">${i + 1}</span><div class="tx">${esc(it.texto)}
      ${!corrigida && m ? `<div class="rxTipos">${TIPOS_RX.map(([k, nm]) => `<button class="chip" data-rxt="${i}" data-t="${k}" aria-pressed="${RXS.marc[i] === k}">${nm}</button>`).join("")}</div>` : ""}${ex}</div>
      ${corrigida ? "" : `<i class="ti ti-${m ? "flag-filled" : "flag"} bandeira"></i>`}</div>`;
  };
  const s = $("#sec-prescricoes");
  s.innerHTML = `<div class="rxGrade">
   <div>
    <div class="folhaRx">
     <div class="rxCab"><div class="dadoPac">${p.idade ? `<span class="pil">${p.idade} anos</span>` : ""}<span class="pil">${p.sexo === "F" ? "feminino" : "masculino"}</span>${p.peso ? `<span class="pil">${num(p.peso)} kg</span>` : ""}${p.altura ? `<span class="pil">${p.altura} cm</span>` : ""}
       <span class="pil ${/nega|nenhuma|sem alerg|nkda/i.test(p.alergias || "nega") ? "" : "er"}">alergias: ${esc(p.alergias || "nega")}</span></div>
       <p>${esc(r.contexto)}</p>
       <div class="rxDados">${(r.dados || []).map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join("")}</div></div>
     <div class="rxTit"><i class="ti ti-prescription"></i>Prescrição médica de hoje ${corrigida ? "" : '<span class="sub">toque nas linhas com problema</span>'}</div>
     ${r.itens.map(linha).join("")}
    </div>
    ${corrigida ? `${(r.omissoes || []).length ? `<div class="cx" style="margin-top:16px"><h3><i class="ti ti-square-plus"></i>O que faltava na prescrição</h3><p class="sub" style="margin:-4px 0 6px">Marque o que você tinha apontado no campo de omissões.</p>
       ${r.omissoes.map((o, k) => `<div class="prob${st.omi?.[k] ? " on" : ""}" data-acao="rxOmi" data-k="${id}" data-i="${k}" role="checkbox" aria-checked="${!!st.omi?.[k]}" tabindex="0"><span class="chk"><i class="ti ti-check"></i></span><div><b>${esc(o.texto)}</b><dl><dt>Por quê</dt><dd>${esc(o.explicacao)}</dd><dt>Intervenção</dt><dd>${esc(o.correcao)}</dd></dl></div></div>`).join("")}</div>` : ""}
      <div class="cx" style="margin-top:16px"><h3><i class="ti ti-message-2"></i>Comentário</h3><p style="margin:0;line-height:1.7">${esc(r.comentario)}</p>
       ${r.leituras?.length ? `<div class="chips" style="margin-top:12px">${r.leituras.map(sl => LEIT[sl] ? `<a class="chip" href="#leituras/${sl}" style="text-decoration:none"><i class="ti ti-book-2"></i>${esc(LEIT[sl].titulo)}</a>` : "").join("")}</div>` : ""}</div>`
    : `<div class="cx" style="margin-top:16px"><h3><i class="ti ti-square-plus"></i>Falta alguma coisa?</h3><textarea id="rxOmi" placeholder="Indicação sem tratamento, profilaxia ausente, exame ou nível sérico que deveria estar pedido…">${esc(RXS.omiTxt)}</textarea></div>`}
   </div>
   <aside class="lado">
    <div class="cx">${corrigida ? `<h3><i class="ti ti-report-analytics"></i>Resultado</h3>
       <div class="vAnel" style="width:120px;height:120px;margin:4px auto 10px">${anel(x.nota / 100, 120, "var(--c-lima)", "var(--sup3)", 11)}<div class="val"><b data-conta="${x.nota}" data-suf="%" style="color:color-mix(in srgb,var(--c-lima) 80%,var(--ink));font-size:28px">0</b><span class="sub">nota</span></div></div>
       ${linhaRx("Problemas encontrados", `${x.tp} de ${x.nprob}`)}${(r.omissoes || []).length ? linhaRx("Omissões apontadas", `${x.om} de ${r.omissoes.length}`) : ""}${linhaRx("Tipo certo", `${x.tipoOk} de ${x.tp}`)}${linhaRx("Falsos alarmes", x.fp)}${linhaRx("Tempo", `${Math.floor((st.seg || 0) / 60)} min ${(st.seg || 0) % 60} s`)}
       <div class="linhaBt" style="margin-top:14px">${prox ? `<button class="bt" style="--ac:var(--c-lima)" data-ir-rx="${prox.id}">Próxima<i class="ti ti-arrow-right"></i></button>` : ""}<button class="bt sec" data-acao="rxRefaz" data-k="${id}"><i class="ti ti-refresh"></i>Refazer</button></div>`
      : `<h3><i class="ti ti-stopwatch"></i>Triagem</h3><div class="rxRel" id="rxRel">${(sg => `${p2(Math.floor(sg / 60))}:${p2(sg % 60)}`)(Math.floor((Date.now() - RXS.t0) / 1000))}</div>
       <p class="sub" style="margin:4px 0 12px"><b id="rxN">${Object.keys(RXS.marc).length}</b> ${Object.keys(RXS.marc).length === 1 ? "linha marcada" : "linhas marcadas"}. Escolher o tipo é opcional, mas conta à parte.</p>
       <button class="bt" style="--ac:var(--c-lima);width:100%" data-acao="rxCorrige" data-k="${id}"><i class="ti ti-checks"></i>Corrigir</button>`}</div>
    <div class="cx"><h3><i class="ti ti-help"></i>Tipos de problema</h3><div class="sub" style="line-height:1.7">${TIPOS_RX.map(t => t[1]).join(" · ")}</div></div>
   </aside></div>`;
  if (!corrigida) {
    $("#rxOmi").addEventListener("input", e => RXS.omiTxt = e.target.value);
    clearInterval(rxRelogio);
    rxRelogio = setInterval(() => { const el = $("#rxRel"); if (!el || RXS.id !== id) return clearInterval(rxRelogio); const sg = Math.floor((Date.now() - RXS.t0) / 1000); el.textContent = `${p2(Math.floor(sg / 60))}:${p2(sg % 60)}`; }, 1000);
  }
  vivo(s);
}
let rxRelogio = null;
const linhaRx = (a, b) => `<div class="linhaR" style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--linha);font-size:14px"><span>${a}</span><b>${b}</b></div>`;
function marcaLinhaRx(i) {
  if (i in RXS.marc) delete RXS.marc[i]; else RXS.marc[i] = "";
  const y = scrollY; pintaRx(RXS.id); scrollTo(0, y);
}
function corrigeRx(id) {
  const r = RX[id], ant = ST.presc[id] || {};
  const st = {marc: {...RXS.marc}, omi: (r.omissoes || []).map(() => false), omiTxt: RXS.omiTxt, seg: Math.round((Date.now() - RXS.t0) / 1000), feito: iso(), tent: (ant.tent || 0) + 1};
  ST.presc[id] = st; salva("presc");
  const a = ativ(); a.rx = (a.rx || 0) + 1; salva("ativ");
  const x = notaRx(r, st);
  if (x.nota >= 80) confete();
  const y = scrollY; pintaRx(id); scrollTo(0, y);
  aviso(`${x.tp} de ${x.nprob} problemas encontrados${x.fp ? `, ${x.fp} ${x.fp > 1 ? "falsos alarmes" : "falso alarme"}` : ""}.`);
}

/* ======================================================================
   INTERAÇÕES
   ====================================================================== */
const GRAV = {
  contraindicada: {nm: "Contraindicada", cor: "#B42318", ic: "ban", o: 0},
  grave: {nm: "Grave", cor: "var(--c-vermelho)", ic: "alert-octagon", o: 1},
  moderada: {nm: "Moderada", cor: "var(--c-ambar)", ic: "alert-triangle", o: 2},
  menor: {nm: "Menor", cor: "var(--c-azul)", ic: "info-circle", o: 3},
  somado: {nm: "Efeito somado", cor: "var(--c-violeta)", ic: "stack-2", o: 2.5}
};
/* Regras genéricas a partir das tags do bulário: cobrem a soma de efeitos que nenhuma base lista
   par a par. O manejo aqui é o consenso geral; o par específico, quando existe, tem precedência. */
const TAGS = {
  qt: {nm: "Prolongamento do QT", ef: "Risco somado de QT longo e torsades de pointes.", mn: "ECG antes e depois de iniciar; rever a associação se QTc acima de 500 ms ou aumento acima de 60 ms. Manter potássio acima de 4 mEq/L e magnésio acima de 2 mg/dL; preferir alternativa sem efeito no QT quando houver."},
  serotonina: {nm: "Síndrome serotoninérgica", ef: "Soma de fármacos serotoninérgicos: agitação, clônus, hiper-reflexia, hipertermia, diarreia.", mn: "Confirmar a necessidade de cada fármaco; monitorar pelos critérios de Hunter, principalmente nas primeiras 24 a 48 h e após aumento de dose."},
  sangramento: {nm: "Risco hemorrágico", ef: "Soma de efeitos antitrombóticos ou que favorecem sangramento.", mn: "Confirmar indicação e duração de cada antitrombótico; monitorar hemoglobina, plaquetas e sinais de sangramento; avaliar profilaxia de úlcera de estresse quando indicada."},
  hipercalemia: {nm: "Hipercalemia", ef: "Soma de fármacos que retêm potássio.", mn: "Dosar potássio com frequência, sobretudo com lesão renal; rever suplementos de potássio e a necessidade de cada fármaco."},
  hipocalemia: {nm: "Hipocalemia", ef: "Soma de perdas de potássio.", mn: "Monitorar e repor potássio e magnésio; risco maior de arritmia com digoxina e fármacos que prolongam o QT."},
  snc: {nm: "Depressão do SNC e respiratória", ef: "Sedação e depressão respiratória aditivas.", mn: "Titular por alvo de RASS e escala de dor; atenção redobrada fora da ventilação mecânica e em idosos."},
  nefrotox: {nm: "Nefrotoxicidade", ef: "Lesão renal aditiva.", mn: "Evitar a associação quando houver alternativa; creatinina e diurese diárias; ajustar doses pela função renal e usar níveis séricos quando disponíveis."},
  ototox: {nm: "Ototoxicidade", ef: "Lesão coclear ou vestibular aditiva.", mn: "Evitar associação; limitar duração; atenção a queixas auditivas e vestibulares."},
  hepatotox: {nm: "Hepatotoxicidade", ef: "Lesão hepática aditiva.", mn: "Transaminases e bilirrubinas no início e periodicamente; suspender o suspeito se houver lesão relevante."},
  mielotox: {nm: "Mielotoxicidade", ef: "Supressão medular aditiva.", mn: "Hemograma seriado; rever a duração e a necessidade de cada fármaco."},
  bradicardia: {nm: "Bradicardia", ef: "Redução aditiva da frequência cardíaca ou da condução AV.", mn: "Monitorar FC e ECG; cuidado especial com bloqueios prévios."},
  hipotensao: {nm: "Hipotensão", ef: "Queda aditiva da pressão arterial.", mn: "Monitorar PA; escalonar doses com cautela em pacientes instáveis."},
  convulsao: {nm: "Redução do limiar convulsivo", ef: "Risco somado de crise convulsiva.", mn: "Ajustar doses pela função renal; evitar em epilepsia não controlada; considerar alternativa."},
  anticolinergico: {nm: "Carga anticolinérgica", ef: "Delirium, retenção urinária, íleo, taquicardia.", mn: "Reduzir o número de anticolinérgicos, principalmente em idosos e em pacientes com delirium."},
  hipoglicemia: {nm: "Hipoglicemia", ef: "Risco somado de hipoglicemia.", mn: "Glicemia capilar mais frequente e protocolo de correção."}
};
const INT = {ids: []};
const EXEMPLOS = [
  ["Sepse e sedação", ["meropenem", "vancomicina", "midazolam", "fentanil", "noradrenalina", "omeprazol", "enoxaparina"]],
  ["Transplantado renal", ["tacrolimo", "micofenolato", "fluconazol", "sulfametoxazol-trimetoprima", "omeprazol", "anlodipino"]],
  ["Delirium e QT", ["haloperidol", "ondansetrona", "azitromicina", "amiodarona", "quetiapina", "furosemida"]],
  ["Neurocrítico", ["fenitoina", "meropenem", "acido-valproico", "midazolam", "dexametasona", "nimodipino"]],
  ["Cardiopata anticoagulado", ["varfarina", "amiodarona", "sinvastatina", "clopidogrel", "omeprazol", "espironolactona"]],
  ["HIV com tuberculose", ["dolutegravir", "tenofovir-lamivudina", "rifampicina", "isoniazida", "sulfametoxazol-trimetoprima", "gluconato-calcio"]],
  ["Covid com nirmatrelvir", ["nirmatrelvir-ritonavir", "tacrolimo", "rivaroxabana", "sinvastatina", "midazolam", "amiodarona"]],
  ["Psiquiátrico na UTI", ["litio", "sertralina", "linezolida", "tramadol", "enalapril", "hidroclorotiazida"]]
];
function pintaInteracoes(id) {
  INT.ids = (ST.pos.int || []).filter(x => FARM[x]);
  if (id && FARM[id] && !INT.ids.includes(id)) { INT.ids.push(id); ST.pos.int = INT.ids; salva("pos"); history.replaceState(null, "", "#interacoes"); paramAtual = ""; }
  titulo("arrows-exchange", "Interações", `Verificador com ${RF.interacoes.length} pares específicos e regras de efeito somado a partir de ${RF.bulario.length} fichas do bulário`);
  const s = $("#sec-interacoes");
  s.innerHTML = `<div class="cx" style="margin-bottom:16px"><div class="seletor"><div class="filtros" style="margin:0"><div class="busca"><i class="ti ti-search"></i><input type="search" id="intBusca" placeholder="Adicionar fármaco da prescrição (digite 3 letras)" autocomplete="off"></div></div><div class="sugestoes" id="intSug" hidden></div></div>
     <div class="chips" id="intChips" style="margin-top:12px"></div>
     <div class="linhaBt" style="margin-top:14px"><span class="sub">Exemplos:</span>${EXEMPLOS.map((e, k) => `<button class="chip" data-ex="${k}">${e[0]}</button>`).join("")}<button class="chip" data-acao="limpaInt"><i class="ti ti-trash"></i>Limpar</button></div></div>
   <div id="intRes"></div>
   <p class="sub" style="margin-top:18px">Material de estudo. Confirme em base atualizada (Micromedex, Lexicomp, UpToDate) e no protocolo da instituição antes de intervir.</p>`;
  const inp = $("#intBusca"), sug = $("#intSug"); let sel = 0, achados = [];
  const mostraSug = () => {
    const q = norm(inp.value.trim());
    if (q.length < 2) { sug.hidden = true; return; }
    achados = RF.farmacos.filter(f => !INT.ids.includes(f.id) && (norm(f.nome).includes(q) || f.id.includes(q))).sort((a, b) => norm(a.nome).indexOf(q) - norm(b.nome).indexOf(q)).slice(0, 10);
    sel = 0;
    sug.innerHTML = achados.map((f, k) => `<button data-add="${f.id}" class="${k === 0 ? "sel" : ""}">${esc(f.nome)}<small>${esc(f.grupo)}</small></button>`).join("") || `<div class="sub" style="padding:10px">Não está na lista de ${RF.farmacos.length} fármacos da base.</div>`;
    sug.hidden = false;
  };
  inp.addEventListener("input", mostraSug);
  inp.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + achados.length) % Math.max(1, achados.length); $$("button", sug).forEach((b, k) => b.classList.toggle("sel", k === sel)); }
    else if (e.key === "Enter" && achados[sel]) { e.preventDefault(); addFarm(achados[sel].id); }
    else if (e.key === "Escape") sug.hidden = true;
  });
  inp.addEventListener("blur", () => setTimeout(() => sug.hidden = true, 200));
  pintaResultadoInt();
}
function addFarm(id) { if (!INT.ids.includes(id)) INT.ids.push(id); ST.pos.int = INT.ids; salva("pos"); const i = $("#intBusca"); if (i) { i.value = ""; i.focus(); } $("#intSug").hidden = true; pintaResultadoInt(); }
function analisaInt(ids) {
  const esp = [], cob = new Set();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const x = INTER.get(par(ids[i], ids[j])); if (x) { esp.push(x); cob.add(par(ids[i], ids[j])); } }
  esp.sort((a, b) => (GRAV[a.grav]?.o ?? 9) - (GRAV[b.grav]?.o ?? 9));
  const tem = (id, t) => (BUL[id]?.tags || []).includes(t);
  const grupos = [];
  for (const [t, meta] of Object.entries(TAGS)) {
    const m = ids.filter(id => tem(id, t));
    if (m.length >= 2) grupos.push({t, meta, m});
  }
  const pk = [];
  const regra = (fa, fb, rot, ef, mn) => { for (const a of ids.filter(id => tem(id, fa))) for (const b of ids.filter(id => tem(id, fb))) if (a !== b && !cob.has(par(a, b))) pk.push({a, b, rot, ef, mn}); };
  regra("inib3a4", "sub3a4", "Inibição do CYP3A4", "O inibidor tende a aumentar a exposição ao substrato.", "Verificar magnitude na bula ou em base de interações; reduzir dose do substrato, monitorar nível sérico ou efeito, ou trocar um dos fármacos.");
  regra("ind3a4", "sub3a4", "Indução do CYP3A4", "O indutor tende a reduzir a exposição ao substrato, com perda de efeito em dias a semanas; ao suspender o indutor, o nível volta a subir.", "Monitorar efeito e nível sérico; ajustar a dose do substrato na introdução e na retirada do indutor.");
  regra("quelante", "quelavel", "Quelação ou adsorção no trato digestivo", "Menor absorção oral ou por sonda do fármaco quelável.", "Separar as administrações (em geral 2 h antes ou 4 a 6 h depois do quelante) ou usar a via intravenosa.");
  return {esp, grupos, pk};
}
function pintaResultadoInt() {
  const ids = INT.ids;
  $("#intChips").innerHTML = ids.map(id => `<span class="chipF">${esc(FARM[id].nome)}<button data-rm="${id}" aria-label="Remover ${esc(FARM[id].nome)}"><i class="ti ti-x" style="font-size:13px"></i></button></span>`).join("") || `<span class="sub">Nenhum fármaco adicionado.</span>`;
  const box = $("#intRes");
  if (ids.length === 1) {
    const id = ids[0], xs = (INTER_DE[id] || []).slice().sort((a, b) => (GRAV[a.grav]?.o ?? 9) - (GRAV[b.grav]?.o ?? 9));
    box.innerHTML = `<div class="cx"><h3><i class="ti ti-list-search"></i>${xs.length} ${xs.length === 1 ? "interação cadastrada" : "interações cadastradas"} com ${esc(FARM[id].nome)}</h3>
      <p class="sub" style="margin:-4px 0 6px">Adicione outro fármaco para cruzar com a prescrição. ${BUL[id] ? `<a href="#bulario/${id}">Abrir a ficha no bulário</a>.` : ""}</p>${xs.map(x => htmlInter(x)).join("") || '<p class="sub">Nenhum par específico na base para este fármaco.</p>'}</div>`;
    vivo(box); return;
  }
  if (ids.length < 2) { box.innerHTML = `<div class="cx vazio"><i class="ti ti-arrows-exchange"></i>Adicione dois ou mais fármacos para cruzar, ou um só para ver todas as interações dele.</div>`; return; }
  const r = analisaInt(ids);
  const n = {}; r.esp.forEach(x => n[x.grav] = (n[x.grav] || 0) + 1);
  box.innerHTML = `<div class="grade g4 anima" style="margin-bottom:6px">${["contraindicada", "grave", "moderada", "menor"].map(g => `<div class="kpi" style="--k:${GRAV[g].cor}"><b data-conta="${n[g] || 0}">0</b><span>${GRAV[g].nm.toLowerCase()}</span></div>`).join("")}</div>
   ${r.esp.length ? `<h2 class="grupoL" style="--k:var(--c-vermelho)"><i class="ti ti-arrows-exchange"></i>Pares específicos <small>${r.esp.length}</small></h2>${r.esp.map(x => htmlInter(x)).join("")}` : `<div class="cx" style="margin-top:12px"><p class="sub" style="margin:0">Nenhum par específico entre estes ${ids.length} fármacos na base.</p></div>`}
   ${r.grupos.length ? `<h2 class="grupoL" style="--k:var(--c-violeta)"><i class="ti ti-stack-2"></i>Efeitos somados <small>${r.grupos.length}</small></h2>${r.grupos.map(g => `<details class="inter" style="--k:var(--c-violeta)"><summary><span class="gv"><i class="ti ti-stack-2"></i></span><div><div class="par">${esc(g.meta.nm)}: ${g.m.map(id => esc(FARM[id].nome)).join(", ")}</div><div class="ef">${esc(g.meta.ef)}</div></div><i class="ti ti-chevron-down"></i></summary><div class="corpo"><p><b>Manejo.</b> ${esc(g.meta.mn)}</p><p class="sub">Regra geral a partir das fichas do bulário; o par específico, quando listado acima, tem prioridade.</p></div></details>`).join("")}` : ""}
   ${r.pk.length ? `<h2 class="grupoL" style="--k:var(--c-ambar)"><i class="ti ti-route"></i>Alertas farmacocinéticos gerais <small>${r.pk.length}</small></h2>${r.pk.map(x => `<details class="inter" style="--k:var(--c-ambar)"><summary><span class="gv"><i class="ti ti-route"></i></span><div><div class="par">${esc(FARM[x.a].nome)} + ${esc(FARM[x.b].nome)}</div><div class="ef">${esc(x.rot)}</div></div><i class="ti ti-chevron-down"></i></summary><div class="corpo"><p>${esc(x.ef)}</p><p><b>Manejo.</b> ${esc(x.mn)}</p></div></details>`).join("")}` : ""}`;
  vivo(box);
}
function htmlInter(x) {
  const g = GRAV[x.grav] || GRAV.moderada;
  return `<details class="inter" style="--k:${g.cor}"><summary><span class="gv" title="${g.nm}"><i class="ti ti-${g.ic}"></i></span>
    <div><div class="par">${esc(FARM[x.a]?.nome || x.a)} + ${esc(FARM[x.b]?.nome || x.b)} <span class="pil cor" style="--k:${g.cor}">${g.nm}</span></div><div class="ef">${esc(x.efeito)}</div></div><i class="ti ti-chevron-down"></i></summary>
    <div class="corpo"><p><b>Mecanismo (${esc(x.tipo)}).</b> ${esc(x.mecanismo)}</p><p><b>Manejo.</b> ${esc(x.manejo)}</p><p class="sub">Evidência: ${esc(x.evidencia || "não informada")} · ${esc(x.fonte)}</p></div></details>`;
}

/* ======================================================================
   BULÁRIO
   ====================================================================== */
const BF = {q: "", g: ""};
const IC_GRUPO = {"Vasoativos e inotrópicos": "heart-bolt", "Vasodilatadores e anti-hipertensivos": "activity-heartbeat", "Sedação, analgesia e delirium": "zzz", "Bloqueadores neuromusculares e reversores": "bone", "Anticoagulantes, antiplaquetários e reversores": "droplet", "Antiarrítmicos e cardiovasculares": "heartbeat", "Diuréticos, fluidos e eletrólitos": "droplet-half-2", "Anticonvulsivantes": "brain", "Endócrino e corticoides": "flask-2", "Trato gastrointestinal": "tools-kitchen-2", "Imunossupressores": "shield-half", "Psicofármacos": "mood-empty", "Antibacterianos": "bacteria", "Antifúngicos": "plant", "Antivirais": "virus", "Antídotos e toxicologia": "first-aid-kit", "Respiratório": "lungs", "Hematologia e outros": "test-pipe", "Antiparasitários": "bug"};
const COR_GRUPO = {"Antibacterianos": "var(--c-laranja)", "Antifúngicos": "var(--c-laranja)", "Antivirais": "var(--c-laranja)", "Anticoagulantes, antiplaquetários e reversores": "var(--c-vermelho)", "Vasoativos e inotrópicos": "var(--c-rosa)", "Sedação, analgesia e delirium": "var(--c-violeta)", "Antiparasitários": "var(--c-laranja)", "Antídotos e toxicologia": "var(--c-indigo)", "Respiratório": "var(--c-ciano)", "Psicofármacos": "var(--c-violeta)"};
const corG = g => COR_GRUPO[g] || "var(--c-teal)";
const LEIT_GRUPO = {"Vasoativos e inotrópicos": ["drogas-vasoativas"], "Vasodilatadores e anti-hipertensivos": ["cardiovasculares-antiarritmicos"], "Sedação, analgesia e delirium": ["analgesia-sedacao-delirium", "intubacao-sequencia-rapida"], "Bloqueadores neuromusculares e reversores": ["bloqueadores-neuromusculares"], "Anticoagulantes, antiplaquetários e reversores": ["anticoagulantes-reversao", "profilaxias-uti"], "Antiarrítmicos e cardiovasculares": ["cardiovasculares-antiarritmicos"], "Diuréticos, fluidos e eletrólitos": ["fluidos-diureticos", "eletrolitos"], "Anticonvulsivantes": ["anticonvulsivantes-status"], "Endócrino e corticoides": ["insulina-corticoides"], "Trato gastrointestinal": ["trato-gastrointestinal"], "Imunossupressores": ["interacoes-cyp-transportadores"], "Psicofármacos": ["interacoes-farmacodinamicas"], "Antibacterianos": ["betalactamicos", "carbapenemicos-novos-betalactamicos", "gram-positivos-resistentes", "aminoglicosideos-polimixinas", "outras-classes-antibacterianas"], "Antifúngicos": ["antifungicos"], "Antivirais": ["antivirais-uti", "interacoes-antimicrobianos"], "Antídotos e toxicologia": ["toxicologia-antidotos"], "Respiratório": ["fisiologia-respiratoria-vm"], "Hematologia e outros": ["figado-coagulacao"], "Antiparasitários": ["antivirais-uti"]};
function pintaBulario(id) {
  if (id && FARM[id]) return pintaFicha(id);
  titulo("pill", "Bulário", `${RF.bulario.length} fichas de fármacos da UTI: dose, ajuste renal e hepático, administração, monitorização e interações`);
  const grupos = [...new Set(RF.farmacos.map(f => f.grupo))];
  const s = $("#sec-bulario");
  s.innerHTML = `<div class="filtros"><div class="busca"><i class="ti ti-search"></i><input type="search" id="bfBusca" placeholder="Buscar fármaco ou classe" value="${esc(BF.q)}"></div></div>
   <div class="chips" style="margin-bottom:8px"><button class="chip" data-bf-g="" aria-pressed="${!BF.g}">Todos</button>${grupos.map(g => `<button class="chip" data-bf-g="${esc(g)}" aria-pressed="${BF.g === g}">${esc(g)}</button>`).join("")}</div>
   <div id="listaBul"></div>`;
  listaBulario();
  $("#bfBusca").addEventListener("input", debounce(e => { BF.q = e.target.value; listaBulario(); }, 120));
}
function listaBulario() {
  const q = norm(BF.q);
  const fs = RF.farmacos.filter(f => (!BF.g || f.grupo === BF.g) && (!q || norm(f.nome + " " + (BUL[f.id]?.classe || "") + " " + f.grupo).includes(q)));
  const grupos = [...new Set(fs.map(f => f.grupo))];
  $("#listaBul").innerHTML = grupos.map(g => `<h2 class="grupoL" style="--k:${corG(g)}"><i class="ti ti-${IC_GRUPO[g] || "pill"}"></i>${esc(g)} <small>${fs.filter(f => f.grupo === g).length}</small></h2>
    <div class="listaBul anima">${fs.filter(f => f.grupo === g).map(f => { const b = BUL[f.id]; return `<button class="itemB" style="--k:${corG(g)}" data-ir-b="${f.id}" ${b ? "" : "disabled"}><span class="ic"><i class="ti ti-${IC_GRUPO[g] || "pill"}"></i></span><div><b>${esc(f.nome)}</b><small>${b ? esc(b.classe) : "ficha em preparação"}${b?.altaVigilancia ? " · alta vigilância" : ""}</small></div></button>`; }).join("")}</div>`).join("")
    || `<div class="cx vazio"><i class="ti ti-search-off"></i>Nada encontrado.</div>`;
  vivo($("#listaBul"));
}
function pintaFicha(id) {
  const f = FARM[id], b = BUL[id];
  if (!b) return ir("bulario");
  const nInt = (INTER_DE[id] || []).length;
  titulo("pill", esc(b.nome), esc(b.classe), `<button class="bt sec mini" data-ir="bulario"><i class="ti ti-arrow-left"></i>Bulário</button>`);
  const sec = (ic, nm, txt, largo) => txt ? `<div class="cx${largo ? " largo" : ""}"><h4><i class="ti ti-${ic}"></i>${nm}</h4><p>${esc(txt)}</p></div>` : "";
  const ls = (LEIT_GRUPO[f.grupo] || []).filter(sl => LEIT[sl]);
  $("#sec-bulario").innerHTML = `<div class="chips" style="margin-bottom:16px"><span class="pil cor" style="--k:${corG(f.grupo)}">${esc(f.grupo)}</span>${b.altaVigilancia ? '<span class="pil er"><i class="ti ti-alert-triangle"></i>Alta vigilância (ISMP)</span>' : ""}${(b.tags || []).filter(t => TAGS[t]).map(t => `<span class="pil">${esc(TAGS[t].nm)}</span>`).join("")}</div>
   <div class="fichaSec anima">
    ${sec("atom", "Mecanismo", b.mecanismo)}${sec("target", "Indicações na UTI", b.indicacoes)}
    ${sec("vaccine", "Dose", b.dose, true)}
    ${sec("droplet-half-2", "Ajuste renal", b.renal)}${sec("building-hospital", "Ajuste hepático", b.hepatico)}
    ${sec("flask", "Administração", b.administracao, true)}
    ${sec("heart-rate-monitor", "Monitorização", b.monitorizacao)}${sec("alert-circle", "Eventos adversos", b.efeitos)}
    <div class="cx largo"><h4><i class="ti ti-arrows-exchange"></i>Interações</h4><p>${esc(b.interacoes)}</p><div class="linhaBt" style="margin-top:12px"><button class="bt mini" style="--ac:var(--c-vermelho)" data-acao="verInt" data-f="${id}"><i class="ti ti-arrows-exchange"></i>Ver no verificador${nInt ? ` (${nInt} pares)` : ""}</button></div></div>
    ${sec("bulb", "Pérolas para o farmacêutico", b.perolas, true)}
    ${ls.length ? `<div class="cx largo"><h4><i class="ti ti-book-2"></i>Leituras relacionadas</h4><div class="chips">${ls.map(sl => `<a class="chip" href="#leituras/${sl}" style="text-decoration:none">${esc(LEIT[sl].titulo)}</a>`).join("")}</div></div>` : ""}
    ${sec("books", "Fontes", b.fonte, true)}
   </div><p class="sub" style="margin-top:16px">Doses de adulto para estudo. Confirme na bula vigente e no protocolo da instituição.</p>`;
  vivo($("#sec-bulario"));
}

/* ======================================================================
   CALCULADORAS
   ====================================================================== */
const pn = v => { if (v == null) return NaN; const s = String(v).trim().replace(/\s/g, ""); return parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); };
function tfgCKD(idade, sexo, cr) {
  if (!idade || !cr || cr <= 0 || !sexo) return null;
  const f = sexo === "F", k = f ? .7 : .9, al = f ? -.241 : -.302;
  const v = 142 * Math.pow(Math.min(cr / k, 1), al) * Math.pow(Math.max(cr / k, 1), -1.2) * Math.pow(.9938, idade) * (f ? 1.012 : 1);
  return isFinite(v) && v > 0 ? v : null;
}
const scMost = (p, a) => Math.sqrt(p * a / 3600);
const pesoIdeal = (sexo, alt) => (sexo === "F" ? 45.5 : 50) + .9055 * (alt - 152.4); // Devine: 2,3 kg por polegada acima de 5 pés
const CALCS = [
  {id: "infusao", nm: "Infusão contínua", ic: "droplet-bolt", k: "var(--c-rosa)", ds: "Dose em mcg/kg/min, mg/h ou UI/h para mL/h e o caminho inverso"},
  {id: "tfg", nm: "Função renal (CKD-EPI 2021)", ic: "droplet-half-2", k: "var(--c-azul)", ds: "TFG indexada e não indexada para ajuste de dose"},
  {id: "pesos", nm: "Pesos e superfície corporal", ic: "scale", k: "var(--c-verde)", ds: "IMC, peso ideal, ajustado, massa magra e superfície corporal"},
  {id: "vanco", nm: "Vancomicina por AUC", ic: "chart-area-line", k: "var(--c-laranja)", ds: "AUC24 a partir de dois níveis e nova dose para o alvo 400 a 600"},
  {id: "ataque", nm: "Dose de ataque", ic: "target-arrow", k: "var(--c-violeta)", ds: "Volume de distribuição × peso × concentração-alvo"},
  {id: "fenitoina", nm: "Fenitoína corrigida", ic: "brain", k: "var(--c-indigo)", ds: "Winter-Tozer pela albumina e na disfunção renal grave"},
  {id: "sodio", nm: "Sódio: déficit e infusão", ic: "salt", k: "var(--c-ciano)", ds: "Água livre e fórmula de Adrogué-Madias com limite de correção"},
  {id: "anion", nm: "Ânion gap e osmolaridade", ic: "math-function", k: "var(--c-teal)", ds: "AG corrigido pela albumina, delta-delta e gap osmolar"},
  {id: "calcio", nm: "Cálcio corrigido", ic: "bone", k: "var(--c-ambar)", ds: "Correção pela albumina (Payne)"},
  {id: "qtc", nm: "QT corrigido", ic: "heartbeat", k: "var(--c-vermelho)", ds: "Bazett e Fridericia, com faixas de risco"},
  {id: "protamina", nm: "Protamina", ic: "shield-check", k: "var(--c-azul)", ds: "Neutralização de heparina e enoxaparina"},
  {id: "corticoide", nm: "Equivalência de corticoides", ic: "arrows-left-right", k: "var(--c-verde)", ds: "Hidrocortisona, prednisona, metilprednisolona e dexametasona"},
  {id: "gotas", nm: "Gotejamento", ic: "droplet", k: "var(--c-ciano)", ds: "mL/h para gotas e microgotas por minuto"}
];
const CALC = Object.fromEntries(CALCS.map(c => [c.id, c]));
function pintaCalculadoras(id) {
  if (id && CALC[id]) return pintaCalc(id);
  titulo("calculator", "Calculadoras", "Contas da rotina do farmacêutico de UTI, com o raciocínio visível");
  $("#sec-calculadoras").innerHTML = `<div class="listaCalc anima">${CALCS.map(c => `<button class="itemC" style="--k:${c.k}" data-ir-calc="${c.id}"><span class="ic"><i class="ti ti-${c.ic}"></i></span><div><b>${c.nm}</b><small>${c.ds}</small></div></button>`).join("")}</div>
   <p class="sub" style="margin-top:18px">Ferramentas de estudo. Confira cada conta antes de usá-la numa prescrição e siga o protocolo institucional.</p>`;
  vivo($("#sec-calculadoras"));
}
const campo = (id, nm, ph = "", tipo = "text", extra = "") => `<label class="campo">${nm}<input type="${tipo}" inputmode="decimal" data-c="${id}" placeholder="${ph}" ${extra}></label>`;
const sel = (id, nm, ops) => `<label class="campo">${nm}<select data-c="${id}">${ops.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`;
const linhaR = (a, b) => `<div class="linhaR"><span>${a}</span><b>${b}</b></div>`;
const FORM = {
  infusao: () => `${sel("modo", "Calcular", [["vazao", "Vazão (mL/h) a partir da dose"], ["dose", "Dose a partir da vazão"]])}
    ${sel("un", "Unidade da dose", [["mcgkgmin", "mcg/kg/min"], ["mcgmin", "mcg/min"], ["mgkgh", "mg/kg/h"], ["mgh", "mg/h"], ["mcgkgh", "mcg/kg/h"], ["uimin", "UI/min"], ["uih", "UI/h"], ["uikgh", "UI/kg/h"]])}
    ${campo("dose", "Dose", "ex.: 0,1")}${campo("vaz", "Vazão (mL/h)", "ex.: 6,6")}${campo("peso", "Peso (kg)", "ex.: 70")}
    ${campo("qtd", "Fármaco na solução (mg ou UI)", "ex.: 16")}${campo("vol", "Volume final (mL)", "ex.: 250")}`,
  tfg: () => `${campo("idade", "Idade (anos)", "ex.: 62")}${sel("sexo", "Sexo", [["M", "Masculino"], ["F", "Feminino"]])}${campo("cr", "Creatinina (mg/dL)", "ex.: 1,4")}${campo("peso", "Peso (kg), para desindexar", "opcional")}${campo("alt", "Altura (cm), para desindexar", "opcional")}`,
  pesos: () => `${sel("sexo", "Sexo", [["M", "Masculino"], ["F", "Feminino"]])}${campo("peso", "Peso atual (kg)", "ex.: 110")}${campo("alt", "Altura (cm)", "ex.: 170")}`,
  vanco: () => `${campo("dose", "Dose de manutenção (mg)", "ex.: 1250")}${campo("tau", "Intervalo (h)", "ex.: 12")}${campo("tinf", "Tempo de infusão (h)", "ex.: 1,5")}
    ${campo("c1", "Nível 1 (mg/L), pós-infusão", "ex.: 32")}${campo("t1", "Horário do nível 1 (h desde o início da infusão)", "ex.: 2,5")}
    ${campo("c2", "Nível 2 (mg/L), antes da próxima dose", "ex.: 11")}${campo("t2", "Horário do nível 2 (h desde o início da infusão)", "ex.: 11,5")}${campo("alvo", "AUC24 alvo (mg·h/L)", "500")}`,
  ataque: () => `${campo("vd", "Volume de distribuição (L/kg)", "ex.: 0,7")}${campo("peso", "Peso (kg)", "ex.: 70")}${campo("calvo", "Concentração alvo (mg/L)", "ex.: 20")}${campo("catual", "Concentração atual (mg/L)", "0")}${campo("f", "Biodisponibilidade (0 a 1)", "1")}${campo("sal", "Fração de sal (0 a 1)", "1")}`,
  fenitoina: () => `${campo("cm", "Fenitoína total medida (mcg/mL)", "ex.: 8")}${campo("alb", "Albumina (g/dL)", "ex.: 2,2")}${sel("renal", "Função renal", [["n", "ClCr ≥ 10 mL/min"], ["d", "ClCr < 10 mL/min ou diálise"]])}`,
  sodio: () => `${campo("na", "Sódio atual (mEq/L)", "ex.: 118")}${campo("peso", "Peso (kg)", "ex.: 60")}${sel("grupo", "Paciente", [[".6", "Homem até 65 anos (0,6)"], [".5", "Mulher até 65 anos ou homem idoso (0,5)"], [".45", "Mulher idosa (0,45)"]])}
    ${sel("sol", "Solução", [["513", "NaCl 3% (513 mEq/L)"], ["154", "NaCl 0,9% (154 mEq/L)"], ["130", "Ringer lactato (130 mEq/L)"], ["77", "NaCl 0,45% (77 mEq/L)"], ["0", "Soro glicosado 5% (0)"]])}${campo("k", "Potássio adicionado à solução (mEq/L)", "0")}${campo("alvo", "Correção máxima em 24 h (mEq/L)", "8")}`,
  anion: () => `${campo("na", "Sódio (mEq/L)", "ex.: 138")}${campo("cl", "Cloro (mEq/L)", "ex.: 100")}${campo("hco3", "Bicarbonato (mEq/L)", "ex.: 12")}${campo("alb", "Albumina (g/dL)", "ex.: 2,5")}${campo("gli", "Glicose (mg/dL)", "ex.: 120")}${campo("ureia", "Ureia (mg/dL)", "ex.: 60")}${campo("osm", "Osmolalidade medida (mOsm/kg)", "opcional")}`,
  calcio: () => `${campo("ca", "Cálcio total (mg/dL)", "ex.: 7,6")}${campo("alb", "Albumina (g/dL)", "ex.: 2,4")}`,
  qtc: () => `${campo("qt", "QT medido (ms)", "ex.: 440")}${campo("fc", "Frequência cardíaca (bpm)", "ex.: 96")}${sel("sexo", "Sexo", [["M", "Masculino"], ["F", "Feminino"]])}`,
  protamina: () => `${sel("tipo", "Anticoagulante", [["hnf", "Heparina não fracionada (em infusão)"], ["hnfb", "Heparina não fracionada (bolus recente)"], ["enox", "Enoxaparina"]])}${campo("taxa", "HNF: vazão atual (UI/h)", "ex.: 1200")}${campo("bolus", "HNF em bolus: UI administradas", "ex.: 5000")}${campo("min", "HNF em bolus: minutos desde o bolus", "ex.: 30")}${campo("enox", "Enoxaparina: última dose (mg)", "ex.: 80")}${campo("h", "Enoxaparina: horas desde a dose", "ex.: 6")}`,
  corticoide: () => `${sel("de", "Fármaco", [["hc", "Hidrocortisona"], ["pred", "Prednisona"], ["mp", "Metilprednisolona"], ["dexa", "Dexametasona"]])}${campo("dose", "Dose diária (mg)", "ex.: 200")}`,
  gotas: () => `${campo("vaz", "Vazão (mL/h)", "ex.: 125")}${campo("vol", "Ou volume (mL)", "opcional")}${campo("h", "em quantas horas", "opcional")}`
};
function pintaCalc(id) {
  const c = CALC[id];
  titulo(c.ic, c.nm, c.ds, `<button class="bt sec mini" data-ir="calculadoras"><i class="ti ti-arrow-left"></i>Calculadoras</button>`);
  const s = $("#sec-calculadoras");
  s.style.setProperty("--ac", c.k);
  s.innerHTML = `<div class="cx" style="max-width:860px;--ac:${c.k}"><div class="campos" id="formCalc">${FORM[id]()}</div><div id="resCalc"></div></div>`;
  const salvo = ST.pos["calc_" + id] || {};
  $$("[data-c]", s).forEach(i => { if (salvo[i.dataset.c] != null) i.value = salvo[i.dataset.c]; });
  const roda = () => {
    const v = {}; $$("[data-c]", s).forEach(i => v[i.dataset.c] = i.value);
    ST.pos["calc_" + id] = v; salva("pos");
    let out = "";
    try { out = CALCULA[id](v); } catch (e) { out = ""; }
    $("#resCalc").innerHTML = out || `<p class="sub" style="margin-top:16px">Preencha os campos para ver o resultado.</p>`;
  };
  s.addEventListener("input", roda); s.addEventListener("change", roda);
  roda();
}
const res = (grande, rot, linhas = [], obs = "") => `<div class="resultado"><div class="sub">${rot}</div><div class="grande">${grande}</div>${linhas.length ? `<div style="margin-top:10px">${linhas.join("")}</div>` : ""}</div>${obs ? `<p class="obsCalc">${obs}</p>` : ""}`;
const CALCULA = {
  infusao(v) {
    const un = v.un, porKg = /kg/.test(un), peso = pn(v.peso), qtd = pn(v.qtd), vol = pn(v.vol);
    if (!(qtd > 0 && vol > 0) || (porKg && !(peso > 0))) return "";
    const conc = qtd / vol; // mg/mL ou UI/mL
    const ehUI = /^ui/.test(un);
    const concU = ehUI ? conc : /^mcg/.test(un) ? conc * 1000 : conc; // na unidade da dose por mL
    const porMin = /min$/.test(un);
    const fator = (porKg ? peso : 1) * (porMin ? 60 : 1); // dose -> quantidade por hora
    const cTxt = `${num(concU, 3)} ${ehUI ? "UI" : /^mcg/.test(un) ? "mcg" : "mg"}/mL`;
    const ur = {mcgkgmin: "mcg/kg/min", mcgmin: "mcg/min", mgkgh: "mg/kg/h", mgh: "mg/h", mcgkgh: "mcg/kg/h", uimin: "UI/min", uih: "UI/h", uikgh: "UI/kg/h"}[un];
    if (v.modo === "dose") {
      const vaz = pn(v.vaz); if (!(vaz > 0)) return "";
      const dose = vaz * concU / fator;
      return res(`${num(dose, 3)} ${ur}`, "Dose correspondente", [linhaR("Concentração da solução", cTxt), linhaR("Quantidade por hora", `${num(vaz * concU, 2)} ${cTxt.split(" ")[1].replace("/mL", "")}/h`)], `Conta: dose = vazão × concentração ÷ ${porKg ? "peso" : ""}${porKg && porMin ? " ÷ " : ""}${porMin ? "60" : ""}.`);
    }
    const dose = pn(v.dose); if (!(dose > 0)) return "";
    const vaz = dose * fator / concU;
    return res(`${num(vaz, 1)} mL/h`, "Vazão da bomba", [linhaR("Concentração da solução", cTxt), linhaR("Quantidade por hora", `${num(dose * fator, 2)} ${cTxt.split(" ")[1].replace("/mL", "")}/h`), linhaR("Duração da seringa ou bolsa", `${num(vol / vaz, 1)} h`)],
      `Conta: vazão = dose${porKg ? " × peso" : ""}${porMin ? " × 60" : ""} ÷ concentração. Padronize concentrações pelo protocolo da instituição.`);
  },
  tfg(v) {
    const t = tfgCKD(pn(v.idade), v.sexo, pn(v.cr)); if (!t) return "";
    const p = pn(v.peso), a = pn(v.alt);
    const est = t >= 90 ? "G1" : t >= 60 ? "G2" : t >= 45 ? "G3a" : t >= 30 ? "G3b" : t >= 15 ? "G4" : "G5";
    const ls = [linhaR("Categoria KDIGO de TFG", est)];
    if (p > 0 && a > 0) { const sc = scMost(p, a); ls.push(linhaR("Superfície corporal (Mosteller)", `${num(sc, 2)} m²`), linhaR("TFG não indexada (para dose)", `${Math.round(t * sc / 1.73)} mL/min`)); }
    return res(`${Math.round(t)} mL/min/1,73 m²`, "TFG estimada (CKD-EPI 2021, sem raça)", ls,
      "Para ajuste de dose, o KDIGO recomenda a TFG não indexada (multiplicar pela superfície corporal e dividir por 1,73), sobretudo em extremos de tamanho corporal. A fórmula pressupõe creatinina estável: na LRA em evolução, no clearance renal aumentado e na sarcopenia ela erra, e a depuração medida em urina de 8 a 24 h é melhor.");
  },
  pesos(v) {
    const p = pn(v.peso), a = pn(v.alt); if (!(p > 0 && a > 0)) return "";
    const imc = p / (a / 100) ** 2, pi = pesoIdeal(v.sexo, a), paj = pi + .4 * (p - pi);
    const mm = v.sexo === "F" ? 9270 * p / (8780 + 244 * imc) : 9270 * p / (6680 + 216 * imc);
    return res(`${num(imc, 1)} kg/m²`, "Índice de massa corporal", [linhaR("Peso ideal (Devine)", `${num(pi, 1)} kg`), linhaR("Peso ajustado (PI + 0,4 × excesso)", p > pi ? `${num(paj, 1)} kg` : "não se aplica (peso ≤ ideal)"), linhaR("Massa magra (Janmahasatian)", `${num(mm, 1)} kg`), linhaR("Superfície corporal (Mosteller)", `${num(scMost(p, a), 2)} m²`), linhaR("Peso atual / peso ideal", `${Math.round(p / pi * 100)}%`)],
      "Peso ideal de Devine: 50 kg (homem) ou 45,5 kg (mulher) mais 2,3 kg por polegada acima de 1,52 m. Qual peso usar depende do fármaco: veja a leitura sobre obesidade.");
  },
  vanco(v) {
    const D = pn(v.dose), tau = pn(v.tau), ti = pn(v.tinf), c1 = pn(v.c1), t1 = pn(v.t1), c2 = pn(v.c2), t2 = pn(v.t2), alvo = pn(v.alvo) || 500;
    if (![D, tau, ti, c1, t1, c2, t2].every(x => x > 0) || t2 <= t1 || c2 >= c1 || t1 < ti) return "";
    const ke = Math.log(c1 / c2) / (t2 - t1), meia = Math.log(2) / ke;
    const cmax = c1 * Math.exp(ke * (t1 - ti)), cmin = c2 * Math.exp(-ke * (tau - t2));
    const auc = ti * (cmax + cmin) / 2 + (cmax - cmin) / ke, auc24 = auc * 24 / tau;
    const vd = (D / ti) * (1 - Math.exp(-ke * ti)) / (ke * (cmax - cmin * Math.exp(-ke * ti)));
    const nova = D * alvo / auc24;
    const faixa = auc24 < 400 ? "abaixo do alvo" : auc24 > 600 ? "acima do alvo, com risco renal maior" : "dentro do alvo";
    return res(`${Math.round(auc24)} mg·h/L`, `AUC24 estimada (${faixa})`, [linhaR("Constante de eliminação (ke)", `${num(ke, 3)} h⁻¹`), linhaR("Meia-vida", `${num(meia, 1)} h`), linhaR("Pico ao fim da infusão (extrapolado)", `${num(cmax, 1)} mg/L`), linhaR("Vale ao fim do intervalo (extrapolado)", `${num(cmin, 1)} mg/L`), linhaR("Volume de distribuição", `${num(vd, 1)} L`), linhaR(`Dose para AUC24 ${alvo} no mesmo intervalo`, `${Math.round(nova / 250) * 250} mg a cada ${tau} h (calculado ${Math.round(nova)} mg)`)],
      "Método de Sawchuk-Zaske com dois níveis no mesmo intervalo, em estado de equilíbrio (em geral a partir da 4ª dose), cinética linear de um compartimento. Alvo de AUC24 de 400 a 600 mg·h/L com CIM de 1 mg/L, conforme o consenso ASHP/IDSA/PIDS/SIDP de 2020. Programas bayesianos são a alternativa preferida quando disponíveis.");
  },
  ataque(v) {
    const vd = pn(v.vd), p = pn(v.peso), ca = pn(v.calvo), cat = pn(v.catual) || 0, f = pn(v.f) || 1, s = pn(v.sal) || 1;
    if (!(vd > 0 && p > 0 && ca > 0)) return "";
    const d = vd * p * (ca - cat) / (f * s);
    return res(`${Math.round(d)} mg`, "Dose de ataque", [linhaR("Volume de distribuição total", `${num(vd * p, 1)} L`), linhaR("Incremento de concentração", `${num(ca - cat, 1)} mg/L`)],
      "DA = Vd × peso × (C alvo − C atual) ÷ (F × S). No paciente crítico, fármacos hidrofílicos (betalactâmicos, aminoglicosídeos, vancomicina) têm Vd aumentado por ressuscitação volêmica e extravasamento capilar: a dose de ataque não se reduz pela disfunção renal.");
  },
  fenitoina(v) {
    const cm = pn(v.cm), alb = pn(v.alb); if (!(cm > 0 && alb > 0)) return "";
    const cc = v.renal === "d" ? cm / (.1 * alb + .1) : cm / (.2 * alb + .1);
    return res(`${num(cc, 1)} mcg/mL`, "Fenitoína total corrigida", [linhaR("Faixa terapêutica usual (total)", "10 a 20 mcg/mL"), linhaR("Fórmula", v.renal === "d" ? "C ÷ (0,1 × albumina + 0,1)" : "C ÷ (0,2 × albumina + 0,1)")],
      "Winter-Tozer (Sheiner-Tozer). A correção tende a subestimar a fração livre em pacientes críticos; quando disponível, prefira dosar a fenitoína livre (faixa usual de 1 a 2 mcg/mL). Valproato, uremia e hiperbilirrubinemia também deslocam a fenitoína da albumina.");
  },
  sodio(v) {
    const na = pn(v.na), p = pn(v.peso), fr = pn(v.grupo), sol = pn(v.sol), k = pn(v.k) || 0, lim = pn(v.alvo) || 8;
    if (!(na > 0 && p > 0 && fr > 0) || isNaN(sol)) return "";
    const act = fr * p, delta = (sol + k - na) / (act + 1);
    const ls = [linhaR("Água corporal total", `${num(act, 1)} L`), linhaR("Variação esperada por litro infundido", `${delta >= 0 ? "+" : ""}${num(delta, 2)} mEq/L`)];
    if (delta > 0 && na < 135) { const L = lim / delta; ls.push(linhaR(`Volume para subir ${lim} mEq/L`, `${num(L * 1000, 0)} mL`), linhaR("Em 24 h, equivale a", `${num(L * 1000 / 24, 1)} mL/h`)); }
    if (na > 145) { const def = act * (na / 140 - 1); ls.push(linhaR("Déficit de água livre", `${num(def, 1)} L`)); if (delta < 0) { const L = lim / -delta; ls.push(linhaR(`Volume para baixar ${lim} mEq/L`, `${num(L * 1000, 0)} mL`)); } }
    return res(`${delta >= 0 ? "+" : ""}${num(delta, 2)} mEq/L por litro`, "Fórmula de Adrogué-Madias", ls,
      "Estimativa inicial, sem contar perdas urinárias nem outras infusões: dosar o sódio a cada 2 a 6 h. Na hiponatremia crônica, não passar de 8 a 10 mEq/L em 24 h (8 no alto risco de desmielinização: alcoolismo, desnutrição, hipocalemia, hepatopatia). Sintomas graves: bolus de NaCl 3% conforme diretriz, com meta de subir 5 mEq/L na primeira hora.");
  },
  anion(v) {
    const na = pn(v.na), cl = pn(v.cl), hc = pn(v.hco3), alb = pn(v.alb), gli = pn(v.gli), ur = pn(v.ureia), om = pn(v.osm);
    const ls = []; let g = "";
    if (na > 0 && cl > 0 && hc > 0) {
      const ag = na - (cl + hc); g = `${num(ag, 1)} mEq/L`;
      if (alb > 0) { const agc = ag + 2.5 * (4 - alb); ls.push(linhaR("Ânion gap corrigido pela albumina", `${num(agc, 1)} mEq/L`)); const dd = (agc - 12) / (24 - hc); if (hc < 24) ls.push(linhaR("Relação delta-delta", `${num(dd, 2)} ${dd < 1 ? "(acidose hiperclorêmica associada)" : dd > 2 ? "(alcalose metabólica associada)" : "(AG elevado isolado)"}`)); }
    }
    if (na > 0 && gli > 0 && ur > 0) { const oc = 2 * na + gli / 18 + ur / 6; ls.push(linhaR("Osmolaridade calculada", `${num(oc, 0)} mOsm/L`)); if (om > 0) ls.push(linhaR("Gap osmolar", `${num(om - oc, 0)} mOsm (acima de 10 sugere álcoois tóxicos, manitol, propilenoglicol)`)); }
    if (!g && !ls.length) return "";
    return res(g || "–", "Ânion gap (Na − Cl − HCO₃)", ls, "Referência usual do ânion gap sem potássio: 8 a 12 mEq/L (varia com o laboratório). Cada 1 g/dL de albumina abaixo de 4 reduz o gap em cerca de 2,5 mEq/L. Osmolaridade com ureia: 2 × Na + glicose/18 + ureia/6. Propilenoglicol é veículo de lorazepam e fenobarbital injetáveis.");
  },
  calcio(v) {
    const ca = pn(v.ca), alb = pn(v.alb); if (!(ca > 0 && alb > 0)) return "";
    return res(`${num(ca + .8 * (4 - alb), 2)} mg/dL`, "Cálcio total corrigido", [linhaR("Fórmula", "Ca + 0,8 × (4 − albumina)")], "A correção pela albumina é imprecisa no paciente crítico. Para decidir reposição, use o cálcio iônico (referência usual de 1,12 a 1,32 mmol/L).");
  },
  qtc(v) {
    const qt = pn(v.qt), fc = pn(v.fc); if (!(qt > 0 && fc > 0)) return "";
    const rr = 60 / fc, baz = qt / Math.sqrt(rr), fri = qt / Math.cbrt(rr);
    const lim = v.sexo === "F" ? 470 : 450;
    const cls = x => x >= 500 ? "risco alto de torsades" : x > lim ? "prolongado" : "normal";
    return res(`${Math.round(fri)} ms`, `QTc por Fridericia (${cls(fri)})`, [linhaR("QTc por Bazett", `${Math.round(baz)} ms (${cls(baz)})`), linhaR("Intervalo RR", `${num(rr, 2)} s`), linhaR("Limite superior usual", `${lim} ms`)],
      "Bazett superestima o QTc com frequência cardíaca alta, comum na UTI; Fridericia é preferível acima de 60 a 70 bpm. QTc de 500 ms ou mais, ou aumento acima de 60 ms após um fármaco, pede revisão da prescrição e correção de potássio e magnésio.");
  },
  protamina(v) {
    if (v.tipo === "hnf") { const t = pn(v.taxa); if (!(t > 0)) return ""; const hep = t * 2.5, mg = Math.min(50, hep / 100);
      return res(`${num(mg, 1)} mg`, "Protamina IV", [linhaR("Heparina estimada em circulação (últimas 2,5 h)", `${Math.round(hep)} UI`), linhaR("Relação", "1 mg de protamina para cada 100 UI")], "Infusão lenta, no máximo 5 mg/min, dose máxima de 50 mg por vez. Conferir TTPa 5 a 15 min depois. Risco de anafilaxia e hipotensão (exposição prévia, alergia a peixe, vasectomia)."); }
    if (v.tipo === "hnfb") { const b = pn(v.bolus), m = pn(v.min); if (!(b > 0 && m >= 0)) return ""; const f = m < 30 ? 1 : m <= 60 ? .5 : m <= 120 ? .25 : 0; const mg = Math.min(50, b / 100 * f);
      return res(`${num(mg, 1)} mg`, "Protamina IV", [linhaR("Fração considerada pelo tempo", `${f * 100}% (menos de 30 min: 100%; 30 a 60: 50%; 60 a 120: 25%)`)], "Heparina tem meia-vida de 60 a 90 min: a dose cai com o tempo desde o bolus. Máximo de 50 mg por dose, infusão lenta."); }
    const e = pn(v.enox), h = pn(v.h); if (!(e > 0 && h >= 0)) return "";
    const mg = h <= 8 ? e : h <= 12 ? e * .5 : 0;
    return res(mg ? `${num(Math.min(50, mg), 1)} mg` : "Em geral não indicada", "Protamina IV para enoxaparina", [linhaR("Regra", "até 8 h: 1 mg por 1 mg de enoxaparina; 8 a 12 h: 0,5 mg por 1 mg; após 12 h: em geral dispensável")], "A protamina neutraliza só cerca de 60% da atividade anti-Xa da enoxaparina. Se o sangramento persistir, pode-se repetir 0,5 mg por 1 mg. Máximo de 50 mg por dose.");
  },
  corticoide(v) {
    const d = pn(v.dose); if (!(d > 0)) return "";
    const eq = {hc: 20, pred: 5, mp: 4, dexa: .75}, nm = {hc: "Hidrocortisona", pred: "Prednisona", mp: "Metilprednisolona", dexa: "Dexametasona"};
    const base = d / eq[v.de];
    return res(`${num(base * 5, 1)} mg de prednisona`, "Equivalência glicocorticoide aproximada", Object.keys(eq).map(k => linhaR(nm[k], `${num(base * eq[k], 1)} mg`)),
      "Equivalências anti-inflamatórias: hidrocortisona 20 mg = prednisona 5 mg = metilprednisolona 4 mg = dexametasona 0,75 mg. A atividade mineralocorticoide não segue a mesma proporção (alta na hidrocortisona, nula na dexametasona): no choque séptico e na insuficiência adrenal, isso importa.");
  },
  gotas(v) {
    let vaz = pn(v.vaz); const vol = pn(v.vol), h = pn(v.h);
    if (!(vaz > 0) && vol > 0 && h > 0) vaz = vol / h;
    if (!(vaz > 0)) return "";
    return res(`${num(vaz / 3, 1)} gotas/min`, "Equipo de macrogotas (20 gotas/mL)", [linhaR("Microgotas/min (60 microgotas/mL)", `${num(vaz, 1)}`), linhaR("Vazão", `${num(vaz, 1)} mL/h`)], "Gotas/min = mL/h ÷ 3; microgotas/min = mL/h. Medicamentos de alta vigilância vão em bomba de infusão, não em gotejamento.");
  }
};

/* ======================================================================
   DESEMPENHO
   ====================================================================== */
function pintaDesempenho() {
  const eq = estatQ(), hoje = iso();
  const dias = Object.keys(ST.ativ).filter(estudou).length;
  const min = Object.values(ST.ativ).reduce((s, a) => s + (a.min || 0), 0);
  const vistos = E.cartoes.filter(c => ST.srs[c.id]).length, dom = E.cartoes.filter(c => (ST.srs[c.id]?.i || 0) >= 21).length;
  const lidas = Object.keys(ST.lidas).filter(k => LEIT[k]).length;
  titulo("chart-dots-3", "Desempenho", `Seu progresso desde o início · ${dias} ${dias === 1 ? "dia" : "dias"} de estudo · ${Math.floor(min / 60)} h ${min % 60} min`);
  const s = $("#sec-desempenho");
  const pl = plano();
  /* mapa de calor do começo do plano até a residência */
  const ini0 = [pl.ini, ...Object.keys(ST.ativ)].sort()[0];
  const ini = addD(ini0, -((dt(ini0).getDay() + 6) % 7));
  const fim = E.residencia;
  let heat = "";
  for (let d = ini; d <= fim; d = addD(d, 1)) {
    const p = progMeta(d).tot, e = estudou(d);
    const n = !e ? "" : p >= 1 ? "n4" : p >= .66 ? "n3" : p >= .33 ? "n2" : "n1";
    heat += `<i class="${n}${d === hoje ? " hoje" : ""}${d === fim ? " res" : ""}" title="${fmtDL(d)}${e ? " · " + Math.round(p * 100) + "% da meta" : ""}"></i>`;
  }
  /* gráfico dos últimos 30 dias */
  const N = 30, ds = [...Array(N)].map((_, k) => addD(hoje, k - N + 1));
  const qs = ds.map(d => ST.ativ[d]?.q || 0), mx = Math.max(10, ...qs);
  const W = 640, H = 170, bw = W / N;
  let barras = "", pts = [];
  ds.forEach((d, k) => {
    const h = qs[k] / mx * (H - 30);
    barras += `<rect x="${k * bw + 2}" y="${H - 20 - h}" width="${bw - 4}" height="${h}" rx="3" fill="var(--c-azul)" opacity=".28"><title>${fmtD(d)}: ${qs[k]} questões</title></rect>`;
    const jan = ds.slice(Math.max(0, k - 6), k + 1).map(x => ST.ativ[x] || {}), q = jan.reduce((a, b) => a + (b.q || 0), 0), ok = jan.reduce((a, b) => a + (b.qa || 0), 0);
    if (q >= 3) pts.push([k * bw + bw / 2, H - 20 - (ok / q) * (H - 30)]);
  });
  const linha = pts.length > 1 ? `<polyline points="${pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="var(--c-ciano)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--c-ciano)"/>`).join("") : "";
  const eixo = [0, 50, 100].map(v => `<text x="${W}" y="${H - 20 - v / 100 * (H - 30) + 4}" text-anchor="end">${v}%</text><line x1="0" x2="${W - 30}" y1="${H - 20 - v / 100 * (H - 30)}" y2="${H - 20 - v / 100 * (H - 30)}" stroke="var(--linha)"/>`).join("");
  const rot = [0, 10, 20, 29].map(k => `<text x="${k * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${fmtD(ds[k])}</text>`).join("");
  /* áreas e leituras fracas */
  const areas = E.areas.map(a => ({a, e: estatArea(a.id)}));
  const fracas = E.leituras.map(l => ({l, e: estatQ(q => q.l === l.slug)})).filter(x => x.e.tent >= 3).sort((a, b) => a.e.taxa - b.e.taxa).slice(0, 6);
  const niveis = Object.keys(NIVEL).map(n => ({n, e: estatQ(q => q.n === n)}));
  const est = {novo: 0, aprend: 0, jovem: 0, maduro: 0};
  E.cartoes.forEach(c => { const x = ST.srs[c.id]; if (!x) est.novo++; else if (x.i < 3) est.aprend++; else if (x.i < 21) est.jovem++; else est.maduro++; });
  const sims = ST.sims || [];
  s.innerHTML = `<div class="kpis anima">
     <div class="kpi" style="--k:var(--c-azul)"><b data-conta="${eq.taxa}" data-suf="%">0</b><span>acerto em ${eq.tent} respostas</span></div>
     <div class="kpi" style="--k:var(--c-violeta)"><b data-conta="${lidas}">0</b><span>de ${E.leituras.length} leituras concluídas</span></div>
     <div class="kpi" style="--k:var(--c-ambar)"><b data-conta="${vistos}">0</b><span>cartões vistos · ${dom} dominados</span></div>
     <div class="kpi" style="--k:var(--c-laranja)"><b data-conta="${sequencia()}">0</b><span>dias seguidos · ${dias} no total</span></div></div>
   <div class="grade g2">
    <div class="cx" style="grid-column:1/-1"><h3><i class="ti ti-calendar-stats"></i>Constância até a residência</h3><div class="heat">${heat}</div>
      <div class="legHeat">menos <i style="background:var(--sup3)"></i><i class="n1" style="background:color-mix(in srgb,var(--ac) 30%,var(--sup3))"></i><i style="background:color-mix(in srgb,var(--ac) 55%,var(--sup3))"></i><i style="background:color-mix(in srgb,var(--ac) 80%,var(--sup3))"></i><i style="background:var(--ac)"></i> meta cumprida · <i style="background:var(--c-rosa)"></i> início da residência</div></div>
    <div class="cx grafico" style="grid-column:1/-1"><h3><i class="ti ti-chart-line"></i>Últimos 30 dias</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Questões por dia e acerto em média móvel de 7 dias">${eixo}${barras}${linha}${rot}</svg>
      <div class="legHeat"><i style="background:var(--c-azul);opacity:.3"></i> questões por dia · <i style="background:var(--c-ciano)"></i> acerto (média de 7 dias)</div></div>
    <div class="cx"><h3><i class="ti ti-chart-bar"></i>Por área</h3>${areas.map(({a, e}) => `<button class="vArea" style="--k:${corA(a.id)}" data-acao="focoArea" data-area="${a.id}"><span class="dot"><i class="ti ti-${a.icone}"></i></span><div><div class="nm">${esc(a.nome)}</div><div class="barra"><i data-w="${e.tent ? e.taxa : 0}"></i></div><div class="sub" style="font-size:12px;margin-top:3px">${e.resp}/${e.total} questões · ${e.lidas}/${e.nl} leituras</div></div><span class="tx">${e.tent ? e.taxa + "%" : "–"}</span></button>`).join("")}</div>
    <div class="grade" style="align-content:start">
     <div class="cx"><h3><i class="ti ti-alert-triangle"></i>Leituras com mais erros</h3>${fracas.length ? fracas.map(({l, e}) => `<div class="tarefa" style="--k:${corA(l.area)}"><span class="chk" style="border:0;background:color-mix(in srgb,var(--k) 14%,var(--sup));color:var(--k);font-size:11px;font-weight:800">${e.taxa}%</span><div><div class="tt">${esc(l.titulo)}</div><div class="ds">${e.acTent}/${e.tent} acertos</div></div><button class="ir" data-acao="qLeitura" data-s="${l.slug}" aria-label="Treinar"><i class="ti ti-player-play"></i></button></div>`).join("") : '<p class="sub">Aparece depois de 3 respostas numa mesma leitura.</p>'}</div>
     <div class="cx"><h3><i class="ti ti-stairs"></i>Por nível</h3>${niveis.map(({n, e}) => `<div class="metaItem" style="--k:var(--c-azul)"><span class="ic"><i class="ti ti-stairs-up"></i></span><div><b>${NIVEL[n]}</b><div class="barra"><i data-w="${e.taxa}"></i></div></div><em>${e.tent ? e.taxa + "%" : "–"}</em></div>`).join("")}</div>
     <div class="cx"><h3><i class="ti ti-cards"></i>Cartões</h3>${[["novo", "Nunca vistos", "var(--ink3)"], ["aprend", "Aprendendo (menos de 3 dias)", "var(--c-laranja)"], ["jovem", "Jovens (3 a 20 dias)", "var(--c-ambar)"], ["maduro", "Maduros (21 dias ou mais)", "var(--c-verde)"]].map(([k, nm, cor]) => `<div class="metaItem" style="--k:${cor}"><span class="ic"><i class="ti ti-cards"></i></span><div><b>${nm}</b><div class="barra"><i data-w="${pct(est[k], E.cartoes.length)}"></i></div></div><em>${est[k]}</em></div>`).join("")}</div>
     ${(() => { const r = estatRx(); if (!r.n) return ""; const perd = Object.entries(r.perd).sort((a, b) => b[1] - a[1]).slice(0, 4);
       return `<div class="cx"><h3><i class="ti ti-prescription"></i>Prescrições</h3>${[["Nota média", r.media, "var(--c-lima)"], ["Problemas encontrados", r.sens, "var(--c-verde)"]].map(([nm, v, cor]) => `<div class="metaItem" style="--k:${cor}"><span class="ic"><i class="ti ti-prescription"></i></span><div><b>${nm}</b><div class="barra"><i data-w="${v}"></i></div></div><em>${v}%</em></div>`).join("")}
        <p class="sub" style="margin:12px 0 4px">${r.n} avaliadas · ${num(r.fpPor, 1)} falso alarme por prescrição${perd.length ? " · o que mais escapa: " + perd.map(([t, n]) => `${TIPO_RX[t].toLowerCase()} (${n})`).join(", ") : ""}</p></div>`; })()}
     ${sims.length ? `<div class="cx"><h3><i class="ti ti-stopwatch"></i>Simulados</h3>${sims.slice(-6).map(x => `<div class="metaItem" style="--k:var(--c-laranja)"><span class="ic"><i class="ti ti-flag"></i></span><div><b>${new Date(x.ts).toLocaleDateString("pt-BR")} · ${x.n} questões</b><div class="barra"><i data-w="${pct(x.ok, x.n)}"></i></div></div><em>${pct(x.ok, x.n)}%</em></div>`).join("")}</div>` : ""}
    </div></div>`;
  vivo(s);
}

/* ======================================================================
   AJUSTES
   ====================================================================== */
let promptInstalar = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); promptInstalar = e; if (abaAtual === "ajustes") rota(); });
function pintaAjustes() {
  const c = ST.cfg, pl = plano();
  titulo("settings", "Ajustes", "Metas, cronograma, aparência e seus dados");
  const usados = (() => { try { let t = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PREF)) t += (localStorage.getItem(k) || "").length; } return t; } catch (e) { return 0; } })();
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  $("#sec-ajustes").innerHTML = `<div class="grade g2">
   <div class="cx"><h3><i class="ti ti-target"></i>Meta diária</h3><div class="campos">
     <label class="campo">Questões por dia<input type="number" min="0" max="300" data-cfg="meta.q" value="${c.meta.q}"></label>
     <label class="campo">Cartões por dia<input type="number" min="0" max="500" data-cfg="meta.c" value="${c.meta.c}"></label>
     <label class="campo">Minutos de estudo<input type="number" min="0" max="600" data-cfg="meta.min" value="${c.meta.min}"></label>
     <label class="campo">Cartões novos por dia<input type="number" min="0" max="200" data-cfg="novos" value="${c.novos}"></label></div>
     <p class="sub" style="margin-top:10px">Os minutos contam sozinhos enquanto você estuda no app, com a tela visível.</p></div>
   <div class="cx"><h3><i class="ti ti-calendar-event"></i>Cronograma</h3><div class="campos">
     <label class="campo">Começa na segunda-feira de<input type="date" data-cfg="inicio" value="${pl.ini}"></label>
     <label class="campo">Seu nome (para a saudação)<input type="text" data-cfg="nome" value="${esc(c.nome)}" placeholder="opcional"></label></div>
     <p class="sub" style="margin-top:10px">São ${pl.semanas.length} semanas: com esta data, o plano termina em ${fmtD(pl.fim)}${pl.fim >= E.residencia ? `, <b style="color:var(--err)">depois</b> do início da residência (${fmtD(E.residencia)})` : ` e a residência começa em ${fmtD(E.residencia)}`}. Mudar a data desloca o plano inteiro; o que você já fez continua valendo.</p></div>
   <div class="cx"><h3><i class="ti ti-palette"></i>Aparência</h3><div class="campos">
     <label class="campo">Tema<select data-cfg="tema"><option value="auto" ${ST.tema === "auto" ? "selected" : ""}>Automático</option><option value="claro" ${ST.tema === "claro" ? "selected" : ""}>Claro</option><option value="escuro" ${ST.tema === "escuro" ? "selected" : ""}>Escuro</option></select></label>
     <label class="campo">Letra das leituras<select data-cfg="fonte">${[[.9, "Menor"], [1, "Padrão"], [1.1, "Maior"], [1.2, "Grande"]].map(([v, t]) => `<option value="${v}" ${+c.fonte === v ? "selected" : ""}>${t}</option>`).join("")}</select></label></div></div>
   <div class="cx"><h3><i class="ti ti-device-mobile"></i>Instalar e usar sem internet</h3>
     <p class="sub" style="margin-top:-4px">${standalone ? "O app já está instalado neste aparelho." : ios ? "No iPhone: botão Compartilhar do Safari e depois “Adicionar à Tela de Início”." : "Instale para abrir como aplicativo, em tela cheia."}</p>
     <div class="linhaBt">${promptInstalar && !standalone ? `<button class="bt" data-acao="instalar"><i class="ti ti-download"></i>Instalar o FarmaUTI</button>` : ""}<button class="bt sec" data-acao="offline"><i class="ti ti-cloud-download"></i>Baixar as leituras para usar sem internet</button></div><p class="sub" id="offMsg"></p></div>
   <div class="cx"><h3><i class="ti ti-database"></i>Seus dados</h3>
     <p class="sub" style="margin-top:-4px">Tudo fica neste aparelho (${num(usados / 1024, 0)} KB), com uma cópia interna de segurança. Para trocar de aparelho ou não perder nada, exporte um backup de vez em quando.</p>
     <div class="linhaBt"><button class="bt" data-acao="exporta"><i class="ti ti-file-export"></i>Exportar backup</button><label class="bt sec" style="cursor:pointer"><i class="ti ti-file-import"></i>Importar backup<input type="file" accept="application/json,.json" id="importa" hidden></label></div>
     <div class="sep"></div><button class="bt perigo mini" data-acao="apaga"><i class="ti ti-trash"></i>Apagar todo o progresso</button></div>
   <div class="cx"><h3><i class="ti ti-info-circle"></i>Sobre o conteúdo</h3>
     <p class="sub" style="margin-top:-4px;line-height:1.6">${E.leituras.filter(l => l.ok).length} leituras, ${E.cartoes.length} cartões, ${E.questoes.length} questões, ${E.casos.length} casos, ${RF.bulario.length} fichas e ${RF.interacoes.length} pares de interação, escritos a partir de diretrizes com fonte e ano citados em cada texto. É material de estudo: não substitui a bula vigente, as bases de interação nem os protocolos da instituição. Versão ${VERSAO}.</p></div>
  </div>`;
  $("#importa").addEventListener("change", importa);
}
function mudaCfg(el) {
  const k = el.dataset.cfg; let v = el.value;
  if (k === "tema") { ST.tema = v; salva("tema"); aplicaTema(); return; }
  if (k === "fonte") { ST.cfg.fonte = +v; aplicaFonte(); }
  else if (k === "inicio") { if (!v) return; const d = dt(v), seg = addD(v, -((d.getDay() + 6) % 7)); ST.cfg.inicio = seg; PL = null; if (seg !== v) aviso(`Ajustado para a segunda-feira, ${fmtD(seg)}.`); }
  else if (k === "nome") ST.cfg.nome = v.trim().slice(0, 30);
  else if (k.startsWith("meta.")) ST.cfg.meta[k.slice(5)] = Math.max(0, parseInt(v) || 0);
  else if (k === "novos") ST.cfg.novos = Math.max(0, parseInt(v) || 0);
  salva("cfg");
  if (k === "inicio") rota();
}
function aplicaTema() { const t = ST.tema; if (t === "claro" || t === "escuro") document.documentElement.dataset.tema = t; else delete document.documentElement.dataset.tema; }
function aplicaFonte() { document.documentElement.style.setProperty("--fonteL", ST.cfg.fonte || 1); }
function exporta() {
  const d = {app: "farmauti", versao: VERSAO, data: new Date().toISOString(), estado: Object.fromEntries(CHAVES.map(k => [k, ST[k]]))};
  const b = new Blob([JSON.stringify(d)], {type: "application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `farmauti-backup-${iso()}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  aviso("Backup exportado.");
}
function importa(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (d.app !== "farmauti" || !d.estado) throw new Error("arquivo não é um backup do FarmaUTI");
      if (!confirm("Importar substitui o progresso deste aparelho pelo do arquivo. Continuar?")) return;
      for (const k of CHAVES) if (d.estado[k] !== undefined) { ST[k] = d.estado[k]; salva(k); }
      aviso("Backup importado."); setTimeout(() => location.reload(), 600);
    } catch (err) { aviso("Não foi possível importar: " + err.message); }
  };
  r.readAsText(f);
}
async function baixaOffline() {
  const msg = $("#offMsg"), ls = E.leituras.filter(l => l.ok);
  let n = 0;
  for (const l of ls) { try { const r = await fetch(E.conteudo + l.slug + ".html"); if (r.ok) n++; } catch (e) {} if (msg) msg.textContent = `Baixando ${n} de ${ls.length}…`; }
  if (msg) msg.textContent = n === ls.length ? `Pronto: as ${n} leituras estão disponíveis sem internet.` : `${n} de ${ls.length} baixadas. Tente de novo com uma conexão melhor.`;
}

/* ======================================================================
   BUSCA GLOBAL
   ====================================================================== */
function abreBusca() {
  const c = $("#camada");
  c.innerHTML = `<div class="veu" data-fecha="1"><div class="caixaBusca" role="dialog" aria-label="Buscar"><div class="campoB"><i class="ti ti-search"></i><input type="search" id="bBusca" placeholder="Buscar leituras, seções, fármacos, casos, calculadoras…" autocomplete="off"><kbd>Esc</kbd></div><div class="res" id="bRes"></div></div></div>`;
  const inp = $("#bBusca"); inp.focus();
  let sel = 0;
  const roda = () => {
    const q = norm(inp.value.trim()); const box = $("#bRes");
    if (q.length < 2) { box.innerHTML = `<p class="sub" style="padding:12px">Digite ao menos duas letras.</p>`; return; }
    const pont = t => { const n = norm(t); const i = n.indexOf(q); return i < 0 ? -1 : i === 0 ? 3 : /\s/.test(n[i - 1]) ? 2 : 1; };
    const grupos = [
      ["Leituras", E.leituras.filter(l => l.ok).map(l => ({p: Math.max(pont(l.titulo) * 2, pont(l.dek || "")), k: corA(l.area), ic: icA(l.area), t: l.titulo, s: AREA[l.area].nome, h: "#leituras/" + l.slug}))],
      ["Seções das leituras", E.indice.map(([sl, i, t]) => ({p: pont(t), k: corA(LEIT[sl]?.area), ic: "section", t, s: LEIT[sl]?.titulo, h: "#leituras/" + sl, sec: i}))],
      ["Bulário", RF.bulario.map(b => ({p: Math.max(pont(b.nome) * 2, pont(b.classe)), k: corG(FARM[b.id]?.grupo), ic: "pill", t: b.nome, s: b.classe, h: "#bulario/" + b.id}))],
      ["Casos clínicos", E.casos.map(c => ({p: Math.max(pont(c.titulo), pont(c.resumo)), k: "var(--c-rosa)", ic: "clipboard-heart", t: c.titulo, s: c.resumo, h: "#casos/" + c.id}))],
      ["Prescrições", E.prescricoes.map(r => ({p: Math.max(pont(r.titulo), pont(r.setor), pont(r.itens.map(i => i.texto).join(" ")) > 0 ? 1 : -1), k: "var(--c-lima)", ic: "prescription", t: r.titulo, s: `${r.setor} · semana ${r.sem}`, h: "#prescricoes/" + r.id}))],
      ["Calculadoras", CALCS.map(c => ({p: Math.max(pont(c.nm) * 2, pont(c.ds)), k: c.k, ic: c.ic, t: c.nm, s: c.ds, h: "#calculadoras/" + c.id}))],
      ["Cartões", E.cartoes.map(c => ({p: pont(c.f), k: "var(--c-ambar)", ic: "cards", t: c.f, s: LEIT[c.l]?.titulo, h: "#leituras/" + c.l}))]
    ];
    let h = "", tot = 0;
    for (const [nm, it] of grupos) {
      const r = it.filter(x => x.p > 0).sort((a, b) => b.p - a.p).slice(0, nm === "Seções das leituras" ? 8 : 5);
      if (!r.length) continue;
      h += `<div class="grupoR">${nm}</div>` + r.map(x => `<button class="itR" data-h="${esc(x.h)}" ${x.sec != null ? `data-sec="${x.sec}"` : ""} style="--k:${x.k}"><span class="ic"><i class="ti ti-${x.ic}"></i></span><div><b>${esc(x.t)}</b><small>${esc(x.s || "")}</small></div></button>`).join("");
      tot += r.length;
    }
    box.innerHTML = h || `<p class="sub" style="padding:12px">Nada encontrado.</p>`;
    sel = 0; $$(".itR", box)[0]?.classList.add("sel");
  };
  inp.addEventListener("input", roda);
  inp.addEventListener("keydown", e => {
    const its = $$(".itR", $("#bRes"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!its.length) return; its[sel]?.classList.remove("sel"); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + its.length) % its.length; its[sel].classList.add("sel"); its[sel].scrollIntoView({block: "nearest"}); }
    else if (e.key === "Enter" && its[sel]) its[sel].click();
  });
  roda();
}
function fechaCamada() { $("#camada").innerHTML = ""; }
function abreMais() {
  $("#camada").innerHTML = `<div class="veu" data-fecha="1" style="align-items:flex-end;padding:0"></div><div class="folha" role="dialog" aria-label="Mais seções"><div class="puxa"></div><div class="gradeMais">${ABAS.filter(a => !BARRA.includes(a.id)).map(a => `<button data-ir="${a.id}" style="--c:${COR[a.cor]}"><i class="ti ti-${a.ic}"></i>${a.nome}</button>`).join("")}</div></div>`;
}

/* ---------- eventos (delegação única) ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-ir],[data-ir-l],[data-ir-c],[data-ir-k],[data-ir-b],[data-ir-calc],[data-ir-rx],[data-rxt],[data-rxl],[data-rx-f],[data-acao],[data-alt],[data-simalt],[data-simir],[data-nota],[data-qf],[data-lf-modo],[data-lf-st],[data-lf-area],[data-sim-n],[data-sim-e],[data-ex],[data-add],[data-rm],[data-bf-g],[data-fecha],#carta,.itR,.toc a");
  if (!t) return;
  if (t.dataset.fecha && e.target === t) return fechaCamada();
  if (t.classList.contains("itR")) { fechaCamada(); if (t.dataset.sec != null) LER_SECAO = +t.dataset.sec; location.hash = t.dataset.h; if (location.hash === t.dataset.h) rota(); return; }
  if (t.matches(".toc a")) { e.preventDefault(); $("#s-" + t.dataset.sec)?.scrollIntoView({behavior: "smooth"}); return; }
  if (t.id === "carta") return viraCarta();
  if (t.dataset.ir) return ir(t.dataset.ir);
  if (t.dataset.irL) return ir("leituras", t.dataset.irL);
  if (t.dataset.irC) return ir("cartoes", t.dataset.irC);
  if (t.dataset.irK) return ir("casos", t.dataset.irK);
  if (t.dataset.irB) return ir("bulario", t.dataset.irB);
  if (t.dataset.irCalc) return ir("calculadoras", t.dataset.irCalc);
  if (t.dataset.irRx) return ir("prescricoes", t.dataset.irRx);
  if (t.dataset.rxt != null) { e.stopPropagation(); const i = t.dataset.rxt; RXS.marc[i] = RXS.marc[i] === t.dataset.t ? "" : t.dataset.t; const y = scrollY; pintaRx(RXS.id); scrollTo(0, y); return; }
  if (t.dataset.rxl != null) return marcaLinhaRx(t.dataset.rxl);
  if (t.dataset.rxF) { RXS.semFiltro = t.dataset.rxF; return pintaPrescricoes(); }
  if (t.dataset.alt != null) return responde(+t.dataset.alt);
  if (t.dataset.simalt != null) { const A = SIM.ativo, id = A.ids[A.i]; A.resp[id] = +t.dataset.simalt; return pintaQuestaoSim(); }
  if (t.dataset.simir != null) { SIM.ativo.i = +t.dataset.simir; return pintaQuestaoSim(); }
  if (t.dataset.nota) return avalia(+t.dataset.nota);
  if (t.dataset.lfModo) { LF.modo = t.dataset.lfModo; return pintaLeituras(); }
  if (t.dataset.lfSt != null && t.hasAttribute("data-lf-st")) { LF.st = t.dataset.lfSt; return pintaLeituras(); }
  if (t.hasAttribute("data-lf-area")) { LF.area = t.dataset.lfArea; return pintaLeituras(); }
  if (t.dataset.simN) { SIM.cfg.n = +t.dataset.simN; return pintaSimulado(); }
  if (t.dataset.simE) { SIM.cfg.escopo = t.dataset.simE; return pintaSimulado(); }
  if (t.dataset.ex != null) { INT.ids = [...EXEMPLOS[+t.dataset.ex][1]]; ST.pos.int = INT.ids; salva("pos"); return pintaResultadoInt(); }
  if (t.dataset.add) return addFarm(t.dataset.add);
  if (t.dataset.rm) { INT.ids = INT.ids.filter(x => x !== t.dataset.rm); ST.pos.int = INT.ids; salva("pos"); return pintaResultadoInt(); }
  if (t.hasAttribute("data-bf-g")) { BF.g = t.dataset.bfG; return pintaBulario(); }
  const a = t.dataset.acao;
  switch (a) {
    case "busca": return abreBusca();
    case "mais": return abreMais();
    case "tema": { const ciclo = {auto: escuro() ? "claro" : "escuro", claro: "escuro", escuro: "claro"}; ST.tema = ciclo[ST.tema] || "escuro"; salva("tema"); aplicaTema(); if (abaAtual === "leituras" && paramAtual) rota(); return; }
    case "tarefa": return alternaTarefa(t.dataset.tk);
    case "irTarefa": { const k = achaTarefa(t.dataset.tk); return k && irTarefa(k); }
    case "irHoje": { const k = semanaIdx(); const el = $("#sem-" + (k >= 0 ? k + 1 : 1)); if (el) { el.open = true; el.scrollIntoView({behavior: "smooth"}); } return; }
    case "lida": return marcaLida(t.dataset.s);
    case "fonte": { const v = Math.max(.85, Math.min(1.3, (+ST.cfg.fonte || 1) + (+t.dataset.d) * .05)); ST.cfg.fonte = +v.toFixed(2); salva("cfg"); return aplicaFonte(); }
    case "qLeitura": QS.filtro = {...FILTRO0, l: t.dataset.s}; QS.misturar = false; return ir("questoes");
    case "focoArea": QS.filtro = {...FILTRO0, areas: [t.dataset.area]}; QS.misturar = true; return ir("questoes");
    case "sessao": return iniciaSessao("");
    case "sairSessao": SES = null; return ir("cartoes");
    case "fav": { const id = t.dataset.q; if (ST.fav[id]) delete ST.fav[id]; else ST.fav[id] = 1; salva("fav"); t.classList.toggle("on", !!ST.fav[id]); t.innerHTML = `<i class="ti ti-star${ST.fav[id] ? "-filled" : ""}"></i>`; return; }
    case "qNav": return navQ(+t.dataset.d);
    case "misturar": QS.misturar = !QS.misturar; QS.assin = ""; ST.pos.q = null; return pintaQuestoes();
    case "limpaQ": QS.filtro[t.dataset.k] = null; return pintaQuestoes();
    case "abreSimulado": SIM.ativo = null; return ir("questoes", "simulado");
    case "comecaSim": return comecaSim();
    case "simNav": { const A = SIM.ativo, n = A.i + (+t.dataset.d); if (n >= A.ids.length) return fimSim(); A.i = Math.max(0, n); return pintaQuestaoSim(); }
    case "fimSim": return fimSim();
    case "novoSim": SIM.ativo = null; return pintaSimulado();
    case "sairSim": SIM.ativo = null; return ir("questoes");
    case "revelaCaso": { const id = t.dataset.k; const st = ST.casos[id] ||= {}; st.txt = $("#casoTxt")?.value || st.txt || ""; st.rev = 1; salva("casos"); return pintaCaso(id); }
    case "marcaProb": { const id = t.dataset.k, i = +t.dataset.i, st = ST.casos[id]; const m = new Set(st.marc || []); m.has(i) ? m.delete(i) : m.add(i); st.marc = [...m]; salva("casos"); t.classList.toggle("on", m.has(i)); t.setAttribute("aria-checked", m.has(i)); const b = $('[data-acao="concluiCaso"]'); if (b) b.innerHTML = `<i class="ti ti-check"></i>${st.feito ? "Atualizar nota" : "Concluir caso"} (${m.size}/${CASO[id].gabarito.length})`; return; }
    case "concluiCaso": { const id = t.dataset.k, st = ST.casos[id]; const novo = !st.feito; st.feito = iso(); salva("casos"); if (novo) { confete(); aviso(`Caso concluído: ${st.marc?.length || 0} de ${CASO[id].gabarito.length} problemas identificados.`); } else aviso("Nota atualizada."); return ir("casos"); }
    case "rxCorrige": return corrigeRx(t.dataset.k);
    case "rxRefaz": { const st = ST.presc[t.dataset.k]; if (st) st.refazer = 1; RXS.id = ""; return pintaRx(t.dataset.k); }
    case "rxOmi": { const st = ST.presc[t.dataset.k], i = +t.dataset.i; st.omi[i] = !st.omi[i]; salva("presc"); const y = scrollY; pintaRx(t.dataset.k); scrollTo(0, y); return; }
    case "limpaInt": INT.ids = []; ST.pos.int = []; salva("pos"); return pintaResultadoInt();
    case "verInt": INT.ids = [t.dataset.f]; ST.pos.int = INT.ids; salva("pos"); return ir("interacoes");
    case "instalar": if (promptInstalar) { promptInstalar.prompt(); promptInstalar.userChoice.finally(() => { promptInstalar = null; rota(); }); } return;
    case "offline": return baixaOffline();
    case "exporta": return exporta();
    case "apaga": if (prompt('Isto apaga todo o progresso deste aparelho. Para confirmar, digite APAGAR') === "APAGAR") { CHAVES.forEach(k => { try { localStorage.removeItem(PREF + k); } catch (e) {} }); idb(db => { try { db.transaction("s", "readwrite").objectStore("s").clear(); } catch (e) {} }); setTimeout(() => location.reload(), 300); } return;
  }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.qf) { QS.filtro[t.dataset.qf] = t.value; return pintaQuestoes(); }
  if (t.dataset.cfg) return mudaCfg(t);
});
document.addEventListener("input", e => { const t = e.target; if (t.dataset.cfg && t.type !== "date" && t.tagName !== "SELECT") mudaCfg(t); });
document.addEventListener("keydown", e => {
  const emCampo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === "Escape") { if ($("#camada").innerHTML) return fechaCamada(); }
  if (emCampo || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); return abreBusca(); }
  if ($("#camada").innerHTML) return;
  if (abaAtual === "cartoes" && SES) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!SES.virada) viraCarta(); return; }
    if (/^[1-4]$/.test(e.key)) return avalia(+e.key);
  }
  if (abaAtual === "questoes" && !paramAtual && QS.lista.length) {
    const k = e.key.toUpperCase(); const pos = "ABCDE".indexOf(k) >= 0 ? "ABCDE".indexOf(k) : "12345".indexOf(e.key);
    if (pos >= 0 && !QS.resp) { const q = QID[QS.lista[QS.i]]; return responde(ordemAlts(q)[pos]); }
    if (e.key === "ArrowRight") return navQ(1);
    if (e.key === "ArrowLeft") return navQ(-1);
  }
  if (abaAtual === "questoes" && paramAtual === "simulado" && SIM.ativo && !SIM.ativo.fim) {
    const k = e.key.toUpperCase(), pos = "ABCDE".indexOf(k);
    if (pos >= 0) { const id = SIM.ativo.ids[SIM.ativo.i]; SIM.ativo.resp[id] = ordemAlts(QID[id])[pos]; return pintaQuestaoSim(); }
    if (e.key === "ArrowRight" && SIM.ativo.i < SIM.ativo.ids.length - 1) { SIM.ativo.i++; return pintaQuestaoSim(); }
    if (e.key === "ArrowLeft" && SIM.ativo.i > 0) { SIM.ativo.i--; return pintaQuestaoSim(); }
  }
});

/* ---------- partida ---------- */
const PINTA = {
  prescricoes: p => pintaPrescricoes(p),
  inicio: () => pintaInicio(), cronograma: () => pintaCronograma(), leituras: p => pintaLeituras(p), cartoes: p => pintaCartoes(p),
  questoes: p => pintaQuestoes(p), casos: p => pintaCasos(p), interacoes: p => pintaInteracoes(p), bulario: p => pintaBulario(p),
  calculadoras: p => pintaCalculadoras(p), desempenho: () => pintaDesempenho(), ajustes: () => pintaAjustes()
};
(async function inicia() {
  const tinha = carrega();
  if (!tinha) { const ok = await restauraDoEspelho(); if (ok) setTimeout(() => aviso("Progresso restaurado da cópia interna de segurança."), 800); }
  aplicaTema(); aplicaFonte();
  restauraFiltroQ();
  montaNav();
  addEventListener("hashchange", rota);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  rota();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.__fu = {ST, E, RF, plano, ir, analisaInt, CALCULA, QS};
})();
