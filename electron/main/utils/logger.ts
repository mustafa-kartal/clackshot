import { app } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const isDev = !app.isPackaged;

let logPath: string | null = null;

function getLogPath(): string {
  if (!logPath) {
    const dir = join(app.getPath('logs'), 'ClackShot');
    mkdirSync(dir, { recursive: true });
    logPath = join(dir, 'main.log');
  }
  return logPath;
}

function ts(): string {
  return new Date().toISOString();
}

function write(level: string, args: unknown[]): void {
  const line = `[${ts()}] [${level}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}\n`;
  if (isDev) {
    level === 'info' ? console.log(line.trimEnd()) : level === 'warn' ? console.warn(line.trimEnd()) : console.error(line.trimEnd());
  } else {
    try { appendFileSync(getLogPath(), line); } catch { /* disk hatası yutulur */ }
  }
}

export const log = {
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),
};
