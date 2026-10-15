#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import { loadConfig, resolveRunPlan } from '../lib/config.mjs';
import { crawlJobs } from '../lib/crawler.mjs';
import { JobDatabase } from '../lib/db.mjs';
import { ensureAppDirectories } from '../lib/paths.mjs';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('config', {
      type: 'string',
      default: './config/search.config.json',
      describe: 'Path to the crawl config JSON file'
    })
    .option('force', {
      type: 'boolean',
      default: false,
      describe: 'Reset matching tasks and crawl them again from page 1'
    })
    .option('city-limit', {
      type: 'number',
      describe: 'Temporarily limit the run to the first N cities'
    })
    .option('keyword-limit', {
      type: 'number',
      describe: 'Temporarily limit the run to the first N keywords'
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      describe: 'Print the computed run plan without opening a browser'
    })
    .option('skip-jd', {
      type: 'boolean',
      default: false,
      describe: 'Collect job lists without opening every detail page'
    })
    .option('skip-failed', {
      type: 'boolean',
      default: false,
      describe: 'Leave previously failed tasks for a separate retry run'
    })
    .strict()
    .parse();

  ensureAppDirectories();
  const config = loadConfig(argv.config);
  const plan = resolveRunPlan(config, {
    cityLimit: argv.cityLimit ?? null,
    keywordLimit: argv.keywordLimit ?? null
  });

  console.log(`Plan: ${plan.keywords.length} keywords x ${plan.cities.length} cities = ${plan.keywords.length * plan.cities.length} tasks`);

  if (argv.dryRun) {
    console.log('Keywords:', plan.keywords.join(', '));
    console.log('First cities:', plan.cities.slice(0, 10).map((city) => city.name).join(', '));
    return;
  }

  const db = new JobDatabase();
  try {
    await crawlJobs({
      db,
      config,
      keywords: plan.keywords,
      cities: plan.cities,
      force: argv.force,
      skipJd: argv.skipJd,
      skipFailed: argv.skipFailed
    });
    console.log(`Finished. Jobs in local database: ${db.countJobs()}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
