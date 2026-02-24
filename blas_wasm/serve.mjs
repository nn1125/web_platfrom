import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { argv } from 'node:process';

const PORT = parseInt(argv[2] || '8080', 10);
const DIR = new URL('.', import.meta.url).pathname;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.wasm': 'application/wasm',
  '.css':  'text/css',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  const url = req.url === '/' ? '/shell_cblas.html' : req.url.split('?')[0];
  const file = join(DIR, url);
  const ext = extname(file);

  // Required for SharedArrayBuffer (pthreads)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Serving on http://localhost:${PORT}  (COOP/COEP enabled)`);
});
