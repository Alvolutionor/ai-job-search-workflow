import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { minReviewableDescriptionLength } from '../config/robotics-review-policy.mjs';
import { listScopedJobs, loadVerdictsById } from '../src/lib/robotics-skills.mjs';

const outputPath = path.resolve(process.argv[2] ?? './data/research/robotics-review-pending.json');
const recheck = new Set(process.argv.slice(3));
const db = new Database(path.resolve('./data/jobs.sqlite'), { readonly: true });
const verdicts = loadVerdictsById();
const pending = listScopedJobs(db)
  .filter((job) => job.description?.length >= minReviewableDescriptionLength)
  .filter((job) => !verdicts.has(job.id) || recheck.has(job.id))
  .map(({ id, title, company, city, description }) => ({ id, title, company, city, description }));
db.close();

fs.mkdirSync(path.dirname(outputPath), {recursive:true});
fs.writeFileSync(outputPath, `${JSON.stringify(pending, null, 2)}\n`);
console.log(`Exported ${pending.length} pending robotics review jobs to ${outputPath}`);
