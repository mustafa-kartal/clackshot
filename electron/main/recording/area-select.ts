// Renderer "area recording için rect seç" istediğinde overlay'i açar ve
// kullanıcı seçim yapana kadar bekler. Promise tabanlı API — overlay submit
// veya cancel olduğunda resolve edilir.
import { createOverlayWindow } from '../windows/overlay';
import type { Rect } from '../../../src/shared/types';

let pendingResolver: ((rect: Rect | null) => void) | null = null;

export function awaitAreaSelection(): Promise<Rect | null> {
  // Önceki bekleyen seçim varsa null ile kapat.
  if (pendingResolver) {
    pendingResolver(null);
    pendingResolver = null;
  }
  return new Promise<Rect | null>((resolve) => {
    pendingResolver = resolve;
    createOverlayWindow('record-rect');
  });
}

export function resolveAreaSelection(rect: Rect | null): void {
  if (!pendingResolver) return;
  const r = pendingResolver;
  pendingResolver = null;
  r(rect);
}
