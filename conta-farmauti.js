/* conta-farmauti.js — liga o mtsync.js (cópia sem mudança de ~/Documents/Claude/_mtsync/) ao FarmaUTI.
   10/10/2026: o FarmaUTI passou a ser vendido no MedTech (produto "farmauti", linha provas). O app só abre
   logado, cada gravação sobe sozinha para users/{uid}/apps/farmauti/sync e o que chega de outro aparelho
   entra em tempo real. Mesmo desenho do conta-estudo.js (TráfegoTítulo), com as chaves do FarmaUTI.

   Ordem no index.html: mtsync.js no <head> (portão antes do primeiro pixel), app.js, /_mtacesso.js e
   este arquivo no fim do <body>. O motor só começa depois do evento "fu-pronto" do app (estado local
   carregado, inclusive o que veio do espelho IndexedDB). Ganchos do app em window.__fu.

   REGRA DO DONO (10/10/2026): o progresso que já está no aparelho NUNCA é apagado por causa da conta.
   - Primeiro login do aparelho: antes de o motor começar, cópia crua de todas as chaves fu_* (e do espelho
     IndexedDB) vai para o IndexedDB "farmauti-reserva", chave "antes-da-conta" (só se ainda não existir,
     conferida lendo de volta). Nada no código apaga essa reserva.
   - Sair da conta e troca de conta (o mtsync chama limparLocal): NADA é apagado; só mais uma cópia na
     reserva ("saida-<uid>-<momento>"). Consequência aceita: outra conta que entrar neste aparelho recebe
     esse progresso.
   - Chave que não abriu (JSON corrompido) ou que sumiu do aparelho enquanto a nuvem a tinha: não sobe
     vazia; a base do motor dessa coleção é zerada e a nuvem a devolve. */
