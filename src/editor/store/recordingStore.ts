// Recording lifecycle state. UI bileşenleri (RecordingControls, EmptyState)
// bu store'dan abonelik kurar. Aktif handle'ı non-reactive olarak tutuyoruz
// (zustand state'inde class instance'ları sorunlu).
import { create } from 'zustand';
import type { FaceCamShape, RecordingMode, SourceInfo } from '../../shared/types';
import { startAreaRecording, startScreenRecording } from '../recording/encoder';
import type { EncoderOptions, RecorderHandle, WebcamOverlay } from '../recording/encoder';
import { useConfigStore } from './configStore';

let handle: RecorderHandle | null = null;
let timerId: number | null = null;
let webcamStream: MediaStream | null = null;

async function getWebcamStream(): Promise<MediaStream | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 480 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' },
      audio: false,
    });
    webcamStream = stream;
    return stream;
  } catch (err) {
    console.warn('Webcam stream alınamadı', err);
    return null;
  }
}

async function buildWebcamOverlay(shape: FaceCamShape): Promise<WebcamOverlay | undefined> {
  const stream = await getWebcamStream();
  if (!stream) return undefined;
  return { stream, shape };
}

// Aktif config'ten encoder ayarlarını topla. Config henüz yüklenmediyse
// (kullanıcı global shortcut'la doğrudan kayıt başlatırsa) makul varsayılan.
function currentEncoderOptions(withMic: boolean): EncoderOptions {
  const cfg = useConfigStore.getState();
  return {
    resolution: cfg.videoResolution,
    fps: cfg.videoFps,
    quality: cfg.videoQuality,
    withMicrophone: withMic,
  };
}
// Pause-resume süre dengelemesi: pause edildiğinde "şu ana kadarki elapsed"i
// dondurup, resume'da startedAt'i bu değere göre offsetleyerek tick devam etsin.
let pausedAtElapsedMs = 0;

interface RecordingState {
  active: boolean;
  saving: boolean;
  paused: boolean;
  mode: RecordingMode | null;
  startedAt: number | null;
  elapsedMs: number;
  // Mikrofon UI state — handle.hasMicrophone()/isMicMuted()'ten türetilir.
  hasMic: boolean;
  micMuted: boolean;
  // Face cam window görünürlüğü — main process tarafında ayrı pencere açıp
  // kapatıyoruz, store sadece UI state için tutar.
  faceCamVisible: boolean;
  faceCamShape: FaceCamShape;
  // Kayıt başlatırken kullanılacak kullanıcı tercihleri.
  withMic: boolean;
  withFaceCam: boolean;
  withCountdown: boolean;
  setWithMic(v: boolean): void;
  setWithFaceCam(v: boolean): void;
  setWithCountdown(v: boolean): void;
  // Yüksek seviyeli başlatıcılar — hem buton hem global shortcut çağırır.
  startFullscreen(): Promise<void>;
  startWindow(source: SourceInfo): Promise<void>;
  startWindowFirst(): Promise<void>;
  startArea(): Promise<void>;
  begin(mode: RecordingMode, h: RecorderHandle): void;
  // Her saniye çalışacak tick — UI'da timer için.
  tick(): void;
  setSaving(value: boolean): void;
  togglePause(): void;
  toggleMic(): void;
  setFaceCamVisible(visible: boolean): void;
  toggleFaceCam(): Promise<void>;
  setFaceCamShape(shape: FaceCamShape): Promise<void>;
  end(): void;
  getHandle(): RecorderHandle | null;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  active: false,
  saving: false,
  paused: false,
  mode: null,
  startedAt: null,
  elapsedMs: 0,
  hasMic: false,
  micMuted: false,
  faceCamVisible: false,
  faceCamShape: 'circle',
  withMic: false,
  withFaceCam: false,
  withCountdown: true,

  setWithMic(v) {
    set({ withMic: v });
  },
  setWithFaceCam(v) {
    set({ withFaceCam: v });
  },
  setWithCountdown(v) {
    set({ withCountdown: v });
  },

  async startFullscreen() {
    if (get().active) return;
    try {
      const sources = await window.api.capture.listSources(['screen']);
      if (sources.length === 0) return;
      const webcam = get().withFaceCam
        ? await buildWebcamOverlay(get().faceCamShape)
        : undefined;
      if (get().withCountdown) {
        await window.api.recording.countdown(3);
      }
      const h = await startScreenRecording({
        sourceId: sources[0].id,
        ...currentEncoderOptions(get().withMic),
        webcam,
      });
      get().begin('fullscreen', h);
      if (webcam) get().setFaceCamVisible(true);
    } catch (err) {
      console.error('Tam ekran kaydı başlatılamadı', err);
    }
  },

