// macOS TCC (Transparency, Consent, and Control) izinleri.
// Ekran kaydı izni programatik istenemez — sadece OS'un kendi prompt'u var
// ve ilk desktopCapturer çağrısında otomatik tetiklenir (uygulama imzalıysa).
// İzin reddedildiyse kullanıcıyı System Settings'e yönlendiriyoruz.
import { systemPreferences, shell } from 'electron';
import type { ScreenAccessStatus } from '../../../src/shared/types';

export function checkScreenAccess(): ScreenAccessStatus {
  if (process.platform !== 'darwin') return 'granted';
  // Electron API'si: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
  return systemPreferences.getMediaAccessStatus('screen') as ScreenAccessStatus;
}

export async function openScreenAccessSettings(): Promise<void> {
  if (process.platform !== 'darwin') return;
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  );
}
