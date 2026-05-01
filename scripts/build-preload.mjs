// Production build için preload'ları tek seferlik CJS derle.
import { build } from 'esbuild';

await build({
  entryPoints: [
    'electron/preload/editor.ts',
    'electron/preload/overlay.ts',
    'electron/preload/face-cam.ts',
  ],
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  format: 'cjs',
  outdir: 'dist-electron/preload',
  outExtension: { '.js': '.cjs' },
  minify: true,
  logLevel: 'info',
});
