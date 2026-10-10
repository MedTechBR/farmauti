/* mtsync.js — conta MedTech + sincronização automática dos apps de estudo.
   FONTE ÚNICA em ~/Documents/Claude/_mtsync/mtsync.js; cada app leva uma CÓPIA
   (ClínicaMed, TráfegoTítulo, RadioTítulo, FlashMed). Mudou aqui, copie para os quatro
   e rode `node _mtsync/teste.js` antes.

   Pedido do Matheus (25/09/2026): "o cliente não é pra precisar ficar fazendo backup; o app
   só é pra abrir se você já estiver logado e a sincronização é feita automaticamente
   durante o uso". Então:

   1. PORTÃO. O app fica coberto desde o primeiro pixel até a conta ser confirmada. Sem
      conta, só aparece a tela de entrar. Quem já entrou neste aparelho abre sem internet
      (sessão e SDK ficam no aparelho; o SDK é vendorizado e vai no precache do SW).
   2. UM DOCUMENTO POR ITEM em users/{uid}/apps/{app}/sync/{colecao~id}. Nada de pacote
      único (teto de 1 MB, e o último aparelho a gravar apagava o outro).
   3. ESCRITAS IDEMPOTENTES, para poderem ser repetidas sem estrago:
        mapa/lista/doc -> set do valor inteiro, com o carimbo da EDIÇÃO (último vence)
        hist           -> arrayUnion das tentativas (a união é feita pelo servidor)
        soma           -> cada aparelho grava só a própria contagem (n.<aparelho>)
   4. A "base" de cada item (o que se sabe que está na nuvem) só avança com o que foi
      de fato ENVIADO e CONFIRMADO, ou recebido. Mudança feita enquanto um envio está no
      ar continua diferente da base e sobe no próximo ciclo. (Era o defeito que engolia
      respostas no TráfegoTítulo/RadioTítulo.)
   5. RECEBE EM TEMPO REAL (onSnapshot) filtrando pelo carimbo do SERVIDOR, com folga de
      10 min: envio atrasado (fila offline) ganha carimbo de quando chegou, então nunca
      fica para trás do cursor de outro aparelho.
   6. Firestore com cache persistente: o que foi gravado offline fica na fila do próprio
      SDK (IndexedDB) e sobe sozinho quando a rede volta, mesmo depois de fechar o app.

   Tipos de coleção (o valor local é o que o app guarda na chave):
     mapa  {id: valor}          último vence por item, lápide na exclusão
     hist  {id: {hist:[...]}}   tentativas unidas por `ts`; teto local opcional
     lista [{<campo id>:...}]   último vence por item, lápide na exclusão
     doc   qualquer valor        o valor inteiro é um item só
     soma  {dia: n}              soma das contagens de cada aparelho
*/
(function (G) {
"use strict";

/* ======================= núcleo puro (testado em Node) ======================= */
const NUCLEO = (() => {
  function estavel(o) {
    if (o === null || typeof o !== "object") return JSON.stringify(o === undefined ? null : o);
    if (Array.isArray(o)) return "[" + o.map(estavel).join(",") + "]";
    return "{" + Object.keys(o).sort().filter(k => o[k] !== undefined)
      .map(k => JSON.stringify(k) + ":" + estavel(o[k])).join(",") + "}";
  }
  /* FNV-1a 32 bits sobre a serialização estável: a base guarda só isto por item */
  function hash(v) {
    const s = estavel(v); let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h.toString(36) + "." + s.length.toString(36);
  }
  const APAGADO = "x";                         /* base de item que a nuvem sabe estar apagado */
  const chaveEnt = e => e && (e.ts !== undefined ? String(e.ts) : [e.d, e.alt, e.ok].join("|"));

  /* valor local da coleção -> {id: item} */
  function itens(spec, v) {
    const out = {};
    if (spec.tipo === "doc") { if (v !== undefined && v !== null && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) out._ = v; return out }
    if (spec.tipo === "lista") { (Array.isArray(v) ? v : []).forEach(x => { const id = x && x[spec.id]; if (id !== undefined && id !== null && id !== "") out[String(id)] = x }); return out }
    if (v && typeof v === "object" && !Array.isArray(v)) Object.keys(v).forEach(k => { if (v[k] !== undefined) out[k] = v[k] });
    return out;
  }
  /* {id: item} -> valor local; `ant` preserva a ordem que o app já tinha */
  function monta(spec, mapa, ant) {
    if (spec.tipo === "doc") return ("_" in mapa) ? mapa._ : (spec.vazio !== undefined ? JSON.parse(JSON.stringify(spec.vazio)) : ant);
    if (spec.tipo === "lista") {
      const vistos = new Set(), out = [];
      (Array.isArray(ant) ? ant : []).forEach(x => { const id = x && String(x[spec.id]); if (id in mapa && !vistos.has(id)) { vistos.add(id); out.push(mapa[id]) } });
      const novos = Object.keys(mapa).filter(id => !vistos.has(id)).sort().map(id => mapa[id]);
      if (spec.novosNoInicio) out.unshift(...novos.reverse()); else out.push(...novos);
      if (spec.ordena) out.sort(spec.ordena);
      if (spec.teto && out.length > spec.teto) return spec.tetoDoFim ? out.slice(-spec.teto) : out.slice(0, spec.teto);
      return out;
    }
    const out = {}; Object.keys(mapa).forEach(k => out[k] = mapa[k]); return out;
  }
  /* hist: separa as tentativas do resto do item */
  function partesHist(item) {
    const h = (item && Array.isArray(item.hist)) ? item.hist : [];
    const resto = {}; Object.keys(item || {}).forEach(k => { if (k !== "hist") resto[k] = item[k] });
    return { h, resto };
  }
  function uneEntradas(a, b, z, teto) {
    const vis = new Set(), out = [];
    (a || []).concat(b || []).forEach(e => { const k = chaveEnt(e); if (k === undefined || vis.has(k)) return; if (z && (+e.ts || 0) <= z) return; vis.add(k); out.push(e) });
    out.sort((x, y) => (+x.ts || 0) - (+y.ts || 0));
    return teto && out.length > teto ? out.slice(-teto) : out;
  }
  return { estavel, hash, APAGADO, chaveEnt, itens, monta, partesHist, uneEntradas };
})();

/* ======================= motor (independe do Firebase) =======================
   `T` é o transporte: no navegador, o Firestore; no teste, um servidor falso.
     T.escrever(ops) -> Promise   ops = [{id, dados, merge}]; resolve quando o servidor confirmou
     T.ouvir(desdeMs, cb) -> parar   cb(docs, {doServidor}) ; docs = [{id, dados}]
     T.uniao(arr), T.agoraServidor()  sentinelas do Firestore
   `A` é o app: {ler(col), gravar(col, valor), aoReceber(cols), estado: persistência do motor} */
function Motor(cfg, T, A) {
  const N = NUCLEO, COLS = cfg.colecoes, NOMES = Object.keys(COLS);
  const ATRASO = cfg.atraso || 1200;
  let E = A.estadoLer() || {};
  if (!E.dev) E.dev = Math.random().toString(36).slice(2, 10);
  const PARTES = ["base", "ed", "bh", "own", "lg", "lgPend", "bt", "somaPend"];
  PARTES.forEach(k => { if (!E[k]) E[k] = {} });
  NOMES.forEach(c => PARTES.forEach(k => { if (!E[k][c]) E[k][c] = {} }));
  /* soma: a contagem que já existia antes do primeiro contato com a nuvem nova é "legado".
     Os aparelhos antigos têm a mesma (a sincronização velha copiava o maior), então ela vai
     para um campo comum (_l) e vale o maior, em vez de ser somada de novo por aparelho. */
  if (!E.somaIni) {
    NOMES.filter(c => COLS[c].tipo === "soma").forEach(c => {
      const it = N.itens(COLS[c], A.ler(c));
      Object.keys(it).forEach(id => { const n = +it[id] || 0; if (!n) return;
        E.lg[c][id] = n; E.own[c][id] = 0; E.base[c][id] = n; E.lgPend[c][id] = 1 });
    });
    E.somaIni = 1;
  }
  if (!E.cursor) E.cursor = 0;
  const voo = {}; NOMES.forEach(c => voo[c] = {});
  const sujo = {};                              /* col -> momento da primeira mudança não varrida */
  const vistos = {}; NOMES.forEach(c => vistos[c] = {});   /* último hash visto por item (memória) */
  let gravarEstadoT = null, enviando = false, deNovo = false, parar = null, erro = null, doServidor = false;
  const ouvintes = [];

  function persiste() { clearTimeout(gravarEstadoT); gravarEstadoT = setTimeout(() => A.estadoGravar(E), Math.min(400, ATRASO)) }
  function persisteJa() { clearTimeout(gravarEstadoT); A.estadoGravar(E) }
  const docId = (c, id) => c + "~" + encodeURIComponent(id).replace(/\./g, "%2E");
  function avisa() { const s = situacao(); ouvintes.forEach(f => { try { f(s) } catch (e) {} }) }

  /* ---------- quanto falta subir ---------- */
  function pendentes() {
    let n = 0;
    NOMES.forEach(c => {
      const spec = COLS[c], it = N.itens(spec, A.ler(c)), base = E.base[c];
      if (spec.tipo === "soma") { const p = new Set(Object.keys(E.somaPend[c])); Object.keys(it).forEach(id => { if ((+it[id] || 0) !== (base[id] || 0)) p.add(id) }); n += p.size; return }
      const ids = new Set(Object.keys(it).concat(Object.keys(base)));
      ids.forEach(id => {
        if (spec.tipo === "hist") {
          if (!(id in it)) { if (base[id] && base[id] !== N.APAGADO) n++; return }
          const { h } = N.partesHist(it[id]), bh = new Set(E.bh[c][id] || []);
          if (h.some(e => !bh.has(N.chaveEnt(e)))) n++;
          return;
        }
        const hl = (id in it) ? N.hash(it[id]) : N.APAGADO;
        if (hl !== (base[id] || N.APAGADO)) n++;
      });
    });
    return n;
  }
  function situacao() {
    const p = pendentes();
    return { pendentes: p, enviando, erro, online: T.online(), doServidor, ultimo: E.ultimo || 0 };
  }

  /* ---------- mudança local: anota quando mudou (é o carimbo da edição) ---------- */
  function mudou(col) {
    if (!COLS[col]) return;
    if (!sujo[col]) sujo[col] = Date.now();
    agenda();
  }
  let agT = null;
  function agenda(ms) { clearTimeout(agT); agT = setTimeout(envia, ms === undefined ? ATRASO : Math.min(ms, ATRASO)) }

  /* carimba edições: item diferente da base e sem carimbo pendente ganha o momento da mudança */
  function varre(col) {
    const spec = COLS[col], quando = sujo[col] || Date.now(); delete sujo[col];
    if (spec.tipo === "soma" || spec.tipo === "hist") return;
    const it = N.itens(spec, A.ler(col)), base = E.base[col], ed = E.ed[col], vi = vistos[col];
    new Set(Object.keys(it).concat(Object.keys(base))).forEach(id => {
      const hl = (id in it) ? N.hash(it[id]) : N.APAGADO;
      if (hl !== (base[id] || N.APAGADO)) {
        /* o que já estava aqui antes do primeiro contato com a nuvem nova vale "1": perde para
           qualquer versão que a nuvem já tenha (outro aparelho migrou antes) */
        if (vi[id] === undefined) { if (!ed[id]) ed[id] = E.inicio ? quando : 1 }
        else if (vi[id] !== hl) ed[id] = quando;
      } else delete ed[id];
      vi[id] = hl;
    });
  }

  /* ---------- envio ---------- */
  async function envia() {
    if (!T.pronto()) return;
    if (enviando) { deNovo = true; return }
    enviando = true; erro = null; avisa();
    try {
      NOMES.forEach(c => varre(c));
      const ops = [], confirma = [];
      NOMES.forEach(c => {
        const spec = COLS[c], it = N.itens(spec, A.ler(c)), base = E.base[c], ed = E.ed[c], v = voo[c];
        if (spec.tipo === "soma") {
          Object.keys(E.lgPend[c]).forEach(id => {
            ops.push({ id: docId(c, id), merge: true, dados: { c, i: id, s: T.agoraServidor(), n: { _l: E.lg[c][id] || 0 } } });
            confirma.push(() => { delete E.lgPend[c][id] });
          });
          Object.keys(it).forEach(id => {
            const n = +it[id] || 0, delta = n - (base[id] || 0);
            if (!delta) return;
            base[id] = n; E.own[c][id] = (E.own[c][id] || 0) + delta; E.somaPend[c][id] = 1;
          });
          /* a contagem própria fica pendente até o servidor confirmar: se o app fechar offline
             e a fila em memória sumir, ela é reenviada (gravar o mesmo número de novo é inofensivo) */
          Object.keys(E.somaPend[c]).forEach(id => {
            const meu = E.own[c][id] || 0; if (v[id] === meu) return; v[id] = meu;
            ops.push({ id: docId(c, id), merge: true, dados: { c, i: id, s: T.agoraServidor(), n: { [E.dev]: meu } } });
            confirma.push(() => { if (v[id] === meu) delete v[id]; if ((E.own[c][id] || 0) === meu) delete E.somaPend[c][id] });
          });
          return;
        }
        if (spec.tipo === "hist") {
          new Set(Object.keys(it).concat(Object.keys(base))).forEach(id => {
            if (!(id in it)) {
              if (!base[id] || base[id] === N.APAGADO || v[id] === N.APAGADO) return;
              const z = Date.now(); v[id] = N.APAGADO;
              ops.push({ id: docId(c, id), merge: false, dados: { c, i: id, s: T.agoraServidor(), t: z, z, del: 1, h: [], dv: E.dev } });
              confirma.push(() => { if (v[id] === N.APAGADO) { delete v[id]; base[id] = N.APAGADO; delete E.bh[c][id] } });
              return;
            }
            const { h } = N.partesHist(it[id]), bh = new Set(E.bh[c][id] || []), emVoo = new Set(v[id] || []);
            const novas = h.filter(e => { const k = N.chaveEnt(e); return !bh.has(k) && !emVoo.has(k) });
            if (!novas.length) return;
            const ks = novas.map(N.chaveEnt); v[id] = (v[id] || []).concat(ks);
            ops.push({ id: docId(c, id), merge: true, dados: { c, i: id, s: T.agoraServidor(), dv: E.dev, del: 0, h: T.uniao(novas.map(N.estavel)) } });
            confirma.push(() => {
              const b = new Set(E.bh[c][id] || []); ks.forEach(k => b.add(k)); E.bh[c][id] = [...b];
              base[id] = "h"; v[id] = (v[id] || []).filter(k => !ks.includes(k)); if (!v[id].length) delete v[id];
            });
          });
          return;
        }
        new Set(Object.keys(it).concat(Object.keys(base))).forEach(id => {
          const hl = (id in it) ? N.hash(it[id]) : N.APAGADO;
          if (hl === (base[id] || N.APAGADO) || v[id] === hl) return;
          const t = ed[id] || Date.now(); v[id] = hl;
          /* o valor vai como texto JSON: o Firestore não aceita lista dentro de lista nem undefined */
          const dados = hl === N.APAGADO
            ? { c, i: id, s: T.agoraServidor(), t, dv: E.dev, del: 1, j: null }
            : { c, i: id, s: T.agoraServidor(), t, dv: E.dev, del: 0, j: JSON.stringify(it[id]) };
          ops.push({ id: docId(c, id), merge: false, dados });
          confirma.push(() => {
            if (v[id] === hl) delete v[id];
            base[id] = hl; E.bt[c][id] = t;
            const agora = N.itens(spec, A.ler(c)), ha = (id in agora) ? N.hash(agora[id]) : N.APAGADO;
            if (ha === hl) delete ed[id];
          });
        });
      });
      if (!E.inicio) E.inicio = Date.now();
      persiste();
      if (ops.length) {
        for (let i = 0; i < ops.length; i += 400) {
          const fatia = ops.slice(i, i + 400), cf = confirma.slice(i, i + 400);
          /* não esperamos a confirmação para seguir: offline ela só chega quando a rede volta,
             e a próxima mudança não pode ficar presa atrás dela */
          T.escrever(fatia).then(() => { cf.forEach(f => f()); E.ultimo = Date.now(); persiste(); avisa() })
            .catch(e => { erro = traduz(e); NOMES.forEach(c => voo[c] = {}); avisa(); setTimeout(() => agenda(0), cfg.atrasoErro || 30000) });
        }
      } else if (!pendentes()) { E.ultimo = E.ultimo || Date.now() }
    } catch (e) { erro = traduz(e) }
    finally { enviando = false; avisa(); if (deNovo) { deNovo = false; agenda(300) } }
  }

  /* ---------- recebimento ---------- */
  function recebe(docs, meta) {
    if (meta) doServidor = !!meta.doServidor;
    const mudaram = new Set(); const cache = {};
    const local = c => cache[c] || (cache[c] = N.itens(COLS[c], A.ler(c)));
    Object.keys(sujo).forEach(c => varre(c));     /* edição local recente precisa do carimbo antes de comparar */
    docs.forEach(({ dados: d }) => {
      if (!d || !COLS[d.c]) return;
      const c = d.c, id = String(d.i), spec = COLS[c], it = local(c), base = E.base[c];
      if (d.s && d.s > E.cursor) E.cursor = d.s;
      if (spec.tipo === "soma") {
        const n = d.n || {}; let outros = 0;
        Object.keys(n).forEach(dv => { if (dv !== E.dev && dv !== "_l") outros += (+n[dv] || 0) });
        const lg = Math.max(+n._l || 0, E.lg[c][id] || 0); if (lg) E.lg[c][id] = lg;
        if ((E.lg[c][id] || 0) > (+n._l || 0) && !E.lgPend[c][id]) E.lgPend[c][id] = 1;
        const tot = lg + outros + (E.own[c][id] || 0);
        const pend = (+it[id] || 0) - (base[id] || 0);   /* mudança local ainda não varrida */
        const novo = tot + pend;
        if ((+it[id] || 0) !== novo) { it[id] = novo; mudaram.add(c) }
        base[id] = tot;
        return;
      }
      if (spec.tipo === "hist") {
        const z = +d.z || 0;
        const rem = (Array.isArray(d.h) ? d.h : []).map(x => { if (typeof x !== "string") return x; try { return JSON.parse(x) } catch (e) { return null } }).filter(Boolean);
        const tem = id in it, { h: hl, resto } = N.partesHist(tem ? it[id] : {});
        const u = N.uneEntradas(hl, rem, z, spec.teto);
        const b = new Set(E.bh[c][id] || []); rem.forEach(e => b.add(N.chaveEnt(e)));
        if (z) hl.forEach(e => { if ((+e.ts || 0) <= z) b.add(N.chaveEnt(e)) });
        E.bh[c][id] = [...b];
        if (!u.length) { if (tem) { delete it[id]; mudaram.add(c) } base[id] = N.APAGADO; return }
        base[id] = "h";
        if (!tem || N.estavel(u) !== N.estavel(hl)) { it[id] = Object.assign({}, resto, { hist: u }); mudaram.add(c) }
        return;
      }
      let rv; if (!d.del) { try { rv = typeof d.j === "string" ? JSON.parse(d.j) : d.v } catch (e) { return } }
      const hr = d.del ? N.APAGADO : N.hash(rv), hl = (id in it) ? N.hash(it[id]) : N.APAGADO;
      const semEdicao = hl === (base[id] || N.APAGADO);
      const ed = E.ed[c][id] || 0, tr = +d.t || 0, bt = E.bt[c][id] || 0;
      if (hl === hr) { base[id] = hr; E.bt[c][id] = tr; delete E.ed[c][id]; return }
      /* versão da nuvem mais velha do que a que este aparelho já aceitou: um envio atrasado
         de outro aparelho chegou depois. Mantém a local e a devolve com o carimbo dela. */
      if (semEdicao && tr < bt) { base[id] = hr; E.bt[c][id] = tr; E.ed[c][id] = bt; vistos[c][id] = hl; return }
      if (semEdicao || tr >= ed) {
        if (d.del) delete it[id]; else it[id] = rv;
        vistos[c][id] = hr;
        base[id] = hr; E.bt[c][id] = tr; delete E.ed[c][id]; delete voo[c][id]; mudaram.add(c);
      } else {
        base[id] = hr; E.bt[c][id] = tr;   /* a nuvem tem hr; o local é mais novo e vai subir */
      }
    });
    mudaram.forEach(c => A.gravar(c, N.monta(COLS[c], cache[c], A.ler(c))));
    persiste();
    if (mudaram.size) { try { A.aoReceber([...mudaram]) } catch (e) {} }
    if (docs.length) agenda(800);   /* devolve o que a nuvem ainda não tem */
    avisa();
  }

  function liga() {
    if (parar) parar();
    const desde = Math.max(0, (E.cursor || 0) - 10 * 60 * 1000);
    parar = T.ouvir(desde, recebe, e => { erro = traduz(e); avisa() });
    agenda(1500);
  }
  function desliga() { if (parar) { parar(); parar = null } clearTimeout(agT); persisteJa() }

  function traduz(e) {
    const c = (e && e.code) || "";
    if (/permission/.test(c)) return "A nuvem recusou a gravação (permissão).";
    if (/unavailable|network/.test(c)) return "";
    if (/resource-exhausted|quota/.test(c)) return "A nuvem está no limite de uso agora; tento de novo em instantes.";
    return (e && e.message) ? String(e.message).slice(0, 140) : "Falha ao sincronizar.";
  }

  return {
    mudou, envia, liga, desliga, recebe, situacao, pendentes,
    aoMudarSituacao(f) { ouvintes.push(f); f(situacao()) },
    get estado() { return E }, docId, persisteJa
  };
}

/* ======================= navegador: Firebase + portão ======================= */
if (typeof window === "undefined") { module.exports = { NUCLEO, Motor }; return }

const FB = {
  apiKey: "AIzaSyD2mGtXsfAyirtqvAaeWjoPacKMOK3qtVU",
  authDomain: "medtech-c658c.firebaseapp.com",
  projectId: "medtech-c658c",
  storageBucket: "medtech-c658c.firebasestorage.app",
  messagingSenderId: "815142768751",
  appId: "1:815142768751:web:2db574351bd785b0b7fd9a"
};
const REGIAO = "southamerica-east1";

/* o portão entra ANTES de o app pintar: o script é clássico e síncrono no <head> */
const H = document.documentElement;
H.classList.add("mts-trava");
const CSS = `
html.mts-trava body>*:not(#mtsPortao){visibility:hidden!important}
html.mts-trava,html.mts-trava body{overflow:hidden!important}
#mtsPortao{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
 padding:24px 16px;background:var(--mts-fundo,#FAFAF8);color:var(--mts-texto,#1d2433);
 font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;overflow:auto}
#mtsPortao .mts-cx{width:100%;max-width:380px}
#mtsPortao h1{font-size:24px;line-height:1.2;margin:0 0 4px;font-weight:700;letter-spacing:-.01em}
#mtsPortao .sub{margin:0 0 22px;color:var(--mts-suave,#5b6475);font-size:14px}
#mtsPortao label{display:block;font-size:13px;font-weight:600;margin:14px 0 6px}
#mtsPortao input[type=email],#mtsPortao input[type=password],#mtsPortao input[type=text]{width:100%;box-sizing:border-box;
 font:inherit;padding:12px 14px;border:1px solid var(--mts-borda,#d5d9e0);border-radius:10px;background:var(--mts-campo,#fff);color:inherit}
#mtsPortao input:focus{outline:2px solid var(--mts-cor,#2563eb);outline-offset:1px;border-color:transparent}
#mtsPortao .bt{display:block;width:100%;margin-top:20px;padding:13px 16px;border:0;border-radius:10px;
 background:var(--mts-cor,#2563eb);color:var(--mts-sobrecor,#fff);font:inherit;font-weight:650;cursor:pointer}
#mtsPortao .bt[disabled]{opacity:.6;cursor:default}
#mtsPortao .lk{background:none;border:0;padding:0;margin:0;font:inherit;font-size:14px;color:var(--mts-cor,#2563eb);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
#mtsPortao .linha{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:16px}
#mtsPortao .msg{margin-top:14px;font-size:14px;min-height:1.5em}
#mtsPortao .msg.erro{color:var(--mts-erro,#b42318)}
#mtsPortao .msg.ok{color:var(--mts-ok,#067647)}
#mtsPortao .lgpd{display:flex;gap:8px;align-items:flex-start;font-size:13px;font-weight:400;color:var(--mts-suave,#5b6475)}
#mtsPortao .lgpd input{margin-top:3px}
#mtsPortao .lgpd a{color:var(--mts-cor,#2563eb);font-weight:600}
#mtsPortao .giro{width:28px;height:28px;border-radius:50%;border:3px solid var(--mts-borda,#d5d9e0);border-top-color:var(--mts-cor,#2563eb);animation:mtsgiro .8s linear infinite;margin:0 auto 14px}
#mtsPortao .centro{text-align:center}
@keyframes mtsgiro{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){#mtsPortao .giro{animation:none}}
`;
function injetaCSS() { if (document.getElementById("mtsCSS")) return; const s = document.createElement("style"); s.id = "mtsCSS"; s.textContent = CSS; (document.head || H).appendChild(s) }
injetaCSS();

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let CFG = null, portaoEl = null;
function portao(html) {
  if (!portaoEl) {
    portaoEl = document.createElement("div"); portaoEl.id = "mtsPortao";
    portaoEl.setAttribute("role", "dialog"); portaoEl.setAttribute("aria-modal", "true"); portaoEl.setAttribute("aria-labelledby", "mtsTit");
    const poe = () => document.body.appendChild(portaoEl);
    if (document.body) poe(); else document.addEventListener("DOMContentLoaded", poe, { once: true });
  }
  portaoEl.innerHTML = `<div class="mts-cx">${html}</div>`;
  return portaoEl;
}
function tiraPortao() { H.classList.remove("mts-trava"); if (portaoEl) { portaoEl.remove(); portaoEl = null } }
const nomeApp = () => (CFG && CFG.nome) || "MedTech";
/* enquanto o app ainda não chamou iniciar(), a tela não fica em branco */
document.addEventListener("DOMContentLoaded", () => { if (H.classList.contains("mts-trava") && !portaoEl) telaEspera() }, { once: true });
function telaEspera(txt) {
  portao(`<div class="centro"><div class="giro" aria-hidden="true"></div><p class="sub" id="mtsTit" style="margin:0">${esc(txt || "Abrindo sua conta…")}</p></div>`);
}
function telaAviso(titulo, txt, botao) {
  const p = portao(`<h1 id="mtsTit">${esc(titulo)}</h1><p class="sub">${esc(txt)}</p>${botao ? `<button class="bt" id="mtsBt">${esc(botao)}</button>` : ""}`);
  const b = p.querySelector("#mtsBt"); if (b) b.onclick = () => location.reload();
}

const ERROS = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "Não há conta com esse e-mail.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/email-already-in-use": "Já existe conta com esse e-mail. Use Entrar.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem internet. Para entrar pela primeira vez neste aparelho é preciso estar conectado.",
  "auth/user-disabled": "Esta conta está desativada."
};
const msgErro = e => ERROS[e && e.code] || "Não foi possível concluir. Tente de novo.";

function telaEntrar(auth, modo, avisoInicial) {
  modo = modo || "entrar";
  const criar = modo === "criar", esqueci = modo === "esqueci";
  const p = portao(`
    <h1 id="mtsTit">${esc(nomeApp())}</h1>
    <p class="sub">${criar ? "Crie sua conta MedTech. É a mesma conta de todos os apps MedTech." : esqueci ? "Enviaremos um link para você criar uma nova senha." : "Entre com sua conta MedTech. Seu progresso fica salvo nela e aparece em qualquer aparelho."}</p>
    <form id="mtsForm" novalidate>
      ${criar ? `<label for="mtsNome">Nome</label><input id="mtsNome" type="text" autocomplete="name" required>` : ""}
      <label for="mtsEmail">E-mail</label><input id="mtsEmail" type="email" autocomplete="email" inputmode="email" required>
      ${esqueci ? "" : `<label for="mtsSenha">Senha</label><input id="mtsSenha" type="password" autocomplete="${criar ? "new-password" : "current-password"}" required minlength="6">`}
      ${criar ? `<label class="lgpd"><input id="mtsLgpd" type="checkbox"> <span>Li e aceito os <a href="https://medtechbr.com.br/termos.html" target="_blank" rel="noopener">Termos</a> e a <a href="https://medtechbr.com.br/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a> (LGPD).</span></label>` : ""}
      <button class="bt" type="submit" id="mtsEnviar">${criar ? "Criar conta" : esqueci ? "Enviar link" : "Entrar"}</button>
    </form>
    <div class="msg" id="mtsMsg" role="status"></div>
    <div class="linha">
      ${modo !== "entrar" ? `<button class="lk" data-m="entrar" type="button">Já tenho conta</button>` : `<button class="lk" data-m="esqueci" type="button">Esqueci a senha</button>`}
      ${modo !== "criar" ? `<button class="lk" data-m="criar" type="button">Criar conta</button>` : ""}
    </div>`);
  const $ = s => p.querySelector(s), msg = (t, cl) => { const m = $("#mtsMsg"); m.textContent = t || ""; m.className = "msg " + (cl || "") };
  if (avisoInicial) msg(avisoInicial, "erro");
  p.querySelectorAll("[data-m]").forEach(b => b.onclick = () => telaEntrar(auth, b.dataset.m));
  setTimeout(() => { const f = $(criar ? "#mtsNome" : "#mtsEmail"); if (f) f.focus() }, 50);
  $("#mtsForm").onsubmit = async ev => {
    ev.preventDefault();
    const email = ($("#mtsEmail").value || "").trim(), senha = $("#mtsSenha") ? $("#mtsSenha").value : "";
    if (!email) return msg("Informe o e-mail.", "erro");
    if (!esqueci && !senha) return msg("Informe a senha.", "erro");
    if (criar && !$("#mtsLgpd").checked) return msg("Para criar a conta, marque a concordância.", "erro");
    const bt = $("#mtsEnviar"); bt.disabled = true; msg("Aguarde…");
    try {
      if (esqueci) { await auth.sendPasswordResetEmail(email); msg("Link enviado. Confira sua caixa de entrada e o spam.", "ok"); bt.disabled = false; return }
      if (criar) {
        const nome = ($("#mtsNome").value || "").trim();
        const r = await auth.createUserWithEmailAndPassword(email, senha);
        if (nome) { try { await r.user.updateProfile({ displayName: nome }) } catch (e) {} }
      } else await auth.signInWithEmailAndPassword(email, senha);
      msg("Entrando…", "ok");
    } catch (e) { msg(msgErro(e), "erro"); bt.disabled = false }
  };
}

/* ---------- SDK vendorizado ---------- */
function carrega(src) {
  return new Promise((ok, falha) => {
    const s = document.createElement("script"); s.src = src; s.async = false;
    s.onload = ok; s.onerror = () => falha(new Error("não carregou " + src)); document.head.appendChild(s);
  });
}
async function carregaSDK(base) {
  if (window.firebase && firebase.firestore && firebase.auth) return;
  for (const m of ["app", "auth", "firestore"]) await carrega(`${base}firebase-${m}-compat.js`);
}

/* ---------- transporte Firestore ---------- */
function transporte(db, uid, app) {
  const col = db.collection("users").doc(uid).collection("apps").doc(app).collection("sync");
  const FV = firebase.firestore.FieldValue;
  return {
    pronto: () => true,
    online: () => navigator.onLine !== false,
    uniao: arr => FV.arrayUnion.apply(FV, arr),
    agoraServidor: () => FV.serverTimestamp(),
    escrever(ops) {
      const b = db.batch();
      ops.forEach(o => b.set(col.doc(o.id), o.dados, { merge: !!o.merge }));
      return b.commit();
    },
    ouvir(desdeMs, cb, falha) {
      let q = col;
      if (desdeMs > 0) q = col.where("s", ">=", firebase.firestore.Timestamp.fromMillis(desdeMs));
      return q.onSnapshot({ includeMetadataChanges: true }, snap => {
        const docs = [];
        snap.docChanges().forEach(ch => {
          if (ch.type === "removed" || ch.doc.metadata.hasPendingWrites) return;
          const d = ch.doc.data({ serverTimestamps: "estimate" });
          if (d.s && d.s.toMillis) d.s = d.s.toMillis();
          docs.push({ id: ch.doc.id, dados: d });
        });
        cb(docs, { doServidor: !snap.metadata.fromCache });
      }, falha);
    }
  };
}

/* ---------- API pública ---------- */
const MTS = {
  NUCLEO, Motor,
  usuario: null, db: null, auth: null, motor: null,
  _sit: { pendentes: 0, enviando: false, erro: null, online: true, doServidor: false, ultimo: 0 },
  _ouv: [],
  aoMudarSituacao(f) { this._ouv.push(f); f(this._sit) },
  mudou(col) { if (this.motor) this.motor.mudou(col) },
  /* troca o conteúdo mantendo o mesmo objeto: há telas que guardam referência a ST.<chave> */
  emLugar(alvo, novo) {
    if (Array.isArray(alvo) && Array.isArray(novo)) { alvo.length = 0; novo.forEach(x => alvo.push(x)); return alvo }
    if (alvo && novo && typeof alvo === "object" && typeof novo === "object" && !Array.isArray(alvo) && !Array.isArray(novo)) {
      Object.keys(alvo).forEach(k => { if (!(k in novo)) delete alvo[k] }); Object.assign(alvo, novo); return alvo;
    }
    return novo;
  },
  agora() { if (this.motor) this.motor.envia() },

  /* IA central (mesma Cloud Function do _mtauth), por HTTP: dispensa o SDK de functions */
  async chamar(nome, dados) {
    if (!this.usuario) throw new Error("Entre na sua conta MedTech.");
    const tk = await this.usuario.getIdToken();
    const r = await fetch(`https://${REGIAO}-${FB.projectId}.cloudfunctions.net/${nome}`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
      body: JSON.stringify({ data: dados || {} })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error((j.error && j.error.message) || ("Falha " + r.status)); e.code = j.error && j.error.status; throw e }
    return j.result;
  },
  async ai(prompt, model) {
    const r = await this.chamar("gemini", { prompt, model: model || "gemini-2.5-flash", app: CFG && CFG.app });
    return (r && r.text) || "";
  },

  /* Sair: primeiro garante que nada ficou para trás */
  async sair() {
    const s = this.motor ? this.motor.situacao() : { pendentes: 0 };
    if (this.motor) { this.motor.envia(); }
    if (s.pendentes && this.db) {
      const ok = await Promise.race([this.db.waitForPendingWrites().then(() => true).catch(() => false), new Promise(r => setTimeout(() => r(false), 6000))]);
      if (!ok && !confirm(`Há ${s.pendentes} ${s.pendentes === 1 ? "alteração" : "alterações"} deste aparelho que ainda não chegaram à nuvem (sem internet agora). Se sair, elas se perdem. Sair mesmo assim?`)) return;
    }
    if (this.motor) { this.motor.desliga(); this.motor = null }
    try { CFG.limparLocal && await CFG.limparLocal() } catch (e) {}
    try { localStorage.removeItem(CFG.pref + "mts"); localStorage.removeItem(CFG.pref + "mts_uid") } catch (e) {}
    try { await this.auth.signOut() } catch (e) {}
    location.reload();
  },

  async iniciar(cfg) {
    CFG = cfg; injetaCSS();
    if (cfg.cores) {
      /* texto do botão: preto ou branco pelo contraste com a cor do app (no escuro a cor clareia) */
      const lum = c => { const m = String(c).match(/^#([0-9a-f]{6})$/i) || null; let r, g, b;
        if (m) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4), 16) }
        else { const n = String(c).match(/\d+(\.\d+)?/g); if (!n || n.length < 3) return null; [r, g, b] = n.map(Number) }
        const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) };
        return .2126 * f(r) + .7152 * f(g) + .0722 * f(b) };
      /* a cor pode vir como #fff, nome ou var(): o navegador resolve para rgb() num elemento de prova */
      let resolvida = cfg.cores.cor;
      try { const t = document.createElement("i"); t.style.color = cfg.cores.cor; (document.body || H).appendChild(t); resolvida = getComputedStyle(t).color; t.remove() } catch (e) {}
      const L = lum(resolvida); if (L !== null) cfg.cores.sobrecor = L > .35 ? "#111111" : "#ffffff";
      Object.keys(cfg.cores).forEach(k => H.style.setProperty("--mts-" + k, cfg.cores[k]));
    }
    telaEspera();
    try { await carregaSDK(cfg.vendor || "vendor/") }
    catch (e) { return telaAviso(nomeApp(), "Não consegui carregar o módulo da conta. Para abrir pela primeira vez neste aparelho é preciso estar conectado; depois ele abre sem internet.", "Tentar de novo") }
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FB);
    this.auth = firebase.auth(app);
    this.db = firebase.firestore(app);
    try { await this.db.enablePersistence({ synchronizeTabs: true }) } catch (e) { console.warn("mtsync: sem cache persistente do Firestore", e && e.code) }

    let resolvido = false;
    const demora = setTimeout(() => { if (!resolvido) telaEspera("Ainda abrindo sua conta… Se não abrir, verifique a internet.") }, 8000);
    this.auth.onAuthStateChanged(async u => {
      resolvido = true; clearTimeout(demora);
      if (!u) {
        if (this.motor) { this.motor.desliga(); this.motor = null }
        this.usuario = null;
        H.classList.add("mts-trava");
        telaEntrar(this.auth, "entrar", navigator.onLine === false ? "Sem internet. Para entrar pela primeira vez neste aparelho é preciso estar conectado." : "");
        return;
      }
      /* conta diferente da última deste aparelho: o que está aqui é de outra pessoa */
      let ult = null; try { ult = localStorage.getItem(cfg.pref + "mts_uid") } catch (e) {}
      if (ult && ult !== u.uid) {
        telaEspera("Trocando de conta…");
        try { cfg.limparLocal && await cfg.limparLocal() } catch (e) {}
        try { localStorage.removeItem(cfg.pref + "mts"); localStorage.setItem(cfg.pref + "mts_uid", u.uid) } catch (e) {}
        return location.reload();
      }
      try { localStorage.setItem(cfg.pref + "mts_uid", u.uid) } catch (e) {}
      this.usuario = u;
      if (cfg.verificarAcesso) { try { const ok = await cfg.verificarAcesso(u); if (ok === false) return } catch (e) {} }
      tiraPortao();
      this.iniciaMotor(u);
      try { cfg.aoEntrar && cfg.aoEntrar(u) } catch (e) { console.warn(e) }
    });
  },

  async iniciaMotor(u) {
    const cfg = CFG, self = this, chave = cfg.pref + "mts";
    const leE = () => { try { const e = JSON.parse(localStorage.getItem(chave)); return e && e.uid === u.uid ? e : { uid: u.uid } } catch (e) { return { uid: u.uid } } };
    /* formato antigo: mescla uma vez por conta ANTES de o motor fotografar o estado, para a
       contagem antiga entrar como legado e não como estudo novo deste aparelho */
    let E0 = leE(), legOk = !!E0.legado;
    if (cfg.legado && !legOk) {
      try { legOk = (await cfg.legado({ uid: u.uid, db: this.db, firebase, depois: !!E0.inicio })) !== false }
      catch (e) { console.warn("mtsync: formato antigo não lido agora (tento na próxima abertura)", e && e.message) }
      if (legOk) { E0 = leE(); E0.legado = Date.now(); try { localStorage.setItem(chave, JSON.stringify(E0)) } catch (e) {} }
    }
    const T = transporte(this.db, u.uid, cfg.app);
    this.motor = Motor(cfg, T, {
      ler: c => cfg.ler(c),
      gravar: (c, v) => cfg.gravar(c, v),
      aoReceber: cols => cfg.aoReceber && cfg.aoReceber(cols),
      estadoLer: leE,
      estadoGravar: e => { try { e.uid = u.uid; localStorage.setItem(chave, JSON.stringify(e)) } catch (x) {} }
    });
    this.motor.aoMudarSituacao(s => { self._sit = s; self._ouv.forEach(f => { try { f(s) } catch (e) {} }) });
    this.motor.liga();
    const vai = () => { if (this.motor) this.motor.envia() };
    const repinta = () => { if (this.motor) { self._sit = this.motor.situacao(); self._ouv.forEach(f => { try { f(self._sit) } catch (e) {} }) } };
    addEventListener("online", () => { vai(); repinta() });
    addEventListener("offline", repinta);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") vai() });
    addEventListener("pagehide", vai);
  },

  /* texto curto para Ajustes */
  descreve(s) {
    s = s || this._sit;
    if (s.erro) return { cl: "erro", txt: s.erro };
    if (s.pendentes && !s.online) return { cl: "pend", txt: `Sem internet: ${s.pendentes} ${s.pendentes === 1 ? "alteração guardada" : "alterações guardadas"} neste aparelho. Sobem sozinhas quando a conexão voltar.` };
    if (s.pendentes || s.enviando) return { cl: "pend", txt: "Enviando para a nuvem…" };
    return { cl: "ok", txt: "Tudo salvo na sua conta." };
  }
};
G.MTS = MTS;
})(typeof window !== "undefined" ? window : globalThis);
