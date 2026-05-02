// Tüm ipcMain.handle kayıtları tek noktada.
// Her handler küçük ve typed; iş mantığı ilgili modülde.
import { ipcMain, clipboard, nativeImage, dialog, BrowserWindow, shell, net, app } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IPC } from './channels';
import { takeScreenshot } from '../capture/screenshot';
import { listSources } from '../capture/sources';
import { triggerCapture } from '../capture/screenshot-trigger';
import { checkScreenAccess, openScreenAccessSettings } from '../permissions';
import { storage } from '../storage';
import { reregisterShortcuts } from '../shortcuts';
import { triggerUpdateDialogForTest } from '../updater';
import { rebuildTrayMenu } from '../windows/tray';
import { awaitAreaSelection, resolveAreaSelection } from '../recording/area-select';
import {
  enterRecordingWidgetMode,
  exitRecordingWidgetMode,
  sendCaptureToEditor,
} from '../windows/editor';
import {
  closeOverlay,
  getOverlayPurpose,
  transitionOverlayToRecording,
} from '../windows/overlay';
import {
  closeFaceCamWindow,
  createFaceCamWindow,
  setFaceCamShape,
  getFaceCamBounds,
  getFaceCamShape,
  hideFaceCamForRecording,
  showFaceCamForRecording,
} from '../windows/face-cam';
import { showCountdown } from '../windows/countdown';
import type { FaceCamShape } from '../../../src/shared/types';
import type { ScreenshotOptions, AppConfig } from '../../../src/shared/types';

