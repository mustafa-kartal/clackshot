// Geliştirme orkestratorü:
// 1) Preload script'lerini esbuild ile CJS formatında derle (watch modunda).
//    Sebep: vite-plugin-electron preload için CJS format zorlamasını es geçiyor;
//    Electron sandbox:false preload CJS bekliyor (.cjs uzantısı + commonjs).
// 2) Vite dev sunucusunu spawn et — vite-plugin-electron Electron'u tetikleyecek.
import { spawn } from 'node:child_process';
import { context } from 'esbuild';

const preloadCtx = await context({
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
  sourcemap: 'inline',
  logLevel: 'info',
});

await preloadCtx.watch();
console.log('[dev] preload watching (CJS → dist-electron/preload/*.cjs)');

const viteBin = process.platform === 'win32' ? 'vite.cmd' : 'vite';
const vite = spawn(`./node_modules/.bin/${viteBin}`, [], {
  stdio: 'inherit',
  env: process.env,
});

const cleanup = async () => {
  await preloadCtx.dispose();
  if (!vite.killed) vite.kill('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
vite.on('exit', cleanup);
