// Kullanıcı tema tercihini (configStore.theme) sistem tercihiyle birleştirip
// gerçekte uygulanan ('dark' | 'light') değeri döner. Aynı zamanda yan etki
// olarak <html> elementinin class'ını yönetir (Tailwind dark mode class
// strategy: globals.css içindeki :root/.dark/.light selector'larını tetikler).
//
// 'system' seçildiğinde matchMedia ile OS tema değişimi de canlı dinlenir —
// kullanıcı OS'ta light → dark yaptığında uygulama da anında geçer.
import { useEffect, useState } from 'react';
import { useConfigStore } from '../store/configStore';

export type AppliedTheme = 'dark' | 'light';

function readSystem(): AppliedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useAppliedTheme(): AppliedTheme {
  const theme = useConfigStore((s) => s.theme);
  const [systemTheme, setSystemTheme] = useState<AppliedTheme>(() => readSystem());

  // OS tema değişimini dinle — sadece 'system' seçili ise gerçekten etkili
  // ama listener'ı her durumda kuruyoruz; ucuz ve güvenli.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const applied: AppliedTheme = theme === 'system' ? systemTheme : theme;

  // <html> class'ını sürekli senkron tut — Tailwind .dark / .light selector'ları
  // ve globals.css :root değişkenleri buna bağlı.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(applied);
  }, [applied]);

  return applied;
}
