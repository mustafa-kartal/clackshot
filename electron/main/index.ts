// Ana giriş noktası. Lifecycle, single-instance lock, IPC kayıtları, tray, shortcut.
import { app, BrowserWindow, desktopCapturer, systemPreferences } from 'electron';
import { registerIpcHandlers } from './ipc/handlers';
import { registerShortcuts, unregisterAllShortcuts } from './shortcuts';
import { createTray } from './windows/tray';
import { createEditorWindow, getEditorWindow } from './windows/editor';
import { createSplashWindow } from './windows/splash';
import { initAutoUpdater, setUpdaterMainWindow } from './updater';
import { storage } from './storage';
import { log } from './utils/logger';

// Wayland/PipeWire desteği — Linux'ta sistem ekran paylaşım portalını etkinleştirir.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
}

// Tek instance — ikinci açılış denemesi mevcut instance'ı öne getirir.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  // Mevcut açık pencerelerden birini öne getir.
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0) {
    const w = wins[0];
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});

// macOS dock'tan gizle — uygulama tray-only çalışır.
if (process.platform === 'darwin') app.dock?.hide();

// macOS Screen Recording iznini proaktif tetikle.
// İlk desktopCapturer çağrısı macOS TCC'ye uygulamayı kaydeder ve
// System Settings → Privacy → Screen Recording listesinde görünür hale getirir.
async function primeScreenAccessOnMac(): Promise<void> {
  if (process.platform !== 'darwin') return;
  try {
    const status = systemPreferences.getMediaAccessStatus('screen');
    log.info('screen access status', status);
    // Hangi statüde olursa olsun bir kez çağrı yap — TCC entry'yi garantiler.
    // 1×1 thumbnail ile tetikleyelim, performans maliyeti sıfır.
    await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    });
  } catch (err) {
    log.warn('screen access prime başarısız (izin yokken normal)', err);
  }
}

app.whenReady().then(async () => {
  log.info('app ready', { version: app.getVersion(), platform: process.platform });

  // Splash önce — kullanıcı boş ekran beklemesin. IPC/tray/shortcut hazırlığı
  // arka planda devam ederken brand'lı bir loading kartı görünür. Editor
  // window 'ready-to-show' olunca splash minimum süresini tamamlayıp kapanır.
  createSplashWindow();

  registerIpcHandlers();
  await createTray();
  registerShortcuts();

  // Login item ayarını storage ile senkronize et (kurulum sonrası ilk açılış için).
  const launchAtLogin = storage.get('launchAtLogin') ?? false;
  app.setLoginItemSettings({ openAtLogin: launchAtLogin, openAsHidden: true });

  // İzin entry'sini hemen kaydettir ki Settings listesinde görünsün.
  await primeScreenAccessOnMac();

  // Phase 1: ana editor penceresini başlangıçta aç. Boş "henüz capture yok" durumu
  // gösterip kullanıcıya kısayolları hatırlatır. Phase 5'te kullanıcı tercihine göre
  // tray-only başlatma seçeneği eklenecek.
  createEditorWindow();

  // Auto-updater: production build'de aktif. Editor penceresini referans olarak
  // alır ki update event'lerini renderer'a ulaştırabilsin.
  setUpdaterMainWindow(() => getEditorWindow());
  initAutoUpdater();

  app.on('activate', () => {
    // macOS: dock ikonu tıklanırsa pencereyi geri getir/öne al.
    const wins = BrowserWindow.getAllWindows();
    if (wins.length === 0) createEditorWindow();
    else wins[0].focus();
  });
});

app.on('will-quit', () => {
  unregisterAllShortcuts();
});

// Tüm pencereler kapansa bile uygulamayı kapatma — tray'de yaşamaya devam
// etsin. Bu event'te app.quit() çağırmadığımız için Electron default olarak
// kapatmaz; preventDefault() çağrısına gerek yok.
app.on('window-all-closed', () => {
  // no-op
});

// Güvenlik: yeni pencere açma ve navigation'ı kilitle.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });
});
