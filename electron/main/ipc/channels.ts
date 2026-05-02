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
    getFaceCamBounds: 'recording:get-face-cam-bounds',
    hideFaceCamForRecording: 'recording:hide-face-cam-for-recording',
    showFaceCamForRecording: 'recording:show-face-cam-for-recording',
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
  shell: {
    showItemInFolder: 'shell:show-item-in-folder',
    openExternal: 'shell:open-external',
  },
  imgur: {
    upload: 'imgur:upload',
  },
  events: {
    captureCompleted: 'event:capture-completed',
    overlayEnterRecording: 'event:overlay-enter-recording',
    overlaySetPurpose: 'event:overlay-set-purpose',
    faceCamShapeChanged: 'event:face-cam-shape-changed',
    faceCamStopCamera: 'event:face-cam-stop-camera',
    faceCamStartCamera: 'event:face-cam-start-camera',
    triggerRecord: 'event:trigger-record',
    openSettings: 'event:open-settings',
  },
} as const;
