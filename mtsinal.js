/* mtsinal.js — sinalizar questão com erro, nos apps de estudo MedTech (26/09/2026).
   Fonte única: ~/Documents/Claude/_mtsinal/ (README lá). Mexeu? Teste no teste.html e copie para os apps.

   O app guarda os dados (no armazenamento dele, que já sincroniza); o componente só desenha e edita.

   const S = MTSinal.cria({
     app: "TráfegoTítulo",
     le: () => objeto,                 // {chave: {tipo, nota, ts, q, tema, resolvido?}}
     grava: obj => {...},              // grava o objeto inteiro
     exemplo: "Ex.: …",                // opcional: texto de exemplo no campo "Detalhe"
     gravaItem: (chave, itemOuNull),   // opcional: grava só um item (para sincronizar item a item)
     central: {app: "trafego-titulo",  // opcional: também envia à CAIXA CENTRAL da administração (função mtSinal)
               token: () => idToken}   //   (apps sem conta MedTech: sem token; o aparelho ganha um id aleatório)
   });
   S.botao(elemento, {chave, q, tema, extra})  → transforma o elemento num botão-bandeira da questão
   S.abre({chave, q, tema, extra})              → abre o formulário
   S.lista(container, {abreQuestao: chave => {...}, titulo})  → desenha a lista com "Copiar relatório"
   S.tem(chave) / S.total()
   `q` = enunciado (guarda-se só o começo, para localizar a questão); `extra` = texto livre curto (ex.: "Leva 12, Q4",
   gabarito marcado, fonte) que entra no relatório. */
