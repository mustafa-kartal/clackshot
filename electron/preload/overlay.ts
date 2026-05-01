// Overlay penceresinin preload script'i.
// contextBridge ile renderer'a sadece ihtiyaç duyduğu IPC yüzeyini expose eder.
// nodeIntegration kapalı, contextIsolation açık — saldırı yüzeyi minimum.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const api = {
  overlay: {
    submitSelection: (rect: Rect) => ipcRenderer.invoke(IPC.overlay.submit, rect),
    cancel: () => ipcRenderer.invoke(IPC.overlay.cancel),
  },
  on: {
    overlayEnterRecording(handler: (rect: Rect) => void): () => void {
      const wrapped = (_e: unknown, rect: Rect) => handler(rect);
      ipcRenderer.on(IPC.events.overlayEnterRecording, wrapped);
      return () => ipcRenderer.removeListener(IPC.events.overlayEnterRecording, wrapped);
    },
    overlaySetPurpose(handler: (purpose: string) => void): () => void {
      const wrapped = (_e: unknown, purpose: string) => handler(purpose);
      ipcRenderer.on(IPC.events.overlaySetPurpose, wrapped);
      return () => ipcRenderer.removeListener(IPC.events.overlaySetPurpose, wrapped);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
