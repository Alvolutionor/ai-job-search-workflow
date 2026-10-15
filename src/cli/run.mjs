#!/usr/bin/env node
// One-shot pipeline: crawl every config'd city × keyword, fetch JD inline for every job,
// print a summary at the end. Reads cookies from data/boss-cookies.json — run
// `npm run login` + `npm run collect-cookies` first if they're stale.

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import { loadConfig, resolveRunPlan } from '../lib/config.mjs';
import { crawlJobs } from '../lib/crawler.mjs';
import { JobDatabase } from '../lib/db.mjs';
import { ensureAppDirectories } from '../lib/paths.mjs';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('config', { type: 'string', default: './config/search.config.json' })
    .option('city-limit', { type: 'number' })
    .option('keyword-limit', { type: 'number' })
    .option('reset', { type: 'boolean', default: false, describe: 'Wipe task progress and start every city from page 1 (normally you want resume)' })
    .option('skip-jd', { type: 'boolean', default: false, describe: 'Dev: skip JD detail fetch to iterate on list/pagination logic faster' })
    .strict()
    .parse();

  ensureAppDirectories();
  const config = loadConfig(argv.config);
  const plan = resolveRunPlan(config, {
    cityLimit: argv.cityLimit ?? null,
    keywordLimit: argv.keywordLimit ?? null,
  });

  const db = new JobDatabase();
  const startedAt = Date.now();

  try {
    console.log(`\n=== crawl — ${plan.keywords.length} keywords × ${plan.cities.length} cities (${argv.skipJd ? 'list only' : 'JD inline'}) ===`);
    await crawlJobs({
      db,
      config,
      keywords: plan.keywords,
      cities: plan.cities,
      force: argv.reset,
      skipJd: argv.skipJd,
    });

    const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
    const stats = db.getDashboardStats();
    const withDesc = stats.totalJobs - db.listJobsMissingDescription(100_000).length;
    console.log('\n=== SUMMARY ===');
    console.log(`  elapsed:    ${elapsedMin} min`);
    console.log(`  total jobs: ${stats.totalJobs}`);
    console.log(`  with JD:    ${withDesc} / ${stats.totalJobs}`);
    console.log(`  companies:  ${stats.companyCount}`);
    console.log(`  cities:     ${stats.cityCount}`);
    console.log(`  dashboard:  npm run web  →  http://localhost:3333`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
