// Floating face cam penceresi. Frameless, transparent, always-on-top.
// Renderer dairesel webcam video'su gösterir, pencere body'sinde drag region
// var → kullanıcı her yerden sürükleyebilir. Kayıt başladığında açılır,
// bitince kapatılır.
import { BrowserWindow, screen } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC } from '../ipc/channels';
import type { FaceCamShape } from '../../../src/shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

let faceCamWindow: BrowserWindow | null = null;
let currentShape: FaceCamShape = 'circle';

const SIZE = 220;
const MARGIN = 24;

export function setFaceCamShape(shape: FaceCamShape): void {
  currentShape = shape;
  if (faceCamWindow && !faceCamWindow.isDestroyed()) {
    faceCamWindow.webContents.send(IPC.events.faceCamShapeChanged, shape);
  }
}

export function getFaceCamBounds(): { x: number; y: number; width: number; height: number; scaleFactor: number } | null {
  if (!faceCamWindow || faceCamWindow.isDestroyed()) return null;
  const bounds = faceCamWindow.getBounds(); // CSS piksel (logical)
  const display = screen.getDisplayMatching(bounds);
  return { ...bounds, scaleFactor: display.scaleFactor };
}

export function getFaceCamShape(): FaceCamShape {
  return currentShape;
}

// Kayıt sırasında face cam penceresinin kamerası durdurulur (encoder kendi stream'ini açar).
export function hideFaceCamForRecording(): void {
  if (faceCamWindow && !faceCamWindow.isDestroyed()) {
    faceCamWindow.webContents.send(IPC.events.faceCamStopCamera);
    faceCamWindow.hide();
  }
}

export function showFaceCamForRecording(): void {
  if (faceCamWindow && !faceCamWindow.isDestroyed()) {
    faceCamWindow.showInactive();
    faceCamWindow.webContents.send(IPC.events.faceCamStartCamera);
  }
}

export function createFaceCamWindow(): BrowserWindow {
  if (faceCamWindow && !faceCamWindow.isDestroyed()) {
    faceCamWindow.show();
    return faceCamWindow;
  }

  // Default konum: primary display'in sağ-alt köşesi.
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const x = workArea.x + workArea.width - SIZE - MARGIN;
  const y = workArea.y + workArea.height - SIZE - MARGIN;

  faceCamWindow = new BrowserWindow({
    x,
    y,
    width: SIZE,
    height: SIZE,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/face-cam.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  faceCamWindow.setAlwaysOnTop(true, 'screen-saver');
  faceCamWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const base = devUrl.endsWith('/') ? devUrl : `${devUrl}/`;
    const url = new URL('src/face-cam/face-cam.html', base).toString();
    faceCamWindow.loadURL(url);
  } else {
    faceCamWindow.loadFile(join(__dirname, '../../dist/src/face-cam/face-cam.html'));
  }

  faceCamWindow.once('ready-to-show', () => {
    faceCamWindow?.showInactive();
    // Renderer mount olduktan sonra mevcut shape'i hemen yolla.
    faceCamWindow?.webContents.send(IPC.events.faceCamShapeChanged, currentShape);
  });

  faceCamWindow.on('closed', () => {
    faceCamWindow = null;
  });

  return faceCamWindow;
}

export function closeFaceCamWindow(): void {
  if (faceCamWindow && !faceCamWindow.isDestroyed()) {
    faceCamWindow.close();
  }
  faceCamWindow = null;
}
