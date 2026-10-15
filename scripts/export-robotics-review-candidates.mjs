import fs from 'node:fs';
import path from 'node:path';

import { minReviewableDescriptionLength } from '../config/robotics-review-policy.mjs';

const inputPath = path.resolve(process.argv[2] ?? './data/research/boss-robotics-evidence.json');
const outputPath = path.resolve(process.argv[3] ?? './data/research/robotics-review-candidates.json');
const evidence = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const candidates = evidence.jobs
  .filter((job) => job.description?.length >= minReviewableDescriptionLength)
  .map((job) => ({
    id: job.jobId,
    title: job.title,
    company: job.company,
    city: job.city,
    url: job.url,
    description: job.description,
    matchedKeywords: job.matchedKeywords,
    publishedAt: job.publishedAt,
    dateBasis: job.dateBasis,
    lastObservedAt: job.lastObservedAt,
  }));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(candidates, null, 2)}\n`);
console.log(`Exported ${candidates.length} robotics candidates with reviewable descriptions to ${outputPath}`);
