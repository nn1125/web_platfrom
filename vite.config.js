import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, createReadStream, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const blasDir = resolve(__dirname, 'blas_wasm');

/* Serve WASM build artifacts directly from blas_wasm/ so there is
   only one copy of the files (no duplicates in public/).            */
function blasWasmPlugin() {
  const MIME = { js: 'application/javascript', wasm: 'application/wasm', html: 'text/html' };

  return {
    name: 'blas-wasm',

    /* Dev server: serve /blas_wasm/* from the blas_wasm/ directory */
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];          // strip query params
        if (!url?.startsWith('/blas_wasm/')) return next();
        const rel = url.slice('/blas_wasm/'.length);
        if (!rel || rel.includes('..')) return next(); // safety
        const file = resolve(blasDir, rel);
        if (!existsSync(file) || statSync(file).isDirectory()) return next();
        const ext = rel.split('.').pop();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        createReadStream(file).pipe(res);
      });
    },

    /* Production build: emit WASM artifacts into dist/blas_wasm/ */
    generateBundle() {
      for (const f of ['shell_cblas.js', 'shell_cblas.wasm', 'shell_cblas.worker.js']) {
        const src = resolve(blasDir, f);
        if (existsSync(src)) {
          this.emitFile({ type: 'asset', fileName: `blas_wasm/${f}`, source: readFileSync(src) });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), blasWasmPlugin()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
});
