// WebCodecs tabanlı kayıt motoru.
// MediaRecorder + ffmpeg yerine doğrudan VideoEncoder/AudioEncoder kullanır.
// Çıktı: H.264 + AAC, mp4-muxer ile MP4 container'a sarılır.
// Kayıt sırasında donanım encoder'ı (VideoToolbox/Media Foundation/NVENC)
// devreye girer; "Stop"a basınca dosya zaten hazır — transcoding yok.
//
// Capture stream → MediaStreamTrackProcessor → VideoFrame stream → VideoEncoder
//                                                                       ↓
//                                                                  EncodedChunk → mp4-muxer
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { Rect, VideoQuality, VideoResolution, VideoFps } from '../../shared/types';

export interface RecorderHandle {
  stop(): Promise<Blob>;
  cancel(): void;
  isRecording(): boolean;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  hasMicrophone(): boolean;
  isMicMuted(): boolean;
  setMicMuted(muted: boolean): void;
  getMicLevel(): number;
}

export interface EncoderOptions {
  resolution: VideoResolution;
  fps: VideoFps;
  quality: VideoQuality;
  withMicrophone: boolean;
}

interface StartOptions extends EncoderOptions {
  sourceId: string;
}

// Çözünürlük preset → hedef yükseklik. Genişlik kaynak en-boy oranından türetilir.
const RESOLUTION_HEIGHT: Record<Exclude<VideoResolution, 'native'>, number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '4k': 2160,
};

// Bits-per-pixel formülü ile bitrate hesabı. Sabit bitrate yerine içerik
// boyutuna göre ölçeklenir (4K için 25 Mbps, 720p için 2.5 Mbps gibi).
const QUALITY_BPP: Record<VideoQuality, number> = {
  low: 0.05,
  medium: 0.1,
  high: 0.2,
};

// Çözünürlüğe göre H.264 profile/level seç. Yüksek çözünürlüklerde Baseline
// yetmez; High profile + uygun level gerekir.
function pickAvcCodec(width: number, height: number): string {
  const pixels = width * height;
  if (pixels <= 1280 * 720) return 'avc1.42E01F'; // Baseline 3.1
  if (pixels <= 1920 * 1080) return 'avc1.640028'; // High 4.0
  if (pixels <= 2560 * 1440) return 'avc1.640032'; // High 5.0
  return 'avc1.640033'; // High 5.1 (4K)
}

// Hedef yüksekliği kaynak çözünürlüğüne göre ayarla — kaynak hedeften
// küçükse upscale etme (kalite kazanılmaz, dosya şişer).
function computeOutputSize(
  sourceW: number,
  sourceH: number,
  resolution: VideoResolution,
): { width: number; height: number } {
  if (resolution === 'native') {
    return { width: sourceW, height: sourceH };
  }
  const targetH = RESOLUTION_HEIGHT[resolution];
  if (sourceH <= targetH) {
    return { width: sourceW, height: sourceH };
  }
  const scale = targetH / sourceH;
  // H.264 even-dimension gereksinimi.
  const w = Math.round((sourceW * scale) / 2) * 2;
  const h = Math.round(targetH / 2) * 2;
  return { width: w, height: h };
}

async function captureMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

async function micPermissionGranted(): Promise<boolean> {
  try {
    const perm = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    return perm.state === 'granted';
  } catch {
    return false;
  }
}

interface MicResources {
  micStream: MediaStream | null;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
}

// Mikrofon kaynaklarını ayarlar. withMicrophone=false olsa da izin önceden
// verilmişse track'i muted şekilde alıyoruz — kayıt sırasında widget'tan
// açılabilsin diye (encoder zaten init edilmiş olur).
async function setupMicrophone(withMicrophone: boolean): Promise<MicResources> {
  let micStream: MediaStream | null = null;

  if (withMicrophone) {
    try {
      micStream = await captureMicrophoneStream();
    } catch (err) {
      console.warn('Mikrofon erişimi başarısız, sessiz kayıt yapılıyor', err);
    }
  } else if (await micPermissionGranted()) {
    try {
      micStream = await captureMicrophoneStream();
      micStream.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
    } catch (err) {
      console.warn('Pre-grant mikrofon yakalanamadı', err);
    }
  }

  if (!micStream) {
    return { micStream: null, audioContext: null, analyser: null };
  }

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(micStream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.4;
  source.connect(analyser);

  return { micStream, audioContext, analyser };
}

async function captureDesktopStream(sourceId: string, fps: number): Promise<MediaStream> {
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxWidth: 3840,
        maxHeight: 2160,
        maxFrameRate: fps,
      },
    },
  } as unknown as MediaStreamConstraints;
  return navigator.mediaDevices.getUserMedia(constraints);
}

