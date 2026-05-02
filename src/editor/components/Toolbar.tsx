// Editor alt çubuğu. Pencerenin alt sürümüne sabit yerleşir (fixed/floating
// değil) — toolbar görüntüye binmez ve pencere ölçeğinden bağımsız her zaman
// tam görünür. Tool, renk, kalınlık, undo/redo ve dosya aksiyonlarını barındırır.
//
// Save/copy: native canvas üzerinde flatten yapar — Konva.Stage.toCanvas
// scale+pixelRatio kombinasyonunda güvenilir değil, doğrudan compositing
// daha sağlam.
import { useEffect, useRef, useState, useCallback, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore, type Shape, type Tool } from '../store/editorStore';
import { useConfigStore } from '../store/configStore';
import { toast } from '../store/toastStore';
import type { ImageFormat } from '../../shared/types';

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

const PRESET_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff', '#000000'];
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 120;
const STROKE_MIN = 1;
const STROKE_MAX = 64;

export function ToolsBar() {
  const image = useEditorStore((s) => s.image);
  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const fontSize = useEditorStore((s) => s.fontSize);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const blurRadius = useEditorStore((s) => s.blurRadius);
  const setTool = useEditorStore((s) => s.setTool);
  const setColor = useEditorStore((s) => s.setColor);
  const setStrokeWidth = useEditorStore((s) => s.setStrokeWidth);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const setBlurRadius = useEditorStore((s) => s.setBlurRadius);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  if (!image) return null;

  return (
    <div className="shrink-0 border-b border-surface-border bg-surface-raised/60 backdrop-blur">
      <div className="flex items-center justify-center gap-2 px-3 py-2 overflow-x-auto">
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
        <ColorPicker color={color} onChangeColor={setColor} />

        <Divider />

        {/* Stroke kalınlığı — select ve text hariç tüm araçlarda göster */}
        {!['select', 'text', 'crop', 'blur', 'number'].includes(tool) && (
          <>
            <StrokePicker strokeWidth={strokeWidth} onChangeStrokeWidth={setStrokeWidth} />
            <Divider />
          </>
        )}

        {/* Font boyutu — yalnızca text toolunda göster */}
        {tool === 'text' && (
          <>
            <FontSizePicker fontSize={fontSize} onChangeFontSize={setFontSize} />
            <Divider />
          </>
        )}

        {/* Blur seviyesi — yalnızca blur toolunda göster */}
        {tool === 'blur' && (
          <>
            <BlurRadiusPicker blurRadius={blurRadius} onChangeBlurRadius={setBlurRadius} />
            <Divider />
          </>
        )}


        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <IconButton label="Geri al" onClick={undo} disabled={past.length === 0}>
            <UndoIcon />
          </IconButton>
          <IconButton label="Yinele" onClick={redo} disabled={future.length === 0}>
            <RedoIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export function ActionBar() {
  const image = useEditorStore((s) => s.image);
  const defaultFormat = useConfigStore((s) => s.defaultFormat) ?? 'png';
  const shapes = useEditorStore((s) => s.shapes);
  const resetAnnotations = useEditorStore((s) => s.resetAnnotations);
  const [uploading, setUploading] = useState(false);

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

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void onSave();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        void onCopy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  if (!image) return null;

  const onSave = async () => {
    const buf = await flattenStage(defaultFormat);
    if (!buf) {
      toast.error('Görüntü hazırlanamadı');
      return;
    }
    try {
      const d = new Date(image.capturedAt);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const H = String(d.getHours()).padStart(2, '0');
      const i = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      const stamp = `${dd}-${mm}-${yyyy}-${H}-${i}-${s}`;
      const path = await window.api.editor.saveImage(buf, `clackshot-screenshot-${stamp}.${defaultFormat}`);
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
    const buf = await flattenStage('png');
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

  const onUpload = async () => {
    const buf = await flattenStage('png');
    if (!buf) {
      toast.error('Görüntü hazırlanamadı');
      return;
    }
    setUploading(true);
    const toastId = toast.loading('Imgur\'a yükleniyor…');
    try {
      const link = await window.api.imgur.upload(buf);
      await navigator.clipboard.writeText(link);
      toast.update(toastId, {
        type: 'success',
        message: 'Link panoya kopyalandı!',
        action: { label: 'Aç', onClick: () => window.api.shell.openExternal(link) },
      });
    } catch (err) {
      console.error('[imgur] upload error:', err);
      toast.update(toastId, { type: 'error', message: 'Imgur\'a yüklenemedi' }, 5000);
    } finally {
      setUploading(false);
    }
  };

  const onClose = () => window.api.editor.closeEditor();

  return (
    <div className="shrink-0 border-t border-surface-border bg-surface-raised/60 backdrop-blur">
      <div className="flex items-center justify-between gap-1 px-3 py-2">
        <ActionButton label="Temizle" icon={<TrashIcon />} onClick={resetAnnotations} disabled={shapes.length === 0} danger />
        <div className="flex items-center gap-1">
          <ActionButton label={uploading ? 'Yükleniyor…' : 'Paylaş'} icon={<ShareIcon />} onClick={onUpload} disabled={uploading} />
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

// Undo/Redo klavye kısayollarını yönetir — ToolsBar içinden ayrıldı ki
// ActionBar ile ayrı lifecycle'da çalışabilsin.
export function UndoRedoKeyHandler() {
  const image = useEditorStore((s) => s.image);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [image, undo, redo]);

  return null;
}

function ToolButton(props: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const { ref, tooltip, onMouseEnter, onMouseLeave } = useTooltip(props.label);
  return (
    <>
      <button
        ref={ref}
        onClick={props.onClick}
        aria-label={props.label}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={
          'w-8 h-8 flex items-center justify-center rounded-md transition-colors ' +
          (props.active
            ? 'bg-accent text-white'
            : 'text-fg-muted hover:bg-surface-hover hover:text-fg')
        }
      >
        {props.icon}
      </button>
      {tooltip}
    </>
  );
}

function ColorPicker(props: { color: string; onChangeColor: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const nativeRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { tooltip: colorTooltip, onMouseEnter: colorEnter, onMouseLeave: colorLeave } = useTooltip('Renk seç');

  const close = useCallback(() => setOpen(false), []);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        dropdownRef.current?.contains(t)
      ) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-surface-raised border border-surface-border rounded-lg shadow-lg p-2 flex items-center gap-1.5"
    >
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => { props.onChangeColor(c); close(); }}
          title={c}
          aria-label={`Renk ${c}`}
          className={
            'w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0 ' +
            (props.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-raised scale-110' : '')
          }
          style={{ backgroundColor: c }}
        />
      ))}

      <button
        title="Özel renk seç"
        aria-label="Özel renk seç"
        onClick={() => nativeRef.current?.click()}
        className={
          'w-5 h-5 rounded-full border-2 border-dashed transition-transform hover:scale-110 flex-shrink-0 ' +
          (!PRESET_COLORS.includes(props.color)
            ? 'border-white scale-110'
            : 'border-fg-subtle/50 hover:border-fg-subtle')
        }
        style={!PRESET_COLORS.includes(props.color) ? { backgroundColor: props.color } : { backgroundColor: 'transparent' }}
      >
        {PRESET_COLORS.includes(props.color) && (
          <span className="text-fg-subtle text-[9px] leading-none flex items-center justify-center w-full h-full">+</span>
        )}
      </button>

      <input
        ref={nativeRef}
        type="color"
        value={props.color.startsWith('#') ? props.color : '#ef4444'}
        onChange={(e) => props.onChangeColor(e.target.value)}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative flex items-center px-1">
      <button
        ref={triggerRef}
        onClick={toggle}
        aria-label="Renk seç"
        onMouseEnter={colorEnter}
        onMouseLeave={colorLeave}
        className={
          'w-7 h-7 flex items-center justify-center rounded-md transition-colors ' +
          (open ? 'bg-surface-hover' : 'hover:bg-surface-hover')
        }
      >
        <span
          className="w-4 h-4 rounded-full ring-1 ring-white/30 flex-shrink-0"
          style={{ backgroundColor: props.color }}
        />
      </button>
      {dropdown}
      {colorTooltip}
    </div>
  );
}

function FontSizePicker(props: { fontSize: number; onChangeFontSize: (s: number) => void }) {
  const clamp = (v: number) => Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, v));
  const decrement = () => props.onChangeFontSize(clamp(props.fontSize - 1));
  const increment = () => props.onChangeFontSize(clamp(props.fontSize + 1));
  const { ref, tooltip, onMouseEnter, onMouseLeave } = useTooltip<HTMLDivElement>('Yazı boyutu');

  return (
    <>
      <div ref={ref} className="flex items-center gap-1" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-fg-muted flex-shrink-0" aria-hidden="true">
          <text x="2" y="18" fontSize="20" fontWeight="700" fontFamily="system-ui,sans-serif">A</text>
        </svg>
        <div className="flex items-center gap-0.5">
          <button
            onClick={decrement}
            aria-label="Yazı boyutunu küçült"
            className="w-6 h-6 flex items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors text-sm leading-none"
          >
            −
          </button>
          <span className="w-9 h-6 text-center text-xs flex items-center justify-center text-fg tabular-nums select-none">
            {props.fontSize}
          </span>
          <button
            onClick={increment}
            aria-label="Yazı boyutunu büyüt"
            className="w-6 h-6 flex items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors text-sm leading-none"
          >
            +
          </button>
        </div>
      </div>
      {tooltip}
    </>
  );
}

