// Auto-update — electron-updater. Production build'de update server'ı kontrol
// eder, yeni sürüm varsa indirir ve "yeniden başlat" prompt'u gösterir.
//
// Önemli notlar:
//  - Dev mode'da çalışmaz (app.isPackaged guard).
//  - macOS'ta code signing zorunlu — Apple Developer hesabı olmadan update
//    download'ları açılırken hata verir. Win/Linux'ta sorun yok.
//  - Publish konfigürasyonu electron-builder.yml'da; GitHub releases veya
//    custom server URL kullanılabilir.
// electron-updater CJS export ediyor; ESM'de default import üzerinden alıyoruz.
import electronUpdater from 'electron-updater';
import type { BrowserWindow } from 'electron';
import { app, dialog } from 'electron';
import { log } from './utils/logger';

const { autoUpdater } = electronUpdater;

let mainWindowRef: () => BrowserWindow | null = () => null;

export function setUpdaterMainWindow(getter: () => BrowserWindow | null): void {
  mainWindowRef = getter;
}

function send(channel: string, payload?: unknown): void {
  const win = mainWindowRef();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    log.info('autoUpdater: dev mode, atlanıyor');
    return;
  }

  // Otomatik download'u kapat — kullanıcı onayı isteyelim. install otomatik
  // yeniden başlatma sırasında devreye girsin.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    log.error('autoUpdater error', err);
    send('event:update-error', String(err?.message ?? err));
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('autoUpdater: checking');
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('autoUpdater: up to date', info);
  });

  autoUpdater.on('update-available', async (info) => {
    log.info('autoUpdater: update available', info);
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Yeni sürüm bulundu',
      message: `ClackShot ${info.version} yayınlandı.`,
      detail: 'Şimdi indirilsin mi?',
      buttons: ['İndir', 'Sonra'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      autoUpdater.downloadUpdate();
      send('event:update-downloading');
    }
  });

  autoUpdater.on('download-progress', (p) => {
    send('event:update-progress', { percent: p.percent });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    log.info('autoUpdater: downloaded', info);
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Güncelleme hazır',
      message: 'Yeni sürüm indirildi.',
      detail: 'Şimdi yeniden başlatıp uygulansın mı?',
      buttons: ['Yeniden Başlat', 'Kapatınca Uygula'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  // İlk açılışta + her 4 saatte bir kontrol et.
  autoUpdater.checkForUpdates().catch((err) => {
    log.warn('autoUpdater initial check failed', err);
  });
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.warn('autoUpdater periodic check failed', err);
      });
    },
    4 * 60 * 60 * 1000,
  );
}
