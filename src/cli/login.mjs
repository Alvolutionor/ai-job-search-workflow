#!/usr/bin/env node
import fs from 'node:fs';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import { ensureAppDirectories, manualBrowserDataDir, manualBrowserPortFilePath } from '../lib/paths.mjs';
import {
  findAvailableDebugPort,
  findSupportedBrowserExecutable,
  getDefaultDebugPort,
  launchNormalBrowserForBossLogin,
  waitForDebugPort
} from '../lib/local-browser.mjs';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('port', {
      type: 'number',
      default: null,
      describe: 'Remote debugging port for the normal browser'
    })
    .strict()
    .parse();

  ensureAppDirectories();

  const executablePath = findSupportedBrowserExecutable();
  const debugPort = argv.port ?? await findAvailableDebugPort(getDefaultDebugPort());

  launchNormalBrowserForBossLogin({
    executablePath,
    userDataDir: manualBrowserDataDir,
    debugPort
  });

  const connected = await waitForDebugPort(debugPort);
  fs.writeFileSync(
    manualBrowserPortFilePath,
    JSON.stringify({
      port: debugPort,
      executablePath,
      userDataDir: manualBrowserDataDir,
      startedAt: new Date().toISOString(),
      connected
    }, null, 2),
    'utf8'
  );

  console.log(`Opened normal browser: ${executablePath}`);
  console.log(`Remote debugging port: ${debugPort}`);
  console.log(`Port state file: ${manualBrowserPortFilePath}`);
  if (!connected) {
    console.log('Browser was launched, but the debugging port did not become reachable yet. Keep the browser open and rerun collect-cookies after login.');
  }
  console.log('This browser is not launched by Playwright, so it should not show the automation-controlled banner.');
  console.log('');
  console.log('Next steps:');
  console.log('1. Finish login in the opened browser window');
  console.log('2. Keep that window open');
  console.log('3. Run: node ./src/cli/collect-cookies.mjs');
  console.log('4. Then run: node ./src/cli/crawl.mjs --config ./config/search.config.json');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
