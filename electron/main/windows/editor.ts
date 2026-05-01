// Capture sonrası açılan modern editör penceresi.
// Çerçeveyi platforma göre ayarlıyoruz: macOS'ta hiddenInset (native traffic light),
// Windows/Linux'ta custom titleBar (frame:false + drag region).
import { app, BrowserWindow, screen } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaptureResult } from '../../../src/shared/types';
import { IPC } from '../ipc/channels';
import { log } from '../utils/logger';
import { closeSplashWindow, isSplashOpen } from './splash';

// ESM build çıktısında __dirname yok — manuel hesapla.
const __dirname = dirname(fileURLToPath(import.meta.url));

let editorWindow: BrowserWindow | null = null;

export function getEditorWindow(): BrowserWindow | null {
  return editorWindow;
}

export function createEditorWindow(): BrowserWindow {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.show();
    editorWindow.focus();
    return editorWindow;
  }

  editorWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#0e0e10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/editor.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  log.info('createEditorWindow', { devUrl, isPackaged: app.isPackaged });

  if (devUrl) {
    const base = devUrl.endsWith('/') ? devUrl : `${devUrl}/`;
    const url = new URL('src/editor/editor.html', base).toString();
    log.info('loading editor URL', url);
    editorWindow.loadURL(url);
  } else {
    editorWindow.loadFile(join(__dirname, '../../dist/src/editor/editor.html'));
  }

  // DevTools'u otomatik açma — kullanıcı isterse Cmd+Option+I (macOS) /
  // Ctrl+Shift+I (Win/Linux) ile açabilir.

  // Yükleme hatalarını logla — sessiz kalmasın.
  editorWindow.webContents.on(
    'did-fail-load',
    (_e, errorCode, errorDescription, validatedURL) => {
      log.error('editor load failed', { errorCode, errorDescription, validatedURL });
    },
  );

  editorWindow.once('ready-to-show', () => {
    // Splash açıksa minimum süreyi tamamla, sonra editor'ı göster — kullanıcı
    // splash → editor sıralı geçişi yaşar. Splash kapalıysa hemen göster
    // (capture/recording sonrası açılan editor'larda splash zaten yok).
    if (isSplashOpen()) {
      void closeSplashWindow().then(() => {
        editorWindow?.show();
      });
    } else {
      editorWindow?.show();
    }
  });

  editorWindow.on('closed', () => {
    editorWindow = null;
  });

  return editorWindow;
}

// Recording widget mode: editor penceresini küçük, always-on-top bir
// floating widget'a dönüştürür ki kullanıcı başka uygulamalara geçtiğinde de
// "Durdur ve Kaydet" butonu görünür kalsın.
let prevBounds: Electron.Rectangle | null = null;
let prevAlwaysOnTop = false;
let prevWasFullScreen = false;

const WIDGET_WIDTH = 560;
const WIDGET_HEIGHT = 60;
const WIDGET_MARGIN = 16;

export async function enterRecordingWidgetMode(): Promise<void> {
  if (!editorWindow || editorWindow.isDestroyed()) return;
  const win = editorWindow;

  // macOS fullscreen'de pencere ayrı bir Space'te ve setBounds yutulur;
  // floating widget hâlâ tüm ekranı kaplar. Önce native fullscreen'den
  // çıkmamız gerek — leave-full-screen animasyonu bittikten sonra setBounds
  // gerçekten uygulanır.
  if (win.isFullScreen()) {
    prevWasFullScreen = true;
    await new Promise<void>((resolve) => {
      win.once('leave-full-screen', () => resolve());
      win.setFullScreen(false);
    });
  }

  prevBounds = win.getBounds();
  prevAlwaysOnTop = win.isAlwaysOnTop();

  // Sıralamayı bozma! Önce min-size'ı küçük değere çek, sonra setBounds —
  // aksi halde construction-time min-height (480) küçülmeyi bloklar.
  win.setMinimumSize(WIDGET_WIDTH, WIDGET_HEIGHT);
  win.setResizable(false);

  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  win.setBounds({
    x: workArea.x + Math.round((workArea.width - WIDGET_WIDTH) / 2),
    y: workArea.y + WIDGET_MARGIN,
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
  });

  // 'screen-saver' seviyesi: tam ekrana alınmış uygulamalar dahil her şeyin
  // üstünde kalır.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // macOS: trafik ışıklarını gizle — widget temiz bir bar olarak görünsün.
  if (process.platform === 'darwin') {
    win.setWindowButtonVisibility(false);
  }
}

export function exitRecordingWidgetMode(): void {
  if (!editorWindow || editorWindow.isDestroyed()) return;
  const win = editorWindow;

  if (process.platform === 'darwin') {
    win.setWindowButtonVisibility(true);
  }

  win.setAlwaysOnTop(prevAlwaysOnTop);
  win.setVisibleOnAllWorkspaces(false);
  win.setMinimumSize(720, 480);
  win.setResizable(true);
  if (prevBounds) {
    win.setBounds(prevBounds);
  }
  // Kayıt öncesi fullscreen'deydiyse geri al — kullanıcının workspace'i bozulmaz.
  if (prevWasFullScreen) {
    win.setFullScreen(true);
  }
  prevBounds = null;
  prevAlwaysOnTop = false;
  prevWasFullScreen = false;
}

// Capture tamamlandığında editor'a sonucu push'la.
// Pencere yoksa açıyoruz, hazır olana kadar bekleyip event'i o zaman gönderiyoruz.
export function sendCaptureToEditor(result: CaptureResult): void {
  const win = createEditorWindow();
  const send = () => {
    win.webContents.send(IPC.events.captureCompleted, result);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}
