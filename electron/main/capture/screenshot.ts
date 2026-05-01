// Ekran görüntüsü pipeline'ı.
//
// Strateji:
//   1) desktopCapturer.getSources() ile hedef ekranı/pencereyi al.
//      thumbnailSize'ı displayin fiziksel boyutuna eşitleyerek tam çözünürlüklü
//      bir NativeImage elde ediyoruz. Ek MediaStream gerekmiyor — bu da overlay
//      açmadan tam ekran capture'u <100ms tutmamızı sağlar.
//   2) 'area' modu için NativeImage.crop() yeterli; sharp çağrısına bile gerek yok.
//   3) PNG buffer'ı renderer'a transferable ArrayBuffer olarak veriyoruz.
import { desktopCapturer, screen, nativeImage, Display } from 'electron';
import type {
  CaptureResult,
  Rect,
  ScreenshotOptions,
} from '../../../src/shared/types';
import { log } from '../utils/logger';

function pickDisplay(displayId?: number): Display {
  const all = screen.getAllDisplays();
  if (displayId != null) {
    const found = all.find((d) => d.id === displayId);
    if (found) return found;
  }
  return screen.getPrimaryDisplay();
}

async function captureFullDisplay(display: Display): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  // scaleFactor: Retina/HiDPI'da fiziksel piksel sayısı.
  const scale = display.scaleFactor || 1;
  const width = Math.round(display.size.width * scale);
  const height = Math.round(display.size.height * scale);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });

  const target = sources.find(
    (s) =>
      s.display_id === String(display.id) ||
      Number(s.display_id) === display.id,
  );
  // Tek ekran sistemlerinde display_id boş gelebilir — ilk kaynağa düş.
  const source = target ?? sources[0];
  if (!source) throw new Error('Hiç ekran kaynağı bulunamadı.');

  const img = source.thumbnail;
  const size = img.getSize();
  return {
    buffer: img.toPNG(),
    width: size.width,
    height: size.height,
  };
}

async function captureWindow(sourceId: string): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  // Windows için thumbnailSize üst limiti var — pratikte 4K çoğu pencere için yeterli.
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 3840, height: 2160 },
  });
  const source = sources.find((s) => s.id === sourceId);
  if (!source) throw new Error(`Pencere kaynağı bulunamadı: ${sourceId}`);

  const size = source.thumbnail.getSize();
  return {
    buffer: source.thumbnail.toPNG(),
    width: size.width,
    height: size.height,
  };
}

function cropPng(
  fullDisplay: { buffer: Buffer; width: number; height: number },
  rect: Rect,
  display: Display,
): { buffer: Buffer; width: number; height: number } {
  // Overlay'den gelen rect mantıksal koordinatlardadır; fiziksel piksele çeviriyoruz.
  const scale = display.scaleFactor || 1;
  const px = {
    x: Math.max(0, Math.round(rect.x * scale)),
    y: Math.max(0, Math.round(rect.y * scale)),
    width: Math.min(
      fullDisplay.width - Math.round(rect.x * scale),
      Math.round(rect.width * scale),
    ),
    height: Math.min(
      fullDisplay.height - Math.round(rect.y * scale),
      Math.round(rect.height * scale),
    ),
  };
  if (px.width <= 0 || px.height <= 0) {
    throw new Error('Seçim alanı geçersiz.');
  }

  // NativeImage doğrudan crop edemez (Buffer'a indikten sonra), bu yüzden
  // önce decode edip sonra crop ediyoruz. Phase 4'te sharp ile değiştirilebilir.
  const img = nativeImage.createFromBuffer(fullDisplay.buffer);
  const cropped = img.crop({ x: px.x, y: px.y, width: px.width, height: px.height });
  const size = cropped.getSize();
  return {
    buffer: cropped.toPNG(),
    width: size.width,
    height: size.height,
  };
}

export async function takeScreenshot(opts: ScreenshotOptions): Promise<CaptureResult> {
  const display = pickDisplay(opts.displayId);
  log.info('takeScreenshot', { mode: opts.mode, displayId: display.id });

  let result: { buffer: Buffer; width: number; height: number };

  switch (opts.mode) {
    case 'fullscreen':
      result = await captureFullDisplay(display);
      break;
    case 'area': {
      if (!opts.rect) throw new Error('Area modu için rect zorunlu.');
      const full = await captureFullDisplay(display);
      result = cropPng(full, opts.rect, display);
      break;
    }
    case 'window': {
      if (!opts.sourceId) throw new Error('Window modu için sourceId zorunlu.');
      result = await captureWindow(opts.sourceId);
      break;
    }
    default:
      throw new Error(`Bilinmeyen capture modu: ${opts.mode as string}`);
  }

  // Buffer → ArrayBuffer (transferable). Node Buffer'ın altındaki ArrayBuffer'ı
  // doğrudan gönderiyoruz; renderer tarafında copy yok.
  // Buffer.buffer tipi `ArrayBufferLike` (ArrayBuffer | SharedArrayBuffer) —
  // pratikte hep ArrayBuffer ama TS narrow yapamadığı için cast.
  const ab = result.buffer.buffer.slice(
    result.buffer.byteOffset,
    result.buffer.byteOffset + result.buffer.byteLength,
  ) as ArrayBuffer;

  return {
    pngBuffer: ab,
    width: result.width,
    height: result.height,
    capturedAt: Date.now(),
  };
}
