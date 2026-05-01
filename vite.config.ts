import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Vite konfigürasyonu.
// - Main process: ESM olarak build edilir (package.json "type":"module").
// - Preload script'leri: vite-plugin-electron CJS format'ı es geçtiği için,
//   esbuild ile scripts/dev.mjs ve scripts/build-preload.mjs üzerinden derlenir.
// - Renderer: standart Vite multi-page (overlay + editor).
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Sadece ana süreç. Preload'lar Vite dışında esbuild ile derleniyor.
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: [
                'electron',
                'electron-store',
                'electron-updater',
                'sharp',
                'ffmpeg-static',
              ],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@editor': resolve(__dirname, 'src/editor'),
      '@overlay': resolve(__dirname, 'src/overlay'),
      '@face-cam': resolve(__dirname, 'src/face-cam'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        overlay: resolve(__dirname, 'src/overlay/overlay.html'),
        editor: resolve(__dirname, 'src/editor/editor.html'),
        'face-cam': resolve(__dirname, 'src/face-cam/face-cam.html'),
        splash: resolve(__dirname, 'src/splash/splash.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
});
