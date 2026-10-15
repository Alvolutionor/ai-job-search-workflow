#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import { createApp } from '../server/app.mjs';
import { ensureAppDirectories } from '../lib/paths.mjs';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('port', {
      type: 'number',
      default: 3333,
      describe: 'Dashboard port'
    })
    .strict()
    .parse();

  ensureAppDirectories();
  const app = createApp();
  const server=app.listen(argv.port, '127.0.0.1', () => {
    console.log(`Dashboard ready at http://127.0.0.1:${server.address().port}`);
  });
  server.on('error',error=>{app.locals.close();console.error(error.message);process.exitCode=1;});
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
