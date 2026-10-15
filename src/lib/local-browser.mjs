import fs from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';

import { chromium } from 'playwright';

const defaultDebugPort = 9222;

export function getDefaultDebugPort() {
  return defaultDebugPort;
}

export async function isDebugPortOpen(port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(700);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });
}

export async function findAvailableDebugPort(startPort = defaultDebugPort) {
  for (let port = startPort; port < startPort + 40; port += 1) {
    if (!(await isDebugPortOpen(port))) {
      return port;
    }
  }
  throw new Error(`No free debug port found from ${startPort} to ${startPort + 39}.`);
}

export async function waitForDebugPort(port, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isDebugPortOpen(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

export function findSupportedBrowserExecutable() {
  if(process.env.JOBTRENDING_BROWSER_PATH) {
    if(!fs.existsSync(process.env.JOBTRENDING_BROWSER_PATH)) throw new Error('JOBTRENDING_BROWSER_PATH does not point to an executable.');
    return process.env.JOBTRENDING_BROWSER_PATH;
  }
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    chromium.executablePath(),
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('No supported browser found. Run npx playwright install chromium or set JOBTRENDING_BROWSER_PATH.');
}

export function launchNormalBrowserForBossLogin({
  executablePath,
  userDataDir,
  debugPort = defaultDebugPort,
  startUrl = 'https://www.zhipin.com/web/user/?ka=header-login'
}) {
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--new-window',
    startUrl
  ];

  const child = spawn(executablePath, args, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return child;
}

export async function connectToLocalBrowser(debugPort = defaultDebugPort) {
  return await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
}
