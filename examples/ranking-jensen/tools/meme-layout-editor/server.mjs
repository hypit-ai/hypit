import { createReadStream } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const editorRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const projectRoot = resolve(editorRoot, '../..');
const mediaRoot = resolve(projectRoot, 'media');
const layoutPath = resolve(projectRoot, 'scripts/meme-layouts.json');
const requestedPort = Number(process.argv[process.argv.indexOf('--port') + 1] ?? 0);
let layouts = JSON.parse(await readFile(layoutPath, 'utf8'));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'access-control-allow-origin': 'http://127.0.0.1',
  });
  response.end(body);
}

async function bodyOf(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Request is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function finite(value, fallback, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function mergeLayout(input) {
  const next = structuredClone(layouts);
  for (const [sceneId, scene] of Object.entries(next.scenes)) {
    const incoming = input?.scenes?.[sceneId];
    if (!incoming || !Array.isArray(incoming.items)) continue;
    for (const item of scene.items) {
      const change = incoming.items.find((candidate) => candidate.id === item.id);
      if (!change) continue;
      item.x = Math.round(finite(Number(change.x), item.x, 0, scene.width));
      item.y = Math.round(finite(Number(change.y), item.y, 0, scene.height));
      item.fontSize = Math.round(finite(Number(change.fontSize), item.fontSize, 18, 220));
    }
  }
  return next;
}

async function serveFile(response, path) {
  const info = await stat(path);
  response.writeHead(200, {
    'content-type': mimeTypes[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store',
  });
  createReadStream(path).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/') {
      await serveFile(response, resolve(editorRoot, 'index.html'));
      return;
    }
    if (url.pathname === '/api/layouts' && request.method === 'GET') {
      send(response, 200, JSON.stringify(layouts));
      return;
    }
    if (url.pathname === '/api/layouts' && request.method === 'POST') {
      layouts = mergeLayout(JSON.parse(await bodyOf(request)));
      const temporary = `${layoutPath}.tmp`;
      await writeFile(temporary, `${JSON.stringify(layouts, null, 2)}\n`, 'utf8');
      await rename(temporary, layoutPath);
      send(response, 200, JSON.stringify({ ok: true, savedAt: new Date().toISOString(), layouts }));
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/media/')) {
      const path = resolve(projectRoot, `.${decodeURIComponent(url.pathname)}`);
      if (!path.startsWith(`${mediaRoot}/`)) {
        send(response, 403, JSON.stringify({ ok: false, error: 'Forbidden' }));
        return;
      }
      await serveFile(response, path);
      return;
    }
    send(response, 404, JSON.stringify({ ok: false, error: 'Not found' }));
  } catch (error) {
    send(response, 500, JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(Number.isFinite(requestedPort) ? requestedPort : 0, '127.0.0.1', () => {
  const address = server.address();
  if (typeof address === 'object' && address) {
    console.log(`Meme layout editor: http://127.0.0.1:${address.port}`);
  }
});
