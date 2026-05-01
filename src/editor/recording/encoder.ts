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
import type { Rect, VideoQuality, VideoResolution, VideoFps, FaceCamShape } from '../../shared/types';

export interface WebcamOverlay {
  stream: MediaStream;
  shape: FaceCamShape;
}

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
  // Kayıt sırasında webcam stream'ini set et (null = kapat).
  setWebcamStream(stream: MediaStream | null, shape: FaceCamShape): void;
  // Kayıt sırasında shape'i güncelle.
  setWebcamShape(shape: FaceCamShape): void;
}

export interface EncoderOptions {
  resolution: VideoResolution;
  fps: VideoFps;
  quality: VideoQuality;
  withMicrophone: boolean;
}

interface StartOptions extends EncoderOptions {
  sourceId: string;
  webcam?: WebcamOverlay;
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
  // Live webcam değişimi için dışarıdan okunabilir ref'ler.
  webcamVideoRef?: { value: HTMLVideoElement | null };
  webcamShapeRef?: { value: FaceCamShape };
}

function buildHandle(cfg: PipelineHandleConfig): RecorderHandle {
  const { pipeline, videoTrack, audioStream, audioContext, analyser, extraCleanup, webcamVideoRef, webcamShapeRef } = cfg;
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
    setWebcamStream(stream: MediaStream | null, shape: FaceCamShape) {
      if (!webcamVideoRef) return;
      // Önceki stream'i durdur.
      const prev = webcamVideoRef.value;
      if (prev) {
        prev.srcObject = null;
      }
      if (!stream) {
        webcamVideoRef.value = null;
        return;
      }
      const vid = document.createElement('video');
      vid.muted = true;
      vid.playsInline = true;
      vid.srcObject = stream;
      void vid.play();
      webcamVideoRef.value = vid;
      if (webcamShapeRef) webcamShapeRef.value = shape;
    },
    setWebcamShape(shape: FaceCamShape) {
      if (webcamShapeRef) webcamShapeRef.value = shape;
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

// Canvas tabanlı kayıt pipeline'ı kurar. Hem area hem screen/window modunda kullanılır.
// webcam varsa sabit sağ-alt konumda composite edilir; yoksa saf ekran kaydı.
function buildCanvasPipeline(
  screenVideo: HTMLVideoElement,
  sourceW: number,
  sourceH: number,
  cropRect: { sx: number; sy: number; sw: number; sh: number } | null,
  outW: number,
  outH: number,
  fps: number,
  webcamVideoRef: { value: HTMLVideoElement | null },
  webcamShapeRef: { value: FaceCamShape },
): { stream: MediaStream; stop: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  let rafId: number | null = null;
  let running = true;

  const drawFrame = () => {
    if (!running) return;
    if (screenVideo.readyState >= 2) {
      try {
        if (cropRect) {
          ctx.drawImage(screenVideo, cropRect.sx, cropRect.sy, cropRect.sw, cropRect.sh, 0, 0, outW, outH);
        } else {
          ctx.drawImage(screenVideo, 0, 0, sourceW, sourceH, 0, 0, outW, outH);
        }
      } catch { /* ignore */ }

      const wv = webcamVideoRef.value;
      if (wv && wv.readyState >= 2) {
        drawWebcamOverlay(ctx, wv, webcamShapeRef.value, outW, outH);
      }
    }
    rafId = requestAnimationFrame(drawFrame);
  };
  rafId = requestAnimationFrame(drawFrame);

  const stream = canvas.captureStream(fps);
  return {
    stream,
    stop() {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
  };
}

// Alan kaydı: ekran stream'ini canvas'a crop edip canvas.captureStream'inden
// yeni bir video track çıkarıyoruz. Bu track'i WebCodecs pipeline'ı tüketir.
export async function startAreaRecording(
  screenSourceId: string,
  rect: Rect,
  pixelRatio: number,
  opts: EncoderOptions,
  webcam?: WebcamOverlay,
): Promise<RecorderHandle> {
  const screenStream = await captureDesktopStream(screenSourceId, opts.fps);

  const screenVideo = document.createElement('video');
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  screenVideo.srcObject = screenStream;
  await screenVideo.play();

  const sx = Math.max(0, Math.round(rect.x * pixelRatio));
  const sy = Math.max(0, Math.round(rect.y * pixelRatio));
  const sw = Math.max(2, Math.round(rect.width * pixelRatio));
  const sh = Math.max(2, Math.round(rect.height * pixelRatio));
  const { width: outW, height: outH } = computeOutputSize(sw, sh, opts.resolution);

  const webcamVideoRef: { value: HTMLVideoElement | null } = { value: null };
  const webcamShapeRef: { value: FaceCamShape } = { value: webcam?.shape ?? 'circle' };

  if (webcam) {
    const wv = document.createElement('video');
    wv.muted = true;
    wv.playsInline = true;
    wv.srcObject = webcam.stream;
    await wv.play();
    webcamVideoRef.value = wv;
  }

  const { stream: canvasStream, stop: stopCanvas } = buildCanvasPipeline(
    screenVideo, sw, sh, { sx, sy, sw, sh }, outW, outH, opts.fps, webcamVideoRef, webcamShapeRef,
  );
  const cropTrack = canvasStream.getVideoTracks()[0] as MediaStreamTrack;
  const bitrate = computeBitrate(outW, outH, opts.fps, opts.quality);
  const mic = await setupMicrophone(opts.withMicrophone);
  const audioTrack = (mic.micStream?.getAudioTracks()[0] as MediaStreamTrack | undefined) ?? null;
  const pipeline = buildPipeline(cropTrack, audioTrack, outW, outH, opts.fps, bitrate);

  const extraCleanup = () => {
    stopCanvas();
    screenStream.getTracks().forEach((t) => t.stop());
    canvasStream.getTracks().forEach((t) => t.stop());
    screenVideo.srcObject = null;
    const wv = webcamVideoRef.value;
    if (wv) wv.srcObject = null;
  };

  return buildHandle({
    pipeline,
    videoTrack: cropTrack,
    audioStream: mic.micStream,
    audioContext: mic.audioContext,
    analyser: mic.analyser,
    extraCleanup,
    webcamVideoRef,
    webcamShapeRef,
  });
}

// Tam ekran / pencere kaydı — canvas-based pipeline + webcam overlay.
export async function startScreenRecording(opts: StartOptions): Promise<RecorderHandle> {
  const screenStream = await captureDesktopStream(opts.sourceId, opts.fps);
  const rawTrack = screenStream.getVideoTracks()[0] as MediaStreamTrack;
  const settings = rawTrack.getSettings();
  const sourceW = settings.width ?? 1920;
  const sourceH = settings.height ?? 1080;
  const { width: outW, height: outH } = computeOutputSize(sourceW, sourceH, opts.resolution);

  const screenVideo = document.createElement('video');
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  screenVideo.srcObject = screenStream;
  await screenVideo.play();

  const webcamVideoRef: { value: HTMLVideoElement | null } = { value: null };
  const webcamShapeRef: { value: FaceCamShape } = { value: opts.webcam?.shape ?? 'circle' };

  if (opts.webcam) {
    const wv = document.createElement('video');
    wv.muted = true;
    wv.playsInline = true;
    wv.srcObject = opts.webcam.stream;
    await wv.play();
    webcamVideoRef.value = wv;
  }

  const { stream: canvasStream, stop: stopCanvas } = buildCanvasPipeline(
    screenVideo, sourceW, sourceH, null, outW, outH, opts.fps, webcamVideoRef, webcamShapeRef,
  );
  const compTrack = canvasStream.getVideoTracks()[0] as MediaStreamTrack;
  const bitrate = computeBitrate(outW, outH, opts.fps, opts.quality);
  const mic = await setupMicrophone(opts.withMicrophone);
  const audioTrack = (mic.micStream?.getAudioTracks()[0] as MediaStreamTrack | undefined) ?? null;
  const pipeline = buildPipeline(compTrack, audioTrack, outW, outH, opts.fps, bitrate);

  const extraCleanup = () => {
    stopCanvas();
    screenStream.getTracks().forEach((t) => t.stop());
    canvasStream.getTracks().forEach((t) => t.stop());
    screenVideo.srcObject = null;
    const wv = webcamVideoRef.value;
    if (wv) wv.srcObject = null;
  };

  return buildHandle({
    pipeline,
    videoTrack: compTrack,
    audioStream: mic.micStream,
    audioContext: mic.audioContext,
    analyser: mic.analyser,
    extraCleanup,
    webcamVideoRef,
    webcamShapeRef,
  });
}

// Face cam'i canvas'ın sağ-alt köşesine sabit olarak çizer.
// Boyut: video yüksekliğinin %22'si, minimum 80px.
function drawWebcamOverlay(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  webcamVideo: HTMLVideoElement,
  shape: FaceCamShape,
  outW: number,
  outH: number,
): void {
  const size = Math.max(80, Math.round(outH * 0.22));
  const margin = Math.round(outH * 0.03);
  const dx = outW - size - margin;
  const dy = outH - size - margin;

  ctx.save();
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(dx + size / 2, dy + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
  } else {
    const r = size * 0.09;
    ctx.beginPath();
    ctx.roundRect(dx, dy, size, size, r);
    ctx.clip();
  }
  // Beyaz çerçeve
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(2, size * 0.014);
  ctx.stroke();
  // Yatay ayna (selfie kamera — FaceCam.tsx ile tutarlı)
  ctx.translate(dx + size, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(webcamVideo, 0, 0, size, size);
  ctx.restore();
}
