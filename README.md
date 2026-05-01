# ClackShot

Modern, minimal, çapraz platform ekran görüntüsü ve ekran kaydı uygulaması.

## Phase 1 (MVP) — bu commit

- [x] Electron + Vite + React + TypeScript + Tailwind boilerplate
- [x] Iki ayrı BrowserWindow: overlay (saydam fullscreen) + editor
- [x] `desktopCapturer` üzerinden tam ekran capture
- [x] Sürükle-seç alan capture (overlay)
- [x] Pencere capture (Phase 1: ilk pencere fallback)
- [x] PNG kayıt + clipboard kopyalama
- [x] Sistem tray ikonu
- [x] Global kısayollar (Cmd/Ctrl+Shift+3/4/5)
- [x] macOS izin akışı (TCC)
- [x] Tek instance lock + güvenlik kilitleri (yeni pencere açmayı engelle, navigation kilidi)

## Geliştirme

```bash
npm install
npm run dev
```

İlk açılışta macOS sistem ayarlarından **Privacy & Security → Screen Recording** altında uygulamaya izin vermeniz gerekir. İlk `desktopCapturer` çağrısında prompt otomatik tetiklenecek; ancak izin "kalıcı" olabilmesi için uygulamanın imzalı olması (notarization) gerekir. Geliştirmede prompt her seferinde tekrar çıkabilir — bu beklenen davranıştır.

## Build

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

Notarize için `APPLE_ID` ve `APPLE_APP_SPECIFIC_PASSWORD` env değişkenlerini ayarlayın ve `electron-builder.yml` içinde `notarize: true` yapın.

## Mimari

`electron/` ana süreç ve preload'lar (Node tarafı), `src/` renderer (React + Tailwind). `src/shared/` her iki tarafta da kullanılan saf tip dosyalarını içerir.

Ayrıntılar için commit mesajındaki mimari tartışmasına bakın.

## Sonraki Adımlar

- Phase 2: MediaRecorder ile ekran kaydı + FFmpeg transcode
- Phase 3: Konva tabanlı annotation editörü
- Phase 4: Cold start optimizasyonu, worker thread'ler
- Phase 5: electron-updater + CI signing/notarization matrisi
