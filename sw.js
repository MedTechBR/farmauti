/* FarmaUTI — service worker.
   Três baldes: CACHE (casca do app, trocado a cada versão), LEIT (leituras, sobrevive às versões)
   e EXT (ícones Tabler e mermaid do jsDelivr). HTML da página: rede primeiro, cache se offline.
   Estáticos: stale-while-revalidate (serve do cache e SEMPRE revalida; um precache envenenado pela
   borda do CDN se cura no carregamento seguinte). Bumpar CACHE a cada deploy: python3 bump.py */
const CACHE = "fu-v12";
const LEIT = "fu-leituras-v1";
const EXT = "fu-ext-v1";
const V = "12";
/* Conta (10/10/2026): mtsync.js, o adaptador, o _mtacesso.js do site e o SDK do Firebase (vendorizado no site,
   mesma origem) também vão no precache, para o app abrir sem internet depois do primeiro login. */
const PRE = ["./", "index.html", "app.css?v=" + V, "mtsync.js?v=" + V, "mtfiltro.js?v=" + V, "mtsinal.js?v=" + V, "mterrata.js?v=" + V, "app.js?v=" + V, "conta-farmauti.js?v=" + V, "dados/estudo.js?v=" + V, "dados/referencia.js?v=" + V, "manifest.webmanifest", "icons/icon-192.png",
  "/_mtacesso.js?v=8", "/vendor/firebase/firebase-app-compat.js", "/vendor/firebase/firebase-auth-compat.js", "/vendor/firebase/firebase-firestore-compat.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRE.map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![CACHE, LEIT, EXT].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function swr(req, balde) {
  return caches.open(balde).then(c => c.match(req).then(hit => {
    const rede = fetch(req, {cache: "no-cache"}).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || rede;
  }));
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (req.mode === "navigate") {
      e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put("index.html", cp)); return r; })
        .catch(() => caches.match("index.html", {ignoreSearch: true})));
      return;
    }
    /* preços e produtos: sempre da rede (cópia só para quando não há internet) */
    if (u.pathname === "/planos.json") { e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; }).catch(() => caches.match(req, {ignoreSearch: true}))); return; }
    if (u.pathname.includes("/conteudo/")) { e.respondWith(swr(req, LEIT)); return; }
    e.respondWith(swr(req, CACHE));
    return;
  }
  if (u.hostname === "cdn.jsdelivr.net") e.respondWith(swr(req, EXT));
});
