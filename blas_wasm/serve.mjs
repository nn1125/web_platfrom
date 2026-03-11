import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

const PORT = parseInt(argv[2] || '8080', 10);
const DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.wasm': 'application/wasm',
  '.css':  'text/css',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  const rawUrl = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawUrl);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  const relativePath = decodedPath.replace(/^\/+/, '');
  const file = resolve(DIR, relativePath);
  const inRoot = file === DIR || file.startsWith(DIR + sep);
  if (!inRoot) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = extname(file);

  // Required for SharedArrayBuffer (pthreads)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    // SPA fallback: extensionless paths serve index.html
    if (!ext) {
      try {
        const fallback = await readFile(resolve(DIR, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fallback);
        return;
      } catch {}
    }
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Serving on http://localhost:${PORT}  (COOP/COEP enabled)`);
});
