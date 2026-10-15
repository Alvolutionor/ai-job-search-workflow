import fs from 'node:fs';
import path from 'node:path';

import { minReviewableDescriptionLength } from '../config/robotics-review-policy.mjs';
import { roboticsSkillRules } from '../config/robotics-skill-rules.mjs';
import { excerptFor } from '../src/lib/robotics-skills.mjs';

const reviewedPath = path.resolve('./data/research/robotics-reviewed-evidence.json');
const candidatePath = path.resolve('./data/research/boss-robotics-evidence.json');
const outputPath = path.resolve('./docs/robotics-market-report.md');
const countsPath = path.resolve('./data/research/robotics-skill-counts.json');
const reviewed = JSON.parse(fs.readFileSync(reviewedPath, 'utf8'));
const candidates = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));

if (roboticsSkillRules.length !== 50 || new Set(roboticsSkillRules.map((rule) => rule.id)).size !== 50) {
  throw new Error('The report requires exactly 50 distinct skill rules');
}
if (reviewed.candidatesReviewed !== candidates.reviewableDescriptionJobs) {
  throw new Error('Review verdicts do not cover the current reviewable descriptions');
}
if (new Set(reviewed.jobs.map((job) => job.id)).size !== reviewed.jobs.length
    || reviewed.jobs.some((job) => !job.description || job.description.length < minReviewableDescriptionLength
      || !job.url?.startsWith('https://www.zhipin.com/job_detail/'))) {
  throw new Error('The reviewed corpus contains duplicate IDs or incomplete BOSS evidence');
}

