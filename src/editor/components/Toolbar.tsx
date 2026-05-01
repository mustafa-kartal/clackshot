// Editor alt çubuğu. Pencerenin alt sürümüne sabit yerleşir (fixed/floating
// değil) — toolbar görüntüye binmez ve pencere ölçeğinden bağımsız her zaman
// tam görünür. Tool, renk, kalınlık, undo/redo ve dosya aksiyonlarını barındırır.
//
// Save/copy: native canvas üzerinde flatten yapar — Konva.Stage.toCanvas
// scale+pixelRatio kombinasyonunda güvenilir değil, doğrudan compositing
// daha sağlam.
import { useEffect, type ReactNode } from 'react';
import { useEditorStore, type Shape, type Tool } from '../store/editorStore';
import { toast } from '../store/toastStore';

const TOOLS: Array<{ id: Tool; label: string; icon: ReactNode }> = [
  { id: 'select', label: 'Seç', icon: <SelectIcon /> },
  { id: 'pen', label: 'Kalem', icon: <PenIcon /> },
  { id: 'rect', label: 'Dikdörtgen', icon: <RectIcon /> },
  { id: 'arrow', label: 'Ok', icon: <ArrowIcon /> },
  { id: 'blur', label: 'Bulanıklaştır', icon: <BlurIcon /> },
  { id: 'text', label: 'Metin', icon: <TextIcon /> },
  { id: 'number', label: 'Numara', icon: <NumberIcon /> },
  { id: 'crop', label: 'Kırp', icon: <CropIcon /> },
];

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff'];
const STROKES = [2, 4, 8];

export function Toolbar() {
  const image = useEditorStore((s) => s.image);
  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const setTool = useEditorStore((s) => s.setTool);
  const setColor = useEditorStore((s) => s.setColor);
  const setStrokeWidth = useEditorStore((s) => s.setStrokeWidth);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  // Klavye kısayolları: Cmd/Ctrl+Z undo, Cmd+Shift+Z redo, Cmd+S kaydet,
  // Cmd+C kopyala, Esc kapat.
  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        window.api.editor.closeEditor();
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void onSave();
      } else if (e.key === 'c' || e.key === 'C') {
        // Kullanıcı zaten metin seçmediyse copy=görsel; metin seçmişse default
        // bırak (textarea kontrolü zaten yukarıda).
        e.preventDefault();
        void onCopy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // onSave/onCopy intentionally omitted — closure-stable her render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, undo, redo]);

  if (!image) return null;

  const onSave = async () => {
    const buf = await flattenStageToPng();
    if (!buf) {
      toast.error('Görüntü hazırlanamadı');
      return;
    }
    try {
      const path = await window.api.editor.saveImage(buf, `screenshot-${image.capturedAt}.png`);
      if (path) {
        const fileName = path.split('/').pop() ?? path;
        toast.success(`Kaydedildi: ${fileName}`, { label: 'Klasörü Göster', onClick: () => window.api.shell.showItemInFolder(path) });
      }
    } catch (err) {
      console.error(err);
      toast.error('Dosya kaydedilemedi');
    }
  };

  const onCopy = async () => {
    const buf = await flattenStageToPng();
    if (!buf) {
      toast.error('Görüntü hazırlanamadı');
      return;
    }
    try {
      await window.api.editor.copyImageToClipboard(buf);
      toast.success('Panoya kopyalandı');
      window.api.editor.closeEditor();
    } catch (err) {
      console.error(err);
      toast.error('Panoya kopyalanamadı');
    }
  };

  const onClose = () => window.api.editor.closeEditor();

  return (
    <div className="shrink-0 border-t border-surface-border bg-surface-raised/60 backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
        {/* Tools */}
        <div className="flex items-center gap-0.5">
          {TOOLS.map((t) => (
            <ToolButton
              key={t.id}
              label={t.label}
              icon={t.icon}
              active={tool === t.id}
              onClick={() => setTool(t.id)}
            />
          ))}
        </div>

        <Divider />

        {/* Renkler */}
        <div className="flex items-center gap-1.5 px-1">
          {COLORS.map((c) => (
            <ColorSwatch key={c} color={c} active={color === c} onClick={() => setColor(c)} />
          ))}
        </div>

        <Divider />

        {/* Stroke kalınlığı */}
        <div className="flex items-center gap-0.5">
          {STROKES.map((w) => (
            <StrokeButton
              key={w}
              size={w}
              active={strokeWidth === w}
              onClick={() => setStrokeWidth(w)}
            />
          ))}
        </div>

        <Divider />

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <IconButton label="Geri al" onClick={undo} disabled={past.length === 0}>
            <UndoIcon />
          </IconButton>
          <IconButton label="Yinele" onClick={redo} disabled={future.length === 0}>
            <RedoIcon />
          </IconButton>
        </div>

        {/* Esnek boşluk → aksiyonlar sağa yapışsın */}
        <div className="flex-1" />

        {/* Aksiyonlar */}
        <div className="flex items-center gap-1">
          <ActionButton label="Kopyala" icon={<CopyIcon />} onClick={onCopy} />
          <ActionButton label="Kaydet" icon={<SaveIcon />} primary onClick={onSave} />
          <IconButton label="Kapat" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function ToolButton(props: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      className={
        'w-8 h-8 flex items-center justify-center rounded-md transition-colors ' +
        (props.active
          ? 'bg-accent text-white'
          : 'text-fg-muted hover:bg-surface-hover hover:text-fg')
      }
    >
      {props.icon}
    </button>
  );
}

function ColorSwatch(props: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      title={props.color}
      aria-label={`Renk ${props.color}`}
      className={
        'w-5 h-5 rounded-full transition-transform ' +
        (props.active
          ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-raised scale-110'
          : 'hover:scale-110')
      }
      style={{ backgroundColor: props.color }}
    />
  );
}

