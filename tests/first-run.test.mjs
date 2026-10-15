import test from 'node:test';
import assert from 'node:assert/strict';
import { JobDatabase } from '../src/lib/db.mjs';
import { selectBalancedJobs } from '../src/lib/enrich.mjs';
import { normalizeJobRecord } from '../src/lib/normalize-job.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { rootDir } from '../src/lib/paths.mjs';

test('a new database supports detail capture and subsequent detail queries immediately', () => {
  const db=new JobDatabase(':memory:');
  try {
    const job=normalizeJobRecord({encryptJobId:'fixture-first-run',jobName:'Nurse'}, {keyword:'Nurse',searchCity:{code:101210100,name:'杭州'},pageNumber:1,collectedAtMs:Date.now()});
    db.saveNormalizedJob(job);
    assert.equal(db.hasFullJobDetail(job.jobId),false);
    assert.equal(db.listJobsMissingFullDetail().length,1);
    db.updateJobDetail(job.jobId,{description:'A complete fixture description',bossActiveLabel:'Online'});
    assert.equal(db.hasFullJobDetail(job.jobId),true);
    assert.equal(db.listJobsMissingFullDetail().length,0);
    assert.equal(db.listJobsMissingDescriptionForKeywords(['Nurse']).length,0);
  } finally {db.close();}
});

test('detail selection does not promote robotics or demote sales and product roles', () => {
  const jobs=[
    {job_id:'sales',job_name:'销售',matched_keywords:'work',city_name:'杭州',last_observed_at_ms:30},
    {job_id:'product',job_name:'产品经理',matched_keywords:'work',city_name:'杭州',last_observed_at_ms:20},
    {job_id:'robot',job_name:'机器人软件工程师',matched_keywords:'work',city_name:'杭州',last_observed_at_ms:10}
  ];
  assert.deepEqual(selectBalancedJobs(jobs,['work'],3).map(job=>job.job_id),['sales','product','robot']);
});

test('research export, review, report, audit and PDF work in an isolated first-run workspace', () => {
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'jobtrending-test-'));
  try {
    fs.cpSync(path.join(rootDir,'config'),path.join(workspace,'config'),{recursive:true,filter:source=>!source.endsWith('.json') || source.endsWith('.example.json') || /robotics[.\-]/.test(path.basename(source))});
    const run=(script,...args)=>{
      const result=spawnSync(process.execPath,[path.join(rootDir,'scripts',script),...args],{cwd:workspace,encoding:'utf8',windowsHide:true,timeout:30000});
      assert.equal(result.status,0,`${script}: ${result.stdout}\n${result.stderr}`);
      return result;
    };
    run('setup.mjs');
    const profile=path.join(workspace,'config/candidate-profile.json');
    fs.writeFileSync(profile,JSON.stringify({name:'Fixture candidate'}));
    run('setup.mjs');
    assert.equal(JSON.parse(fs.readFileSync(profile)).name,'Fixture candidate');
    const research={...JSON.parse(fs.readFileSync(path.join(workspace,'config/research.config.json'))),keywords:['Nurse'],cityMode:'custom',cityNames:['杭州'],cityCodes:[]};
    fs.writeFileSync(path.join(workspace,'config/research.config.json'),JSON.stringify(research));
    const db=new JobDatabase(path.join(workspace,'data/jobs.sqlite'));
    const description='Patient care and shift coordination. '.repeat(8);
    const job=normalizeJobRecord({encryptJobId:'research-fixture',jobName:'Nurse',cityName:'杭州',description}, {keyword:'Nurse',searchCity:{code:101210100,name:'杭州'},pageNumber:1,collectedAtMs:Date.now()});
    db.saveNormalizedJob(job);db.close();
    run('export-boss-robotics-evidence.mjs');
    run('export-robotics-review-candidates.mjs');
    run('prepare-robotics-review.mjs');
    const verdict=[{id:'research-fixture',relevant:true,reason:'Matches the user search.'}];
    const folder=path.join(workspace,'data/research');
    fs.writeFileSync(path.join(folder,'robotics-review-draft.json'),JSON.stringify(verdict));
    run('validate-verdicts.mjs',path.join(folder,'robotics-review-candidates.json'),path.join(folder,'robotics-review-draft.json'));
    fs.writeFileSync(path.join(folder,'robotics-review-verdicts.json'),JSON.stringify(verdict));
    run('export-reviewed-robotics-evidence.mjs');
    run('build-robotics-market-report.mjs');
    run('audit-robotics-skills.mjs');
    run('export-pending-robotics-review.mjs');
    run('clean-nonrobotics-results.mjs');
    fs.writeFileSync(path.join(folder,'pdf-fixture.json'),JSON.stringify([{job_name:'Nurse',city_name:'杭州',company_name:'Fixture clinic'}]));
    run('make-pdf.mjs',path.join(folder,'pdf-fixture.json'),path.join(folder,'report.pdf'),'User chosen title');
    assert.equal(fs.readFileSync(path.join(folder,'report.pdf')).subarray(0,5).toString(),'%PDF-');
    const html=fs.readFileSync(path.join(folder,'report.html'),'utf8');
    assert(html.includes('User chosen title'));
    assert(!html.includes('环保'));
    fs.writeFileSync(path.join(folder,'robotics-review-verdicts.json'),JSON.stringify([{id:'research-fixture',relevant:'yes',reason:''}]));
    const rejected=spawnSync(process.execPath,[path.join(rootDir,'scripts/export-reviewed-robotics-evidence.mjs')],{cwd:workspace,encoding:'utf8',windowsHide:true});
    assert.notEqual(rejected.status,0);
  } finally {
    assert.equal(path.resolve(path.dirname(workspace)),path.resolve(os.tmpdir()));
    assert(path.basename(workspace).startsWith('jobtrending-test-'));
    fs.rmSync(workspace,{recursive:true,force:true});
  }
});
