import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const rows = JSON.parse(fs.readFileSync('data/judge/final_relevant.json', 'utf8'));

function cleanActivity(s) {
  if (!s) return '';
  const t = String(s).trim();
  if (!t) return '';
  if (t.length > 8 || /公司|有限|集团|环境|科技|招聘|经理|股份/.test(t)) return '';
  return t;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const byCity = new Map();
for (const r of rows) {
  const c = r.city_name || '其他';
  if (!byCity.has(c)) byCity.set(c, []);
  byCity.get(c).push(r);
}

const cityOrder = ['北京', '天津', '大连', '沈阳'];
const orderedCities = [...cityOrder.filter((c) => byCity.has(c)), ...[...byCity.keys()].filter((c) => !cityOrder.includes(c))];

const generatedAt = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

const css = `
* { box-sizing: border-box; }
body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1a1a1a; padding: 18mm 15mm 15mm; }
h1 { font-size: 18pt; margin: 0 0 6mm; color: #0f3a2e; border-bottom: 2pt solid #0f3a2e; padding-bottom: 3mm; }
.subtitle { color: #555; font-size: 9.5pt; margin-bottom: 8mm; }
.city-section { break-inside: avoid-page; margin-top: 6mm; }
.city-header { font-size: 13pt; background: #0f3a2e; color: #fff; padding: 3mm 4mm; border-radius: 2mm; margin: 4mm 0 3mm; }
.city-count { font-weight: normal; opacity: 0.75; font-size: 10pt; margin-left: 2mm; }
table { width: 100%; border-collapse: collapse; }
tr.job { border-bottom: 0.5pt solid #ddd; page-break-inside: avoid; }
td { padding: 2.5mm 2mm; vertical-align: top; }
.col-name { width: 38%; }
.col-company { width: 22%; }
.col-salary { width: 14%; }
.col-meta { width: 18%; }
.col-link { width: 8%; text-align: right; }
.name { font-weight: 600; font-size: 10.5pt; color: #1a1a1a; }
.name a { color: inherit; text-decoration: none; }
.name a:hover { text-decoration: underline; }
.reason { font-size: 8.5pt; color: #0f3a2e; margin-top: 1mm; }
.company { font-size: 10pt; color: #333; }
.district { font-size: 8.5pt; color: #888; }
.salary { font-weight: 600; color: #b8490d; }
.exp { font-size: 8.5pt; color: #666; }
.activity { display: inline-block; padding: 0.5mm 1.5mm; border-radius: 1mm; font-size: 8pt; font-weight: 600; background: #eef7f2; color: #0f3a2e; }
.activity.fresh { background: #d8f5e5; color: #105a37; }
.activity.stale { background: #f3f3f3; color: #777; }
.activity.empty { color: #ccc; background: transparent; }
.link-btn { display: inline-block; padding: 1.5mm 3mm; background: #0f3a2e; color: #fff !important; text-decoration: none; border-radius: 1.5mm; font-size: 9pt; }
`;

function activityClass(a) {
  if (!a) return 'empty';
  if (/刚刚|今日|在线|3日内/.test(a)) return 'fresh';
  if (/半年前|1年前|5月内|4月内|3月内/.test(a)) return 'stale';
  return '';
}

let body = `<h1>环保 · 废气/水处理相关岗位汇总</h1>`;
body += `<div class="subtitle">由 jobtrending 从 BOSS 直聘抓取 · LLM 判定相关 · 生成于 ${esc(generatedAt)} · 共 ${rows.length} 个岗位</div>`;

for (const city of orderedCities) {
  const list = byCity.get(city);
  body += `<section class="city-section"><div class="city-header">${esc(city)}<span class="city-count">${list.length} 个岗位</span></div>`;
  body += `<table>`;
  for (const r of list) {
    const activity = cleanActivity(r.boss_active_label || r.publish_label_detail);
    const actCls = activityClass(activity);
    const activityHtml = activity
      ? `<span class="activity ${actCls}">${esc(activity)}</span>`
      : `<span class="activity empty">—</span>`;
    body += `<tr class="job">`;
    body += `<td class="col-name"><div class="name"><a href="${esc(r.job_url || '#')}">${esc(r.job_name || '未知职位')}</a></div>`;
    if (r._reason) body += `<div class="reason">★ ${esc(r._reason)}</div>`;
    body += `</td>`;
    body += `<td class="col-company"><div class="company">${esc(r.company_name || '未知公司')}</div>${r.district_name ? `<div class="district">${esc(r.district_name)}</div>` : ''}</td>`;
    body += `<td class="col-salary"><div class="salary">${esc(r.salary_desc || '面议')}</div><div class="exp">${esc(r.experience_name || '')}</div></td>`;
    body += `<td class="col-meta">${activityHtml}</td>`;
    body += `<td class="col-link"><a class="link-btn" href="${esc(r.job_url || '#')}">打开 →</a></td>`;
    body += `</tr>`;
  }
  body += `</table></section>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>环保岗位汇总</title><style>${css}</style></head><body>${body}</body></html>`;

const outHtml = path.resolve('data/judge/relevant-jobs.html');
const outPdf = path.resolve('data/judge/relevant-jobs.pdf');
fs.writeFileSync(outHtml, html);
console.log('HTML written:', outHtml);

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.goto('file:///' + outHtml.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
await page.pdf({
  path: outPdf,
  format: 'A4',
  printBackground: true,
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
});
await browser.close();
console.log('PDF written:', outPdf);
