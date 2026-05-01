// Splash ekranı — uygulama başlangıcında ana editor pencere hazır olana
// kadar gösterilir. Frameless+transparent BrowserWindow içinde render edilir,
// pencere kendisi sürüklenebilir (-webkit-app-region: drag).
//
// Tema: kullanıcı config'i bu noktada henüz yüklü değil. Splash sistem tema
// tercihine göre logo seçer (matchMedia) — uygulama açılır açılmaz config
// load olduğunda zaten editor'a geçilir, splash birkaç saniyede yok olur.
import { useEffect, useState } from 'react';
import logoDark from '../../resources/icons/logo-dark.png';
import logoLight from '../../resources/icons/logo-light.png';

type AppliedTheme = 'dark' | 'light';

function readSystemTheme(): AppliedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function Splash() {
  const [theme, setTheme] = useState<AppliedTheme>(() => readSystemTheme());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    // <html> class'ını set et — globals.css içindeki :root/.dark/.light
    // selector'ları aktif olsun (token'lar otomatik geçer).
    document.documentElement.classList.add(theme);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  // Logo: tema-uyumlu — dark zeminde light logo, light zeminde dark logo.
  const logo = theme === 'dark' ? logoLight : logoDark;

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 px-10 py-8 rounded-2xl bg-surface-raised/95 backdrop-blur border border-surface-border shadow-2xl animate-scale-in">
        <img
          src={logo}
          alt="ClackShot"
          className="h-14 w-auto select-none"
          draggable={false}
        />
        <div className="flex items-center gap-2.5 text-fg-muted text-xs">
          <Spinner />
          <span>Yükleniyor…</span>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="w-3.5 h-3.5 animate-spin text-accent"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
