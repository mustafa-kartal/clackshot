// Saydam zemin üzerinde sürükle-seç UI'ı + area recording sırasında pasif
// "kayıt çerçevesi" göstergesi. Aynı pencere iki fazda kullanılır:
//   - 'select' (default): kullanıcı sürükleyerek alan seçer.
//   - 'confirm': seçim yapılmış, tutamaçlarla ayarlanabilir, onaylanmayı bekler.
//   - 'recording': seçili rect dışı karartılır, rect kenarına çerçeve çizilir,
//     pencere click-through olur (mouse event'leri altındaki uygulamalara geçer).
//
// Önemli: 'recording' fazında çizilen hiçbir piksel rect'in INSIDE'ına
// girmemeli — yoksa kayıt yapan crop pipeline'ı bunları yakalar.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect } from '../shared/types';

// Overlay preload'ı editor preload'ından farklı — sadece bu penceredeki yüzeyi tanımla.
interface OverlayApi {
  overlay: {
    submitSelection(rect: Rect): Promise<void>;
    cancel(): Promise<void>;
  };
  on: {
    overlayEnterRecording(handler: (rect: Rect) => void): () => void;
    overlaySetPurpose(handler: (purpose: string) => void): () => void;
  };
}

const overlayApi = (window as unknown as { api: OverlayApi }).api;

interface Point {
  x: number;
  y: number;
}

type Phase = 'select' | 'confirm' | 'recording';
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const MIN_SIZE = 16;
const HANDLE_SIZE = 14;

