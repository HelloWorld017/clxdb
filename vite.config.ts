import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      name: 'clxdb',
      entry: resolve(__dirname, 'src/index.ts'),
      fileName: 'clxdb',
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
