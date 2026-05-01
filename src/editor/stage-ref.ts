// Toolbar'ın save/copy aksiyonları Konva Stage referansına ihtiyaç duyar.
// React context yerine küçük bir module-level singleton; renderer içinde
// her an tek aktif Stage olur, bu yeterli.
import type Konva from 'konva';

let current: Konva.Stage | null = null;

export const stageRef = {
  set(s: Konva.Stage | null): void {
    current = s;
  },
  get(): Konva.Stage | null {
    return current;
  },
};
