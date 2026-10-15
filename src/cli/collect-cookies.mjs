#!/usr/bin/env node
import fs from 'node:fs';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import {
  connectToLocalBrowser,
  findAvailableDebugPort,
  findSupportedBrowserExecutable,
  getDefaultDebugPort,
  isDebugPortOpen,
  launchNormalBrowserForBossLogin,
  waitForDebugPort
} from '../lib/local-browser.mjs';
import { checkCookieListFormat, detectCookieListFormat, saveCookieFile } from '../lib/cookies.mjs';
import { saveLocalStorageFile } from '../lib/local-storage.mjs';
import { ensureAppDirectories, manualBrowserDataDir, manualBrowserPortFilePath } from '../lib/paths.mjs';

function isBlockedBossUrl(url) {
  return /_security_check|captcha|verify|security|geetest/i.test(url ?? '');
}

async function isBossLoggedIn(browser) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (!page.url().includes('zhipin.com')) {
        continue;
      }
      const loggedIn = await page.locator('.nav-figure, .user-nav, .nav-user-center').first().isVisible({ timeout: 1200 }).catch(() => false);
      if (loggedIn) {
        return true;
      }
    }
  }
  return false;
}

async function findBossPage(browser) {
  let fallbackPage = null;
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.isClosed() || page.url() === 'about:blank') {
        continue;
      }
      if (!page.url().includes('zhipin.com')) {
        continue;
      }
      if (!isBlockedBossUrl(page.url())) {
        return page;
      }
      fallbackPage = fallbackPage ?? page;
    }
  }
  return fallbackPage;
}

async function ensureBossPage(context, browser) {
  const existingPage = await findBossPage(browser);
  if (existingPage) {
    return {
      page: existingPage,
      temporary: false
    };
  }

  const page = await context.newPage();
  try {
    await page.goto('https://www.zhipin.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000
    });
    return {
      page,
      temporary: true
    };
  } catch (error) {
    await page.close().catch(() => void 0);
    throw new Error(`No open zhipin.com page found, and opening a temporary BOSS page failed. ${error.message}`);
  }
}

async function readLocalStorage(page) {
  return await page.evaluate(() => {
    const result = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) {
        continue;
      }
      result[key] = window.localStorage.getItem(key) ?? '';
    }
    return result;
  });
}

async function collectLocalStorage(context, preferredPage) {
  if (preferredPage && !preferredPage.isClosed()) {
    try {
      return await readLocalStorage(preferredPage);
    } catch (error) {
      console.warn(`Reading localStorage from the existing BOSS tab failed, retrying with a temporary tab. ${error.message}`);
    }
  }

  const page = await context.newPage();
  try {
    await page.goto('https://www.zhipin.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000
    });
    if (isBlockedBossUrl(page.url())) {
      throw new Error(`Temporary BOSS tab opened a security/verification page: ${page.url()}`);
    }
    return await readLocalStorage(page);
  } finally {
    await page.close().catch(() => void 0);
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('port', {
      type: 'number',
      default: null,
      describe: 'Remote debugging port of the normal browser'
    })
    .option('launch-if-needed', {
      type: 'boolean',
      default: true,
      describe: 'Launch a normal browser if no debug port is reachable'
    })
    .option('cookies-only', {
      type: 'boolean',
      default: false,
      describe: 'Save valid BOSS cookies without reading browser local storage'
    })
    .strict()
    .parse();

  ensureAppDirectories();

  let port = argv.port ?? readSavedDebugPort() ?? getDefaultDebugPort();
  if (!(await isDebugPortOpen(port)) && argv.launchIfNeeded) {
    const executablePath = findSupportedBrowserExecutable();
    port = await findAvailableDebugPort(getDefaultDebugPort());
    launchNormalBrowserForBossLogin({
      executablePath,
      userDataDir: manualBrowserDataDir,
      debugPort: port
    });
    const connected = await waitForDebugPort(port);
    fs.writeFileSync(
      manualBrowserPortFilePath,
      JSON.stringify({
        port,
        executablePath,
        userDataDir: manualBrowserDataDir,
        startedAt: new Date().toISOString(),
        connected
      }, null, 2),
      'utf8'
    );
    if (!connected) {
      throw new Error(`Launched browser, but debug port ${port} is not reachable. Keep the opened browser alive and rerun collect-cookies.`);
    }
    console.log(`Launched normal browser for BOSS login on port ${port}. Finish login there, keep it open, then rerun collect-cookies.`);
    return;
  }

  let browser;
  try {
    browser = await connectToLocalBrowser(port);
  } catch (error) {
    throw new Error(
      `Could not connect to a manually opened browser on port ${port}. Run "node ./src/cli/login.mjs", finish login in that browser window, keep it open, then rerun collect-cookies. ${error.message}`,
    );
  }
  const contexts = browser.contexts();
  const context = contexts[0];
  if (!context) {
    throw new Error(`Connected to browser on ${argv.port}, but no context is available.`);
  }

  const cookies = await context.cookies([
    'https://www.zhipin.com',
    'https://zhipin.com'
  ]);

  if (!checkCookieListFormat(cookies)) {
    throw new Error('Collected cookies are incomplete. Confirm you are logged into BOSS in the opened browser window.');
  }

  const cookieFormat = detectCookieListFormat(cookies);
  const savedPath = saveCookieFile(cookies);
  console.log(`Saved ${cookies.length} cookies to ${savedPath}`);
  console.log(`Detected cookie format: ${cookieFormat}`);
  if (argv.cookiesOnly) {
    return;
  }
  try {
    const bossPageHandle = await ensureBossPage(context, browser);
    try {
      if (isBlockedBossUrl(bossPageHandle.page.url())) {
        throw new Error(`Current BOSS page is still in security/verification state: ${bossPageHandle.page.url()}. Open a normal logged-in BOSS page first, then rerun collect-cookies.`);
      }
      const localStorageState = await collectLocalStorage(context, bossPageHandle.page);

      const loggedIn = await isBossLoggedIn(browser);
      if (!loggedIn) {
        console.warn('Connected browser did not expose a logged-in BOSS page element. Cookies may still be partial.');
      }

      const localStoragePath = saveLocalStorageFile(localStorageState);
      console.log(`Saved ${Object.keys(localStorageState).length} localStorage entries to ${localStoragePath}`);
    } finally {
      if (bossPageHandle.temporary && !bossPageHandle.page.isClosed()) {
        await bossPageHandle.page.close().catch(() => void 0);
      }
    }
  } catch (error) {
    console.warn(`Cookies were saved, but local storage could not be collected: ${error.message}`);
  }
}

function readSavedDebugPort() {
  if (!fs.existsSync(manualBrowserPortFilePath)) {
    return null;
  }
  try {
    const state = JSON.parse(fs.readFileSync(manualBrowserPortFilePath, 'utf8'));
    return Number.isInteger(state.port) ? state.port : null;
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