export function registerIpcHandlers(): void {
  // -- capture
  ipcMain.handle(IPC.capture.screenshot, async (_e, opts: ScreenshotOptions) => {
    return takeScreenshot(opts);
  });
  ipcMain.handle(IPC.capture.listSources, async (_e, types?: Array<'screen' | 'window'>) => {
    return listSources(types);
  });
  ipcMain.handle(
    IPC.capture.trigger,
    async (_e, mode: 'area' | 'fullscreen' | 'window') => {
      await triggerCapture(mode);
    },
  );

  // -- overlay → main
  ipcMain.handle(
    IPC.overlay.submit,
    async (_e, rect: { x: number; y: number; width: number; height: number }) => {
      const purpose = getOverlayPurpose();

      if (purpose === 'record-rect') {
        // Area recording: rect'i bekleyen renderer'a iade et + overlay'i
        // kapatma, click-through pasif çerçeve göstergesine dönüştür.
        // Pencere açık kalır, kayıt sırasında dim+çerçeve gösterir.
        resolveAreaSelection(rect);
        transitionOverlayToRecording(rect);
        return;
      }

      // Default: screenshot akışı. Pencereyi önce kapat ki seçim kutusu
      // screenshot'a sızmasın.
      closeOverlay();
      // Pencere gerçekten gizlenip ekran tazelenene kadar 1 frame bekle ki
      // seçim kutusu sızmasın.
      await new Promise((r) => setTimeout(r, 80));
      const result = await takeScreenshot({ mode: 'area', rect });
      sendCaptureToEditor(result);
    },
  );
  ipcMain.handle(IPC.overlay.cancel, async () => {
    const purpose = getOverlayPurpose();
    closeOverlay();
    if (purpose === 'record-rect') {
      resolveAreaSelection(null);
    }
  });

  // -- editor
  ipcMain.handle(
    IPC.editor.saveImage,
    async (_e, png: ArrayBuffer, suggestedName?: string) => {
      const dir = storage.get('saveDirectory');
      const defaultName = suggestedName || (() => {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const H = String(d.getHours()).padStart(2, '0');
        const i = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        return `clackshot-screenshot-${dd}-${mm}-${yyyy}-${H}-${i}-${s}.png`;
      })();
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: dir ? join(dir, defaultName) : defaultName,
        filters: [
          { name: 'PNG', extensions: ['png'] },
          { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
          { name: 'WebP', extensions: ['webp'] },
          { name: 'BMP', extensions: ['bmp'] },
          { name: 'Tüm Resimler', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
        ],
      });
      if (canceled || !filePath) return null;
      await writeFile(filePath, Buffer.from(png));
      storage.addRecent({
        filePath,
        type: 'image',
        capturedAt: Date.now(),
        name: filePath.split(/[/\\]/).pop() ?? filePath,
      });
      rebuildTrayMenu();
      return filePath;
    },
  );
  ipcMain.handle(IPC.editor.copyImage, async (_e, png: ArrayBuffer) => {
    const img = nativeImage.createFromBuffer(Buffer.from(png));
    clipboard.writeImage(img);
  });

  // -- recording
  ipcMain.handle(
    IPC.recording.saveVideo,
    async (_e, bytes: ArrayBuffer, suggestedName?: string) => {
      // WebCodecs pipeline'ı zaten MP4 üretiyor — burada sadece diske yazıyoruz.
      const dir = storage.get('saveDirectory');
      const defaultName = suggestedName || (() => {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const H = String(d.getHours()).padStart(2, '0');
        const i = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        return `clackshot-video-${dd}-${mm}-${yyyy}-${H}-${i}-${s}.mp4`;
      })();
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: dir ? join(dir, defaultName) : defaultName,
        filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
      });
      if (canceled || !filePath) return null;

      await writeFile(filePath, Buffer.from(bytes));
      storage.addRecent({
        filePath,
        type: 'video',
        capturedAt: Date.now(),
        name: filePath.split(/[/\\]/).pop() ?? filePath,
      });
      rebuildTrayMenu();
      return filePath;
    },
  );
  ipcMain.handle(IPC.recording.selectArea, async () => {
    return awaitAreaSelection();
  });
  ipcMain.handle(IPC.recording.endOverlay, async () => {
    closeOverlay();
  });
  ipcMain.handle(IPC.recording.enterWidgetMode, async () => {
    await enterRecordingWidgetMode();
  });
  ipcMain.handle(IPC.recording.exitWidgetMode, async () => {
    exitRecordingWidgetMode();
  });
  ipcMain.handle(IPC.recording.showFaceCam, async () => {
    createFaceCamWindow();
  });
  ipcMain.handle(IPC.recording.hideFaceCam, async () => {
    closeFaceCamWindow();
  });
  ipcMain.handle(IPC.recording.setFaceCamShape, async (_e, shape: FaceCamShape) => {
    setFaceCamShape(shape);
  });
  ipcMain.handle(IPC.recording.getFaceCamBounds, async () => {
    const bounds = getFaceCamBounds();
    if (!bounds) return null;
    return { ...bounds, shape: getFaceCamShape() };
  });
  ipcMain.handle(IPC.recording.hideFaceCamForRecording, async () => {
    hideFaceCamForRecording();
  });
  ipcMain.handle(IPC.recording.showFaceCamForRecording, async () => {
    showFaceCamForRecording();
  });
  ipcMain.handle(IPC.recording.countdown, async (_e, seconds: number) => {
    await showCountdown(seconds);
  });
  ipcMain.handle(IPC.editor.close, async (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  // -- launch at login
  ipcMain.handle(IPC.config.setLaunchAtLogin, async (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
    storage.set('launchAtLogin', enabled);
  });

  // -- shell
  ipcMain.handle(IPC.shell.showItemInFolder, async (_e, path: string) => {
    shell.showItemInFolder(path);
  });
  ipcMain.handle(IPC.shell.openExternal, async (_e, url: string) => {
    await shell.openExternal(url);
  });

  // -- imgur
  ipcMain.handle(IPC.imgur.upload, async (_e, buf: ArrayBuffer): Promise<string> => {
    const base64 = Buffer.from(buf).toString('base64');
    const body = JSON.stringify({ image: base64, type: 'base64' });

    return new Promise((resolve, reject) => {
      const req = net.request({
        method: 'POST',
        url: 'https://api.imgur.com/3/image',
      });
      req.setHeader('Authorization', 'Client-ID 546c25a59c58ad7');
      req.setHeader('Content-Type', 'application/json');
      req.on('response', (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString()) as {
              success: boolean;
              data: { link: string };
              status: number;
            };
            if (!json.success) reject(new Error(`Imgur API ${json.status}`));
            else resolve(json.data.link);
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  });

  // -- permissions
  ipcMain.handle(IPC.permissions.checkScreen, async () => checkScreenAccess());
  ipcMain.handle(IPC.permissions.openScreenSettings, async () => openScreenAccessSettings());

  // DEV-ONLY: update dialog'unu dev modda test etmek için — production'a çıkmadan silinecek
  if (!app.isPackaged) {
    ipcMain.handle(IPC.dev.triggerUpdateDialog, async () => {
      await triggerUpdateDialogForTest();
    });
  }
  // END DEV-ONLY

  // -- config
  ipcMain.handle(IPC.config.getVersion, async () => app.getVersion());
  ipcMain.handle(IPC.config.getAll, async () => storage.getAll());
  ipcMain.handle(
    IPC.config.set,
    async (_e, key: keyof AppConfig, value: AppConfig[keyof AppConfig]) => {
      storage.set(key, value);
    },
  );
  ipcMain.handle(IPC.config.pickSaveDirectory, async () => {
    const current = storage.get('saveDirectory');
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Kayıt klasörü seç',
      defaultPath: current ?? undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    const dir = filePaths[0];
    storage.set('saveDirectory', dir);
    return dir;
  });
  ipcMain.handle(
    IPC.config.setShortcut,
    async (
      _e,
      key: keyof AppConfig['shortcuts'],
      accelerator: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!accelerator || typeof accelerator !== 'string') {
        return { ok: false, error: 'Geçersiz kısayol' };
      }

      const cfg = storage.getAll();
      for (const k of Object.keys(cfg.shortcuts) as Array<keyof AppConfig['shortcuts']>) {
        if (k !== key && cfg.shortcuts[k] === accelerator) {
          return { ok: false, error: 'Bu kısayol başka bir aksiyon için kullanılıyor' };
        }
      }

      const prev = cfg.shortcuts;
      storage.set('shortcuts', { ...prev, [key]: accelerator });

      const result = reregisterShortcuts();
      if (result.failed.includes(key)) {
        // Yeni accelerator OS tarafından kabul edilmedi (başka uygulama almış olabilir)
        // veya geçersiz format. Eski değere geri dön.
        storage.set('shortcuts', prev);
        reregisterShortcuts();
        return {
          ok: false,
          error: 'Bu kısayol kullanılamıyor (başka uygulama tarafından alınmış olabilir)',
        };
      }

      // Tray menüsündeki accelerator etiketini de yenile.
      rebuildTrayMenu();
      return { ok: true };
    },
  );
}
