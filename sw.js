// Fa funzionare Risparmio anche senza rete.
// Quando cambi i file sul sito, aumenta il numero di VERSIONE.
const VERSIONE = 'risparmio-v4';
const FILE = [
  './', './index.html', './style.css', './app.js', './config.js', './manifest.webmanifest',
  './font/nunito.woff2',
  './img/cane_elegante.png', './img/cane_normale.png', './img/cane_trasandato.png',
  './img/icon-180.png', './img/icon-192.png', './img/icon-512.png', './img/favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
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
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((salvato) => {
      const rete = fetch(req).then((r) => {
        if (r.ok && !new URL(req.url).search) {
          const copia = r.clone();
          caches.open(VERSIONE).then((c) => c.put(req, copia));
        }
        return r;
      }).catch(() => salvato);
      return salvato || rete;
    })
  );
});