function BlurRadiusPicker(props: { blurRadius: number; onChangeBlurRadius: (r: number) => void }) {
  const clamp = (v: number) => Math.max(1, Math.min(50, v));
  const { ref, tooltip, onMouseEnter, onMouseLeave } = useTooltip<HTMLDivElement>('Bulanıklık seviyesi');

  return (
    <>
      <div ref={ref} className="flex items-center gap-1" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-muted flex-shrink-0" aria-hidden="true">
          <circle cx="12" cy="12" r="3" strokeWidth="2.5" />
          <circle cx="12" cy="12" r="7" strokeOpacity="0.5" />
          <circle cx="12" cy="12" r="10.5" strokeOpacity="0.2" />
        </svg>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => props.onChangeBlurRadius(clamp(props.blurRadius - 1))}
            aria-label="Bulanıklığı azalt"
            className="w-6 h-6 flex items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors text-sm leading-none"
          >
            −
          </button>
          <span className="w-9 h-6 text-center text-xs flex items-center justify-center text-fg tabular-nums select-none">
            {props.blurRadius}
          </span>
          <button
            onClick={() => props.onChangeBlurRadius(clamp(props.blurRadius + 1))}
            aria-label="Bulanıklığı artır"
            className="w-6 h-6 flex items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors text-sm leading-none"
          >
            +
          </button>
        </div>
      </div>
      {tooltip}
    </>
  );
}

