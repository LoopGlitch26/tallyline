import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// The dashboard lives in src/web and is built into ./dist next to the tracker (public/t.js).
export default defineConfig({
  root: 'src/web',
  publicDir: '../../public',
  plugins: [preact()],
  build: { outDir: '../../dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
});
