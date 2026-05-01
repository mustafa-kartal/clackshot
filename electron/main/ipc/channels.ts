// Tüm IPC kanal isimleri tek noktada — string typo'ları engellemek için.
// Hem main hem preload bu sabitleri import eder.
export const IPC = {
  capture: {
    screenshot: 'capture:screenshot',
    listSources: 'capture:list-sources',
    trigger: 'capture:trigger',
  },
  editor: {
    saveImage: 'editor:save-image',
    copyImage: 'editor:copy-image',
    close: 'editor:close',
  },
  recording: {
    saveVideo: 'recording:save-video',
    selectArea: 'recording:select-area',
    endOverlay: 'recording:end-overlay',
    enterWidgetMode: 'recording:enter-widget-mode',
    exitWidgetMode: 'recording:exit-widget-mode',
    showFaceCam: 'recording:show-face-cam',
    hideFaceCam: 'recording:hide-face-cam',
    setFaceCamShape: 'recording:set-face-cam-shape',
    countdown: 'recording:countdown',
  },
  overlay: {
    submit: 'overlay:submit',
    cancel: 'overlay:cancel',
  },
  permissions: {
    checkScreen: 'perm:check-screen',
    openScreenSettings: 'perm:open-screen-settings',
  },
  config: {
    getAll: 'config:get-all',
    set: 'config:set',
    setShortcut: 'config:set-shortcut',
    pickSaveDirectory: 'config:pick-save-directory',
  },
  events: {
    captureCompleted: 'event:capture-completed',
    overlayEnterRecording: 'event:overlay-enter-recording',
    faceCamShapeChanged: 'event:face-cam-shape-changed',
    triggerRecord: 'event:trigger-record',
  },
} as const;
