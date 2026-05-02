// Ayarlar modalı. macOS native System Settings tarzı sidebar + content
// layout. Sol tarafta kategori menüsü, sağ tarafta seçili kategorinin
// içeriği. İçerik dikeyde scroll edebilir; modal yüksekliği sabit.
import { useEffect, useState, type ReactNode } from 'react';
import { useConfigStore } from '../store/configStore';
import type { AppConfig, ImageFormat, VideoFps, VideoQuality, VideoResolution } from '../../shared/types';

type ShortcutKey =
  | 'captureArea'
  | 'captureFullscreen'
  | 'captureWindow'
  | 'recordArea'
  | 'recordFullscreen'
  | 'recordWindow';

const LABELS: Record<ShortcutKey, string> = {
  captureArea: 'Alan Seç',
  captureFullscreen: 'Tam Ekran',
  captureWindow: 'Pencere',
  recordArea: 'Alan Kaydet',
  recordFullscreen: 'Tam Ekran Kaydet',
  recordWindow: 'Pencere Kaydet',
};

const CAPTURE_ORDER: ShortcutKey[] = [
  'captureArea',
  'captureFullscreen',
  'captureWindow',
];
const RECORD_ORDER: ShortcutKey[] = [
  'recordArea',
  'recordFullscreen',
  'recordWindow',
];

type TabId = 'general' | 'shortcuts' | 'recording';

interface SettingsProps {
  open: boolean;
  onClose(): void;
}