interface EncodingPipeline {
  start(): Promise<Blob>;
  cancel(): void;
  setPaused(paused: boolean): void;
}

// Tam pipeline: video frame'leri MediaStreamTrackProcessor'dan oku, gerekirse
// resize için OffscreenCanvas'a çiz, encoder'a gönder. Audio aynı şekilde.
// Pause: encoded data'yı bırakırız (yazma yok), timestamp'leri pausedDuration
// kadar geri offsetler — final video'da boşluk olmaz.
function buildPipeline(
  videoTrack: MediaStreamTrack,
  audioTrack: MediaStreamTrack | null,
  outWidth: number,
  outHeight: number,
  fps: number,
  bitrate: number,
): EncodingPipeline {
  const codec = pickAvcCodec(outWidth, outHeight);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: outWidth,
      height: outHeight,
      frameRate: fps,
    },
    audio: audioTrack
      ? {
          codec: 'aac',
          sampleRate: 48000,
          numberOfChannels: 1,
        }
      : undefined,
    fastStart: 'in-memory',
  });

  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;
  let videoReader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  let audioReader: ReadableStreamDefaultReader<AudioData> | null = null;
  let resizeCanvas: OffscreenCanvas | null = null;
  let resizeCtx: OffscreenCanvasRenderingContext2D | null = null;

  let cancelled = false;
  let paused = false;
  let pausedAccumUs = 0; // pause sırasında geçen toplam mikrosaniye
  let pauseStartUs = 0;
  // İlk frame timestamp'i — output'u sıfırdan başlatmak için.
  let videoBaseUs: number | null = null;
  let audioBaseUs: number | null = null;
  let frameCount = 0;
  // Keyframe'i her ~2 saniyede bir zorla — dosya seek edilebilir kalır.
  const keyframeInterval = Math.max(1, Math.round(fps * 2));

  const errorHandler = (e: Error) => {
    console.error('Encoder error', e);
  };

  // --- VIDEO ---
  videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: errorHandler,
  });
  videoEncoder.configure({
    codec,
    width: outWidth,
    height: outHeight,
    bitrate,
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
    avc: { format: 'avc' },
  });

  // --- AUDIO ---
  if (audioTrack) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: errorHandler,
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2', // AAC-LC
      sampleRate: 48000,
      numberOfChannels: 1,
      bitrate: 128_000,
    });
  }

  const trackProcessorCtor = (window as unknown as {
    MediaStreamTrackProcessor: new (init: { track: MediaStreamTrack }) => {
      readable: ReadableStream<VideoFrame | AudioData>;
    };
  }).MediaStreamTrackProcessor;

  const videoProc = new trackProcessorCtor({ track: videoTrack });
  videoReader = (videoProc.readable as ReadableStream<VideoFrame>).getReader();

  if (audioTrack) {
    const audioProc = new trackProcessorCtor({ track: audioTrack });
    audioReader = (audioProc.readable as ReadableStream<AudioData>).getReader();
  }

  // VideoFrame'i hedef boyuta getir — kaynak/hedef aynıysa direkt geçir.
  const maybeResize = (frame: VideoFrame): VideoFrame => {
    if (frame.displayWidth === outWidth && frame.displayHeight === outHeight) {
      return frame;
    }
    if (!resizeCanvas) {
      resizeCanvas = new OffscreenCanvas(outWidth, outHeight);
      resizeCtx = resizeCanvas.getContext('2d');
    }
    if (!resizeCtx) return frame;
    resizeCtx.drawImage(frame, 0, 0, outWidth, outHeight);
    const ts = frame.timestamp;
    frame.close();
    return new VideoFrame(resizeCanvas, { timestamp: ts });
  };

  const readVideo = async () => {
    if (!videoReader || !videoEncoder) return;
    while (!cancelled) {
      const { value: frame, done } = await videoReader.read();
      if (done || !frame) break;
      if (paused) {
        // Pause sırasındaki frame'leri at — encoder'a verme.
        frame.close();
        continue;
      }
      if (videoBaseUs === null) videoBaseUs = frame.timestamp;
      const adjustedTs = frame.timestamp - videoBaseUs - pausedAccumUs;
      // Negatif olamaz; pause çıkışında tek frame için savunma.
      const safeTs = Math.max(0, adjustedTs);
      const adjusted = new VideoFrame(frame, { timestamp: safeTs });
      frame.close();
      const sized = maybeResize(adjusted);
      const isKey = frameCount % keyframeInterval === 0;
      try {
        videoEncoder.encode(sized, { keyFrame: isKey });
      } catch (err) {
        console.warn('Video encode hatası', err);
      }
      sized.close();
      frameCount += 1;
    }
  };

  const readAudio = async () => {
    if (!audioReader || !audioEncoder) return;
    while (!cancelled) {
      const { value: data, done } = await audioReader.read();
      if (done || !data) break;
      if (paused) {
        data.close();
        continue;
      }
      if (audioBaseUs === null) audioBaseUs = data.timestamp;
      const adjustedTs = data.timestamp - audioBaseUs - pausedAccumUs;
      const safeTs = Math.max(0, adjustedTs);
      // AudioData için timestamp'i değiştirmek = clone gerek.
      // copyTo + ctor ile yeni AudioData üretmek pahalı — yerine direkt
      // AudioData'yı offset'leyemediğimiz için clone'a düşüyoruz.
      const buf = new Float32Array(data.numberOfFrames * data.numberOfChannels);
      try {
        data.copyTo(buf, { planeIndex: 0, format: 'f32' });
      } catch {
        data.close();
        continue;
      }
      const adjusted = new AudioData({
        format: 'f32',
        sampleRate: data.sampleRate,
        numberOfFrames: data.numberOfFrames,
        numberOfChannels: data.numberOfChannels,
        timestamp: safeTs,
        data: buf,
      });
      data.close();
      try {
        audioEncoder.encode(adjusted);
      } catch (err) {
        console.warn('Audio encode hatası', err);
      }
      adjusted.close();
    }
  };

  const videoLoop = readVideo();
  const audioLoop = audioReader ? readAudio() : Promise.resolve();

  return {
    setPaused(next: boolean) {
      if (next === paused) return;
      paused = next;
      const nowUs = performance.now() * 1000;
      if (paused) {
        pauseStartUs = nowUs;
      } else {
        pausedAccumUs += nowUs - pauseStartUs;
      }
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      try {
        videoReader?.cancel().catch(() => {});
        audioReader?.cancel().catch(() => {});
      } catch {
        // ignore
      }
      try {
        videoEncoder?.close();
      } catch {
        // ignore
      }
      try {
        audioEncoder?.close();
      } catch {
        // ignore
      }
    },
    async start(): Promise<Blob> {
      // Stop akışı: track'leri durdur → reader'lar done döner → loop'lar biter
      // → encoder.flush() ile son chunk'ları al → muxer.finalize() ile MP4 oluştur.
      videoTrack.stop();
      audioTrack?.stop();
      await Promise.allSettled([videoLoop, audioLoop]);
      try {
        await videoEncoder?.flush();
      } catch (err) {
        console.warn('Video flush hatası', err);
      }
      try {
        await audioEncoder?.flush();
      } catch (err) {
        console.warn('Audio flush hatası', err);
      }
      videoEncoder?.close();
      audioEncoder?.close();
      muxer.finalize();
      const target = muxer.target as ArrayBufferTarget;
      return new Blob([target.buffer], { type: 'video/mp4' });
    },
  };
}

