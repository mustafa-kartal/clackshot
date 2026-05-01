// Tray ve global shortcut'tan tetiklenen high-level capture orkestrasyonu.
// 'area' → overlay aç, kullanıcı seçim yapsın → overlay rect'i gönderir → capture.
// 'fullscreen' → overlay'siz, doğrudan capture.
import { takeScreenshot } from './screenshot';
import { listSources } from './sources';
import { sendCaptureToEditor } from '../windows/editor';
import { createOverlayWindow } from '../windows/overlay';
import { checkScreenAccess, openScreenAccessSettings } from '../permissions';
import { dialog } from 'electron';
import { log } from '../utils/logger';

async function ensureScreenAccess(): Promise<boolean> {
  const status = checkScreenAccess();
  if (status === 'granted') return true;
  if (status === 'not-determined') {
    // İlk desktopCapturer çağrısı OS prompt'unu tetikleyecek; capture'a izin ver.
    return true;
  }
  // denied / restricted: kullanıcıyı System Settings'e yönlendir.
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Ekran Kaydı İzni Gerekli',
    message:
      'ClackShot ekran görüntüsü alabilmek için Ekran Kaydı iznine ihtiyaç duyuyor.',
    detail:
      'System Settings → Privacy & Security → Screen Recording içinden uygulamayı işaretleyip yeniden başlatın.',
    buttons: ['Ayarları Aç', 'İptal'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) await openScreenAccessSettings();
  return false;
}

export async function triggerCapture(
  mode: 'area' | 'fullscreen' | 'window',
): Promise<void> {
  log.info('triggerCapture', { mode });

  const ok = await ensureScreenAccess();
  if (!ok) return;

  if (mode === 'fullscreen') {
    try {
      const result = await takeScreenshot({ mode: 'fullscreen' });
      sendCaptureToEditor(result);
    } catch (err) {
      log.error('fullscreen capture başarısız', err);
      dialog.showErrorBox('Capture Hatası', String(err));
    }
    return;
  }

  if (mode === 'area') {
    // Overlay aç. Sonuç IPC'den gelecek (overlay:submit handler'ı capture'ı başlatır).
    createOverlayWindow();
    return;
  }

  if (mode === 'window') {
    // Phase 1'de basit: ilk pencere kaynağını al. Phase 2'de proper picker.
    const sources = await listSources(['window']);
    if (sources.length === 0) {
      dialog.showErrorBox('Capture Hatası', 'Yakalanabilir pencere bulunamadı.');
      return;
    }
    const result = await takeScreenshot({ mode: 'window', sourceId: sources[0].id });
    sendCaptureToEditor(result);
    return;
  }
}