function escapeTable(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const jobs = [...new Map(reviewed.jobs.map((job) => [job.id, job])).values()];
const descriptions = new Map();
for (const job of jobs) {
  const key = job.description.replace(/\s+/g, '');
  descriptions.set(key, [...(descriptions.get(key) ?? []), job]);
}
const duplicateDescriptionGroups = [...descriptions.values()]
  .filter((group) => group.length > 1)
  .map((group) => group.map((job) => ({ id: job.id, url: job.url, city: job.city })));
const rows = roboticsSkillRules.map((rule) => {
  const sources = jobs.flatMap((job) => {
    const excerpt = excerptFor(job.description, rule.groups);
    return excerpt ? [{ id: job.id, title: job.title, company: job.company, city: job.city, url: job.url, excerpt }] : [];
  });
  return { id: rule.id, name: rule.name, check: rule.check, count: sources.length, sources };
});

const cityCounts = new Map();
for (const job of candidates.jobs) {
  cityCounts.set(job.city, (cityCounts.get(job.city) ?? 0) + 1);
}
const reviewedCityCounts = new Map();
for (const job of jobs) {
  reviewedCityCounts.set(job.city, (reviewedCityCounts.get(job.city) ?? 0) + 1);
}

const result = {
  generatedAt: new Date().toISOString(),
  source: 'BOSS Zhipin',
  candidateJobs: candidates.candidateJobs,
  capturedDescriptionJobs: candidates.capturedDescriptionJobs,
  reviewableDescriptionJobs: candidates.reviewableDescriptionJobs,
  reviewedDescriptionJobs: reviewed.candidatesReviewed,
  excludedJobs: reviewed.excludedJobs,
  completedSearchTasks: candidates.completedSearchTasks ?? 0,
  failedSearchTasks: candidates.failedSearchTasks ?? 0,
  completedSearchCities: candidates.completedSearchCities ?? [],
  failedSearchCities: candidates.failedSearchCities ?? [],
  reviewedRelevantJobs: jobs.length,
  duplicateDescriptionGroups,
  citiesWithCandidates: [...cityCounts].sort((left, right) => right[1] - left[1]),
  countingRule: 'Count each distinct reviewed relevant job ID once per skill only when the description explicitly matches all terms in one line.',
  dateRule: 'Observation dates do not verify initial posting within six months.',
  skills: rows,
};

const lines = [
  '# BOSS 直聘机器人岗位技能调研',
  '',
  `采集观察日期：${candidates.asOf}。来源：BOSS 直聘。`,
  '',
  '## 样本与统计口径',
  '',
  `- 列表页去重岗位：**${result.candidateJobs}** 个；取得任意描述：**${result.capturedDescriptionJobs}** 个；其中达到 ${minReviewableDescriptionLength} 字审核门槛：**${result.reviewableDescriptionJobs}** 个；逐条审核排除 **${result.excludedJobs}** 个后，纳入技能统计：**${result.reviewedRelevantJobs}** 个。以下“岗位数”的分母均为这 ${result.reviewedRelevantJobs} 个岗位。`,
  '- 纳入实体机器人或自主移动平台的软件、算法、仿真、控制和传感器集成岗位；排除仅做产品、销售或无机器人研发职责的岗位。',
  `- 已完成“关键词 × 搜索城市”任务：**${result.completedSearchTasks}** 个；失败：**${result.failedSearchTasks}** 个。实际完成搜索的入口：${result.completedSearchCities.join('、')}。`,
  ...(result.failedSearchCities.length > 0 ? [`- 出现失败任务的搜索城市：${result.failedSearchCities.join('、')}；失败任务未计入已完成任务数。`] : []),
  `- 列表候选岗位分布在 **${result.citiesWithCandidates.length}** 个实际工作城市；审核通过的职位详情页描述分布在 **${reviewedCityCounts.size}** 个城市。城市明细见下表。`,
  '- 每个技能只数一次岗位 ID；只检查审核通过的岗位描述原文；所需词组必须出现在同一行。岗位标题、搜索词和列表页摘要不计入。',
  '- 下列“验证项”是据岗位要求制定的学习练习，不是招聘方原话，也不参与提及次数统计。',
  '- BOSS 页面没有提供可核验的首次发布日期；本报告只能证明岗位在观察日可见，**不能证明其首次发布于最近六个月**。',
  '- 页面上的“今日活跃”等标签表示招聘者近期活动，不能当作岗位发布日期。',
  '- 数量是本次样本内的提及次数，不能推算全国岗位比例；招聘页面可能变更或下架。',
  `- ${duplicateDescriptionGroups.length} 组已审核岗位描述在去除空白后完全相同。统计单位是不同 BOSS 岗位 ID，这些重复文案可能对应同一个实际招聘空缺；具体 ID 见 \`data/research/robotics-skill-counts.json\`。`,
  '',
  `本样本提及最多的 10 项：${[...rows].sort((left, right) => right.count - left.count).slice(0, 10).map((row) => `${row.name} ${row.count}`).join('、')}。`,
  '',
  '## 50 项技能及可执行验证项',
  '',
  '| # | 技能需求 | 提及岗位数 | 学习验证项 | 原文证据 |',
  '| --- | --- | ---: | --- | --- |',
  ...rows.map((row) => `| ${row.id} | ${escapeTable(row.name)} | ${row.count} | ${escapeTable(row.check)} | ${row.sources.map((source) => `[J${String(jobs.findIndex((job) => job.id === source.id) + 1).padStart(2, '0')}](${source.url})`).join('、') || '本样本未检出'} |`),
  '',
  '## 城市覆盖',
  '',
  '| 实际工作城市 | 列表候选岗位 | 纳入技能统计的岗位 |',
  '| --- | ---: | ---: |',
  ...result.citiesWithCandidates.map(([city, count]) => `| ${city} | ${count} | ${reviewedCityCounts.get(city) ?? 0} |`),
  '',
  '## 原文证据索引',
  '',
  '点击岗位编号可打开对应 BOSS 岗位页面。抓取到的职位详情页描述保存在 `data/research/robotics-reviewed-evidence.json`；每项技能对应的岗位 ID、页面链接和原文摘录保存在 `data/research/robotics-skill-counts.json`，可逐项复核。',
  '',
];

for (const [index, job] of jobs.entries()) {
  const number = String(index + 1).padStart(2, '0');
  lines.push(`### J${number}`, '', `[${job.title}｜${job.company}｜${job.city}](${job.url}) · 岗位 ID：\`${job.id}\``, '');
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
fs.writeFileSync(countsPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Built ${rows.length} skill rows from ${jobs.length} reviewed jobs; ${rows.filter((row) => row.count === 0).length} skills have zero matches`);
console.log(outputPath);