interface PipelineHandleConfig {
  pipeline: EncodingPipeline;
  videoTrack: MediaStreamTrack;
  audioStream: MediaStream | null;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  extraCleanup?: () => void;
}

function buildHandle(cfg: PipelineHandleConfig): RecorderHandle {
  const { pipeline, videoTrack, audioStream, audioContext, analyser, extraCleanup } = cfg;
  const levelBuffer = analyser ? new Uint8Array(analyser.fftSize) : null;
  let stopped = false;
  let paused = false;

  const cleanupAux = () => {
    audioStream?.getTracks().forEach((t) => t.stop());
    void audioContext?.close();
    extraCleanup?.();
  };

  return {
    isRecording: () => !stopped,
    isPaused: () => paused,
    pause() {
      if (stopped) return;
      paused = true;
      pipeline.setPaused(true);
    },
    resume() {
      if (stopped) return;
      paused = false;
      pipeline.setPaused(false);
    },
    hasMicrophone: () => !!audioStream && audioStream.getAudioTracks().length > 0,
    isMicMuted: () => {
      if (!audioStream) return true;
      const t = audioStream.getAudioTracks()[0];
      return !t || !t.enabled;
    },
    setMicMuted(muted: boolean) {
      audioStream?.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });
    },
    getMicLevel() {
      if (!analyser || !levelBuffer) return 0;
      analyser.getByteTimeDomainData(levelBuffer);
      let sum = 0;
      for (let i = 0; i < levelBuffer.length; i++) {
        const v = (levelBuffer[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / levelBuffer.length);
    },
    cancel() {
      if (stopped) return;
      stopped = true;
      pipeline.cancel();
      try {
        videoTrack.stop();
      } catch {
        // ignore
      }
      cleanupAux();
    },
    async stop(): Promise<Blob> {
      if (stopped) throw new Error('Recording already stopped');
      stopped = true;
      try {
        const blob = await pipeline.start();
        return blob;
      } finally {
        cleanupAux();
      }
    },
  };
}