function StrokePicker(props: { strokeWidth: number; onChangeStrokeWidth: (w: number) => void }) {
  const clamp = (v: number) => Math.max(STROKE_MIN, Math.min(STROKE_MAX, v));
  const decrement = () => props.onChangeStrokeWidth(clamp(props.strokeWidth - 1));
  const increment = () => props.onChangeStrokeWidth(clamp(props.strokeWidth + 1));
  const { ref, tooltip, onMouseEnter, onMouseLeave } = useTooltip<HTMLDivElement>('Çizgi kalınlığı');

  return (
    <>
      <div ref={ref} className="flex items-center gap-1" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-fg-muted flex-shrink-0" aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7" strokeWidth="2" strokeLinecap="round" />
          <line x1="4" y1="12" x2="20" y2="12" strokeWidth="4" strokeLinecap="round" />
          <line x1="4" y1="18" x2="20" y2="18" strokeWidth="6" strokeLinecap="round" />
        </svg>
        <div className="flex items-center gap-0.5">
          <button
            onClick={decrement}
            aria-label="Kalınlığı azalt"
            className="w-6 h-6 flex items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors text-sm leading-none"
          >
            −
          </button>
          <span className="w-9 h-6 text-center text-xs flex items-center justify-center text-fg tabular-nums select-none">
            {props.strokeWidth}
          </span>
          <button
            onClick={increment}
            aria-label="Kalınlığı artır"
            className="w-6 h-6 flex items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors text-sm leading-none"
          >
            +
          </button>
        </div>
      </div>
      {tooltip}
    </>
  );
}

function IconButton(props: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { ref, tooltip, onMouseEnter, onMouseLeave } = useTooltip(props.label);
  return (
    <>
      <button
        ref={ref}
        onClick={props.onClick}
        disabled={props.disabled}
        aria-label={props.label}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={
          'w-8 h-8 flex items-center justify-center rounded-md transition-colors ' +
          (props.disabled
            ? 'text-fg-subtle/60 cursor-not-allowed'
            : 'text-fg-muted hover:bg-surface-hover hover:text-fg')
        }
      >
        {props.children}
      </button>
      {tooltip}
    </>
  );
}

function ActionButton(props: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={
        'flex items-center gap-1.5 px-3 h-8 text-sm rounded-md transition-colors ' +
        (props.disabled
          ? 'text-fg-subtle/50 cursor-not-allowed'
          : props.primary
            ? 'bg-accent text-white hover:bg-accent-hover'
            : props.danger
              ? 'text-red-500 hover:bg-red-500/10'
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

function Tooltip({ label, anchorRef }: { label: string; anchorRef: RefObject<HTMLElement | null> }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top - 32, left: r.left + r.width / 2 });
  }, [anchorRef]);

  if (!pos) return null;
  return createPortal(
    <div
      style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)', zIndex: 99999, pointerEvents: 'none' }}
      className="px-2 py-1 rounded-md bg-zinc-900 text-white text-xs font-medium shadow-lg whitespace-nowrap animate-fade-in"
    >
      {label}
    </div>,
    document.body,
  );
}

function useTooltip<T extends HTMLElement = HTMLButtonElement>(label: string) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<T>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timer.current = setTimeout(() => setVisible(true), 500);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  const tooltip = visible ? <Tooltip label={label} anchorRef={ref} /> : null;
  return { ref, tooltip, onMouseEnter: show, onMouseLeave: hide };
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

function TrashIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
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

function ShareIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

// --- Flatten ---

const FORMAT_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

// Annotation'lı / annotation'sız mevcut görüntüyü verilen formatta ArrayBuffer'a çevirir.
// Hızlı yol: hiç shape yoksa ve format PNG ise orijinal capture buffer'ını döndür.
// Yavaş yol: native canvas üzerine image + shape'leri compose et.
async function flattenStage(format: ImageFormat): Promise<ArrayBuffer | null> {
  const { image, shapes } = useEditorStore.getState();
  if (!image) return null;

  if (shapes.length === 0 && format === 'png') {
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

  const mime = FORMAT_MIME[format] ?? 'image/png';
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), mime);
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
      const head = Math.max(8, s.strokeWidth * s.headSize);
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