export function Overlay() {
  const [phase, setPhase] = useState<Phase>('select');
  const [purpose, setPurpose] = useState<'screenshot' | 'record-rect'>('screenshot');
  const [recordingRect, setRecordingRect] = useState<Rect | null>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [confirmedRect, setConfirmedRect] = useState<Rect | null>(null);
  const draggingRef = useRef(false);

  // Handle/taşıma sürükleme state'i.
  const dragRef = useRef<{
    active: boolean;
    handle: Handle | null;
    startPointer: Point;
    startRect: Rect;
  }>({ active: false, handle: null, startPointer: { x: 0, y: 0 }, startRect: { x: 0, y: 0, width: 0, height: 0 } });

  const screenW = window.screen.width;
  const screenH = window.screen.height;

  // Main → overlay'in hangi amaçla açıldığını bildir.
  useEffect(() => {
    const off = overlayApi.on.overlaySetPurpose((p) => {
      setPurpose(p as 'screenshot' | 'record-rect');
    });
    return off;
  }, []);

  // Main → "recording fazına geç" sinyali.
  useEffect(() => {
    const off = overlayApi.on.overlayEnterRecording((rect) => {
      setRecordingRect(rect);
      setPhase('recording');
    });
    return off;
  }, []);

  // Klavye: Enter onayla, Esc iptal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'select') {
        if (e.key === 'Escape') overlayApi.overlay.cancel();
      } else if (phase === 'confirm') {
        if (e.key === 'Escape') {
          setPhase('select');
          setConfirmedRect(null);
          setStart(null);
          setEnd(null);
        } else if (e.key === 'Enter' && confirmedRect && confirmedRect.width >= 4 && confirmedRect.height >= 4) {
          e.preventDefault();
          void overlayApi.overlay.submitSelection(confirmedRect);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, confirmedRect]);

  // Window-level pointer takibi — handle sürüklenirken overlay dışına çıkınca da devam et.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const p = { x: e.clientX, y: e.clientY };
      const dx = p.x - dragRef.current.startPointer.x;
      const dy = p.y - dragRef.current.startPointer.y;
      const r = dragRef.current.startRect;
      const h = dragRef.current.handle;

      let { x, y, width, height } = r;
      if (h === null) {
        // Taşıma
        x = Math.max(0, Math.min(r.x + dx, screenW - r.width));
        y = Math.max(0, Math.min(r.y + dy, screenH - r.height));
      } else {
        if (h.includes('w')) { x = Math.max(0, Math.min(r.x + dx, r.x + r.width - MIN_SIZE)); width = r.width - (x - r.x); }
        if (h.includes('e')) { width = Math.min(Math.max(MIN_SIZE, r.width + dx), screenW - r.x); }
        if (h.includes('n')) { y = Math.max(0, Math.min(r.y + dy, r.y + r.height - MIN_SIZE)); height = r.height - (y - r.y); }
        if (h.includes('s')) { height = Math.min(Math.max(MIN_SIZE, r.height + dy), screenH - r.y); }
      }
      setConfirmedRect({ x, y, width, height });
    };

    const onUp = () => {
      dragRef.current.active = false;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [screenW, screenH]);

  const startHandleDrag = useCallback((handle: Handle | null, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmedRect) return;
    dragRef.current = {
      active: true,
      handle,
      startPointer: { x: e.clientX, y: e.clientY },
      startRect: { ...confirmedRect },
    };
  }, [confirmedRect]);

  if (phase === 'recording' && recordingRect) {
    return <RecordingFrame rect={recordingRect} />;
  }

  // Select fazı: çizim yapılıyor.
  if (phase === 'select') {
    const rect = computeRect(start, end);
    return (
      <div
        onMouseDown={(e) => {
          draggingRef.current = true;
          setStart({ x: e.clientX, y: e.clientY });
          setEnd({ x: e.clientX, y: e.clientY });
        }}
        onMouseMove={(e) => {
          if (!draggingRef.current) return;
          setEnd({ x: e.clientX, y: e.clientY });
        }}
        onMouseUp={() => {
          draggingRef.current = false;
          if (!rect || rect.width < 4 || rect.height < 4) {
            void overlayApi.overlay.cancel();
            return;
          }
          setConfirmedRect(rect);
          setPhase('confirm');
        }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', cursor: 'crosshair' }}
      >
        {rect && (
          <>
            <div
              style={{
                position: 'absolute',
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.28)',
                border: '1.5px solid #7c5cff',
                background: 'transparent',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: rect.x,
                top: Math.max(0, rect.y - 24),
                padding: '2px 6px',
                fontFamily: 'system-ui, sans-serif',
                fontSize: 11,
                color: '#fff',
                background: '#7c5cff',
                borderRadius: 3,
                pointerEvents: 'none',
              }}
            >
              {rect.width} × {rect.height}
            </div>
          </>
        )}
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 12px',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
            color: '#fff',
            background: 'rgba(0,0,0,0.6)',
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          Alan seçmek için sürükleyin · ESC ile iptal
        </div>
      </div>
    );
  }

  // Confirm fazı: seçim yapılmış, tutamaçlarla ayarlanabilir.
  if (phase === 'confirm' && confirmedRect) {
    const r = confirmedRect;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const r2 = r.x + r.width;
    const b2 = r.y + r.height;
    const hs = HANDLE_SIZE;

    const handles: { id: Handle; x: number; y: number; cursor: string }[] = [
      { id: 'nw', x: r.x,  y: r.y,  cursor: 'nw-resize' },
      { id: 'n',  x: cx,   y: r.y,  cursor: 'n-resize' },
      { id: 'ne', x: r2,   y: r.y,  cursor: 'ne-resize' },
      { id: 'e',  x: r2,   y: cy,   cursor: 'e-resize' },
      { id: 'se', x: r2,   y: b2,   cursor: 'se-resize' },
      { id: 's',  x: cx,   y: b2,   cursor: 's-resize' },
      { id: 'sw', x: r.x,  y: b2,   cursor: 'sw-resize' },
      { id: 'w',  x: r.x,  y: cy,   cursor: 'w-resize' },
    ];

    const dim = 'rgba(0,0,0,0.45)';
    const btnBase: React.CSSProperties = {
      padding: '5px 12px',
      borderRadius: 6,
      border: 'none',
      fontFamily: 'system-ui, sans-serif',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    };

    // Buton paneli pozisyonu: rect altına; ekrandan taşarsa üste.
    const panelTop = b2 + 10 + 36 > screenH ? r.y - 42 : b2 + 10;

    return (
      <div
        style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}
        onMouseDown={(e) => {
          // Seçim dışına tıklanırsa yeni seçim başlat.
          const target = e.target as HTMLElement;
          if (target === e.currentTarget) {
            setPhase('select');
            setConfirmedRect(null);
            setStart({ x: e.clientX, y: e.clientY });
            setEnd({ x: e.clientX, y: e.clientY });
            draggingRef.current = true;
          }
        }}
      >
        {/* Dim alanlar */}
        <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(0, r.y), background: dim, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 0, top: b2, right: 0, bottom: 0, background: dim, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 0, top: r.y, width: Math.max(0, r.x), height: r.height, background: dim, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: r2, top: r.y, right: 0, height: r.height, background: dim, pointerEvents: 'none' }} />

        {/* Taşıma alanı */}
        <div
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.width,
            height: r.height,
            cursor: 'move',
          }}
          onMouseDown={(e) => startHandleDrag(null, e)}
        />

        {/* Seçim çerçevesi */}
        <div
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.width,
            height: r.height,
            border: '2px dashed #3b82f6',
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        />

        {/* Boyut balonu */}
        <div
          style={{
            position: 'absolute',
            left: cx,
            top: Math.max(4, r.y - 28),
            transform: 'translateX(-50%)',
            padding: '2px 6px',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11,
            color: '#fff',
            background: 'rgba(0,0,0,0.75)',
            borderRadius: 4,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {Math.round(r.width)} × {Math.round(r.height)}
        </div>

        {/* Resize tutamaçları */}
        {handles.map((h) => {
          const hx = Math.max(0, Math.min(h.x - hs / 2, screenW - hs));
          const hy = Math.max(0, Math.min(h.y - hs / 2, screenH - hs));
          return (
            <div
              key={h.id}
              style={{
                position: 'absolute',
                left: hx,
                top: hy,
                width: hs,
                height: hs,
                background: 'white',
                border: '2px solid #3b82f6',
                borderRadius: 3,
                boxSizing: 'border-box',
                cursor: h.cursor,
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}
              onMouseDown={(e) => startHandleDrag(h.id, e)}
            />
          );
        })}

        {/* Onayla / İptal butonları */}
        <div
          style={{
            position: 'absolute',
            left: r.x,
            top: panelTop,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(30,30,30,0.92)',
            backdropFilter: 'blur(8px)',
            padding: '5px 8px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <button
            style={{ ...btnBase, background: '#3b82f6', color: '#fff' }}
            onClick={() => {
              if (confirmedRect && confirmedRect.width >= 4 && confirmedRect.height >= 4) {
                void overlayApi.overlay.submitSelection(confirmedRect);
              }
            }}
          >
            {purpose === 'record-rect' ? 'Kaydı Başlat (Enter)' : 'Editöre Aktar (Enter)'}
          </button>
          <button
            style={{ ...btnBase, background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)' }}
            onClick={() => {
              setPhase('select');
              setConfirmedRect(null);
              setStart(null);
              setEnd(null);
            }}
          >
            İptal (Esc)
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// Recording fazı: 4 dim strip rect'in dışında, ince kırmızı çerçeve rect'in
// 3px dışında. Tüm öğeler pointer-events: none.
function RecordingFrame({ rect }: { rect: Rect }) {
  const dim = 'rgba(0, 0, 0, 0.32)';
  const offset = 3;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'transparent' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(0, rect.y - offset), background: dim }} />
      <div style={{ position: 'absolute', left: 0, top: rect.y + rect.height + offset, right: 0, bottom: 0, background: dim }} />
      <div style={{ position: 'absolute', left: 0, top: Math.max(0, rect.y - offset), width: Math.max(0, rect.x - offset), height: rect.height + offset * 2, background: dim }} />
      <div style={{ position: 'absolute', left: rect.x + rect.width + offset, top: Math.max(0, rect.y - offset), right: 0, height: rect.height + offset * 2, background: dim }} />
      <div
        style={{
          position: 'absolute',
          left: rect.x - offset,
          top: rect.y - offset,
          width: rect.width + offset * 2,
          height: rect.height + offset * 2,
          border: '2px solid #ef4444',
          borderRadius: 1,
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function computeRect(a: Point | null, b: Point | null) {
  if (!a || !b) return null;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(a.x - b.x);
  const height = Math.abs(a.y - b.y);
  return { x, y, width, height };
}
