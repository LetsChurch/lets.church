import tailwindcss from '@tailwindcss/vite';
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => ({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    // Precompress public assets (the large /reading/ + /search/ JSON) to .br/.gz
    // at build time; Nitro's static handler serves them with Content-Encoding when
    // the client allows it — e.g. BSB reading ~28.8MB raw → ~2.5MB brotli.
    nitroV2Plugin({
      preset: 'node-server',
      compressPublicAssets: { gzip: true, brotli: true },
    }),
    viteReact(),
    tailwindcss(),
  ],
}));
