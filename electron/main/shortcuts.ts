// Global kısayolları kaydeder. Uygulama focus'ta olmasa bile çalışır.
// macOS'ta Accessibility izni gerekebilir (özel modifier kombinasyonlarında).
import { globalShortcut } from 'electron';
import { storage } from './storage';
import { triggerCapture } from './capture/screenshot-trigger';
import { IPC } from './ipc/channels';
import { createEditorWindow, getEditorWindow } from './windows/editor';
import { log } from './utils/logger';
import type { AppConfig, RecordingMode } from '../../src/shared/types';

// Recording renderer-side bir feature (MediaRecorder); ana süreç sadece
// editor'a IPC event gönderiyor. Editor renderer event'i alıp ilgili kayıt
// akışını başlatır. Tray menüsünden de çağrılabilir.
export function triggerRecording(mode: RecordingMode): void {
  const win = getEditorWindow() ?? createEditorWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  // Pencere yeni açıldıysa load tamamlanana kadar bekle.
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.send(IPC.events.triggerRecord, mode);
    });
  } else {
    win.webContents.send(IPC.events.triggerRecord, mode);
  }
}

type ShortcutKey = keyof AppConfig['shortcuts'];

export interface RegisterResult {
  ok: boolean;
  failed: ShortcutKey[];
}

export function registerShortcuts(): RegisterResult {
  const cfg = storage.getAll();
  const failed: ShortcutKey[] = [];

  const tryRegister = (key: ShortcutKey, accel: string, fn: () => void) => {
    try {
      const ok = globalShortcut.register(accel, fn);
      if (!ok) {
        failed.push(key);
        log.warn(`Kısayol kaydedilemedi: ${key}=${accel}`);
      }
    } catch (e) {
      failed.push(key);
      log.warn(`Kısayol kaydedilemedi: ${key}=${accel}`, e);
    }
  };

  tryRegister('captureArea', cfg.shortcuts.captureArea, () => triggerCapture('area'));
  tryRegister('captureFullscreen', cfg.shortcuts.captureFullscreen, () =>
    triggerCapture('fullscreen'),
  );
  tryRegister('captureWindow', cfg.shortcuts.captureWindow, () => triggerCapture('window'));

  tryRegister('recordArea', cfg.shortcuts.recordArea, () => triggerRecording('area'));
  tryRegister('recordFullscreen', cfg.shortcuts.recordFullscreen, () =>
    triggerRecording('fullscreen'),
  );
  tryRegister('recordWindow', cfg.shortcuts.recordWindow, () => triggerRecording('window'));

  return { ok: failed.length === 0, failed };
}

export function reregisterShortcuts(): RegisterResult {
  unregisterAllShortcuts();
  return registerShortcuts();
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll();
}