(function () {
  "use strict";
  const APP = "farmauti", ACESSO = "farmauti", NOME = "FarmaUTI", PREF = "fu_", IDB = "farmauti";
  const X = () => window.__fu;
  const ST = () => X().ST;

  /* Primeiro login NESTE aparelho: ainda não há conta gravada aqui. Lido antes de o mtsync gravar o uid. */
  let PRIMEIRO = false;
  try { PRIMEIRO = !localStorage.getItem(PREF + "mts_uid") && !localStorage.getItem(PREF + "mts") } catch (e) {}

  /* ---------- reserva imutável (IndexedDB "farmauti-reserva", objeto "r") ---------- */
  const RESERVA = "farmauti-reserva";
  const pede = q => new Promise((ok, falha) => { q.onsuccess = () => ok(q.result); q.onerror = () => falha(q.error) });
  function abreDB(nome, loja) {
    return new Promise((ok, falha) => {
      const q = indexedDB.open(nome, 1);
      q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains(loja)) q.result.createObjectStore(loja) };
      q.onsuccess = () => ok(q.result); q.onerror = () => falha(q.error); q.onblocked = () => falha(new Error("bloqueado"));
    });
  }
  const comTeto = (p, ms) => Promise.race([p, new Promise((_, f) => setTimeout(() => f(new Error("tempo")), ms))]);
  async function leEspelho() {
    try {
      const db = await comTeto(abreDB(IDB, "s"), 2500);
      try { return await comTeto(pede(db.transaction("s").objectStore("s").get("estado")), 2500) } finally { db.close() }
    } catch (e) { return null }
  }
  function textoCru() {
    const o = {};
    try { Object.keys(localStorage).forEach(k => { if (k.startsWith(PREF) || k.startsWith("msn_fila:")) o[k] = localStorage.getItem(k) }) } catch (e) {}
    return o;
  }
  /* grava uma cópia e confere lendo de volta; soSeNova: não toca numa chave que já existe */
  async function reserva(chave, soSeNova) {
    try {
      const txt = JSON.stringify({ app: APP, quando: new Date().toISOString(), chaves: textoCru(), espelho: await leEspelho() });
      const db = await comTeto(abreDB(RESERVA, "r"), 4000);
      try {
        const loja = m => db.transaction("r", m).objectStore("r");
        if (soSeNova && (await pede(loja("readonly").get(chave))) != null) return true;
        await pede(loja("readwrite").put(txt, chave));
        return (await pede(loja("readonly").get(chave))) === txt;
      } finally { db.close() }
    } catch (e) { console.warn("FarmaUTI: reserva não gravada", chave, e && e.message); return false }
  }

  /* Coleções (tipos no cabeçalho do mtsync.js).
     - Progresso grande vai como mapa POR ITEM: dois aparelhos que já tinham progresso se unem item a item no
       primeiro login (a versão da nuvem só vence no MESMO item).
       resp = respostas por questão; srs = cartões; lidas/revs/prog = leituras; tarefas = cronograma;
       casos, presc = casos clínicos e prescrições; notas, fav, sinal = anotações, marcadas e sinalizadas.
     - sims (simulados feitos) é lista com id = ts (momento do fim do simulado), em ordem cronológica.
     - ativ (atividade por dia) é soma: cada aparelho soma as próprias contagens. O valor local é
       {dia: {q, qa, c, cn, min, l, rx, ...}}; o motor vê "dia|campo": número (ler/gravar convertem).
       seg (segundos ainda não convertidos em minuto) e meta (aviso de meta já dado) ficam só no aparelho.
     - cfg (metas, início do cronograma, fonte, nome) é doc: preferência pequena, último vence.
     Fora da sincronização: pos (posição e filtros de tela), recentes (últimas leituras abertas) e tema
     (aparência deste aparelho), além das chaves do próprio motor (fu_mts, fu_mts_uid). */
  const COLECOES = {
    cfg: { tipo: "doc", vazio: {} },
    lidas: { tipo: "mapa" }, prog: { tipo: "mapa" }, notas: { tipo: "mapa" }, resp: { tipo: "mapa" },
    fav: { tipo: "mapa" }, srs: { tipo: "mapa" }, tarefas: { tipo: "mapa" }, casos: { tipo: "mapa" },
    presc: { tipo: "mapa" }, revs: { tipo: "mapa" }, sinal: { tipo: "mapa" },
    sims: { tipo: "lista", id: "ts", ordena: (a, b) => (+a.ts || 0) - (+b.ts || 0) },
    ativ: { tipo: "soma" }
  };
  const ATIV_LOCAL = new Set(["seg", "meta"]);
  const ehObj = v => !!v && typeof v === "object" && !Array.isArray(v);

  function ler(c) {
    const s = ST();
    if (c !== "ativ") return s[c];
    const out = {};
    Object.keys(s.ativ || {}).forEach(dia => {
      const d = s.ativ[dia]; if (!ehObj(d)) return;
      Object.keys(d).forEach(k => { if (!ATIV_LOCAL.has(k) && typeof d[k] === "number" && isFinite(d[k])) out[dia + "|" + k] = d[k] });
    });
    return out;
  }

  /* grava o valor que o motor montou (local + nuvem). Nunca troca a chave por vazio nem por tipo errado. */
  function gravar(c, v) {
    const s = ST(), F = X();
    if (c === "ativ") {
      if (!ehObj(v)) return;
      if (!ehObj(s.ativ)) s.ativ = {};
      Object.keys(v).forEach(k => {
        const i = k.lastIndexOf("|"); if (i < 1) return;
        const dia = k.slice(0, i), campo = k.slice(i + 1), n = +v[k];
        if (!isFinite(n) || ATIV_LOCAL.has(campo)) return;
        if (!ehObj(s.ativ[dia])) s.ativ[dia] = {};
        s.ativ[dia][campo] = n;
      });
      F.salva("ativ");
      return;
    }
    if (c === "cfg") {
      if (!ehObj(v)) return;
      const P = F.PADRAO.cfg, novo = Object.assign(JSON.parse(JSON.stringify(P)), v);
      novo.meta = Object.assign(JSON.parse(JSON.stringify(P.meta)), ehObj(v.meta) ? v.meta : {});
      s.cfg = MTS.emLugar(s.cfg, novo);
      F.salva("cfg");
      return;
    }
    const lista = COLECOES[c].tipo === "lista";
    if (lista ? !Array.isArray(v) : !ehObj(v)) return;
    /* nunca troca o que existe aqui por vazio (regra do dono); exclusões item a item continuam valendo */
    const n = lista ? v.length : Object.keys(v).length, atual = s[c];
    if (!n && atual && (Array.isArray(atual) ? atual.length : Object.keys(atual).length)) return;
    s[c] = MTS.emLugar(s[c], v);
    F.salva(c);
  }

  /* chegou algo de outro aparelho: atualiza só telas de consulta; questão, cartão, simulado ou campo em
     edição não saem do lugar */
  function aoReceber(cols) {
    try {
      const F = X();
      if (cols.includes("cfg")) F.aplicaFonte();
      F.contadores();
      const foco = document.activeElement;
      if (foco && /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName)) return;
      if (F.emSessao || document.querySelector("#camada > *, .msn-pai, #mta")) return;
      const a = F.abaAtual, p = F.paramAtual;
      if (["inicio", "cronograma", "desempenho"].includes(a) || (["leituras", "casos", "prescricoes"].includes(a) && !p)) {
        const y = scrollY; F.rota(); scrollTo(0, y);
      }
    } catch (e) {}
  }

  /* troca de conta ou "Sair da conta" (o mtsync chama isto e depois apaga só fu_mts e fu_mts_uid):
     NADA do progresso é apagado. Guarda uma cópia na reserva e o estado do motor desta conta em
     fu_mtsr:<uid>, para a mesma conta, ao voltar, continuar de onde estava (sem somar de novo as contagens). */
  async function limparLocal() {
    let e = null; try { e = JSON.parse(localStorage.getItem(PREF + "mts")) } catch (x) {}
    const uid = (e && e.uid) || (() => { try { return localStorage.getItem(PREF + "mts_uid") } catch (x) { return null } })() || "sem-conta";
    if (e && e.uid) { try { localStorage.setItem(PREF + "mtsr:" + e.uid, localStorage.getItem(PREF + "mts")) } catch (x) {} }
    await reserva("saida-" + uid + "-" + new Date().toISOString());
  }

  /* Antes de o motor nascer (o mtsync espera esta função). Nunca bloqueia a entrada. */
  async function antesDoMotor(u) {
    if (PRIMEIRO) { const ok = await reserva("antes-da-conta", true); if (!ok) console.warn("FarmaUTI: reserva antes-da-conta não confirmada") }
    try {
      const F = X(), k = PREF + "mts";
      let e = null; try { e = JSON.parse(localStorage.getItem(k)) } catch (x) {}
      if (!e || e.uid !== u.uid) {
        e = null;
        const r = localStorage.getItem(PREF + "mtsr:" + u.uid);
        if (r) { try { e = JSON.parse(r) } catch (x) {} }
        /* sem estado do motor desta conta: as contagens diárias (ativ) que estão aqui nunca subiram para ela;
           entram somadas às da conta (somaIni antes de o motor nascer). Sem isto, o motor as trataria como
           "legado" de sincronização antiga e ficaria com o maior valor entre os aparelhos. Fora quando o
           estado veio do espelho IndexedDB (pode já ter subido antes). */
        if (!e || e.uid !== u.uid) e = F.restaurou ? null : { uid: u.uid, somaIni: 1 };
      }
      if (!e) return;
      /* coleção que não abriu ou que está vazia aqui enquanto a nuvem já a tinha: zera a base dela e manda
         receber tudo de novo (cursor 0). O que estiver aqui ganha carimbo 1 e perde para a nuvem no mesmo item;
         nada sobe como exclusão. */
      const N = MTS.NUCLEO, corr = new Set(F.corrompidas || []);
      Object.keys(COLECOES).forEach(c => {
        const base = (e.base || {})[c] || {};
        const vivos = Object.keys(base).filter(id => base[id] !== N.APAGADO).length;
        const loc = N.itens(COLECOES[c], ler(c));
        if (!(corr.has(c) || (vivos && !Object.keys(loc).length))) return;
        ["base", "bt", "bh"].forEach(p => { if (e[p]) e[p][c] = {} });
        e.ed = e.ed || {}; e.ed[c] = {}; Object.keys(loc).forEach(id => e.ed[c][id] = 1);
        e.cursor = 0;
        console.warn("FarmaUTI: coleção " + c + " vazia ou ilegível aqui; recebo da nuvem sem subir exclusões");
      });
      localStorage.setItem(k, JSON.stringify(e));
    } catch (x) { console.warn("FarmaUTI: preparo do motor", x && x.message) }
  }

  /* ---------- cartão Conta em Ajustes ---------- */
  const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* verde/vermelho do app puxados para a cor do texto: o --ok puro dava 3,2:1 no branco */
  const corSit = cl => cl === "erro" ? "color-mix(in srgb,var(--err) 70%,var(--ink))" : cl === "pend" ? "var(--ink2)" : "color-mix(in srgb,var(--ok) 65%,var(--ink))";
  let slot = null;
  function pinta() {
    if (!slot || !document.body.contains(slot)) return;
    const u = window.MTS && MTS.usuario;
    if (!u) { slot.innerHTML = `<h3><i class="ti ti-user-circle" aria-hidden="true"></i>Conta</h3><p class="sub" style="margin-top:-4px">Abrindo sua conta…</p>`; return }
    const d = MTS.descreve();
    slot.innerHTML = `<h3><i class="ti ti-user-circle" aria-hidden="true"></i>Conta</h3>
      <p class="sub" style="margin-top:-4px">Conectado como <b>${esc(u.displayName || u.email || "")}</b>${u.displayName && u.email ? ` (${esc(u.email)})` : ""}.</p>
      <p class="sub" id="contaSit" role="status" style="margin-top:6px;font-weight:600;color:${corSit(d.cl)}">${esc(d.txt)}</p>
      <p class="sub" style="margin-top:6px">O que você faz no app é salvo sozinho na sua conta e aparece igual no celular e no computador. Sem internet, o app continua funcionando e envia depois.</p>
      <div class="linhaBt"><button class="bt sec" id="contaSair" type="button"><i class="ti ti-logout" aria-hidden="true"></i>Sair da conta</button></div>`;
    slot.querySelector("#contaSair").onclick = () => { if (confirm("Sair da conta? O FarmaUTI pede login, então a tela de entrada volta. Seu progresso fica salvo na conta e neste aparelho.")) MTS.sair() };
  }

  window.FUCONTA = {
    aoSalvar(k) { if (COLECOES[k] && window.MTS) MTS.mudou(k) },
    renderCartao(el) { slot = el; pinta() },
    COLECOES
  };

  function inicia() {
    const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
    const t = document.documentElement.dataset.tema;
    const escuro = t === "escuro" || (!t && matchMedia("(prefers-color-scheme: dark)").matches);
    MTS.aoMudarSituacao(s => { const el = document.getElementById("contaSit"); if (el) { const d = MTS.descreve(s); el.textContent = d.txt; el.style.color = corSit(d.cl) } });
    MTS.iniciar({
      app: APP, nome: NOME, pref: PREF, vendor: "/vendor/firebase/",
      /* índigo do app: #5B5BF0 dá 5,0:1 com o texto branco do botão e 4,6:1 sobre o papel; no escuro,
         #9C9CF8 com texto preto (7,7:1) e 7,7:1 sobre o fundo. O mtsync escolhe a cor do texto do botão. */
      cores: { cor: escuro ? "#9C9CF8" : "#5B5BF0", fundo: g("--papel") || (escuro ? "#0D1017" : "#F5F6FB"), texto: g("--ink") || (escuro ? "#EDF0F7" : "#141827"),
        suave: g("--ink2") || (escuro ? "#A3ABBE" : "#5D6579"), borda: g("--linhaF") || (escuro ? "#343D51" : "#D3D8E5"), campo: g("--sup") || (escuro ? "#161B26" : "#fff"),
        erro: escuro ? "#FF9B9B" : "#B42318", ok: escuro ? "#5EE6A8" : "#067647" },
      colecoes: COLECOES,
      ler, gravar, aoReceber, limparLocal,
      async verificarAcesso(u) { await antesDoMotor(u); return true },
      aoEntrar(u) {
        if (window.MTAcesso) MTAcesso.verificar({ appId: ACESSO, user: u, signOut: () => MTS.sair() }).catch(() => {});
        pinta();
      }
    });
  }
  if (window.__fuPronto) inicia(); else window.addEventListener("fu-pronto", inicia, { once: true });
})();
