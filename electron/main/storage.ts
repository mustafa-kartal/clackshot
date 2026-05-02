// Kullanıcı tercihlerini diske yazan modül.
// electron-store: atomic write, schema validation, JSON tabanlı.
import Store from 'electron-store';
import { app } from 'electron';
import { join } from 'node:path';
import type { AppConfig, RecentItem } from '../../src/shared/types';

const RECENTS_LIMIT = 10;

const defaults: AppConfig = {
  theme: 'system',
  defaultFormat: 'png',
  saveDirectory: null,
  copyToClipboardOnCapture: true,
  launchAtLogin: false,
  videoResolution: '1080p',
  videoFps: 30,
  videoQuality: 'medium',
  shortcuts: {
    captureArea: process.platform === 'darwin' ? 'Cmd+Shift+3' : 'Ctrl+Shift+3',
    captureFullscreen: process.platform === 'darwin' ? 'Cmd+Shift+4' : 'Ctrl+Shift+4',
    captureWindow: process.platform === 'darwin' ? 'Cmd+Shift+5' : 'Ctrl+Shift+5',
    startRecording: process.platform === 'darwin' ? 'Cmd+Shift+6' : 'Ctrl+Shift+6',
    recordArea: process.platform === 'darwin' ? 'Cmd+Shift+7' : 'Ctrl+Shift+7',
    recordFullscreen: process.platform === 'darwin' ? 'Cmd+Shift+8' : 'Ctrl+Shift+8',
    recordWindow: process.platform === 'darwin' ? 'Cmd+Shift+9' : 'Ctrl+Shift+9',
  },
  recents: [],
};

// Pictures klasörünü default kayıt yolu yap (varsa).
function defaultSaveDir(): string {
  try {
    return app.getPath('pictures');
  } catch {
    return join(app.getPath('home'), 'Pictures');
  }
}

const store = new Store<AppConfig>({
  defaults: { ...defaults, saveDirectory: defaultSaveDir() },
  name: 'openscreenshot-config',
});

// Migration: önceki sürümlerden gelen config'lerde yeni shortcut anahtarları
// eksik olabilir (electron-store defaults sadece dosya YOKSA uygulanır).
// Eksik anahtarları varsayılanlarla doldur, mevcut değerleri koru.
{
  const current = store.get('shortcuts') as Partial<AppConfig['shortcuts']> | undefined;
  const merged: AppConfig['shortcuts'] = {
    ...defaults.shortcuts,
    ...(current ?? {}),
  };
  store.set('shortcuts', merged);
}
// Recents alanı yoksa ekle.
{
  const current = (store as unknown as { has: (k: string) => boolean }).has('recents');
  if (!current) store.set('recents', []);
}
// Yeni video ayarları alanları (eski sürümden yükselten kullanıcılar için).
{
  const has = (store as unknown as { has: (k: string) => boolean }).has.bind(store);
  if (!has('videoResolution')) store.set('videoResolution', defaults.videoResolution);
  if (!has('videoFps')) store.set('videoFps', defaults.videoFps);
  if (!has('videoQuality')) store.set('videoQuality', defaults.videoQuality);
  if (!has('launchAtLogin')) store.set('launchAtLogin', defaults.launchAtLogin);
}

export const storage = {
  getAll(): AppConfig {
    return store.store;
  },
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return store.get(key);
  },
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    store.set(key, value);
  },
  addRecent(item: RecentItem): void {
    const current = (store.get('recents') as RecentItem[] | undefined) ?? [];
    // Aynı path'i tekrar pushlama — mevcut entry'i en üste taşı.
    const filtered = current.filter((r) => r.filePath !== item.filePath);
    const next = [item, ...filtered].slice(0, RECENTS_LIMIT);
    store.set('recents', next);
  },
  clearRecents(): void {
    store.set('recents', []);
  },
};
