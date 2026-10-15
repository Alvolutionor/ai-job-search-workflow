import fs from 'node:fs';
import path from 'node:path';

const candidatePath = path.resolve('./data/research/robotics-review-candidates.json');
const verdictPath = path.resolve('./data/research/robotics-review-verdicts.json');
const draftPath = path.resolve('./data/research/robotics-review-draft.json');
const candidates = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const previous = fs.existsSync(verdictPath) ? JSON.parse(fs.readFileSync(verdictPath, 'utf8')) : [];
const previousById = new Map(previous.map((row) => [row.id, row]));

if (previousById.size !== previous.length || new Set(candidates.map((row) => row.id)).size !== candidates.length) {
  throw new Error('Duplicate candidate or previous verdict IDs');
}

const draft = candidates.map((candidate) => previousById.get(candidate.id) ?? {
  id: candidate.id,
  relevant: null,
  reason: '',
});
const pending = draft.filter((row) => row.relevant === null);
const disappeared = previous.filter((row) => !candidates.some((candidate) => candidate.id === row.id));

fs.writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`);
console.log(`Prepared ${draft.length} verdicts: ${draft.length - pending.length} reused, ${pending.length} pending, ${disappeared.length} previously reviewed IDs absent from this candidate set`);
console.log(draftPath);
