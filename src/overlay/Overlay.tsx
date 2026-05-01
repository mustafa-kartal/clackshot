// Saydam zemin üzerinde sürükle-seç UI'ı + area recording sırasında pasif
// "kayıt çerçevesi" göstergesi. Aynı pencere iki fazda kullanılır:
//   - 'select' (default): kullanıcı sürükleyerek alan seçer.
//   - 'recording': seçili rect dışı karartılır, rect kenarına çerçeve çizilir,
//     pencere click-through olur (mouse event'leri altındaki uygulamalara geçer).
//
// Önemli: 'recording' fazında çizilen hiçbir piksel rect'in INSIDE'ına
// girmemeli — yoksa kayıt yapan crop pipeline'ı bunları yakalar. Border'ı
// rect dışına 3px offset ile koyuyoruz, dim'leri rect'in dışında tutuyoruz.
import { useEffect, useRef, useState } from 'react';
import type { Rect } from '../shared/types';

interface Point {
  x: number;
  y: number;
}

type Phase = 'select' | 'recording';

export function Overlay() {
  const [phase, setPhase] = useState<Phase>('select');
  const [recordingRect, setRecordingRect] = useState<Rect | null>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const draggingRef = useRef(false);

  // Main → bu pencereye "recording fazına geç" sinyali.
  useEffect(() => {
    const off = window.api.on.overlayEnterRecording((rect) => {
      setRecordingRect(rect);
      setPhase('recording');
    });
    return off;
  }, []);

  useEffect(() => {
    if (phase !== 'select') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.api.overlay.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (phase === 'recording' && recordingRect) {
    return <RecordingFrame rect={recordingRect} />;
  }

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
          window.api.overlay.cancel();
          return;
        }
        window.api.overlay.submitSelection(rect);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.28)',
      }}
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

// Recording fazı: 4 dim strip rect'in dışında, ince kırmızı çerçeve rect'in
// 3px dışında. Tüm öğeler pointer-events: none — pencere zaten main tarafında
// setIgnoreMouseEvents(true) ile click-through yapılıyor ama yine de garanti.
function RecordingFrame({ rect }: { rect: Rect }) {
  const dim = 'rgba(0, 0, 0, 0.32)';
  const offset = 3;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        background: 'transparent',
      }}
    >
      {/* Üst */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          height: Math.max(0, rect.y - offset),
          background: dim,
        }}
      />
      {/* Alt */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: rect.y + rect.height + offset,
          right: 0,
          bottom: 0,
          background: dim,
        }}
      />
      {/* Sol */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: Math.max(0, rect.y - offset),
          width: Math.max(0, rect.x - offset),
          height: rect.height + offset * 2,
          background: dim,
        }}
      />
      {/* Sağ */}
      <div
        style={{
          position: 'absolute',
          left: rect.x + rect.width + offset,
          top: Math.max(0, rect.y - offset),
          right: 0,
          height: rect.height + offset * 2,
          background: dim,
        }}
      />
      {/* Kırmızı çerçeve — rect'in 3px dışında */}
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
