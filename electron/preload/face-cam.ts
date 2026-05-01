// Face cam penceresinin preload script'i.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';
import type { FaceCamShape } from '../../src/shared/types';

const api = {
  onShapeChange(handler: (shape: FaceCamShape) => void): () => void {
    const wrapped = (_e: unknown, shape: FaceCamShape) => handler(shape);
    ipcRenderer.on(IPC.events.faceCamShapeChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC.events.faceCamShapeChanged, wrapped);
  },
  onStopCamera(handler: () => void): () => void {
    const wrapped = () => handler();
    ipcRenderer.on(IPC.events.faceCamStopCamera, wrapped);
    return () => ipcRenderer.removeListener(IPC.events.faceCamStopCamera, wrapped);
  },
  onStartCamera(handler: () => void): () => void {
    const wrapped = () => handler();
    ipcRenderer.on(IPC.events.faceCamStartCamera, wrapped);
    return () => ipcRenderer.removeListener(IPC.events.faceCamStartCamera, wrapped);
  },
};

contextBridge.exposeInMainWorld('faceCamApi', api);