function StrokeButton(props: { size: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      title={`${props.size}px`}
      aria-label={`Kalınlık ${props.size}px`}
      className={
        'w-8 h-8 flex items-center justify-center rounded-md transition-colors ' +
        (props.active ? 'bg-surface-hover' : 'hover:bg-surface-hover')
      }
    >
      <span
        className="block rounded-full bg-zinc-200"
        style={{ width: props.size + 2, height: props.size + 2 }}
      />
    </button>
  );
}

function IconButton(props: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
      aria-label={props.label}
      className={
        'w-8 h-8 flex items-center justify-center rounded-md transition-colors ' +
        (props.disabled
          ? 'text-fg-subtle/60 cursor-not-allowed'
          : 'text-fg-muted hover:bg-surface-hover hover:text-fg')
      }
    >
      {props.children}
    </button>
  );
}

function ActionButton(props: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      className={
        'flex items-center gap-1.5 px-3 h-8 text-sm rounded-md transition-colors ' +
        (props.primary
          ? 'bg-accent text-white hover:bg-accent-hover'
          : 'text-fg hover:bg-surface-hover')
      }
    >
      {props.icon}
      <span className="font-medium">{props.label}</span>
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-surface-border" />;
}

// --- Icons ---

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function SelectIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M5 3l14 7-7 2-2 7-5-16z" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 5 20 12 13 19" />
    </svg>
  );
}

function BlurIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="6" cy="6" r="1.5" />
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="18" cy="6" r="1.5" />
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
      <circle cx="6" cy="18" r="1.5" />
      <circle cx="12" cy="18" r="1.5" />
      <circle cx="18" cy="18" r="1.5" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function NumberIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        1
      </text>
    </svg>
  );
}

function CropIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <polyline points="15 14 20 9 15 4" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}

// --- Flatten ---

// Annotation'lı / annotation'sız mevcut görüntüyü PNG ArrayBuffer'a çevirir.
// Hızlı yol: hiç shape yoksa orijinal capture buffer'ını döndür.
// Yavaş yol: native canvas üzerine image + shape'leri kendin compose et.
async function flattenStageToPng(): Promise<ArrayBuffer | null> {
  const { image, shapes } = useEditorStore.getState();
  if (!image) return null;

  if (shapes.length === 0) {
    // Capture buffer'ı zaten transferable bir ArrayBuffer kopyası — doğrudan
    // kopyala/kaydet için en güvenilir yol.
    return image.buffer.slice(0);
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imgEl = await loadImage(image.objectUrl);
  ctx.drawImage(imgEl, 0, 0);

  for (const s of shapes) {
    drawShape(ctx, s, imgEl);
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
  if (!blob) return null;
  return await blob.arrayBuffer();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, imgEl: HTMLImageElement): void {
  ctx.save();
  switch (s.type) {
    case 'pen': {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < s.points.length; i += 2) {
        const x = s.points[i];
        const y = s.points[i + 1];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'rect': {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.strokeRect(s.x, s.y, s.width, s.height);
      break;
    }
    case 'arrow': {
      const [x1, y1, x2, y2] = s.points;
      ctx.strokeStyle = s.stroke;
      ctx.fillStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(8, s.strokeWidth * 3);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - head * Math.cos(angle - Math.PI / 6),
        y2 - head * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        x2 - head * Math.cos(angle + Math.PI / 6),
        y2 - head * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'blur': {
      if (s.width <= 0 || s.height <= 0) break;
      ctx.filter = `blur(${s.blurRadius}px)`;
      ctx.drawImage(imgEl, s.x, s.y, s.width, s.height, s.x, s.y, s.width, s.height);
      ctx.filter = 'none';
      break;
    }
    case 'text': {
      const family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
      ctx.fillStyle = s.fill;
      ctx.font = `bold ${s.fontSize}px ${family}`;
      ctx.textBaseline = 'top';
      const lines = s.text.split('\n');
      const lineHeight = s.fontSize * 1.2;
      lines.forEach((line, i) => {
        ctx.fillText(line, s.x, s.y + i * lineHeight);
      });
      break;
    }
    case 'number': {
      const family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
      // Daire
      ctx.fillStyle = s.fill;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      // Beyaz halka
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Numara metni
      const fontSize = Math.round(s.radius * 1.1);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fontSize}px ${family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(s.value), s.x, s.y);
      break;
    }
  }
  ctx.restore();
}
