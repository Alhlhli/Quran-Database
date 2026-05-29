/* Service Worker — يتيح عمل التطبيق دون اتصال (PWA) */
const CACHE = 'quran-db-v2';
const ASSETS = [
    'index.html',
    'stats.html',
    'faq.html',
    'style.css',
    'app.js',
    'stats.js',
    'quran-data.json',
    'manifest.json',
];

// التثبيت: تخزين الملفات الأساسية
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

// التفعيل: حذف النسخ القديمة من الكاش
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// الجلب: المحلي أولاً (Cache First) مع تحديث في الخلفية
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        caches.match(event.request).then(cached => {
            const network = fetch(event.request).then(res => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(event.request, copy));
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
