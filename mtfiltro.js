/* mtfiltro.js — seletor de VÁRIOS temas para os apps de estudo MedTech (25/09/2026).
   Fonte única: ~/Documents/Claude/_mtfiltro/ (README lá). Mexeu? Teste em teste.html e copie para os apps.

   Uso:
     const ctl = MTTemas.monta(elemento, {
       opcoes: [{id, nome, grupo?, n?}],   // n = nº de questões do tema (mostrado ao lado)
       selecionados: ["aptidao", ...],     // [] = todos
       rotuloTodos: "Todos os temas",
       titulo: "Temas",                     // título do painel
       conta: ids => numero,                // opcional: quantas questões o conjunto dá (botão "Mostrar N")
       unidade: ["questão","questões"],    // opcional
       aoMudar: ids => {...}                // chamado ao confirmar; [] = todos
     });
     ctl.valor()  → ids atuais;  ctl.define(ids)  → troca sem disparar aoMudar.

   O elemento vira um botão-resumo ("Todos os temas", "Álcool e direção", "3 temas"). Clicar abre um painel
   (popover no computador, folha de baixo no celular) com busca, grupos, marcar/desmarcar grupo inteiro,
   "Todos" e o botão de confirmar. Esc ou toque fora cancela. Cores vêm do app via --mtt-* (com recuo para
   os tokens comuns --ac/--brand, --sup/--card, --ink/--tinta, --fio/--line). */
