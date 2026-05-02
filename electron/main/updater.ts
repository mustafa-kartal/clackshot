// Auto-update — electron-updater. Production build'de update server'ı kontrol
// eder, yeni sürüm varsa indirir ve "yeniden başlat" prompt'u gösterir.
//
// Önemli notlar:
//  - Dev mode'da çalışmaz (app.isPackaged guard).
//  - macOS'ta code signing zorunlu — Apple Developer hesabı olmadan update
//    download'ları açılırken hata verir. Win/Linux'ta sorun yok.
//  - Publish konfigürasyonu electron-builder.yml'da; GitHub releases veya
//    custom server URL kullanılabilir.
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import type { BrowserWindow } from 'electron';
import { app, dialog } from 'electron';
import { log } from './utils/logger';
import { storage } from './storage';

const SNOOZE_MS = 4 * 60 * 60 * 1000;

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

  // electron-updater'ın dahili logger'ını bizim log sistemine bağla.
  autoUpdater.logger = {
    info: (...args: unknown[]) => log.info('[updater]', ...args),
    warn: (...args: unknown[]) => log.warn('[updater]', ...args),
    error: (...args: unknown[]) => log.error('[updater]', ...args),
    debug: (...args: unknown[]) => log.info('[updater:debug]', ...args),
  };

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

    // Snooze kontrolü: 4 saatlik erteleme süresi dolmadıysa dialog gösterme.
    const snoozedUntil = storage.get('updateSnoozedUntil');
    if (snoozedUntil && Date.now() < snoozedUntil) {
      log.info('autoUpdater: snooze aktif, dialog atlanıyor');
      return;
    }

    // Bu sürümü atla kontrolü: kullanıcı daha önce bu versiyonu atladıysa gösterme.
    const skippedVersion = storage.get('updateSkippedVersion');
    if (skippedVersion === info.version) {
      log.info('autoUpdater: sürüm daha önce atlandı', info.version);
      return;
    }

    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Yeni sürüm bulundu',
      message: `ClackShot ${info.version} yayınlandı.`,
      detail: 'Şimdi indirilsin mi?',
      buttons: ['İndir', 'Daha Sonra Hatırlat (4 saat)', 'Bu Sürümü Atla'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      storage.set('updateSnoozedUntil', null);
      storage.set('updateSkippedVersion', null);
      autoUpdater.downloadUpdate();
      send('event:update-downloading');
    } else if (response === 1) {
      storage.set('updateSnoozedUntil', Date.now() + SNOOZE_MS);
      log.info('autoUpdater: 4 saat ertelendi');
    } else {
      storage.set('updateSkippedVersion', info.version);
      log.info('autoUpdater: sürüm atlandı', info.version);
    }
  });

  autoUpdater.on('download-progress', (p) => {
    send('event:update-progress', { percent: p.percent });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    log.info('autoUpdater: downloaded', info);
    send('event:update-downloaded');
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

// DEV-ONLY: update dialog'unu dev modda doğrudan tetiklemek için — production'a çıkmadan silinecek
export async function triggerUpdateDialogForTest(): Promise<void> {
  const fakeInfo = { version: '99.9.9' };

  const snoozedUntil = storage.get('updateSnoozedUntil');
  const skippedVersion = storage.get('updateSkippedVersion');

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '[TEST] Yeni sürüm bulundu',
    message: `ClackShot ${fakeInfo.version} yayınlandı.`,
    detail: `Snooze: ${snoozedUntil ? new Date(snoozedUntil).toLocaleTimeString() : 'yok'} | Atlandı: ${skippedVersion ?? 'yok'}\n\nŞimdi indirilsin mi?`,
    buttons: ['İndir', 'Daha Sonra Hatırlat (4 saat)', 'Bu Sürümü Atla'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    storage.set('updateSnoozedUntil', null);
    storage.set('updateSkippedVersion', null);
    log.info('[TEST] update: indir seçildi');
  } else if (response === 1) {
    storage.set('updateSnoozedUntil', Date.now() + SNOOZE_MS);
    log.info('[TEST] update: 4 saat ertelendi');
  } else {
    storage.set('updateSkippedVersion', fakeInfo.version);
    log.info('[TEST] update: sürüm atlandı');
  }
}
// END DEV-ONLY
