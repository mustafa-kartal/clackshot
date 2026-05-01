// Floating face cam penceresi içeriği. getUserMedia ile webcam stream'ini
// alır, video'yu shape'e göre (circle / rounded / square) render eder.
// Pencere transparent + frameless + always-on-top → seçilen şekil dışında
// hiçbir piksel görünmez. Body drag region — kullanıcı her yerden sürükler.
import { useEffect, useRef, useState } from 'react';
import type { FaceCamShape } from '../shared/types';

declare global {
  interface Window {
    faceCamApi: {
      onShapeChange(handler: (shape: FaceCamShape) => void): () => void;
    };
  }
}

function radiusFor(shape: FaceCamShape): string {
  switch (shape) {
    case 'circle':
      return '50%';
    case 'rounded':
      return '20px';
  }
}

export function FaceCam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [shape, setShape] = useState<FaceCamShape>('circle');

  useEffect(() => {
    const off = window.faceCamApi?.onShapeChange?.(setShape);
    return () => {
      off?.();
    };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 480 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch((err) => {
        console.error('Webcam erişimi başarısız', err);
        setError(String(err?.message ?? err));
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: radiusFor(shape),
        overflow: 'hidden',
        background: '#000',
        border: '3px solid rgba(255, 255, 255, 0.95)',
        boxSizing: 'border-box',
        position: 'relative',
        transition: 'border-radius 180ms ease',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scaleX(-1)',
          background: '#000',
        }}
      />
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11,
            textAlign: 'center',
            padding: 12,
            background: 'rgba(0, 0, 0, 0.7)',
          }}
        >
          Kameraya erişilemedi
        </div>
      )}
    </div>
  );
}
