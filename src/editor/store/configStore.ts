import { create } from 'zustand';
import type { AppConfig, ImageFormat, VideoFps, VideoQuality, VideoResolution } from '../../shared/types';

type Shortcuts = AppConfig['shortcuts'];
type Theme = AppConfig['theme'];

interface ConfigState {
  shortcuts: Shortcuts | null;
  saveDirectory: string | null;
  defaultFormat: ImageFormat;
  videoResolution: VideoResolution;
  videoFps: VideoFps;
  videoQuality: VideoQuality;
  theme: Theme;
  launchAtLogin: boolean;
  loaded: boolean;
  load(): Promise<void>;
  setShortcut(
    key: keyof Shortcuts,
    accelerator: string,
  ): Promise<{ ok: boolean; error?: string }>;
  pickSaveDirectory(): Promise<string | null>;
  setDefaultFormat(v: ImageFormat): Promise<void>;
  setVideoResolution(v: VideoResolution): Promise<void>;
  setVideoFps(v: VideoFps): Promise<void>;
  setVideoQuality(v: VideoQuality): Promise<void>;
  setTheme(v: Theme): Promise<void>;
  setLaunchAtLogin(v: boolean): Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  shortcuts: null,
  saveDirectory: null,
  defaultFormat: 'png',
  videoResolution: '1080p',
  videoFps: 30,
  videoQuality: 'medium',
  theme: 'system',
  launchAtLogin: false,
  loaded: false,
  async load() {
    const cfg = await window.api.config.getAll();
    set({
      shortcuts: cfg.shortcuts,
      saveDirectory: cfg.saveDirectory,
      defaultFormat: cfg.defaultFormat,
      videoResolution: cfg.videoResolution,
      videoFps: cfg.videoFps,
      videoQuality: cfg.videoQuality,
      theme: cfg.theme,
      launchAtLogin: cfg.launchAtLogin ?? false,
      loaded: true,
    });
  },
  async setShortcut(key, accelerator) {
    const res = await window.api.config.setShortcut(key, accelerator);
    if (res.ok) {
      const cur = get().shortcuts;
      if (cur) set({ shortcuts: { ...cur, [key]: accelerator } });
    }
    return res;
  },
  async pickSaveDirectory() {
    const dir = await window.api.config.pickSaveDirectory();
    if (dir) set({ saveDirectory: dir });
    return dir;
  },
  async setDefaultFormat(v) {
    await window.api.config.set('defaultFormat', v);
    set({ defaultFormat: v });
  },
  async setVideoResolution(v) {
    await window.api.config.set('videoResolution', v);
    set({ videoResolution: v });
  },
  async setVideoFps(v) {
    await window.api.config.set('videoFps', v);
    set({ videoFps: v });
  },
  async setVideoQuality(v) {
    await window.api.config.set('videoQuality', v);
    set({ videoQuality: v });
  },
  async setTheme(v) {
    await window.api.config.set('theme', v);
    set({ theme: v });
  },
  async setLaunchAtLogin(v) {
    await window.api.config.setLaunchAtLogin(v);
    set({ launchAtLogin: v });
  },
}));
