<div align="center">
  <img src="./resources/icons/logo-dark.png" alt="ClackShot" width="320" />
  <p>Modern, minimal, cross-platform screenshot and screen recording tool.</p>

  [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)](https://github.com/mustafa-kartal/clackshot/releases/latest)
  [![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
  [![Release](https://img.shields.io/github/v/release/mustafa-kartal/clackshot?label=latest)](https://github.com/mustafa-kartal/clackshot/releases/latest)
  [![Downloads](https://img.shields.io/github/downloads/mustafa-kartal/clackshot/total?label=downloads)](https://github.com/mustafa-kartal/clackshot/releases)

  [Türkçe](./README-TR.md)
</div>

## Screenshots

<div align="center">

| Main Screen | Annotation Editor |
|---|---|
| <img src="./resources/screenshots/screenshot-1777617584464.png" alt="ClackShot Main Screen" /> | <img src="./resources/screenshots/screenshot-1777617684717.png" alt="ClackShot Annotation Editor" /> |

</div>

## Features

- **Screenshot** — full screen, area selection, window capture
- **Screen recording** — MediaRecorder based, MP4 output
- **Annotation editor** — Konva based, text, shapes, arrows
- **Face cam** — camera overlay during recording
- **Clipboard** — automatic copy to clipboard after capture
- **PNG export** — save to any location
- **System tray** — runs in the background, always accessible
- **Global shortcuts** — trigger without switching to the app
- **Auto update** — via GitHub Releases

## Shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| Full screen capture | `Cmd+Shift+3` | `Ctrl+Shift+3` |
| Area selection capture | `Cmd+Shift+4` | `Ctrl+Shift+4` |
| Start / stop recording | `Cmd+Shift+5` | `Ctrl+Shift+5` |

## Development

```bash
npm install
npm run dev
```

> **macOS:** On first launch, grant permission under System Settings → Privacy & Security → **Screen Recording**.

## Build

```bash
npm run build:mac     # macOS (dmg + zip, x64 + arm64)
npm run build:win     # Windows (nsis x64)
npm run build:linux   # Linux (AppImage + deb)
```

> For macOS notarization, set `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` env variables and set `notarize: true` in `electron-builder.yml`.

## Architecture

```
electron/
  main/         # Main process (Node) — IPC, tray, shortcuts, updater
  preload/      # Secure bridge to renderer
src/
  editor/       # Main editor window (React + Tailwind + Konva)
  overlay/      # Transparent fullscreen capture area
  face-cam/     # Camera overlay window
  splash/       # Splash screen
  shared/       # Shared types (main + renderer)
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for all release notes.

## Contributing

Pull requests are welcome. For major changes, please open an [issue](https://github.com/mustafa-kartal/clackshot/issues) first.

## License

[MIT](LICENSE)
