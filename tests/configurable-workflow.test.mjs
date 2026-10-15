import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { JobDatabase } from '../src/lib/db.mjs';
import { RecruitingStore } from '../src/lib/recruiting-store.mjs';
import { findStartupMatches } from '../src/lib/startup-matches.mjs';
import { buildRecruitingPrompt } from '../src/lib/recruiting-agent.mjs';
import { createRecruitingRouter } from '../src/server/recruiting-router.mjs';
import { createApp } from '../src/server/app.mjs';

const neutral = {cities:[],keywords:[],excludedKeywords:[],preferredContactTitles:[],priorityTerms:[],prioritizeContacts:false};

function fixtureDatabase() {
  const database = new JobDatabase(':memory:');
  const insert = database.db.prepare('INSERT INTO jobs(job_id,job_name,company_name,city_name,boss_title,description,first_seen_at_ms,last_seen_at_ms,raw_json) VALUES (?,?,?,?,?,?,?,?,?)');
  insert.run('analyst','Financial analyst','Fixture Finance','北京','Recruiter','Financial planning and analysis',1,30,'{}');
  insert.run('nurse','Nurse','Fixture Clinic','杭州','Hiring manager','Patient care',1,20,'{}');
  insert.run('designer','Product designer','Fixture Studio','成都','Founder','Research and design',1,10,'{}');
  return database;
}

test('neutral matching retains different careers, cities and contacts without hidden preferences', () => {
  const database=fixtureDatabase();
  try {
    const result=findStartupMatches(database.db,{config:neutral});
    assert.deepEqual(result.companies.flatMap(company=>company.jobs.map(job=>job.job_id)),['analyst','nurse','designer']);
    assert.equal(result.totalJobs,3);
    assert(result.companies.every(company=>company.score===0));
  } finally {database.close();}
});

test('only user-selected filters and priority terms change matching', () => {
  const database=fixtureDatabase();
  try {
    const ranking={...neutral,priorityTerms:['design']};
    assert.equal(findStartupMatches(database.db,{config:ranking}).companies[0].jobs[0].job_id,'designer');
    assert.equal(findStartupMatches(database.db,{config:ranking}).totalJobs,3);
    const filtered={...neutral,cities:['杭州'],keywords:['patient']};
    assert.equal(findStartupMatches(database.db,{config:filtered}).companies[0].jobs[0].job_id,'nurse');
    assert.equal(findStartupMatches(database.db,{config:{...filtered,excludedKeywords:['patient']}}).totalJobs,0);
    const contacts={...neutral,preferredContactTitles:['hiring manager'],prioritizeContacts:true};
    assert.equal(findStartupMatches(database.db,{config:contacts}).companies[0].jobs[0].job_id,'nurse');
  } finally {database.close();}
});

test('drafting follows the supplied goal without an imposed industry or contact target', () => {
  const prompt=buildRecruitingPrompt({job:{job_name:'Nurse'},goal:'Explore a career change and ask about shift patterns.',profile:{},policy:{language:'English'}});
  const input=JSON.parse(prompt.split('\n\n').at(-1));
  assert.equal(input.job.job_name,'Nurse');
  assert.equal(input.candidateGoal,'Explore a career change and ask about shift patterns.');
  assert(!/robotics|founder|technical lead|Shanghai|Shenzhen/i.test(prompt));
});

test('live search accepts other cities and nationwide scope, and saves the user goal', async () => {
  const database=fixtureDatabase();
  const store=new RecruitingStore(':memory:');
  const searches=[];
  const browser={lastStatus:{state:'disconnected'},search:async(keyword,city)=>{searches.push({keyword,city});return [];}};
  const router=createRecruitingRouter(database,{store,browser,matchJobs:(db,options)=>findStartupMatches(db,{...options,config:neutral})});
  const app=express();app.use('/api/recruiting',router);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/recruiting`;
  try {
    const {token}=await (await fetch(base+'/session')).json();
    const post=(url,body)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json','x-workbench-token':token},body:JSON.stringify(body)});
    assert.equal((await post('/search',{keyword:'Nurse',city:'杭州'})).status,200);
    assert.equal((await post('/search',{keyword:'Designer',city:'全国'})).status,200);
    assert.equal(searches[1].city,100010000);
    assert.equal((await post('/settings',{wechatId:'',autoDraft:false,goal:'Discuss shift patterns'})).status,200);
    assert.equal(store.settings().goal,'Discuss shift patterns');
    assert.equal((await (await fetch(base+'/jobs')).json()).total,3);
  } finally {await new Promise(resolve=>server.close(resolve));router.close();database.close();}
});

test('the integrated application serves empty-data pages and APIs without a BOSS login', async () => {
  const database=new JobDatabase(':memory:');
  const app=createApp({database});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/workbench','/jobs','/startups','/robotics','/api/startups','/api/robotics/skills','/api/recruiting/state']) {
      const response=await fetch(base+route);
      assert.equal(response.status,200,route);
    }
    const state=await (await fetch(base+'/api/recruiting/state')).json();
    assert.equal(state.leads.length,0);
    assert.equal(state.conversations.length,0);
    assert(state.cities.some(city=>city.name==='杭州'));
  } finally {await new Promise(resolve=>server.close(resolve));app.locals.close();database.close();}
});
