// Editor penceresinin preload script'i. Tüm IPC API yüzeyini expose eder.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';
import type { IpcApi } from '../../src/shared/ipc-types';
import type { CaptureResult } from '../../src/shared/types';
import type { FaceCamBoundsResult } from '../../src/shared/ipc-types';

const api: IpcApi = {
  capture: {
    screenshot: (opts) => ipcRenderer.invoke(IPC.capture.screenshot, opts),
    listSources: (types) => ipcRenderer.invoke(IPC.capture.listSources, types),
    trigger: (mode) => ipcRenderer.invoke(IPC.capture.trigger, mode),
  },
  editor: {
    saveImage: (png, name) => ipcRenderer.invoke(IPC.editor.saveImage, png, name),
    copyImageToClipboard: (png) => ipcRenderer.invoke(IPC.editor.copyImage, png),
    closeEditor: () => ipcRenderer.invoke(IPC.editor.close),
  },
  recording: {
    saveVideo: (bytes, name) => ipcRenderer.invoke(IPC.recording.saveVideo, bytes, name),
    selectArea: () => ipcRenderer.invoke(IPC.recording.selectArea),
    endOverlay: () => ipcRenderer.invoke(IPC.recording.endOverlay),
    enterWidgetMode: () => ipcRenderer.invoke(IPC.recording.enterWidgetMode),
    exitWidgetMode: () => ipcRenderer.invoke(IPC.recording.exitWidgetMode),
    showFaceCam: () => ipcRenderer.invoke(IPC.recording.showFaceCam),
    hideFaceCam: () => ipcRenderer.invoke(IPC.recording.hideFaceCam),
    setFaceCamShape: (shape) => ipcRenderer.invoke(IPC.recording.setFaceCamShape, shape),
    getFaceCamBounds: (): Promise<FaceCamBoundsResult | null> => ipcRenderer.invoke(IPC.recording.getFaceCamBounds),
    hideFaceCamForRecording: () => ipcRenderer.invoke(IPC.recording.hideFaceCamForRecording),
    showFaceCamForRecording: () => ipcRenderer.invoke(IPC.recording.showFaceCamForRecording),
    countdown: (seconds) => ipcRenderer.invoke(IPC.recording.countdown, seconds),
  },
  overlay: {
    submitSelection: (rect) => ipcRenderer.invoke(IPC.overlay.submit, rect),
    cancel: () => ipcRenderer.invoke(IPC.overlay.cancel),
  },
  permissions: {
    checkScreenAccess: () => ipcRenderer.invoke(IPC.permissions.checkScreen),
    openScreenAccessSettings: () => ipcRenderer.invoke(IPC.permissions.openScreenSettings),
  },
  config: {
    getAll: () => ipcRenderer.invoke(IPC.config.getAll),
    set: (key, value) => ipcRenderer.invoke(IPC.config.set, key, value),
    setShortcut: (key, accel) => ipcRenderer.invoke(IPC.config.setShortcut, key, accel),
    pickSaveDirectory: () => ipcRenderer.invoke(IPC.config.pickSaveDirectory),
  },
  shell: {
    showItemInFolder: (path) => ipcRenderer.invoke(IPC.shell.showItemInFolder, path),
    openExternal: (url) => ipcRenderer.invoke(IPC.shell.openExternal, url),
  },
  imgur: {
    upload: (png) => ipcRenderer.invoke(IPC.imgur.upload, png),
  },
  on: {
    captureCompleted(handler) {
      const wrapped = (_e: unknown, result: CaptureResult) => handler(result);
      ipcRenderer.on(IPC.events.captureCompleted, wrapped);
      return () => ipcRenderer.removeListener(IPC.events.captureCompleted, wrapped);
    },
    overlayEnterRecording(handler) {
      const wrapped = (_e: unknown, rect: { x: number; y: number; width: number; height: number }) =>
        handler(rect);
      ipcRenderer.on(IPC.events.overlayEnterRecording, wrapped);
      return () => ipcRenderer.removeListener(IPC.events.overlayEnterRecording, wrapped);
    },
    triggerRecord(handler) {
      const wrapped = (_e: unknown, mode: 'fullscreen' | 'area' | 'window') => handler(mode);
      ipcRenderer.on(IPC.events.triggerRecord, wrapped);
      return () => ipcRenderer.removeListener(IPC.events.triggerRecord, wrapped);
    },
    openSettings(handler) {
      const wrapped = () => handler();
      ipcRenderer.on(IPC.events.openSettings, wrapped);
      return () => ipcRenderer.removeListener(IPC.events.openSettings, wrapped);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
