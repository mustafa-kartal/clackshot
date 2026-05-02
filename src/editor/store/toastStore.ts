import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'error' | 'loading';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: { label: string; onClick(): void };
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>, durationMs?: number): string;
  update(id: string, t: Partial<Omit<Toast, 'id'>>, durationMs?: number): void;
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
    return id;
  },
  update(id, t, durationMs = 3500) {
    set({ toasts: get().toasts.map((x) => (x.id === id ? { ...x, ...t } : x)) });
    if (durationMs > 0) {
      window.setTimeout(() => get().dismiss(id), durationMs);
    }
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
}));

export const toast = {
  info(message: string) {
    return useToastStore.getState().push({ type: 'info', message });
  },
  success(message: string, action?: Toast['action']) {
    return useToastStore.getState().push({ type: 'success', message, action });
  },
  error(message: string) {
    return useToastStore.getState().push({ type: 'error', message }, 5000);
  },
  loading(message: string) {
    return useToastStore.getState().push({ type: 'loading', message }, 0);
  },
  update(id: string, t: Partial<Omit<Toast, 'id'>>, durationMs?: number) {
    useToastStore.getState().update(id, t, durationMs);
  },
  dismiss(id: string) {
    useToastStore.getState().dismiss(id);
  },
};
