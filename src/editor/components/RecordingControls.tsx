// Aktif kayıt sırasında ekranda gözüken floating widget. Süreyi gösterir,
// "Durdur" butonu ile kaydı bitirir, save dialog'unu açar ve dosyayı yazar.
// Kullanıcı mp4/mov seçerse main tarafında ffmpeg ile dönüştürülür — bu
// sırada widget "Kaydediliyor…" durumunda kalır. 'area' modunda kayıt
// sırasında açık olan dim+çerçeve overlay'i de stop/cancel'da kapatılır.
//
// `embedded`=true: pencere widget moduna geçtiğinde tüm pencere alanını
// kapla; aksi halde fixed-pozisyonlu floating bar olarak render et.
import { useEffect, useRef, useState } from 'react';
import { useRecordingStore } from '../store/recordingStore';
import { toast } from '../store/toastStore';
import type { FaceCamShape } from '../../shared/types';

interface RecordingControlsProps {
  embedded?: boolean;
}

export function RecordingControls({ embedded = false }: RecordingControlsProps) {
  const active = useRecordingStore((s) => s.active);
  const saving = useRecordingStore((s) => s.saving);
  const paused = useRecordingStore((s) => s.paused);
  const togglePause = useRecordingStore((s) => s.togglePause);
  const mode = useRecordingStore((s) => s.mode);
  const elapsedMs = useRecordingStore((s) => s.elapsedMs);
  const hasMic = useRecordingStore((s) => s.hasMic);
  const micMuted = useRecordingStore((s) => s.micMuted);
  const toggleMic = useRecordingStore((s) => s.toggleMic);
  const faceCamVisible = useRecordingStore((s) => s.faceCamVisible);
  const toggleFaceCam = useRecordingStore((s) => s.toggleFaceCam);
  const faceCamShape = useRecordingStore((s) => s.faceCamShape);
  const setFaceCamShape = useRecordingStore((s) => s.setFaceCamShape);
  const setSaving = useRecordingStore((s) => s.setSaving);
  const end = useRecordingStore((s) => s.end);
  const getHandle = useRecordingStore((s) => s.getHandle);

  if (!active) return null;

  const teardownAuxWindows = () => {
    if (mode === 'area') {
      void window.api.recording.endOverlay();
    }
    // Face cam pencere açık olabilir — her durumda kapat (idempotent).
    if (faceCamVisible) {
      void window.api.recording.hideFaceCam();
    }
  };

  const stop = async () => {
    const handle = getHandle();
    if (!handle) {
      teardownAuxWindows();
      end();
      return;
    }
    setSaving(true);
    try {
      const blob = await handle.stop();
      const buf = await blob.arrayBuffer();
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const H = String(d.getHours()).padStart(2, '0');
      const i = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      const stamp = `${dd}-${mm}-${yyyy}-${H}-${i}-${s}`;
      const path = await window.api.recording.saveVideo(buf, `clackshot-video-${stamp}.mp4`);
      if (path) {
        const fileName = path.split('/').pop() ?? path;
        toast.success(`Kaydedildi: ${fileName}`, { label: 'Klasörü Göster', onClick: () => window.api.shell.showItemInFolder(path) });
      }
    } catch (err) {
      console.error('Recording stop hatası', err);
      toast.error('Kayıt kaydedilemedi');
    } finally {
      teardownAuxWindows();
      end();
    }
  };

  const cancel = () => {
    if (saving) return;
    const handle = getHandle();
    if (handle) handle.cancel();
    teardownAuxWindows();
    end();
  };

  const wrapperClass = embedded
    ? 'h-full w-full flex items-center justify-center px-3'
    : 'fixed top-12 left-1/2 -translate-x-1/2 z-40 animate-scale-in';

  // Embedded mode: pencerenin kendisi kapsayıcı — bar minimal, çerçevesiz.
  // Standalone mode: floating bar; kendi yuvarlak kapsülü ve gölgesi var.
  const barClass = embedded
    ? 'flex items-center gap-3 flex-nowrap'
    : 'flex items-center gap-3 px-3 py-2 rounded-2xl bg-surface-raised/95 backdrop-blur border border-surface-border shadow-2xl flex-nowrap';

  return (
    <div className={wrapperClass}>
      <div
        className={barClass}
        style={
          embedded
            ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties)
            : undefined
        }
      >
        {saving ? (
          <>
            <Spinner />
            <span className="text-sm text-fg">Kaydediliyor…</span>
          </>
        ) : (
          <>
            <span className="relative flex items-center justify-center w-3 h-3">
              {!paused && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping" />
              )}
              <span
                className={
                  'relative inline-flex w-3 h-3 rounded-full ' +
                  (paused ? 'bg-zinc-500' : 'bg-red-500')
                }
              />
            </span>
            <span
              className={
                'text-sm font-mono tabular-nums ' +
                (paused ? 'text-fg-subtle' : 'text-fg')
              }
            >
              {formatDuration(elapsedMs)}
            </span>
            <button
              onClick={togglePause}
              title={paused ? 'Devam et' : 'Duraklat'}
              aria-label={paused ? 'Devam et' : 'Duraklat'}
              className="w-7 h-7 flex items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover transition-colors"
            >
              {paused ? <PlayGlyph /> : <PauseGlyph />}
            </button>
            {hasMic && (
              <>
                <button
                  onClick={toggleMic}
                  title={micMuted ? 'Mikrofon kapalı — aç' : 'Mikrofon açık — sustur'}
                  aria-label={micMuted ? 'Mikrofonu aç' : 'Mikrofonu sustur'}
                  className={
                    'w-7 h-7 flex items-center justify-center rounded-md transition-colors ' +
                    (micMuted
                      ? 'text-fg-subtle hover:text-fg-muted hover:bg-surface-hover'
                      : 'text-accent bg-accent/15 hover:bg-accent/25')
                  }
                >
                  <MicGlyph muted={micMuted} />
                </button>
                <MicLevelMeter active={!micMuted} />
              </>
            )}
            <button
              onClick={() => void toggleFaceCam()}
              title={faceCamVisible ? 'Yüz kamerasını kapat' : 'Yüz kamerasını aç'}
              aria-label={faceCamVisible ? 'Yüz kamerasını kapat' : 'Yüz kamerasını aç'}
              className={
                'w-7 h-7 flex items-center justify-center rounded-md transition-colors ' +
                (faceCamVisible
                  ? 'text-accent bg-accent/15 hover:bg-accent/25'
                  : 'text-fg-subtle hover:text-fg-muted hover:bg-surface-hover')
              }
            >
              <CamGlyph disabled={!faceCamVisible} />
            </button>
            {faceCamVisible && (
              <ShapeSelector
                shape={faceCamShape}
                onChange={(s) => void setFaceCamShape(s)}
              />
            )}
            <div className="w-px h-5 bg-surface-border" />
            <button
              onClick={stop}
              className="px-3 py-1 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors whitespace-nowrap"
            >
              Durdur ve Kaydet
            </button>
            <button
              onClick={cancel}
              className="px-2 py-1 text-xs rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors whitespace-nowrap"
            >
              İptal
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Mikrofon real-time seviye göstergesi. handle.getMicLevel()'i her frame
// okur, yumuşak bir peak-hold-with-decay uygular ve 5 bar üzerinden gösterir.
// `active=false` (muted) iken sönükleşir — kullanıcı kayıt sesini gerçekten
// alıp almadığını net görür.
function MicLevelMeter({ active }: { active: boolean }) {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);
  const smoothedRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      const handle = useRecordingStore.getState().getHandle();
      const raw = handle?.getMicLevel?.() ?? 0;
      // Peak-hold with decay: hızlı tırman, yavaş in.
      smoothedRef.current = Math.max(raw, smoothedRef.current * 0.86);
      setLevel(smoothedRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Bar threshold'ları — RMS 0..0.5 aralığı genelde konuşma için tipik.
  const thresholds = [0.02, 0.06, 0.12, 0.22, 0.36];
  // Her bar farklı yükseklikte — VU meter hissi.
  const heights = [6, 9, 12, 15, 18];

  return (
    <div
      className="flex items-end gap-0.5 h-5"
      title={active ? 'Mikrofon seviyesi' : 'Mikrofon kapalı'}
    >
      {thresholds.map((t, i) => {
        const lit = active && level >= t;
        // Renk: ilk 3 bar yeşil, son 2 bar sarı/turuncu (peak indicator).
        const color = lit
          ? i < 3
            ? 'bg-green-400'
            : i === 3
              ? 'bg-yellow-400'
              : 'bg-orange-500'
          : 'bg-zinc-700';
        return (
          <div
            key={i}
            className={'w-[3px] rounded-sm transition-colors duration-75 ' + color}
            style={{ height: heights[i] }}
          />
        );
      })}
    </div>
  );
}

function ShapeSelector(props: {
  shape: FaceCamShape;
  onChange(s: FaceCamShape): void;
}) {
  const opts: Array<{ id: FaceCamShape; label: string }> = [
    { id: 'circle', label: 'Daire' },
    { id: 'rounded', label: 'Yuvarlatılmış' },
  ];
  return (
    <div className="flex items-center gap-0.5 bg-surface-hover rounded-md p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => props.onChange(o.id)}
          title={o.label}
          aria-label={o.label}
          className={
            'w-6 h-6 flex items-center justify-center rounded transition-colors ' +
            (props.shape === o.id
              ? 'bg-zinc-700 text-fg'
              : 'text-fg-subtle hover:text-fg')
          }
        >
          <ShapeGlyph shape={o.id} />
        </button>
      ))}
    </div>
  );
}

function ShapeGlyph({ shape }: { shape: FaceCamShape }) {
  const common = {
    width: 12,
    height: 12,
    fill: 'currentColor',
  };
  if (shape === 'circle') {
    return (
      <svg {...common} viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="5" />
      </svg>
    );
  }
  return (
    <svg {...common} viewBox="0 0 12 12">
      <rect x="1" y="1" width="10" height="10" rx="3" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="3" height="8" rx="0.5" />
      <rect x="7" y="2" width="3" height="8" rx="0.5" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M3 2 L10 6 L3 10 Z" />
    </svg>
  );
}

function CamGlyph({ disabled }: { disabled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
      {disabled && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function MicGlyph({ muted }: { muted: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      {muted && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="w-3.5 h-3.5 animate-spin text-fg-muted"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
