import fs from 'node:fs';
import path from 'node:path';

const candidatePath = path.resolve('./data/research/robotics-review-candidates.json');
const verdictPath = path.resolve('./data/research/robotics-review-verdicts.json');
const outputPath = path.resolve('./data/research/robotics-reviewed-evidence.json');
const candidates = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const verdicts = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
const verdictById = new Map(verdicts.map((row) => [row.id, row]));

if (new Set(candidates.map(job=>job.id)).size !== candidates.length
    || verdicts.some(row=>typeof row.relevant!=='boolean' || !String(row.reason ?? '').trim())
    || verdictById.size !== verdicts.length || candidates.length !== verdicts.length
    || candidates.some((job) => !verdictById.has(job.id))) {
  throw new Error('Review verdicts do not match candidate job IDs exactly');
}

const jobs = candidates
  .filter((job) => verdictById.get(job.id).relevant)
  .map((job) => ({ ...job, relevanceReason: verdictById.get(job.id).reason }));

const result = {
  source: 'BOSS Zhipin',
  reviewedAt: new Date().toISOString(),
  candidatesReviewed: candidates.length,
  relevantJobsWithDescriptions: jobs.length,
  excludedJobs: candidates.length - jobs.length,
  dateRule: 'Observed dates do not prove first publication dates.',
  jobs,
};

fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Exported ${jobs.length} reviewed robotics jobs to ${outputPath}`);