(function () {
  "use strict";
  if (window.MTTemas) return;

  const ESTILO = `
.mtt-btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;max-width:100%;padding:0 14px;border-radius:var(--mtt-raio-btn,12px);
  border:1px solid var(--mtt-fio);background:var(--mtt-sup);color:var(--mtt-tinta);font:inherit;font-size:.95em;cursor:pointer;text-align:left}
.mtt-btn:hover{border-color:var(--mtt-ac)}
.mtt-btn:focus-visible{outline:3px solid var(--mtt-ac);outline-offset:2px}
.mtt-btn .mtt-rot{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.mtt-btn .mtt-qtd{flex:none;min-width:22px;height:22px;padding:0 7px;border-radius:11px;background:var(--mtt-ac);color:var(--mtt-sobreac);
  font-size:.8em;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.mtt-btn svg{flex:none;width:16px;height:16px;opacity:.7}
.mtt-btn.mtt-ativo{border-color:var(--mtt-ac);box-shadow:0 0 0 1px var(--mtt-ac) inset}
.mtt-fundo{position:fixed;inset:0;z-index:100000;background:rgba(10,12,20,.38)}
.mtt-pai{box-sizing:border-box;position:fixed;z-index:100001;display:flex;flex-direction:column;background:var(--mtt-sup);color:var(--mtt-tinta);
  border:1px solid var(--mtt-fio);border-radius:var(--mtt-raio,18px);box-shadow:0 18px 50px rgba(0,0,0,.28);
  width:min(440px,calc(100vw - 24px));max-height:min(620px,calc(100vh - 40px));overflow:hidden;font-size:15px}
.mtt-cab{display:flex;align-items:center;gap:8px;padding:14px 14px 8px}
.mtt-cab h3{margin:0;font-size:1.05em;font-weight:700;flex:1}
.mtt-x{width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:inherit;cursor:pointer;font-size:22px;line-height:1}
.mtt-x:hover{background:var(--mtt-suave)}
.mtt-busca{margin:0 14px 8px;min-height:42px;padding:0 12px;border:1px solid var(--mtt-fio);border-radius:10px;background:var(--mtt-fundoin);
  color:inherit;font:inherit;width:auto}
.mtt-busca:focus{outline:2px solid var(--mtt-ac);outline-offset:1px}
.mtt-atal{display:flex;gap:8px;padding:0 14px 8px;flex-wrap:wrap}
.mtt-atal button{min-height:36px;padding:0 12px;border-radius:18px;border:1px solid var(--mtt-fio);background:transparent;color:inherit;font:inherit;font-size:.88em;cursor:pointer}
.mtt-atal button:hover{border-color:var(--mtt-ac)}
.mtt-lista{overflow:auto;padding:2px 6px 8px;flex:1;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.mtt-grupo{display:flex;align-items:center;gap:8px;margin:10px 8px 2px;font-size:.78em;font-weight:700;letter-spacing:.02em;opacity:.75}
.mtt-grupo button{margin-left:auto;border:0;background:transparent;color:inherit;font:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px;cursor:pointer;padding:6px 6px;border-radius:6px}
.mtt-op{display:flex;align-items:center;gap:12px;min-height:44px;padding:4px 8px;border-radius:10px;cursor:pointer;line-height:1.25}
.mtt-op:hover{background:var(--mtt-suave)}
.mtt-op input{width:20px;height:20px;flex:none;accent-color:var(--mtt-ac);margin:0;cursor:pointer}
.mtt-op .mtt-nm{flex:1;min-width:0}
.mtt-op .mtt-n{flex:none;font-size:.82em;opacity:.65;font-variant-numeric:tabular-nums}
.mtt-vazio{padding:18px;text-align:center;opacity:.7}
.mtt-pe{display:flex;gap:10px;align-items:center;padding:10px 14px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--mtt-fio)}
.mtt-pe .mtt-info{flex:1;font-size:.85em;opacity:.8}
.mtt-ok{min-height:44px;padding:0 18px;border:0;border-radius:12px;background:var(--mtt-ac);color:var(--mtt-sobreac);font:inherit;font-weight:700;cursor:pointer}
.mtt-ok:disabled{opacity:.45;cursor:not-allowed}
@media (max-width:640px){
  .mtt-pai{left:0!important;right:0;bottom:0;top:auto!important;width:100%;max-height:82vh;border-radius:var(--mtt-raio,18px) var(--mtt-raio,18px) 0 0;border-bottom:0}
}
@media (prefers-reduced-motion:no-preference){.mtt-pai{animation:mtt-entra .16s ease-out}}
@keyframes mtt-entra{from{opacity:0;translate:0 8px}to{opacity:1;translate:0 0}}
`;
  /* tokens com recuo: cada app pode definir --mtt-* no :root; senão usa os nomes comuns do ecossistema */
  /* as variáveis ficam no PRÓPRIO botão/painel (não no :root): assim --ac definido por aba, no body ou na seção,
     é o que vale — no :root ele ainda não existe */
  const VARS = `.mtt-btn,.mtt-pai{
  --mtt-ac:var(--mtt-cor,var(--ac,var(--brand,var(--primary,#2563eb))));
  --mtt-sobreac:var(--mtt-sobre,var(--acOn,var(--acSobre,var(--onBrand,var(--mtt-sobreauto,#fff)))));
  --mtt-sup:var(--mtt-superficie,var(--sup,var(--pan,var(--card,var(--surface,#fff)))));
  --mtt-tinta:var(--mtt-texto,var(--ink,var(--tinta,var(--text,#16181d))));
  --mtt-fio:var(--mtt-borda,var(--fio,var(--line,var(--border,rgba(0,0,0,.16)))));
  --mtt-suave:var(--mtt-realce,rgba(127,127,127,.12));
  --mtt-fundoin:var(--mtt-campo,transparent);}`;

  function injetaCss() {
    if (document.getElementById("mtt-css")) return;
    const s = document.createElement("style");
    s.id = "mtt-css";
    /* entra no começo do <head> para o CSS do app poder sobrescrever */
    s.textContent = VARS + ESTILO;
    document.head.insertBefore(s, document.head.firstChild);
  }
  const esc = t => String(t).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const norm = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  /* texto sobre a cor do app: preto ou branco pelo contraste (só vale se o app não definiu --mtt-sobre) */
  function sobreAuto(el) {
    try {
      const n = (getComputedStyle(el).getPropertyValue("--mtt-ac") && (() => {
        const t = document.createElement("i"); t.style.cssText = "position:absolute;visibility:hidden;color:var(--mtt-ac)";
        el.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; })() || "").match(/[\d.]+/g);
      if (!n || n.length < 3) return;
      const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) };
      const L = .2126 * f(+n[0]) + .7152 * f(+n[1]) + .0722 * f(+n[2]);
      el.style.setProperty("--mtt-sobreauto", (L + .05) / .05 > 1.05 / (L + .05) ? "#111111" : "#ffffff");
    } catch (e) {}
  }


  function monta(alvo, cfg) {
    injetaCss();
    const opcoes = (cfg.opcoes || []).filter(o => o && o.id != null);
    const validos = new Set(opcoes.map(o => String(o.id)));
    const ordem = new Map(opcoes.map((o, i) => [String(o.id), i]));
    /* sempre na ordem das opções (a do edital), não na ordem dos cliques */
    const limpa = ids => [...new Set((ids || []).map(String))].filter(id => validos.has(id)).sort((a, b) => ordem.get(a) - ordem.get(b));
    let sel = limpa(cfg.selecionados);
    if (sel.length === opcoes.length) sel = [];
    const rotuloTodos = cfg.rotuloTodos || "Todos os temas";
    const [uni1, uniN] = cfg.unidade || ["questão", "questões"];
    const [item1, itemN] = cfg.item || ["tema", "temas"];   /* ex.: ["área","áreas"] */
    const verbo = cfg.verbo || "Mostrar";                     /* ex.: "Usar" no simulado */
    const nomeDe = new Map(opcoes.map(o => [String(o.id), o.nome]));

    let btn = alvo;
    if (alvo.tagName !== "BUTTON") {
      btn = document.createElement("button");
      if (alvo.id) btn.id = alvo.id;
      alvo.replaceWith(btn);
    }
    btn.type = "button";
    btn.classList.add("mtt-btn");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");

    function resumo() {
      if (!sel.length) return {txt: rotuloTodos, qtd: 0};
      if (sel.length === 1) return {txt: nomeDe.get(sel[0]), qtd: 0};
      return {txt: sel.length + " " + itemN, qtd: 0};  /* os nomes vão no title e no aria-label */
    }
    function pintaBotao() {
      const r = resumo();
      btn.innerHTML = `<span class="mtt-rot">${esc(r.txt)}</span>${r.qtd ? `<span class="mtt-qtd" aria-hidden="true">${r.qtd}</span>` : ""}${SETA}`;
      btn.classList.toggle("mtt-ativo", sel.length > 0);
      btn.title = sel.length > 1 ? sel.map(id => nomeDe.get(id)).join(" · ") : r.txt;
      btn.setAttribute("aria-label", (cfg.titulo || "Temas") + ": " + (sel.length > 1 ? sel.map(id => nomeDe.get(id)).join(", ") : r.txt));
    }

    let aberto = null;
    function fecha(confirmar) {
      if (!aberto) return;
      const {fundo, pai, rascunho, onKey, onResize} = aberto;
      document.removeEventListener("keydown", onKey, true);
      removeEventListener("resize", onResize);
      fundo.remove(); pai.remove();
      aberto = null;
      btn.setAttribute("aria-expanded", "false");
      btn.focus({preventScroll: true});
      if (confirmar) {
        let novo = limpa([...rascunho]);
        if (novo.length === opcoes.length) novo = [];
        const mudou = novo.length !== sel.length || novo.some(id => !sel.includes(id));
        sel = novo; pintaBotao();
        if (mudou && cfg.aoMudar) cfg.aoMudar(sel.slice());
      }
    }

    function abre() {
      if (aberto) return;
      const rascunho = new Set(sel);
      const fundo = document.createElement("div");
      fundo.className = "mtt-fundo";
      const pai = document.createElement("div");
      pai.className = "mtt-pai";
      pai.setAttribute("role", "dialog");
      pai.setAttribute("aria-modal", "true");
      pai.setAttribute("aria-label", cfg.titulo || "Temas");
      const temBusca = opcoes.length > 10;
      pai.innerHTML = `
        <div class="mtt-cab"><h3>${esc(cfg.titulo || "Temas")}</h3><button type="button" class="mtt-x" aria-label="Fechar sem aplicar">×</button></div>
        ${temBusca ? `<input class="mtt-busca" type="search" placeholder="Buscar ${esc(item1)}" aria-label="Buscar ${esc(item1)}" autocomplete="off">` : ""}
        <div class="mtt-atal"><button type="button" data-a="todos">Todos</button><button type="button" data-a="nenhum">Limpar</button></div>
        <div class="mtt-lista" role="group" aria-label="${esc(cfg.titulo || "Temas")}"></div>
        <div class="mtt-pe"><span class="mtt-info" aria-live="polite"></span><button type="button" class="mtt-ok">Aplicar</button></div>`;
      document.body.append(fundo, pai);
      /* o painel mora no <body>: herda a cor que o BOTÃO tem (a da aba/seção onde ele está) */
      const corBtn = getComputedStyle(btn).getPropertyValue("--mtt-ac").trim();
      if (corBtn) pai.style.setProperty("--mtt-cor", corBtn);
      sobreAuto(pai);
      const lista = pai.querySelector(".mtt-lista"), info = pai.querySelector(".mtt-info"), ok = pai.querySelector(".mtt-ok");
      const busca = pai.querySelector(".mtt-busca");
      let termo = "";

      function desenha() {
        const vis = opcoes.filter(o => !termo || norm(o.nome).includes(termo) || norm(o.grupo || "").includes(termo));
        if (!vis.length) { lista.innerHTML = `<div class="mtt-vazio">Nada encontrado para “${esc(termo)}”.</div>`; return; }
        const grupos = [];
        vis.forEach(o => { const g = o.grupo || ""; let G = grupos.find(x => x.g === g); if (!G) grupos.push(G = {g, os: []}); G.os.push(o); });
        const mostraGrupo = grupos.length > 1 || (grupos[0] && grupos[0].g);
        lista.innerHTML = grupos.map((G, gi) => {
          const todosG = G.os.every(o => rascunho.has(String(o.id)));
          return `${mostraGrupo && G.g ? `<div class="mtt-grupo"><span>${esc(G.g)}</span><button type="button" data-g="${gi}">${todosG ? "desmarcar" : "marcar"} grupo</button></div>` : ""}` +
            G.os.map(o => `<label class="mtt-op"><input type="checkbox" value="${esc(o.id)}" ${rascunho.has(String(o.id)) ? "checked" : ""}>
              <span class="mtt-nm">${esc(o.nome)}</span>${o.n != null ? `<span class="mtt-n">${o.n}</span>` : ""}</label>`).join("");
        }).join("");
        lista.querySelectorAll("[data-g]").forEach(b => b.onclick = () => {
          const G = grupos[+b.dataset.g]; const todosG = G.os.every(o => rascunho.has(String(o.id)));
          G.os.forEach(o => todosG ? rascunho.delete(String(o.id)) : rascunho.add(String(o.id)));
          desenha(); rodape();
        });
      }
      function rodape() {
        const ids = [...rascunho];
        const efetivo = ids.length ? ids : opcoes.map(o => String(o.id));
        const n = cfg.conta ? cfg.conta(ids.length ? ids : []) : efetivo.reduce((s, id) => s + (+(opcoes.find(o => String(o.id) === id) || {}).n || 0), 0);
        const temN = cfg.conta || opcoes.some(o => o.n != null);
        info.textContent = (ids.length ? (ids.length === 1 ? "1 " + item1 : ids.length + " " + itemN) : rotuloTodos) + (temN ? ` · ${n} ${n === 1 ? uni1 : uniN}` : "");
        ok.textContent = temN ? `${verbo} ${n} ${n === 1 ? uni1 : uniN}` : "Aplicar";
        ok.disabled = temN && n === 0;
      }
      lista.addEventListener("change", e => {
        const c = e.target; if (c.type !== "checkbox") return;
        c.checked ? rascunho.add(c.value) : rascunho.delete(c.value);
        desenha(); rodape();
        const again = lista.querySelector(`input[value="${CSS.escape ? CSS.escape(c.value) : c.value}"]`); if (again) again.focus();
      });
      pai.querySelector('[data-a="todos"]').onclick = () => { opcoes.forEach(o => rascunho.add(String(o.id))); desenha(); rodape(); };
      pai.querySelector('[data-a="nenhum"]').onclick = () => { rascunho.clear(); desenha(); rodape(); };
      pai.querySelector(".mtt-x").onclick = () => fecha(false);
      fundo.onclick = () => fecha(false);
      ok.onclick = () => fecha(true);
      if (busca) busca.oninput = () => { termo = norm(busca.value.trim()); desenha(); };

      function posiciona() {
        if (innerWidth <= 640) { pai.style.left = ""; pai.style.top = ""; return; }
        const r = btn.getBoundingClientRect(), w = pai.offsetWidth, h = pai.offsetHeight;
        let left = Math.min(Math.max(12, r.left), innerWidth - w - 12);
        let top = r.bottom + 6;
        if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 6);
        if (top + h > innerHeight - 12) top = Math.max(12, innerHeight - h - 12);
        pai.style.left = left + "px"; pai.style.top = top + "px";
      }
      const onKey = e => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fecha(false); return; }
        if (e.key === "Tab") { /* prende o foco no painel */
          const f = [...pai.querySelectorAll("button,input")].filter(x => !x.disabled && x.offsetParent !== null);
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
        /* não deixa atalhos do app (A–E, setas, Enter) agirem com o painel aberto */
        e.stopPropagation();
      };
      const onResize = () => posiciona();
      document.addEventListener("keydown", onKey, true);
      addEventListener("resize", onResize);
      aberto = {fundo, pai, rascunho, onKey, onResize};
      btn.setAttribute("aria-expanded", "true");
      desenha(); rodape(); posiciona();
      (busca && innerWidth > 640 ? busca : (lista.querySelector("input") || ok)).focus({preventScroll: true});
    }

    btn.addEventListener("click", abre);
    pintaBotao();
    sobreAuto(btn);
    return {
      botao: btn,
      valor: () => sel.slice(),
      define: ids => { sel = limpa(ids); if (sel.length === opcoes.length) sel = []; pintaBotao(); },
      abre, fecha: () => fecha(false)
    };
  }

  /* ajuda comum: normaliza o que o app gravou (string antiga "tema" ou lista nova) */
  function lista(v) {
    if (Array.isArray(v)) return v.filter(x => x != null && x !== "").map(String);
    if (v == null || v === "") return [];
    return [String(v)];
  }

  window.MTTemas = {monta, lista, versao: 1};
})();