export function Settings({ open, onClose }: SettingsProps) {
  const loadConfig = useConfigStore((s) => s.load);
  const [tab, setTab] = useState<TabId>('general');

  useEffect(() => {
    if (!open) return;
    // Açılışta taze değer yükle (başka pencerelerde değişme ihtimaline karşı).
    void loadConfig();
  }, [open, loadConfig]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl mx-4 h-[600px] rounded-2xl bg-surface-raised border border-surface-border shadow-2xl animate-scale-in flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-surface-border flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-fg">Ayarlar</h2>
          <button
            className="text-fg-subtle hover:text-fg text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-surface-hover"
            onClick={onClose}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <nav className="w-52 shrink-0 border-r border-surface-border bg-surface/40 p-2 flex flex-col gap-0.5">
            <SidebarItem
              id="general"
              label="Genel"
              icon={<SlidersIcon />}
              active={tab === 'general'}
              onClick={() => setTab('general')}
            />
            <SidebarItem
              id="shortcuts"
              label="Kısayollar"
              icon={<KeyboardIcon />}
              active={tab === 'shortcuts'}
              onClick={() => setTab('shortcuts')}
            />
            <SidebarItem
              id="recording"
              label="Ekran Kaydı"
              icon={<VideoIcon />}
              active={tab === 'recording'}
              onClick={() => setTab('recording')}
            />
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === 'general' && <GeneralPane />}
            {tab === 'shortcuts' && <ShortcutsPane />}
            {tab === 'recording' && <RecordingPane />}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sidebar item ---

function SidebarItem(props: {
  id: TabId;
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      className={
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ' +
        (props.active
          ? 'bg-accent/15 text-accent'
          : 'text-fg-muted hover:text-fg hover:bg-surface-hover')
      }
    >
      <span className="w-4 h-4 flex items-center justify-center">{props.icon}</span>
      <span className="font-medium">{props.label}</span>
    </button>
  );
}

// --- Pane: Genel (Görünüm + Kayıt klasörü) ---

function GeneralPane() {
  const theme = useConfigStore((s) => s.theme);
  const setTheme = useConfigStore((s) => s.setTheme);
  const saveDirectory = useConfigStore((s) => s.saveDirectory);
  const pickSaveDirectory = useConfigStore((s) => s.pickSaveDirectory);
  const defaultFormat = useConfigStore((s) => s.defaultFormat);
  const setDefaultFormat = useConfigStore((s) => s.setDefaultFormat);
  const launchAtLogin = useConfigStore((s) => s.launchAtLogin);
  const setLaunchAtLogin = useConfigStore((s) => s.setLaunchAtLogin);

  return (
    <div className="flex flex-col gap-7">
      <Section title="Görünüm" hint="Uygulamanın renk teması.">
        <div className="grid grid-cols-3 gap-2">
          <ThemeOption
            value="light"
            label="Açık"
            current={theme}
            onChange={(v) => void setTheme(v)}
            preview="light"
          />
          <ThemeOption
            value="dark"
            label="Koyu"
            current={theme}
            onChange={(v) => void setTheme(v)}
            preview="dark"
          />
          <ThemeOption
            value="system"
            label="Sistem"
            current={theme}
            onChange={(v) => void setTheme(v)}
            preview="system"
          />
        </div>
      </Section>

      <Section title="Varsayılan Format" hint="Kaydet butonuna basıldığında önerilen dosya uzantısı.">
        <SelectField
          label="Format"
          value={defaultFormat}
          onChange={(v) => void setDefaultFormat(v as ImageFormat)}
          options={[
            { value: 'png', label: 'PNG — kayıpsız, şeffaflık destekli' },
            { value: 'jpg', label: 'JPEG — küçük boyut, fotoğraf için ideal' },
            { value: 'webp', label: 'WebP — modern, yüksek sıkıştırma' },
            { value: 'bmp', label: 'BMP — sıkıştırmasız bitmap' },
          ]}
        />
      </Section>

      <Section title="Kayıt Klasörü" hint="Yeni ekran görüntüsü ve kayıtlar varsayılan olarak buraya kaydedilir.">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-surface-border">
          <span
            className="flex-1 text-sm text-fg-muted truncate font-mono"
            title={saveDirectory ?? ''}
          >
            {saveDirectory ?? '—'}
          </span>
          <button
            onClick={() => void pickSaveDirectory()}
            className="px-3 py-1 text-xs rounded-md bg-surface-hover text-fg hover:opacity-80 border border-surface-border whitespace-nowrap"
          >
            Değiştir
          </button>
        </div>
      </Section>

      <Section title="Sistem" hint="Oturum açıldığında uygulamanın otomatik başlatılması.">
        <ToggleRow
          label="Başlangıçta Otomatik Başlat"
          hint="Bilgisayar açıldığında ClackShot arka planda çalışmaya başlar."
          value={launchAtLogin}
          onChange={(v) => void setLaunchAtLogin(v)}
        />
      </Section>
    </div>
  );
}

// --- Pane: Kısayollar ---

function ShortcutsPane() {
  const shortcuts = useConfigStore((s) => s.shortcuts);
  const setShortcutInStore = useConfigStore((s) => s.setShortcut);
  const [recording, setRecording] = useState<ShortcutKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }

      const accel = formatAccelerator(e);
      if (!accel) return;

      void commitShortcut(recording, accel);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording]);

  async function commitShortcut(key: ShortcutKey, accel: string) {
    setError(null);
    const res = await setShortcutInStore(key, accel);
    if (res.ok) {
      setRecording(null);
    } else {
      setError(res.error || 'Kısayol kaydedilemedi');
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <Section title="Kısayollar" hint="Bir kısayolu değiştirmek için üstüne tıklayın.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <ShortcutColumn
            title="Ekran Görüntüsü"
            order={CAPTURE_ORDER}
            shortcuts={shortcuts}
            recording={recording}
            onRebind={(k) => {
              setError(null);
              setRecording(k);
            }}
            onCancel={() => setRecording(null)}
          />
          <ShortcutColumn
            title="Ekran Kaydı"
            order={RECORD_ORDER}
            shortcuts={shortcuts}
            recording={recording}
            onRebind={(k) => {
              setError(null);
              setRecording(k);
            }}
            onCancel={() => setRecording(null)}
          />
        </div>

        <div className="mt-3 min-h-[1.25rem] text-xs">
          {error ? (
            <span className="text-red-400">{error}</span>
          ) : recording ? (
            <span className="text-fg-subtle">
              Yeni kısayol kombinasyonuna basın. İptal için Esc.
            </span>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

// --- Pane: Ekran Kaydı ---

function RecordingPane() {
  const videoResolution = useConfigStore((s) => s.videoResolution);
  const videoFps = useConfigStore((s) => s.videoFps);
  const videoQuality = useConfigStore((s) => s.videoQuality);
  const setVideoResolution = useConfigStore((s) => s.setVideoResolution);
  const setVideoFps = useConfigStore((s) => s.setVideoFps);
  const setVideoQuality = useConfigStore((s) => s.setVideoQuality);

  return (
    <div className="flex flex-col gap-7">
      <Section
        title="Video Ayarları"
        hint="Yüksek çözünürlük + FPS dosya boyutunu büyütür. Çoğu kullanım için 1080p / 30 fps / Orta yeterlidir."
      >
        <div className="grid grid-cols-3 gap-3">
          <SelectField
            label="Çözünürlük"
            value={videoResolution}
            onChange={(v) => void setVideoResolution(v as VideoResolution)}
            options={[
              { value: '720p', label: '720p (HD)' },
              { value: '1080p', label: '1080p (Full HD)' },
              { value: '1440p', label: '1440p (2K)' },
              { value: '4k', label: '2160p (4K)' },
              { value: 'native', label: 'Native (Ekran)' },
            ]}
          />
          <SelectField
            label="FPS"
            value={String(videoFps)}
            onChange={(v) => void setVideoFps(Number(v) as VideoFps)}
            options={[
              { value: '30', label: '30 fps' },
              { value: '60', label: '60 fps' },
            ]}
          />
          <SelectField
            label="Kalite"
            value={videoQuality}
            onChange={(v) => void setVideoQuality(v as VideoQuality)}
            options={[
              { value: 'low', label: 'Düşük' },
              { value: 'medium', label: 'Orta' },
              { value: 'high', label: 'Yüksek' },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}

// --- Reusable components ---

function Section(props: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-fg mb-1">{props.title}</h3>
      {props.hint && <p className="text-xs text-fg-subtle mb-3">{props.hint}</p>}
      {props.children}
    </section>
  );
}

function ShortcutColumn(props: {
  title: string;
  order: ShortcutKey[];
  shortcuts: Record<ShortcutKey, string> | null;
  recording: ShortcutKey | null;
  onRebind(k: ShortcutKey): void;
  onCancel(): void;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-2">
        {props.title}
      </div>
      <div className="flex flex-col gap-2">
        {props.shortcuts &&
          props.order.map((key) => (
            <ShortcutRow
              key={key}
              label={LABELS[key]}
              value={props.shortcuts![key]}
              recording={props.recording === key}
              onRebind={() => props.onRebind(key)}
              onCancel={props.onCancel}
            />
          ))}
      </div>
    </div>
  );
}

function ShortcutRow(props: {
  label: string;
  value: string;
  recording: boolean;
  onRebind(): void;
  onCancel(): void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-surface border border-surface-border">
      <span className="text-fg text-sm font-medium">{props.label}</span>
      <button
        onClick={props.recording ? props.onCancel : props.onRebind}
        className={
          'px-3 py-1 text-xs font-mono rounded-md transition-colors min-w-[7rem] ' +
          (props.recording
            ? 'bg-accent/20 text-accent border border-accent/40 animate-pulse'
            : 'bg-surface-hover text-fg-muted border border-surface-border hover:border-fg-subtle')
        }
      >
        {props.recording ? 'Tuşlara bas…' : props.value}
      </button>
    </div>
  );
}

function ThemeOption(props: {
  value: AppConfig['theme'];
  label: string;
  current: AppConfig['theme'];
  preview: 'light' | 'dark' | 'system';
  onChange(v: AppConfig['theme']): void;
}) {
  const active = props.current === props.value;
  return (
    <button
      onClick={() => props.onChange(props.value)}
      className={
        'flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors ' +
        (active
          ? 'border-accent bg-accent/10'
          : 'border-surface-border bg-surface hover:border-fg-subtle')
      }
    >
      <ThemePreview kind={props.preview} />
      <span className={'text-xs font-medium ' + (active ? 'text-accent' : 'text-fg-muted')}>
        {props.label}
      </span>
    </button>
  );
}

function ThemePreview({ kind }: { kind: 'light' | 'dark' | 'system' }) {
  if (kind === 'system') {
    return (
      <div className="w-full h-12 rounded-md overflow-hidden border border-surface-border flex">
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-zinc-900" />
      </div>
    );
  }
  return (
    <div
      className={
        'w-full h-12 rounded-md border border-surface-border flex items-center justify-center ' +
        (kind === 'light' ? 'bg-white' : 'bg-zinc-900')
      }
    >
      <div
        className={
          'w-6 h-1.5 rounded-full ' + (kind === 'light' ? 'bg-zinc-300' : 'bg-zinc-700')
        }
      />
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  hint?: string;
  value: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-xl bg-surface border border-surface-border">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-fg">{props.label}</span>
        {props.hint && <span className="text-xs text-fg-subtle">{props.hint}</span>}
      </div>
      <button
        role="switch"
        aria-checked={props.value}
        onClick={() => props.onChange(!props.value)}
        className={
          'relative w-10 h-6 rounded-full transition-colors shrink-0 focus:outline-none ' +
          (props.value ? 'bg-accent' : 'bg-surface-border')
        }
      >
        <span
          className={
            'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ' +
            (props.value ? 'translate-x-5' : 'translate-x-1')
          }
        />
      </button>
    </div>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange(v: string): void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider">
        {props.label}
      </span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="px-3 py-2 text-sm rounded-xl bg-surface border border-surface-border text-fg hover:border-fg-subtle focus:border-accent focus:outline-none cursor-pointer"
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// --- Sidebar icons ---

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

function SlidersIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="6" y1="10" x2="6" y2="10" />
      <line x1="10" y1="10" x2="10" y2="10" />
      <line x1="14" y1="10" x2="14" y2="10" />
      <line x1="18" y1="10" x2="18" y2="10" />
      <line x1="7" y1="14" x2="17" y2="14" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

// Tarayıcı KeyboardEvent → Electron accelerator string.
// Doc: https://www.electronjs.org/docs/latest/api/accelerator
function formatAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.metaKey) mods.push('Cmd');
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  const k = e.key;
  if (k === 'Meta' || k === 'Control' || k === 'Alt' || k === 'Shift') return null;

  let main: string;
  if (k.length === 1) {
    main = k.toUpperCase();
  } else {
    const map: Record<string, string> = {
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      Escape: 'Esc',
      Enter: 'Return',
      ' ': 'Space',
      Tab: 'Tab',
      Backspace: 'Backspace',
      Delete: 'Delete',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      Insert: 'Insert',
    };
    main = map[k] || k;
  }

  // F-tuşları modifier'sız da olabilir; diğerleri en az bir modifier ister.
  const isFunctionKey = /^F([1-9]|1\d|2[0-4])$/.test(main);
  if (mods.length === 0 && !isFunctionKey) return null;

  return [...mods, main].join('+');
}
