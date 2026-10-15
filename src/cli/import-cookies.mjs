#!/usr/bin/env node
import fs from 'node:fs';

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import { parseCookieJson, saveCookieFile } from '../lib/cookies.mjs';
import { ensureAppDirectories } from '../lib/paths.mjs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('file', {
      type: 'string',
      describe: 'Path to a JSON file exported from EditThisCookie'
    })
    .option('stdin', {
      type: 'boolean',
      default: false,
      describe: 'Read cookie JSON from stdin'
    })
    .strict()
    .parse();

  ensureAppDirectories();

  let rawText = '';
  if (argv.file) {
    rawText = fs.readFileSync(argv.file, 'utf8');
  } else if (argv.stdin || !process.stdin.isTTY) {
    rawText = await readStdin();
  } else {
    throw new Error('Provide --file path\\to\\cookies.json or pipe JSON with --stdin.');
  }

  const cookies = parseCookieJson(rawText);
  const savedPath = saveCookieFile(cookies);
  const domains = Array.from(new Set(cookies.map((cookie) => cookie.domain))).slice(0, 6);

  console.log(`Saved ${cookies.length} cookies to ${savedPath}`);
  console.log(`Domains: ${domains.join(', ')}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
