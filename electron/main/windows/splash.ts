// Splash penceresi — uygulama başlangıcında editor hazırlanırken kullanıcıya
// brand'lı bir loading ekranı gösterir. Frameless + transparent + always-on-top.
//
// Kapatılma akışı:
//   - Editor window 'ready-to-show' olduğunda closeSplashWindow() çağrılır.
//   - Minimum görünme süresi (default 1500ms) sağlanır — aksi halde pencere
//     bir flash gibi açılıp kapanır, kullanıcı brand'i fark etmez.
import { BrowserWindow, screen } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../utils/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));

let splashWindow: BrowserWindow | null = null;
let splashShownAt = 0;

const SPLASH_WIDTH = 460;
const SPLASH_HEIGHT = 280;
const MIN_DURATION_MS = 1500;

export function createSplashWindow(): BrowserWindow {
  if (splashWindow && !splashWindow.isDestroyed()) return splashWindow;

  const display = screen.getPrimaryDisplay();
  const { workArea } = display;

  splashWindow = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    x: workArea.x + Math.round((workArea.width - SPLASH_WIDTH) / 2),
    y: workArea.y + Math.round((workArea.height - SPLASH_HEIGHT) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const base = devUrl.endsWith('/') ? devUrl : `${devUrl}/`;
    const url = new URL('src/splash/splash.html', base).toString();
    splashWindow.loadURL(url);
  } else {
    splashWindow.loadFile(join(__dirname, '../../dist/src/splash/splash.html'));
  }

  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
    splashShownAt = Date.now();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  splashWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error('splash load failed', { code, desc, url });
  });

  return splashWindow;
}

// Editor 'ready-to-show' tetiklendiğinde çağrılır. Minimum görünme süresini
// koruyup splash'i kapatır. Promise döner ki çağıran editor.show()'i await
// edebilsin — kullanıcı sıralı bir geçiş yaşar (splash → editor).
export async function closeSplashWindow(
  minDurationMs: number = MIN_DURATION_MS,
): Promise<void> {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const elapsed = Date.now() - splashShownAt;
  const wait = Math.max(minDurationMs - elapsed, 0);
  if (wait > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

export function isSplashOpen(): boolean {
  return !!splashWindow && !splashWindow.isDestroyed();
}
