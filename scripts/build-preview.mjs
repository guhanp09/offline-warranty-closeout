import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const project = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const assets = [
  ...['app.mjs', 'client.mjs', 'mic.mjs', 'ui.mjs', 'styles.css', 'icon.svg'].map((name) => 'app/web/' + name),
  ...['actions.mjs', 'evidence.mjs', 'observations.mjs', 'sync.mjs', 'workflow.mjs'].map((name) => 'app/core/' + name),
  ...['visit.mjs', 'procedure.mjs', 'signed-work-order-17042.pdf', 'signed-work-order-17086.pdf'].map((name) => 'fixtures/' + name),
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist);
const html = (await readFile(new URL('app/web/index.html', project), 'utf8')).replace('data-mode="local"', 'data-mode="preview"');
await writeFile(new URL('index.html', dist), html);
const digest = createHash('sha256').update(html);
for (const path of assets) {
  await mkdir(new URL(dirname(path) + '/', dist), { recursive: true });
  await copyFile(new URL(path, project), new URL(path, dist));
  digest.update(await readFile(new URL(path, project)));
}
const cacheKey = 'owc-preview-' + digest.digest('hex').slice(0, 12);
await writeFile(new URL('sw.js', dist), `
const cacheKey = ${JSON.stringify(cacheKey)};
const routes = ${JSON.stringify(['./', './index.html', ...assets.map((asset) => './' + asset)])};
const urls = new Set(routes.map((route) => new URL(route, self.registration.scope).href));
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheKey).then((cache) => cache.addAll(routes)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('owc-preview-') && key !== cacheKey)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  if (urls.has(url.href)) {
    event.respondWith(caches.open(cacheKey).then((cache) => cache.match(url.href)).then((saved) => saved || fetch(event.request)));
  }
});
`);
await writeFile(new URL('.nojekyll', dist), '');
console.log('Browser demo built in dist/');
