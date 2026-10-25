import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the self-contained live demo (server + dashboard + SQLite in one HTML file).
export default defineConfig({
  root: 'src/demo',
  publicDir: false,
  plugins: [preact(), viteSingleFile()],
  build: { outDir: '../../demo-dist', emptyOutDir: true, chunkSizeWarningLimit: 5000 },
});
