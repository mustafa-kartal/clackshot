// 3-2-1 sayacı: kayıt başlamadan önce ekranın ortasında büyük rakam.
// Frameless + transparent + click-through + always-on-top — diğer
// uygulamalarla etkileşimi engellemez. Inline HTML data URL ile yüklenir,
// ayrı bir Vite entry'sine gerek yok.
import { BrowserWindow, screen } from 'electron';

export async function showCountdown(seconds: number): Promise<void> {
  if (seconds <= 0) return;

  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; height: 100vh; width: 100vw; background: transparent; overflow: hidden; }
  .num {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 320px; font-weight: 900; color: #fff;
    text-shadow:
      0 0 40px rgba(0,0,0,0.85),
      0 0 80px rgba(239,68,68,0.7),
      0 0 160px rgba(239,68,68,0.4);
    animation: pulse 1s ease-out forwards;
    letter-spacing: -8px;
  }
  @keyframes pulse {
    0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
    18%  { transform: translate(-50%, -50%) scale(1.0); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
  }
</style>
</head>
<body>
<div class="num" id="n"></div>
<script>
  const el = document.getElementById('n');
  let n = ${Math.floor(seconds)};
  function paint() {
    el.textContent = n;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'pulse 1s ease-out forwards';
  }
  paint();
  const t = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(t); return; }
    paint();
  }, 1000);
</script>
</body>
</html>`;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.showInactive();

  // Tüm sayım bitene kadar bekle, pencereyi kapat.
  await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
  if (!win.isDestroyed()) win.close();
}