// Bitrate hesabı: w*h*fps*bpp formülü.
function computeBitrate(w: number, h: number, fps: number, quality: VideoQuality): number {
  const bpp = QUALITY_BPP[quality];
  return Math.round(w * h * fps * bpp);
}

// Tam ekran / pencere kaydı.
export async function startScreenRecording(opts: StartOptions): Promise<RecorderHandle> {
  const screenStream = await captureDesktopStream(opts.sourceId, opts.fps);
  const videoTrack = screenStream.getVideoTracks()[0] as MediaStreamTrack;
  const settings = videoTrack.getSettings();
  const sourceW = settings.width ?? 1920;
  const sourceH = settings.height ?? 1080;
  const { width, height } = computeOutputSize(sourceW, sourceH, opts.resolution);
  const bitrate = computeBitrate(width, height, opts.fps, opts.quality);

  const mic = await setupMicrophone(opts.withMicrophone);
  const audioTrack =
    (mic.micStream?.getAudioTracks()[0] as MediaStreamTrack | undefined) ?? null;

  const pipeline = buildPipeline(videoTrack, audioTrack, width, height, opts.fps, bitrate);

  return buildHandle({
    pipeline,
    videoTrack,
    audioStream: mic.micStream,
    audioContext: mic.audioContext,
    analyser: mic.analyser,
  });
}

// Alan kaydı: ekran stream'ini canvas'a crop edip canvas.captureStream'inden
// yeni bir video track çıkarıyoruz. Bu track'i WebCodecs pipeline'ı tüketir.
export async function startAreaRecording(
  screenSourceId: string,
  rect: Rect,
  pixelRatio: number,
  opts: EncoderOptions,
): Promise<RecorderHandle> {
  const screenStream = await captureDesktopStream(screenSourceId, opts.fps);

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = screenStream;
  await video.play();

  const sx = Math.max(0, Math.round(rect.x * pixelRatio));
  const sy = Math.max(0, Math.round(rect.y * pixelRatio));
  const sw = Math.max(2, Math.round(rect.width * pixelRatio));
  const sh = Math.max(2, Math.round(rect.height * pixelRatio));

  // Output boyutu: kullanıcı çözünürlük preset'ini buraya da uygula.
  const { width: outW, height: outH } = computeOutputSize(sw, sh, opts.resolution);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    screenStream.getTracks().forEach((t) => t.stop());
    throw new Error('Canvas 2D context oluşturulamadı');
  }

  let rafId: number | null = null;
  let running = true;
  const drawFrame = () => {
    if (!running) return;
    if (video.readyState >= 2) {
      try {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
      } catch {
        // ignore
      }
    }
    rafId = requestAnimationFrame(drawFrame);
  };
  rafId = requestAnimationFrame(drawFrame);

  const cropStream = canvas.captureStream(opts.fps);
  const cropTrack = cropStream.getVideoTracks()[0] as MediaStreamTrack;
  const bitrate = computeBitrate(outW, outH, opts.fps, opts.quality);

  const mic = await setupMicrophone(opts.withMicrophone);
  const audioTrack =
    (mic.micStream?.getAudioTracks()[0] as MediaStreamTrack | undefined) ?? null;

  const pipeline = buildPipeline(cropTrack, audioTrack, outW, outH, opts.fps, bitrate);

  const extraCleanup = () => {
    running = false;
    if (rafId !== null) cancelAnimationFrame(rafId);
    screenStream.getTracks().forEach((t) => t.stop());
    cropStream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  return buildHandle({
    pipeline,
    videoTrack: cropTrack,
    audioStream: mic.micStream,
    audioContext: mic.audioContext,
    analyser: mic.analyser,
    extraCleanup,
  });
}
