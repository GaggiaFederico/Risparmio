// Service worker di Risparmio.
// Prima prova sempre il sito (così vedi subito la versione nuova); la copia salvata
// serve solo se manca la rete, per mostrare l'app mentre si ricollega.
// Quando cambi i file sul sito, aumenta il numero di VERSIONE.
const VERSIONE = 'risparmio-v14';
const FILE = [
  './', './index.html', './style.css', './app.js', './config.js', './manifest.webmanifest',
  './font/nunito.woff2',
  './img/cane_elegante.png', './img/cane_normale.png', './img/cane_trasandato.png',
  './img/icon-180.png', './img/icon-192.png', './img/icon-512.png', './img/favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSIONE)
      .then((c) => c.addAll(FILE.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== VERSIONE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Solo i file del sito: Google e Drive passano sempre dalla rete.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((r) => {
        if (r.ok && !url.search) {
          const copia = r.clone();
          caches.open(VERSIONE).then((c) => c.put(req, copia));
        }
        return r;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((salvato) => salvato || caches.match('./index.html')))
  );
});
