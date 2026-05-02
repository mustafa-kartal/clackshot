// Editor kök bileşeni. Capture push'larını dinler ve store'a yazar.
// Kayıt sırasında pencere küçük bir floating widget'a dönüşür: editor UI'ı
// gizlenir, sadece RecordingControls görünür ve pencere always-on-top olur ki
// kullanıcı başka uygulamalara geçtiğinde de "Durdur ve Kaydet" erişilebilir
// kalsın.
import { useEffect, useState } from 'react';
import { useEditorStore } from './store/editorStore';
import { useConfigStore } from './store/configStore';
import { useRecordingStore } from './store/recordingStore';
import { useAppliedTheme } from './hooks/useAppliedTheme';
import { ImageCanvas } from './components/ImageCanvas';
import { ToolsBar, ActionBar, UndoRedoKeyHandler } from './components/Toolbar';
import { Settings } from './components/Settings';
import { RecordingControls } from './components/RecordingControls';
import { ToastHost } from './components/ToastHost';
import faviconDark from '../../resources/icons/favicon-dark.png';
import faviconLight from '../../resources/icons/favicon-light.png';

export function App() {
  const setImage = useEditorStore((s) => s.setImage);
  const loadConfig = useConfigStore((s) => s.load);
  const recordingActive = useRecordingStore((s) => s.active);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  const appliedTheme = useAppliedTheme();
  // Tema-duyarlı favicon. İsim suffix'i logo'nun KENDİ rengini belirtir:
  // favicon-dark = koyu renkli logo → açık zeminde (light mode) okunur.
  // favicon-light = açık renkli logo → koyu zeminde (dark mode) okunur.
  const favicon = appliedTheme === 'dark' ? faviconLight : faviconDark;

  useEffect(() => {
    const off = window.api.on.captureCompleted((result) => {
      setImage(result.pngBuffer, result.width, result.height, result.capturedAt);
    });
    return off;
  }, [setImage]);

  // Global recording shortcut'ları main'den buraya yönlendirilir.
  useEffect(() => {
    const off = window.api.on.triggerRecord((mode) => {
      const store = useRecordingStore.getState();
      if (store.active) return;
      if (mode === 'fullscreen') void store.startFullscreen();
      else if (mode === 'area') void store.startArea();
      else if (mode === 'window') void store.startWindowFirst();
    });
    return off;
  }, []);

  // Tray menüsünden "Ayarlar" tıklanınca modal'ı aç.
  useEffect(() => {
    const off = window.api.on.openSettings((tab) => {
      setSettingsTab(tab);
      setSettingsOpen(true);
    });
    return off;
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Kayıt başlayınca pencereyi widget moduna geçir, bittiğinde geri dön.
  useEffect(() => {
    if (recordingActive) {
      void window.api.recording.enterWidgetMode();
    } else {
      void window.api.recording.exitWidgetMode();
    }
  }, [recordingActive]);

  if (recordingActive) {
    // Widget mode: pencere küçük + always-on-top. İçerik sadece kontrol bandı.
    // Boş alandan sürüklenebilir, butonlar no-drag.
    return (
      <div
        className="h-screen w-screen bg-surface-raised border border-surface-border rounded-2xl text-fg overflow-hidden"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <RecordingControls embedded />
        <ToastHost />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-surface text-fg">
      {/* macOS-native title bar.
          Sol 80px: traffic light reserve (hiddenInset'in kapladığı alan).
          Orta: app adı + favicon, gerçekten merkezlenmiş.
          Sağ 80px: aksiyonlar — sol/sağ eşit genişlikte ki title tam ortada kalsın.
          sticky + opaque arka plan: alttaki içerik scroll edilse bile header
          her zaman tepede ve net görünür. */}
      <header
        className="sticky top-0 z-30 h-11 shrink-0 border-b border-surface-border bg-surface-raised flex items-center px-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="w-20 shrink-0" />
        <div className="flex-1 flex items-center justify-center gap-2 select-none">
          <img src={favicon} alt="" className="h-4 w-4" draggable={false} />
          <span className="text-sm font-semibold text-fg">ClackShot</span>
        </div>
        <div
          className="w-20 shrink-0 flex items-center justify-end"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Ayarlar"
            title="Ayarlar"
            className="text-fg-subtle hover:text-fg hover:bg-surface-hover w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          >
            <GearIcon />
          </button>
        </div>
      </header>
      <ToolsBar />
      <UndoRedoKeyHandler />
      <ImageCanvas />
      <ActionBar />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab={settingsTab} />
      {/* ToastHost en altta */}
      <ToastHost />
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
