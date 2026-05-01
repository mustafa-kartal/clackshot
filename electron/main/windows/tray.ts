// macOS menubar / Windows-Linux system tray ikonu — uygulamanın daima
// erişilebilir olduğu nokta. resources/icons/favicon-dark.png'i sharp ile
// menubar boyutuna küçültüp NativeImage olarak veriyoruz. Renkli ikon →
// template image değil, brand renkleri (cyan brackets + kırmızı nokta)
// menubar'da net görünür.
import { Tray, Menu, app, nativeImage, shell, type NativeImage } from 'electron';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { triggerCapture } from '../capture/screenshot-trigger';
import { triggerRecording } from '../shortcuts';
import { createEditorWindow, getEditorWindow } from './editor';
import { storage } from '../storage';
import { log } from '../utils/logger';

let tray: Tray | null = null;

// Resources path'i: dev'de proje root altında, packaged'da
// process.resourcesPath altına `extraResources` ile kopyalanır.
function resolveFaviconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icons', 'favicon-dark.png');
  }
  return join(app.getAppPath(), 'resources', 'icons', 'favicon-dark.png');
}

async function buildTrayIcon(): Promise<NativeImage> {
  try {
    const buf = await readFile(resolveFaviconPath());
    // macOS menubar için 18pt logical → retina'da 36px. Sharp ile küçültüp
    // 2x scaleFactor ile NativeImage'a sar — menubar net görünür.
    const png = await sharp(buf).resize(36, 36).png().toBuffer();
    const icon = nativeImage.createFromBuffer(png, { scaleFactor: 2.0 });
    // setTemplateImage YOK — renkli logo, menubar tema rengini takip etmez.
    return icon;
  } catch (err) {
    log.warn('Tray icon oluşturulamadı, boş ikon kullanılıyor', err);
    return nativeImage.createEmpty();
  }
}

function formatRelative(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'şimdi';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}d önce`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}sa önce`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}g önce`;
}

function buildMenu(): Menu {
  const cfg = storage.getAll();
  const sc = cfg.shortcuts;
  const recents = cfg.recents ?? [];

  const recentsSubmenu: Electron.MenuItemConstructorOptions[] =
    recents.length === 0
      ? [{ label: 'Henüz kayıt yok', enabled: false }]
      : [
          ...recents.map<Electron.MenuItemConstructorOptions>((r) => ({
            label: `${r.type === 'video' ? '🎬' : '🖼'}  ${r.name}  —  ${formatRelative(r.capturedAt)}`,
            click: () => {
              shell.openPath(r.filePath).then((err) => {
                if (err) shell.showItemInFolder(r.filePath);
              });
            },
          })),
          { type: 'separator' },
          {
            label: 'Listeyi Temizle',
            click: () => {
              storage.clearRecents();
              rebuildTrayMenu();
            },
          },
        ];

  return Menu.buildFromTemplate([
    {
      label: 'ClackShot Penceresini Aç',
      click: () => {
        const win = getEditorWindow() ?? createEditorWindow();
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Ekran Görüntüsü',
      submenu: [
        {
          label: 'Alan Seç',
          accelerator: sc.captureArea,
          click: () => triggerCapture('area'),
        },
        {
          label: 'Tam Ekran',
          accelerator: sc.captureFullscreen,
          click: () => triggerCapture('fullscreen'),
        },
        {
          label: 'Pencere',
          accelerator: sc.captureWindow,
          click: () => triggerCapture('window'),
        },
      ],
    },
    {
      label: 'Ekran Kaydı',
      submenu: [
        {
          label: 'Alan Kaydet',
          accelerator: sc.recordArea,
          click: () => triggerRecording('area'),
        },
        {
          label: 'Tam Ekran Kaydet',
          accelerator: sc.recordFullscreen,
          click: () => triggerRecording('fullscreen'),
        },
        {
          label: 'Pencere Kaydet',
          accelerator: sc.recordWindow,
          click: () => triggerRecording('window'),
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Son Kayıtlar',
      submenu: recentsSubmenu,
    },
    { type: 'separator' },
    { label: 'Çıkış', click: () => app.quit() },
  ]);
}

export async function createTray(): Promise<Tray> {
  const icon = await buildTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('ClackShot');
  tray.setContextMenu(buildMenu());
  return tray;
}

// Kısayollar değiştiğinde menüdeki accelerator etiketlerini güncelle.
export function rebuildTrayMenu(): void {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(buildMenu());
}
