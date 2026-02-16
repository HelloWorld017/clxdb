import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import tailwindShadowDOM from './build/vite-plugin-tailwind-shadowdom';

export default defineConfig({
  build: {
    lib: {
      name: 'clxdb',
      entry: {
        clxdb: resolve(__dirname, 'src/index.ts'),
        ui: resolve(__dirname, 'src/ui/index.ts'),
      },
    },
  },
  plugins: [react(), tailwindcss(), tailwindShadowDOM()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
