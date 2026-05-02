// Editor state — Zustand. Capture sonucu, aktif tool, çizilen shape'ler ve
// undo/redo history'sini tutar. Tüm mutasyonlar past/future stack'leri
// üzerinden ilerler ki yeniden çağırma her zaman tutarlı olsun.
import { create } from 'zustand';

interface CapturedImage {
  buffer: ArrayBuffer; // PNG bytes
  width: number;
  height: number;
  capturedAt: number;
  objectUrl: string;
}

export type Tool =
  | 'select'
  | 'pen'
  | 'rect'
  | 'arrow'
  | 'blur'
  | 'text'
  | 'number'
  | 'crop';

interface BasePen {
  id: string;
  type: 'pen';
  points: number[];
  stroke: string;
  strokeWidth: number;
}
interface BaseRect {
  id: string;
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
}
interface BaseArrow {
  id: string;
  type: 'arrow';
  points: [number, number, number, number];
  stroke: string;
  strokeWidth: number;
  headSize: number; // ok başı çarpanı (1=küçük, 3=orta, 5=büyük)
}
interface BaseBlur {
  id: string;
  type: 'blur';
  x: number;
  y: number;
  width: number;
  height: number;
  blurRadius: number;
}
interface BaseText {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
}
interface BaseNumber {
  id: string;
  type: 'number';
  x: number;
  y: number;
  value: number;
  radius: number;
  fill: string;
}

export type Shape = BasePen | BaseRect | BaseArrow | BaseBlur | BaseText | BaseNumber;

interface EditorState {
  image: CapturedImage | null;
  tool: Tool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  arrowHeadSize: number;
  blurRadius: number;
  shapes: Shape[];
  past: Shape[][];
  future: Shape[][];
  // Aktif select tool'da seçili shape id'si.
  selectedId: string | null;
  // Crop tool aktifken üzerinde çalışılan crop bölgesi (image-space).
  cropRect: { x: number; y: number; width: number; height: number } | null;
  setImage(buffer: ArrayBuffer, width: number, height: number, capturedAt: number): void;
  clearImage(): void;
  setTool(tool: Tool): void;
  setColor(color: string): void;
  setStrokeWidth(w: number): void;
  setFontSize(size: number): void;
  setArrowHeadSize(size: number): void;
  setBlurRadius(r: number): void;
  setSelected(id: string | null): void;
  setCropRect(r: { x: number; y: number; width: number; height: number } | null): void;
  applyCrop(): Promise<void>;
  // Yeni shape ekleyip past'e bir snapshot atar (undo target).
  beginShape(shape: Shape): void;
  // Aktif çizim sırasında son shape'i mutate eder; history'e dokunmaz.
  mutateLastShape(fn: (s: Shape) => Shape): void;
  // Mevcut bir shape'i id ile günceller, past'e snapshot atar (text edit için).
  commitUpdate(id: string, fn: (s: Shape) => Shape): void;
  removeShape(id: string): void;
  undo(): void;
  redo(): void;
  resetAnnotations(): void;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 11);
}

