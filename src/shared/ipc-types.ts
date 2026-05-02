// IPC sözleşmesi: preload bu interface'i implemente eder, renderer
// `window.api` üzerinden tip-güvenli şekilde tüketir.
import type {
  AppConfig,
  CaptureResult,
  FaceCamShape,
  Rect,
  RecordingMode,
  ScreenAccessStatus,
  ScreenshotOptions,
  SourceInfo,
} from './types';

export interface FaceCamBoundsResult {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  shape: FaceCamShape;
}

export interface IpcApi {
  capture: {
    screenshot(opts: ScreenshotOptions): Promise<CaptureResult>;
    listSources(types?: Array<'screen' | 'window'>): Promise<SourceInfo[]>;
    trigger(mode: 'area' | 'fullscreen' | 'window'): Promise<void>;
  };
  editor: {
    saveImage(png: ArrayBuffer, suggestedName?: string): Promise<string | null>;
    copyImageToClipboard(png: ArrayBuffer): Promise<void>;
    closeEditor(): Promise<void>;
  };
  recording: {
    saveVideo(bytes: ArrayBuffer, suggestedName?: string): Promise<string | null>;
    selectArea(): Promise<Rect | null>;
    endOverlay(): Promise<void>;
    enterWidgetMode(): Promise<void>;
    exitWidgetMode(): Promise<void>;
    showFaceCam(): Promise<void>;
    hideFaceCam(): Promise<void>;
    setFaceCamShape(shape: FaceCamShape): Promise<void>;
    getFaceCamBounds(): Promise<FaceCamBoundsResult | null>;
    hideFaceCamForRecording(): Promise<void>;
    showFaceCamForRecording(): Promise<void>;
    countdown(seconds: number): Promise<void>;
  };
  overlay: {
    submitSelection(rect: { x: number; y: number; width: number; height: number }): Promise<void>;
    cancel(): Promise<void>;
  };
  permissions: {
    checkScreenAccess(): Promise<ScreenAccessStatus>;
    openScreenAccessSettings(): Promise<void>;
  };
  config: {
    getAll(): Promise<AppConfig>;
    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void>;
    setShortcut(
      key: keyof AppConfig['shortcuts'],
      accelerator: string,
    ): Promise<{ ok: boolean; error?: string }>;
    pickSaveDirectory(): Promise<string | null>;
  };
  shell: {
    showItemInFolder(path: string): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
  imgur: {
    upload(png: ArrayBuffer): Promise<string>;
  };
  on: {
    captureCompleted(handler: (result: CaptureResult) => void): () => void;
    overlayEnterRecording(handler: (rect: Rect) => void): () => void;
    triggerRecord(handler: (mode: RecordingMode) => void): () => void;
    openSettings(handler: () => void): () => void;
  };
}

declare global {
  interface Window {
    api: IpcApi;
  }
}
