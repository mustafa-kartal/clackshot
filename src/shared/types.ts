// Hem main hem renderer tarafından kullanılan saf tip tanımları.
// Bu dosya runtime kod içermemelidir — sadece type/interface.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CaptureMode = 'fullscreen' | 'area' | 'window';
export type RecordingMode = 'fullscreen' | 'area' | 'window';
export type FaceCamShape = 'circle' | 'rounded';

export interface ScreenshotOptions {
  mode: CaptureMode;
  // 'area' modunda renderer overlay'inden gelen mantıksal koordinatlar.
  rect?: Rect;
  // 'window' modunda hedef desktopCapturer kaynak id'si.
  sourceId?: string;
  // Hangi displayde capture alınacağı (multi-monitor için).
  displayId?: number;
}

export interface CaptureResult {
  // PNG buffer'ı (renderer'a transferable olarak iletilecek).
  pngBuffer: ArrayBuffer;
  width: number;
  height: number;
  capturedAt: number;
}

export interface SourceInfo {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnailDataUrl: string;
  displayId?: number;
}

export type ScreenAccessStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

// Kayıt çözünürlüğü preset'leri. 'native' → ekran/kaynak çözünürlüğü kullanılır.
export type VideoResolution = '720p' | '1080p' | '1440p' | '4k' | 'native';
export type VideoFps = 30 | 60;
export type VideoQuality = 'low' | 'medium' | 'high';

export interface RecentItem {
  filePath: string;
  type: 'image' | 'video';
  capturedAt: number;
  name: string;
}

export type ImageFormat = 'png' | 'jpg' | 'webp' | 'bmp';

export interface AppConfig {
  theme: 'dark' | 'light' | 'system';
  defaultFormat: ImageFormat;
  saveDirectory: string | null;
  copyToClipboardOnCapture: boolean;
  launchAtLogin: boolean;
  videoResolution: VideoResolution;
  videoFps: VideoFps;
  videoQuality: VideoQuality;
  shortcuts: {
    captureArea: string;
    captureFullscreen: string;
    captureWindow: string;
    startRecording: string;
    recordArea: string;
    recordFullscreen: string;
    recordWindow: string;
  };
  recents: RecentItem[];
}
