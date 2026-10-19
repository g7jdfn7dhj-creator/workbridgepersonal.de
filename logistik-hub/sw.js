/* Logistik-Hub PWA service worker.
   Shell (index, manifest, icons, part icons, 3D textures, vendored three.js, self-hosted fonts): cache-first, versioned cache.
   Everything else — including any Arbeitzeit GET data URL and all cross-origin requests — is network-only and never cached. */
const VERSION='lhub-pwa-v5-1';
const SHELL=[
"./",
"./index.html",
"./manifest.json",
"./pwa.js",
"./store.js",
"./vendor/three.min.js",
"./fonts/fonts.css",
"./fonts/IBMPlexMono-400-cyrillic-7febd1.woff2",
"./fonts/IBMPlexMono-400-cyrillic-ext-250613.woff2",
"./fonts/IBMPlexMono-400-latin-d196e8.woff2",
"./fonts/IBMPlexMono-400-latin-ext-7f25d9.woff2",
"./fonts/IBMPlexMono-500-cyrillic-5907a9.woff2",
"./fonts/IBMPlexMono-500-cyrillic-ext-e6406f.woff2",
"./fonts/IBMPlexMono-500-latin-a7544c.woff2",
"./fonts/IBMPlexMono-500-latin-ext-b42080.woff2",
"./fonts/RobotoCondensed-400-cyrillic-ddcb85.woff2",
"./fonts/RobotoCondensed-400-cyrillic-ext-20ec0b.woff2",
"./fonts/RobotoCondensed-400-latin-7f9f18.woff2",
"./fonts/RobotoCondensed-400-latin-ext-c0c7eb.woff2",
"./fonts/SairaCondensed-400-latin-98de77.woff2",
"./fonts/SairaCondensed-400-latin-ext-36d243.woff2",
"./fonts/SairaCondensed-500-latin-e0096f.woff2",
"./fonts/SairaCondensed-500-latin-ext-2351e7.woff2",
"./fonts/SairaCondensed-600-latin-baab28.woff2",
"./fonts/SairaCondensed-600-latin-ext-67318a.woff2",
"./icons/apple-touch-icon.png",
"./icons/favicon-32.png",
"./icons/icon-192.png",
"./icons/icon-512.png",
"./icons/icon-maskable-512.png",
"./icons/part.png",
"./tex/asphalt.jpg",
"./tex/cladding.jpg",
"./tex/concrete.jpg",
"./tex/facade.jpg",
"./tex/grass.jpg",
"./tex/metal.jpg",
"./tex/solar.jpg"
];
const SCOPE=new URL('./',self.location).href;
const SHELL_SET=new Set(SHELL.map(p=>new URL(p,SCOPE).href));
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))))});   // cache:'reload' bypasses the browser HTTP cache, so a new version never stores stale files   // no auto skipWaiting: the page shows an update notice
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('lhub-pwa-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);u.hash='';
  if(u.origin!==self.location.origin)return;                         // cross-origin (e.g. Arbeitzeit GET URL): network-only
  const isNav=r.mode==='navigate'&&u.href.startsWith(SCOPE)&&(u.pathname.endsWith('/')||u.pathname.endsWith('/index.html'));
  const key=isNav?new URL('./index.html',SCOPE).href:u.origin+u.pathname;
  if(!isNav&&!SHELL_SET.has(key))return;                             // not part of the app shell (data URLs etc.): network-only, never cached
  e.respondWith(caches.open(VERSION).then(c=>c.match(key).then(hit=>hit||fetch(r).then(res=>{if(res.ok&&res.type==='basic')c.put(key,res.clone());return res}))))});
