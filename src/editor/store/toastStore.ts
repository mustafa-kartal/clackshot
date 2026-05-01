// Basit toast bildirim sistemi. Save/copy/error gibi akışlar `push()` ile
// bildirim ekler; ToastHost UI'ı her toast'u render eder ve süresi dolunca
// otomatik kaldırır.
import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  // İsteğe bağlı: aksiyon (örn. "Klasörü Aç" link'i)
  action?: { label: string; onClick(): void };
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>, durationMs?: number): void;
  dismiss(id: string): void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(t, durationMs = 3500) {
    const id = `t${++nextId}`;
    set({ toasts: [...get().toasts, { ...t, id }] });
    if (durationMs > 0) {
      window.setTimeout(() => get().dismiss(id), durationMs);
    }
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
}));

// Helper aliases — call site'lar daha okunaklı olsun.
export const toast = {
  info(message: string) {
    useToastStore.getState().push({ type: 'info', message });
  },
  success(message: string, action?: Toast['action']) {
    useToastStore.getState().push({ type: 'success', message, action });
  },
  error(message: string) {
    useToastStore.getState().push({ type: 'error', message }, 5000);
  },
};
