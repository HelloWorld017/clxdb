import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import { analyzer } from 'vite-bundle-analyzer';
import dts from 'vite-plugin-dts';
import tailwindShadowDOM from './build/vite-plugin-tailwind-shadowdom';
import umdEntryPlugin from './build/vite-plugin-umd-entry';

type Package = {
  [K in 'dependencies' | `${'peer' | 'dev'}Dependencies`]: Record<string, string>;
};

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as Package;

const baseConfig = ({ mode }: { mode: string }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});

const libConfig = {
  name: 'clxdb',
  entry: {
    clxdb: resolve(__dirname, 'src/index.ts'),
    ui: resolve(__dirname, 'src/ui/index.ts'),
  },
};

const externalDependencies = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
].map(packageName => new RegExp(`^${packageName}(\\/.*)?$`));

// prettier-ignore
const plugins = [
  react(),
  tailwindcss(),
  tailwindShadowDOM()
];

export default defineConfig(ctx =>
  process.env.BUILD_UMD
    ? {
        ...baseConfig(ctx),
        build: {
          emptyOutDir: false,
          lib: {
            ...libConfig,
            formats: ['umd'],
          },
        },
        plugins: [...plugins, umdEntryPlugin()],
      }
    : {
        ...baseConfig(ctx),
        build: {
          emptyOutDir: false,
          lib: {
            ...libConfig,
            formats: ['es', 'cjs'],
          },
          rollupOptions: { external: externalDependencies },
        },
        // prettier-ignore
        plugins: [
          ...plugins,
          dts({ rollupTypes: true }),
          !!process.env.BUILD_ANALYZE && analyzer(),
        ],
      }
);