(function () {
  "use strict";
  if (window.MTSinal) return;

  const TIPOS = [
    ["gabarito", "Gabarito errado"],
    ["texto", "Erro no enunciado ou nas alternativas"],
    ["desatualizada", "Desatualizada (norma ou diretriz mudou)"],
    ["comentario", "Erro no comentário ou na explicação"],
    ["outro", "Outro problema"]
  ];
  const NOME_TIPO = Object.fromEntries(TIPOS);

  const ESTILO = `
.msn-btn,.msn-pai,.msn-lista{
  --msn-ac:var(--msn-cor,var(--ac,var(--brand,var(--primary,#2563eb))));
  --msn-sup:var(--msn-superficie,var(--sup,var(--pan,var(--card,var(--surface,#fff)))));
  --msn-tinta:var(--msn-texto,var(--ink,var(--tinta,var(--text,#16181d))));
  --msn-fio:var(--msn-borda,var(--fio,var(--line,var(--border,rgba(0,0,0,.16)))));
  --msn-alerta:var(--msn-cor-alerta,var(--err,var(--erro,var(--danger,#c0261f))));
  --msn-sobreac:var(--msn-sobre,var(--acOn,var(--onBrand,var(--msn-sobreauto,#fff))));}
.msn-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:36px;min-height:36px;padding:0 8px;border:1px solid transparent;
  border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:.85em;cursor:pointer;opacity:.8}
.msn-btn:hover{opacity:1;border-color:var(--msn-fio)}
.msn-btn:focus-visible{outline:3px solid var(--msn-ac);outline-offset:2px}
.msn-btn svg{width:18px;height:18px;flex:none}
.msn-btn.msn-on{color:var(--msn-alerta);opacity:1}
.msn-btn.msn-on svg path{fill:currentColor}
.msn-fundo{position:fixed;inset:0;z-index:100000;background:rgba(10,12,20,.38)}
.msn-pai{box-sizing:border-box;position:fixed;z-index:100001;left:50%;top:50%;translate:-50% -50%;width:min(480px,calc(100vw - 24px));
  max-height:calc(100vh - 32px);overflow:auto;background:var(--msn-sup);color:var(--msn-tinta);border:1px solid var(--msn-fio);
  border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28);padding:16px 16px 14px;font-size:15px;line-height:1.4}
.msn-pai h3{margin:0 0 4px;font-size:1.08em;font-weight:700}
.msn-pai .msn-q{margin:0 0 12px;font-size:.86em;opacity:.78;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.msn-pai fieldset{border:0;margin:0 0 10px;padding:0}
.msn-pai legend{font-weight:600;font-size:.9em;margin-bottom:6px;padding:0}
.msn-op{display:flex;align-items:center;gap:10px;min-height:42px;padding:2px 8px;border-radius:10px;cursor:pointer}
.msn-op:hover{background:rgba(127,127,127,.12)}
.msn-op input{width:19px;height:19px;margin:0;flex:none;accent-color:var(--msn-ac)}
.msn-pai label.msn-rot{display:block;font-weight:600;font-size:.9em;margin:4px 0 6px}
.msn-pai textarea{box-sizing:border-box;width:100%;min-height:84px;padding:10px 12px;border:1px solid var(--msn-fio);border-radius:12px;
  background:transparent;color:inherit;font:inherit;font-size:.95em;resize:vertical}
.msn-pai textarea:focus{outline:2px solid var(--msn-ac);outline-offset:1px}
.msn-pe{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:12px}
.msn-pe button,.msn-lista button{min-height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--msn-fio);background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.msn-pe .msn-ok,.msn-lista .msn-ok{background:var(--msn-ac);border-color:var(--msn-ac);color:var(--msn-sobreac)}
.msn-pe .msn-tira{margin-right:auto;color:var(--msn-alerta);border-color:transparent;padding:0 8px}
.msn-pe .msn-ok:disabled{opacity:.45;cursor:not-allowed}
.msn-aviso{font-size:.8em;opacity:.75;margin:8px 0 0}
.msn-lista{color:var(--msn-tinta)}
.msn-lista .msn-cab{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.msn-lista .msn-cab .msn-cont{flex:1;min-width:160px;font-size:.9em;opacity:.8}
.msn-item{border:1px solid var(--msn-fio);border-radius:14px;padding:10px 12px;margin-bottom:8px;background:var(--msn-sup)}
.msn-item .msn-tipo{font-size:.78em;font-weight:700;color:var(--msn-alerta);text-transform:none}
.msn-item .msn-txt{margin:3px 0;font-size:.92em}
.msn-item .msn-nota{margin:4px 0 0;font-size:.88em;opacity:.85;white-space:pre-wrap}
.msn-item .msn-meta{font-size:.76em;opacity:.65;margin-top:4px}
.msn-item .msn-acoes{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.msn-item .msn-acoes button{min-height:36px;padding:0 12px;font-size:.85em}
.msn-vazio{opacity:.7;font-size:.92em;padding:6px 0}
.msn-copia{box-sizing:border-box;width:100%;min-height:160px;margin-top:8px;font:inherit;font-size:.8em;padding:8px;border-radius:10px;border:1px solid var(--msn-fio);background:transparent;color:inherit}
@media (max-width:640px){.msn-pai{left:0;right:0;top:auto;bottom:0;translate:none;width:100%;border-radius:18px 18px 0 0;padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))}}
`;
  function injetaCss() {
    if (document.getElementById("msn-css")) return;
    const s = document.createElement("style");
    s.id = "msn-css"; s.textContent = ESTILO;
    document.head.insertBefore(s, document.head.firstChild);
  }
  const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const BANDEIRA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5"/></svg>';
  const trecho = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  const data = ts => { try { return new Date(ts).toLocaleDateString("pt-BR"); } catch (e) { return ""; } };

  /* teclado: mesmo esquema do mtfiltro — ouvinte registrado na carga, no window, na captura */
  let teclaAtiva = null;
  addEventListener("keydown", e => { if (teclaAtiva) teclaAtiva(e); }, true);

  function sobreAuto(el) {
    try {
      const t = document.createElement("i"); t.style.cssText = "position:absolute;visibility:hidden;color:var(--msn-ac)";
      el.appendChild(t); const n = (getComputedStyle(t).color.match(/[\d.]+/g) || []).map(Number); t.remove();
      if (n.length < 3) return;
      const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) };
      const L = .2126 * f(n[0]) + .7152 * f(n[1]) + .0722 * f(n[2]);
      el.style.setProperty("--msn-sobreauto", (L + .05) / .05 > 1.05 / (L + .05) ? "#111111" : "#ffffff");
    } catch (e) {}
  }

  /* ---------- caixa central (função mtSinal no medtech-c658c) ----------
     Cada mudança entra numa fila no aparelho (localStorage) e sai quando der: agora, ao abrir o app e ao voltar a
     internet. Na fila vale só a ÚLTIMA ação por questão, então sinalizar e tirar offline não envia nada. */
  const URL_CENTRAL = "https://southamerica-east1-medtech-c658c.cloudfunctions.net/mtSinal";
  function central(c) {
    if (!c || !c.app) return null;
    const KF = "msn_fila:" + c.app, KD = "msn_dispositivo";
    const leFila = () => { try { return JSON.parse(localStorage.getItem(KF)) || {}; } catch (e) { return {}; } };
    const gravaFila = f => { try { localStorage.setItem(KF, JSON.stringify(f)); } catch (e) {} };
    function dispositivo() {
      let d = ""; try { d = localStorage.getItem(KD) || ""; } catch (e) {}
      if (!/^[A-Za-z0-9_-]{12,64}$/.test(d)) {
        d = "d" + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
        try { localStorage.setItem(KD, d); } catch (e) {}
      }
      return d;
    }
    let rodando = false, deNovo = false;
    async function esvazia() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (rodando) { deNovo = true; return; }          /* entrou algo com a varredura em curso: repete no fim */
      rodando = true; deNovo = false;
      let parouPorFalha = false;
      try {
        const fila = leFila();
        for (const chave of Object.keys(fila)) {
          const item = fila[chave];
          let tok = null; try { tok = c.token ? await c.token() : null; } catch (e) {}
          const r = await fetch(URL_CENTRAL, {
            method: "POST",
            headers: Object.assign({"Content-Type": "application/json"}, tok ? {Authorization: "Bearer " + tok} : {}),
            body: JSON.stringify({data: Object.assign({app: c.app, chave, dispositivo: dispositivo()}, item)})
          }).catch(() => null);
          if (!r) { parouPorFalha = true; break; }          /* sem rede: tenta depois */
          const j = await r.json().catch(() => ({}));
          const st = j && j.error && j.error.status;
          /* sucesso, ou recusa definitiva (dado inválido): sai da fila. Sem login/limite/servidor fora: fica */
          if (r.ok || st === "INVALID_ARGUMENT" || st === "NOT_FOUND") {
            const f = leFila(); if (JSON.stringify(f[chave]) === JSON.stringify(item)) { delete f[chave]; gravaFila(f); }
          } else if (st === "UNAUTHENTICATED" || st === "RESOURCE_EXHAUSTED" || r.status >= 500 || r.status === 404) { parouPorFalha = true; break; }
        }
      } finally {
        rodando = false;
        if (deNovo && !parouPorFalha) setTimeout(esvazia, 0);
      }
    }
    function poe(chave, item) {
      const f = leFila();
      f[chave] = item ? {op: "enviar", tipo: item.tipo, nota: item.nota || "", q: item.q || "", tema: item.tema || "", extra: item.extra || ""}
                      : {op: "remover"};
      gravaFila(f); esvazia();
    }
    addEventListener("online", esvazia);
    setTimeout(esvazia, 4000);                             /* dá tempo de o login do app restaurar a sessão */
    return {poe, esvazia, pendentes: () => Object.keys(leFila()).length};
  }

  function cria(cfg) {
    injetaCss();
    const cx = central(cfg.central);
    const botoes = new Map();   // chave -> Set de botões vivos (para repintar)
    const listas = new Set();
    const le = () => { try { return cfg.le() || {}; } catch (e) { return {}; } };
    function grava(chave, item) {
      const obj = {...le()};
      if (item) obj[chave] = item; else delete obj[chave];
      if (cfg.gravaItem) cfg.gravaItem(chave, item || null); else cfg.grava(obj);
      if (cx) cx.poe(chave, item || null);
      repinta(chave);
    }
    function repinta(chave) {
      const on = !!le()[chave];
      (botoes.get(chave) || new Set()).forEach(b => {
        if (!b.isConnected) { botoes.get(chave).delete(b); return; }
        pintaBotao(b, on);
      });
      listas.forEach(l => l.isConnected ? l.__msnDesenha() : listas.delete(l));
    }
    function pintaBotao(b, on) {
      b.classList.toggle("msn-on", on);
      b.innerHTML = BANDEIRA + (b.dataset.msnRotulo ? `<span>${on ? "Sinalizada" : esc(b.dataset.msnRotulo)}</span>` : "");
      b.title = on ? "Questão sinalizada com erro — clique para ver ou mudar" : "Sinalizar erro nesta questão";
      b.setAttribute("aria-label", b.title);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }

    function abre(info) {
      const atual = le()[info.chave];
      const fundo = document.createElement("div"); fundo.className = "msn-fundo";
      const pai = document.createElement("div"); pai.className = "msn-pai";
      pai.setAttribute("role", "dialog"); pai.setAttribute("aria-modal", "true"); pai.setAttribute("aria-labelledby", "msn-tit");
      pai.innerHTML = `
        <h3 id="msn-tit">${atual ? "Questão sinalizada" : "Sinalizar erro na questão"}</h3>
        <p class="msn-q">${esc(trecho(info.q, 220))}</p>
        <fieldset><legend>O que está errado?</legend>
          ${TIPOS.map(([id, nome]) => `<label class="msn-op"><input type="radio" name="msn-tipo" value="${id}" ${atual && atual.tipo === id ? "checked" : ""}> ${esc(nome)}</label>`).join("")}
        </fieldset>
        <label class="msn-rot" for="msn-nota">Detalhe (opcional)</label>
        <textarea id="msn-nota" maxlength="600" placeholder="${esc(cfg.exemplo || "Ex.: a correta seria a C, porque… (se souber, diga a fonte)")}">${esc(atual ? atual.nota : "")}</textarea>
        <p class="msn-aviso">${cfg.central ? "Vai para a equipe que revisa as questões e fica também na sua lista de sinalizadas." : "Fica guardado na sua lista de questões sinalizadas, para revisão."}</p>
        <div class="msn-pe">
          ${atual ? `<button type="button" class="msn-tira">Tirar sinalização</button>` : ""}
          <button type="button" class="msn-cancela">Cancelar</button>
          <button type="button" class="msn-ok">${atual ? "Salvar" : "Sinalizar"}</button>
        </div>`;
      const volta = document.activeElement;
      document.body.append(fundo, pai);
      const corEl = info.botao || volta;
      if (corEl && corEl.nodeType === 1) { const c = getComputedStyle(corEl).getPropertyValue("--msn-ac").trim() || getComputedStyle(corEl).getPropertyValue("--ac").trim(); if (c) pai.style.setProperty("--msn-cor", c); }
      sobreAuto(pai);
      const ok = pai.querySelector(".msn-ok"), nota = pai.querySelector("textarea");
      const tipoSel = () => (pai.querySelector('input[name="msn-tipo"]:checked') || {}).value;
      const atualiza = () => { ok.disabled = !tipoSel(); };
      pai.addEventListener("change", atualiza); atualiza();
      function fecha() {
        teclaAtiva = null; fundo.remove(); pai.remove();
        if (volta && volta.focus) volta.focus({preventScroll: true});
      }
      ok.onclick = () => {
        const tipo = tipoSel(); if (!tipo) return;
        grava(info.chave, {tipo, nota: nota.value.trim().slice(0, 600), ts: Date.now(), q: trecho(info.q, 160),
          tema: info.tema || "", extra: info.extra || "", resolvido: false});
        fecha();
      };
      pai.querySelector(".msn-cancela").onclick = fecha;
      const tira = pai.querySelector(".msn-tira"); if (tira) tira.onclick = () => { grava(info.chave, null); fecha(); };
      fundo.onclick = fecha;
      teclaAtiva = e => {
        if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); fecha(); return; }
        if (e.key === "Tab") {
          const f = [...pai.querySelectorAll("button,input,textarea")].filter(x => !x.disabled && x.offsetParent !== null);
          if (f.length && e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (f.length && !e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
        e.stopImmediatePropagation();   /* atalhos do app (A–E, setas) não agem com o formulário aberto */
      };
      (pai.querySelector('input[name="msn-tipo"]:checked') || pai.querySelector('input[name="msn-tipo"]')).focus({preventScroll: true});
    }

    function botao(el, info) {
      injetaCss();
      let b = el;
      if (el.tagName !== "BUTTON") { b = document.createElement("button"); if (el.id) b.id = el.id; if (el.className) b.className = el.className; el.replaceWith(b); }
      b.type = "button"; b.classList.add("msn-btn");
      if (info.rotulo) b.dataset.msnRotulo = info.rotulo;
      if (!botoes.has(info.chave)) botoes.set(info.chave, new Set());
      botoes.get(info.chave).add(b);
      pintaBotao(b, !!le()[info.chave]);
      b.onclick = e => { e.stopPropagation(); abre({...info, botao: b}); };
      return b;
    }

    function relatorio() {
      const itens = Object.entries(le()).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
      const cab = `Questões sinalizadas — ${cfg.app || "app"} — ${itens.length} — ${data(Date.now())}`;
      return [cab, ""].concat(itens.map(([ch, it], i) =>
        `${i + 1}. [${NOME_TIPO[it.tipo] || it.tipo}] ${it.tema ? "(" + it.tema + ") " : ""}${it.q}\n` +
        `   chave: ${ch}${it.extra ? " · " + it.extra : ""} · ${data(it.ts)}` +
        (it.nota ? `\n   nota: ${it.nota.replace(/\s+/g, " ")}` : ""))).join("\n");
    }

    function lista(cont, op) {
      injetaCss();
      op = op || {};
      cont.classList.add("msn-lista");
      listas.add(cont);
      cont.__msnDesenha = function () {
        const itens = Object.entries(le()).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
        cont.innerHTML = `
          <div class="msn-cab"><span class="msn-cont">${itens.length ? `${itens.length} ${itens.length === 1 ? "questão sinalizada" : "questões sinalizadas"}` : ""}</span>
            ${itens.length ? `<button type="button" class="msn-ok msn-copiar" data-msn="copia">Copiar relatório</button>` : ""}</div>
          ${itens.length ? itens.map(([ch, it]) => `
            <div class="msn-item" data-ch="${esc(ch)}">
              <div class="msn-tipo">${esc(NOME_TIPO[it.tipo] || it.tipo)}${it.tema ? ` · <span style="font-weight:600;color:var(--msn-tinta);opacity:.8">${esc(it.tema)}</span>` : ""}</div>
              <div class="msn-txt">${esc(it.q)}</div>
              ${it.nota ? `<div class="msn-nota">${esc(it.nota)}</div>` : ""}
              <div class="msn-meta">sinalizada em ${esc(data(it.ts))}</div>
              <div class="msn-acoes">
                ${op.abreQuestao ? `<button type="button" data-msn="abre">Abrir questão</button>` : ""}
                <button type="button" data-msn="tira">Tirar da lista</button>
              </div>
            </div>`).join("") : `<p class="msn-vazio">Nenhuma questão sinalizada. Use a bandeira no canto da questão quando achar um erro.</p>`}
          <div data-msn="saida"></div>`;
        cont.querySelectorAll('[data-msn="tira"]').forEach(b => b.onclick = () => {
          const ch = b.closest(".msn-item").dataset.ch;
          if (confirm("Tirar esta questão da lista de sinalizadas?")) grava(ch, null);
        });
        cont.querySelectorAll('[data-msn="abre"]').forEach(b => b.onclick = () => op.abreQuestao(b.closest(".msn-item").dataset.ch));
        const cp = cont.querySelector('[data-msn="copia"]');
        if (cp) cp.onclick = async () => {
          const txt = relatorio();
          try { await navigator.clipboard.writeText(txt); cp.textContent = "Copiado!"; setTimeout(() => { if (cp.isConnected) cp.textContent = "Copiar relatório"; }, 2200); }
          catch (e) {
            const s = cont.querySelector('[data-msn="saida"]');
            s.innerHTML = `<textarea class="msn-copia" readonly aria-label="Relatório das questões sinalizadas"></textarea>`;
            const ta = s.querySelector("textarea"); ta.value = txt; ta.focus(); ta.select();
          }
        };
      };
      cont.__msnDesenha();
      return cont;
    }

    return {botao, abre, lista, relatorio, tem: ch => !!le()[ch], total: () => Object.keys(le()).length, repinta, TIPOS,
      enviaPendentes: () => cx && cx.esvazia(), pendentes: () => (cx ? cx.pendentes() : 0)};
  }

  window.MTSinal = {cria, TIPOS, versao: 1};
})();
