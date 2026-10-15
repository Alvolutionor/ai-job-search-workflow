import fs from 'node:fs';
import path from 'node:path';

const [candidateFile, verdictFile] = process.argv.slice(2);
if (!candidateFile || !verdictFile) {
  throw new Error('Usage: node scripts/validate-verdicts.mjs <candidates.json> <verdicts.json>');
}

const candidates = JSON.parse(fs.readFileSync(path.resolve(candidateFile), 'utf8'));
const verdicts = JSON.parse(fs.readFileSync(path.resolve(verdictFile), 'utf8'));
if (!Array.isArray(candidates) || !Array.isArray(verdicts)) {
  throw new Error('Both inputs must be JSON arrays');
}

const getId = (row) => row.id ?? row.job_id;
const candidateIds = candidates.map(getId);
const verdictIds = verdicts.map(getId);
const candidateSet = new Set(candidateIds);
const verdictSet = new Set(verdictIds);
const missing = candidateIds.filter((id) => !verdictSet.has(id));
const extra = verdictIds.filter((id) => !candidateSet.has(id));
const invalid = verdicts.filter((row) => typeof row.relevant !== 'boolean' || !String(row.reason ?? '').trim()).map(getId);

if (candidateSet.size !== candidateIds.length || verdictSet.size !== verdictIds.length || missing.length || extra.length || invalid.length) {
  console.error(JSON.stringify({
    duplicateCandidates: candidateIds.length - candidateSet.size,
    duplicateVerdicts: verdictIds.length - verdictSet.size,
    missing,
    extra,
    invalid,
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Validated ${candidateIds.length} exact job IDs and relevance verdicts`);
}
