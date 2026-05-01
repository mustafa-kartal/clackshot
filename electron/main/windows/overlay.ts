// Saydam, çerçevesiz, her zaman üstte fullscreen overlay penceresi.
// Kullanıcı sürükleyerek alan seçtiğinde renderer IPC ile rect'i main'e gönderir.
//
// Önemli detaylar:
//  - transparent + frame:false + alwaysOnTop:'screen-saver' + skipTaskbar
//  - macOS'ta fullscreen değil "kioskMode benzeri" davranış için
//    setVisibleOnAllWorkspaces gerekiyor.
//  - Tek pencerede tüm ekranları örtemiyoruz çünkü çoklu monitör desteği için
//    her display için ayrı pencere açıyoruz (ileride). Phase 1: primary display.
import { BrowserWindow, screen } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC } from '../ipc/channels';
import type { Rect } from '../../../src/shared/types';

// ESM build çıktısında __dirname yok — manuel hesapla.
const __dirname = dirname(fileURLToPath(import.meta.url));

let overlayWindow: BrowserWindow | null = null;

// Overlay kullanıcı seçiminin sonucu hangi akışa girecek?
// 'screenshot' → main capture'ı tetikler ve editor'a gönderir.
// 'record-rect' → rect editor'a iade edilir, editor area recording başlatır.
export type OverlayPurpose = 'screenshot' | 'record-rect';

let overlayPurpose: OverlayPurpose = 'screenshot';

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

export function getOverlayPurpose(): OverlayPurpose {
  return overlayPurpose;
}

export function createOverlayWindow(purpose: OverlayPurpose = 'screenshot'): BrowserWindow {
  overlayPurpose = purpose;

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show();
    overlayWindow.focus();
    return overlayWindow;
  }

  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    enableLargerThanScreen: true,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/overlay.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload'da electron API'lerine erişim için
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Dev mod: Vite dev sunucusu, prod: derlenmiş HTML.
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const base = devUrl.endsWith('/') ? devUrl : `${devUrl}/`;
    const url = new URL('src/overlay/overlay.html', base).toString();
    overlayWindow.loadURL(url);
  } else {
    overlayWindow.loadFile(join(__dirname, '../../dist/src/overlay/overlay.html'));
  }

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show();
    overlayWindow?.focus();
    // Renderer'a hangi amaçla açıldığını bildir (screenshot vs record-rect).
    overlayWindow?.webContents.send(IPC.events.overlaySetPurpose, overlayPurpose);
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

export function closeOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  overlayWindow = null;
}

// Overlay'i area-recording'in pasif "çerçeve" göstergesine dönüştür:
// rect'i renderer'a yolla ve pencereyi click-through yap. Pencere açık kalır,
// recording bitince closeOverlay() ile kapatılır.
export function transitionOverlayToRecording(rect: Rect): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  // Mouse event'lerini altındaki uygulamalara geçir.
  overlayWindow.setIgnoreMouseEvents(true, { forward: false });
  // Klavye fokusunu da al — Esc kayıt sırasında işlevsiz olsun.
  if (overlayWindow.isFocused()) overlayWindow.blur();
  overlayWindow.webContents.send(IPC.events.overlayEnterRecording, rect);
}
