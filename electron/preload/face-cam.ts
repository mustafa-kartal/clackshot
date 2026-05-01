// Face cam penceresinin preload script'i. Sadece shape-değişti event'ini
// dinler — başka API'ye gerek yok.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';
import type { FaceCamShape } from '../../src/shared/types';

const api = {
  onShapeChange(handler: (shape: FaceCamShape) => void): () => void {
    const wrapped = (_e: unknown, shape: FaceCamShape) => handler(shape);
    ipcRenderer.on(IPC.events.faceCamShapeChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC.events.faceCamShapeChanged, wrapped);
  },
};

contextBridge.exposeInMainWorld('faceCamApi', api);
