import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/**
 * Serves /asset-index.json listing the files that currently exist under
 * public/assets (fresh on every request in dev, emitted at build time), so the
 * game never requests a missing asset (no 404 noise) while asset agents are
 * still delivering files.
 */
function assetIndex(): Plugin {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'public/assets');
  const scan = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      let entries: string[] = [];
      try { entries = readdirSync(dir); } catch { return; }
      for (const e of entries) {
        if (e.startsWith('.')) continue;
        const p = join(dir, e);
        let st;
        try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p);
        else if (st.size > 0) out.push(relative(root, p).split('\\').join('/'));
      }
    };
    walk(root);
    return out.sort();
  };
  return {
    name: 'treseta-asset-index',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url.endsWith('/asset-index.json')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ files: scan() }));
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url.endsWith('/asset-index.json')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ files: scan() }));
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'asset-index.json', source: JSON.stringify({ files: scan() }) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [assetIndex()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    assetsDir: 'static',
    // three.js and gsap rarely change: keep them in their own long-cached chunk.
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: 'vendor', test: /node_modules[\\/](three|gsap)[\\/]/ }] },
      },
    },
  },
  server: { port: 5173 },
});