  async startWindow(source) {
    if (get().active) return;
    try {
      const webcam = get().withFaceCam
        ? await buildWebcamOverlay(get().faceCamShape)
        : undefined;
      if (get().withCountdown) {
        await window.api.recording.countdown(3);
      }
      const h = await startScreenRecording({
        sourceId: source.id,
        ...currentEncoderOptions(get().withMic),
        webcam,
      });
      get().begin('window', h);
      if (webcam) get().setFaceCamVisible(true);
    } catch (err) {
      console.error('Pencere kaydı başlatılamadı', err);
    }
  },

  async startWindowFirst() {
    if (get().active) return;
    try {
      const sources = await window.api.capture.listSources(['window']);
      if (sources.length === 0) return;
      await get().startWindow(sources[0]);
    } catch (err) {
      console.error('Pencere kaydı başlatılamadı', err);
    }
  },

  async startArea() {
    if (get().active) return;
    try {
      const rect = await window.api.recording.selectArea();
      if (!rect) return;
      // Overlay kapanıp ekran tazelenene kadar bir frame bekle.
      await new Promise((r) => setTimeout(r, 80));
      const sources = await window.api.capture.listSources(['screen']);
      if (sources.length === 0) return;
      const webcam = get().withFaceCam
        ? await buildWebcamOverlay(get().faceCamShape)
        : undefined;
      if (get().withCountdown) {
        await window.api.recording.countdown(3);
      }
      const h = await startAreaRecording(
        sources[0].id,
        rect,
        window.devicePixelRatio || 1,
        currentEncoderOptions(get().withMic),
        webcam,
      );
      get().begin('area', h);
      if (webcam) get().setFaceCamVisible(true);
    } catch (err) {
      console.error('Alan kaydı başlatılamadı', err);
    }
  },

  begin(mode, h) {
    handle = h;
    const startedAt = Date.now();
    set({
      active: true,
      saving: false,
      mode,
      startedAt,
      elapsedMs: 0,
      hasMic: h.hasMicrophone(),
      micMuted: h.isMicMuted(),
    });
    if (timerId) window.clearInterval(timerId);
    timerId = window.setInterval(() => get().tick(), 250);
  },

  toggleMic() {
    if (!handle || !handle.hasMicrophone()) return;
    const next = !get().micMuted;
    handle.setMicMuted(next);
    set({ micMuted: next });
  },

  setFaceCamVisible(visible) {
    set({ faceCamVisible: visible });
  },

  async toggleFaceCam() {
    const next = !get().faceCamVisible;
    if (next) {
      // Kamera açılıyor: stream al ve encoder'a enjekte et.
      const stream = await getWebcamStream();
      if (stream && handle) {
        handle.setWebcamStream(stream, get().faceCamShape);
      }
      await window.api.recording.showFaceCam();
    } else {
      // Kamera kapanıyor: encoder'a null gönder, stream'i durdur.
      handle?.setWebcamStream(null, get().faceCamShape);
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop());
        webcamStream = null;
      }
      await window.api.recording.hideFaceCam();
    }
    set({ faceCamVisible: next });
  },

  async setFaceCamShape(shape) {
    set({ faceCamShape: shape });
    handle?.setWebcamShape(shape);
    await window.api.recording.setFaceCamShape(shape);
  },

  tick() {
    const { startedAt, active, saving, paused } = get();
    if (!active || saving || paused || !startedAt) return;
    set({ elapsedMs: Date.now() - startedAt });
  },

  togglePause() {
    if (!handle || !get().active || get().saving) return;
    if (get().paused) {
      // Resume: startedAt'i pause'lanmış elapsed'a göre yeniden hesapla.
      handle.resume();
      const newStartedAt = Date.now() - pausedAtElapsedMs;
      set({ paused: false, startedAt: newStartedAt });
    } else {
      handle.pause();
      pausedAtElapsedMs = get().elapsedMs;
      set({ paused: true });
    }
  },

  setSaving(value) {
    set({ saving: value });
    // Saving moduna geçince timer'ı durdur (süre artmasın).
    if (value && timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
  },

  end() {
    handle = null;
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
    pausedAtElapsedMs = 0;
    if (webcamStream) {
      webcamStream.getTracks().forEach((t) => t.stop());
      webcamStream = null;
    }
    set({
      active: false,
      saving: false,
      paused: false,
      mode: null,
      startedAt: null,
      elapsedMs: 0,
      hasMic: false,
      micMuted: false,
      faceCamVisible: false,
      // faceCamShape'i koruyoruz — bir sonraki kayıtta kullanıcının seçimi
      // geçerli olsun.
    });
  },

  getHandle() {
    return handle;
  },
}));
