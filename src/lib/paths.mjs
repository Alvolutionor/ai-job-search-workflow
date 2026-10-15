import fs from 'node:fs';
import path from 'node:path';

export const rootDir = process.cwd();
export const configDir = path.join(rootDir, 'config');
export const dataDir = path.join(rootDir, 'data');
export const browserDataDir = path.join(dataDir, 'browser');
export const manualBrowserDataDir = path.join(dataDir, 'manual-browser');
export const manualBrowserPortFilePath = path.join(dataDir, 'manual-browser-port.json');
export const debugDir = path.join(dataDir, 'debug');
export const dbPath = path.join(dataDir, 'jobs.sqlite');
export const cookieFilePath = path.join(dataDir, 'boss-cookies.json');
export const localStorageFilePath = path.join(dataDir, 'boss-local-storage.json');
export const templatesDir = path.join(rootDir, 'src', 'server', 'templates');
export const publicDir = path.join(rootDir, 'src', 'server', 'public');

export function ensureAppDirectories() {
  for (const dir of [configDir, dataDir, browserDataDir, manualBrowserDataDir, debugDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
