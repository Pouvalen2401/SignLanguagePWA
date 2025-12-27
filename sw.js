const CACHE = 'signpwa-v1';
const OFFLINE_URL = '/index.php';
const PRECACHE = [
	'/index.php',
	'/manifest.json',
	'/assets/css/styles.css',
	'/assets/js/app.js',
	'/assets/js/avatarRenderer.js',
	'/assets/js/worker.infer.js',
	'/assets/js/idb.js',
	// models and avatar glTF should be added here for offline usage
];
self.addEventListener('install', e=>{
	e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE)));
	self.skipWaiting();
});
self.addEventListener('activate', e=>{
	e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event=>{
	const url = new URL(event.request.url);
	// Offline-first for app shell and models
	if (PRECACHE.includes(url.pathname) || url.pathname.startsWith('/assets/models') || url.pathname.endsWith('.gltf')) {
		event.respondWith(caches.match(event.request).then(cached=>{
			if (cached) return cached;
			return fetch(event.request).then(resp=>{
				const copy = resp.clone();
				caches.open(CACHE).then(c=>c.put(event.request, copy));
				return resp;
			}).catch(()=>caches.match(OFFLINE_URL));
		}));
		return;
	}
	// For API calls: try network then fallback to cached
	if (url.pathname.endsWith('/api.php')) {
		event.respondWith(fetch(event.request).catch(()=>caches.match(event.request) || new Response(JSON.stringify({error:'offline'}), {headers:{'Content-Type':'application/json'}})));
		return;
	}
	// default: network with cache fallback
	event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
