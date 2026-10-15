import fs from 'node:fs';

import { liveVerdictPath } from '../src/lib/robotics-skills.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
  throw new Error('Usage: node scripts/merge-robotics-verdicts.mjs <verdicts.json>...');
}

const pendingIds = new Set(JSON.parse(fs.readFileSync('./data/research/robotics-review-pending.json', 'utf8')).map((job) => job.id));
const incoming = files.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const invalid = incoming.filter((row) => !pendingIds.has(row.id) || typeof row.relevant !== 'boolean' || !String(row.reason ?? '').trim());
if (invalid.length > 0 || new Set(incoming.map((row) => row.id)).size !== incoming.length) {
  console.error(JSON.stringify({ invalid: invalid.map((row) => row.id), duplicates: incoming.length - new Set(incoming.map((row) => row.id)).size }, null, 2));
  throw new Error('Verdicts must cover pending IDs once each with a boolean relevance and a reason');
}

const existing = fs.existsSync(liveVerdictPath) ? JSON.parse(fs.readFileSync(liveVerdictPath, 'utf8')) : [];
const merged = new Map(existing.map((row) => [row.id, row]));
for (const { id, relevant, reason } of incoming) merged.set(id, { id, relevant, reason });

fs.writeFileSync(liveVerdictPath, `${JSON.stringify([...merged.values()], null, 2)}\n`);
console.log(`Merged ${incoming.length} verdicts; ${merged.size} stored in ${liveVerdictPath}`);
