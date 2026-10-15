import fs from 'node:fs';

const report = fs.readFileSync('./docs/robotics-market-report.md', 'utf8');
const counts = JSON.parse(fs.readFileSync('./data/research/robotics-skill-counts.json', 'utf8'));
const reviewed = JSON.parse(fs.readFileSync('./data/research/robotics-reviewed-evidence.json', 'utf8'));
const candidates = JSON.parse(fs.readFileSync('./data/research/boss-robotics-evidence.json', 'utf8'));
const jobs = new Map(reviewed.jobs.map((job) => [job.id, job]));
const failures = [];

if (counts.skills.length !== 50 || reviewed.jobs.length !== counts.reviewedRelevantJobs) {
  failures.push('The skill or reviewed job count does not match the report data');
}
if (reviewed.candidatesReviewed !== candidates.reviewableDescriptionJobs) {
  failures.push('The latest reviewable descriptions have not all been reviewed');
}

for (const [index, skill] of counts.skills.entries()) {
  if (skill.id !== String(index + 1).padStart(2, '0') || skill.count !== skill.sources.length) {
    failures.push(`Invalid count or sequence for skill ${skill.id}`);
  }
  if (new Set(skill.sources.map((source) => source.id)).size !== skill.sources.length) {
    failures.push(`Duplicate job ID for skill ${skill.id}`);
  }
  if (!report.includes(`| ${skill.id} | ${skill.name} | ${skill.count} |`)) {
    failures.push(`Report row missing for skill ${skill.id}`);
  }
  for (const source of skill.sources) {
    const job = jobs.get(source.id);
    const excerpt = source.excerpt.replace(/^…|…$/g, '');
    if (!job || source.url !== job.url || !job.description.replaceAll('\n', ' ').includes(excerpt)) {
      failures.push(`Evidence mismatch for skill ${skill.id}, job ${source.id}`);
    }
    if (!report.includes(job?.url ?? source.url)) {
      failures.push(`Job URL missing from report for ${source.id}`);
    }
  }
}

console.log(JSON.stringify({
  candidateJobs: candidates.candidateJobs,
  reviewableDescriptions: candidates.reviewableDescriptionJobs,
  reviewedRelevantJobs: reviewed.jobs.length,
  skills: counts.skills.length,
  matchedSkillJobPairs: counts.skills.reduce((sum, skill) => sum + skill.count, 0),
  failures,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
