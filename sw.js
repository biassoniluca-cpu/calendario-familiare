// Tiene in cache l'app così si apre anche senza rete. I dati arrivano sempre dal foglio Google.
const CACHE = 'famcal-v12';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

// Notifiche: Firebase mostra da solo le notifiche ricevute ad app chiusa e al tocco apre il calendario.
// Stessi dati pubblici di FB_CONFIG in index.html. Se gstatic non risponde l'app funziona lo stesso.
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
                'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyA4Bisbdv24ML2o-T37JkD9gSWmemnU_Jw',
    authDomain: 'calendario-famiglia-4b9ff.firebaseapp.com',
    projectId: 'calendario-famiglia-4b9ff',
    storageBucket: 'calendario-famiglia-4b9ff.firebasestorage.app',
    messagingSenderId: '411484582881',
    appId: '1:411484582881:web:39e99e118457bb65af58a0'
  });
  firebase.messaging();
} catch (e) {}
