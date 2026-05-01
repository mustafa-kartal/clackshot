// Geliştirme sırasında konsola, prod'da userData/logs/app.log'a yazan basit logger.
// electron-log eklemek istenirse buraya kolayca takılır; şimdilik ihtiyaç yok.
import { app } from 'electron';

const isDev = !app.isPackaged;

function ts(): string {
  return new Date().toISOString();
}

export const log = {
  info: (...args: unknown[]) => {
    if (isDev) console.log(`[${ts()}] [info]`, ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(`[${ts()}] [warn]`, ...args);
  },
  error: (...args: unknown[]) => {
    console.error(`[${ts()}] [error]`, ...args);
  },
};