// Shape'i (dx, dy) kadar kaydır. Crop sonrası koordinatları yeni image'a
// göre düzeltirken kullanılır.
function shiftShape(s: Shape, dx: number, dy: number): Shape {
  switch (s.type) {
    case 'pen':
      return {
        ...s,
        points: s.points.map((p, i) => (i % 2 === 0 ? p + dx : p + dy)),
      };
    case 'arrow':
      return {
        ...s,
        points: [s.points[0] + dx, s.points[1] + dy, s.points[2] + dx, s.points[3] + dy],
      };
    case 'rect':
    case 'blur':
    case 'text':
    case 'number':
      return { ...s, x: s.x + dx, y: s.y + dy };
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  image: null,
  tool: 'pen',
  color: '#ef4444',
  strokeWidth: 15,
  fontSize: 24,
  arrowHeadSize: 5,
  blurRadius: 16,
  shapes: [],
  past: [],
  future: [],
  selectedId: null,
  cropRect: null,

  setImage(buffer, width, height, capturedAt) {
    const prev = get().image;
    if (prev) URL.revokeObjectURL(prev.objectUrl);

    const blob = new Blob([buffer], { type: 'image/png' });
    const objectUrl = URL.createObjectURL(blob);
    set({
      image: { buffer, width, height, capturedAt, objectUrl },
      shapes: [],
      past: [],
      future: [],
      selectedId: null,
    });
  },

  clearImage() {
    const prev = get().image;
    if (prev) URL.revokeObjectURL(prev.objectUrl);
    set({ image: null, shapes: [], past: [], future: [], selectedId: null });
  },

  setTool(tool) {
    // Select tool'dan başkasına geçince seçimi temizle.
    if (tool !== 'select') set({ tool, selectedId: null });
    else set({ tool });
  },
  setColor(color) {
    set({ color });
  },
  setStrokeWidth(strokeWidth) {
    set({ strokeWidth });
  },
  setFontSize(fontSize) {
    set({ fontSize });
  },
  setArrowHeadSize(arrowHeadSize) {
    set({ arrowHeadSize });
  },
  setBlurRadius(blurRadius) {
    set({ blurRadius });
  },
  setSelected(id) {
    set({ selectedId: id });
  },
  setCropRect(r) {
    set({ cropRect: r });
  },

  async applyCrop() {
    const { image, cropRect, shapes, past } = get();
    if (!image || !cropRect) return;
    const { x: cx, y: cy, width: cw, height: ch } = cropRect;
    if (cw < 4 || ch < 4) return;

    // Crop'lu yeni PNG üret.
    const out = document.createElement('canvas');
    out.width = Math.round(cw);
    out.height = Math.round(ch);
    const ctx = out.getContext('2d');
    if (!ctx) return;

    const sourceImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = image.objectUrl;
    });
    ctx.drawImage(sourceImg, cx, cy, cw, ch, 0, 0, cw, ch);

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) return;
    const buf = await blob.arrayBuffer();

    // Tüm shape'leri crop offset'i ile shift et. Crop dışında kalanlar
    // korunur ama clipping ile gizli olur — basitlik için silmiyoruz.
    const shifted: Shape[] = shapes.map((s) => shiftShape(s, -cx, -cy));

    // Yeni image'a geç + past'e mevcut shape'i kaydet (undo crop edilmiş
    // image'ı geri döndürmez ama shape'leri geri alır — image-level undo
    // şu an yok).
    const prev = get().image;
    if (prev) URL.revokeObjectURL(prev.objectUrl);
    const objectUrl = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
    set({
      image: {
        buffer: buf,
        width: Math.round(cw),
        height: Math.round(ch),
        capturedAt: image.capturedAt,
        objectUrl,
      },
      shapes: shifted,
      past: [...past, shapes],
      future: [],
      cropRect: null,
      tool: 'select',
      selectedId: null,
    });
  },

  beginShape(shape) {
    const { shapes, past } = get();
    set({
      shapes: [...shapes, shape],
      past: [...past, shapes],
      future: [],
    });
  },

  mutateLastShape(fn) {
    const { shapes } = get();
    if (shapes.length === 0) return;
    const last = shapes[shapes.length - 1];
    set({ shapes: [...shapes.slice(0, -1), fn(last)] });
  },

  commitUpdate(id, fn) {
    const { shapes, past } = get();
    const idx = shapes.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const next = shapes.slice();
    next[idx] = fn(shapes[idx]);
    set({ shapes: next, past: [...past, shapes], future: [] });
  },

  removeShape(id) {
    const { shapes, past, selectedId } = get();
    const next = shapes.filter((s) => s.id !== id);
    if (next.length === shapes.length) return;
    set({
      shapes: next,
      past: [...past, shapes],
      future: [],
      selectedId: selectedId === id ? null : selectedId,
    });
  },

  undo() {
    const { past, shapes, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      shapes: prev,
      past: past.slice(0, -1),
      future: [...future, shapes],
    });
  },

  redo() {
    const { past, shapes, future } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1];
    set({
      shapes: next,
      past: [...past, shapes],
      future: future.slice(0, -1),
    });
  },

  resetAnnotations() {
    const { shapes, past } = get();
    if (shapes.length === 0) return;
    set({ shapes: [], past: [...past, shapes], future: [] });
  },
}));

// genId'yi shape oluşturucu helper olarak da export et.
export { genId };
