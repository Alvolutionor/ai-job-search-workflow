import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { JobDatabase } from '../src/lib/db.mjs';
import { RecruitingStore, fingerprint } from '../src/lib/recruiting-store.mjs';
import { BossLiveBrowser, readBossDom } from '../src/lib/boss-live-browser.mjs';
import { createRecruitingRouter } from '../src/server/recruiting-router.mjs';
import { publicDir, templatesDir } from '../src/lib/paths.mjs';

const peer={bossId:'boss-fixture',jobId:'job-fixture',accountId:'account-fixture',name:'Fixture recruiter',company:'Fixture Robotics',title:'CTO'};
const original=[{id:'incoming-1',sender:'recruiter',text:'What device platform work have you done?',delivery:0}];

test('new messages invalidate drafts and an action can be claimed only once',()=>{
  const store=new RecruitingStore(':memory:');
  const conversation=store.saveConversation(peer,original);
  const item=store.createDraft({conversationId:conversation.id,text:'A reviewed reply',version:conversation.version});
  store.saveConversation(peer,[...original,{id:'incoming-2',sender:'recruiter',text:'Are you available next week?'}]);
  assert.equal(store.draft(item.id).status,'stale');
  assert.throws(()=>store.claim(item.id,item.text,item.version));
  const another=store.createDraft({text:'Exact approved text'});
  assert.throws(()=>store.claim(another.id,'Changed text',''));
  store.claim(another.id,another.text,'');
  assert.throws(()=>store.claim(another.id,another.text,''));
  store.db.close();
});

test('WeChat IDs are attributed to the recruiter and closed conversations stay closed',()=>{
  const store=new RecruitingStore(':memory:');
  let conversation=store.saveConversation(peer,[{id:'own',sender:'me',text:'我的微信是 myownwx123'},{id:'their',sender:'recruiter',text:'我的微信：recruiter123'}]);
  assert.deepEqual(conversation.wechat.map(contact=>contact.id),['recruiter123']);
  assert.equal(conversation.stage,'wechat_received');
  store.db.prepare("UPDATE conversations SET stage='closed' WHERE id=?").run(conversation.id);
  conversation=store.saveConversation(peer,conversation.messages);
  assert.equal(conversation.stage,'closed');store.db.close();
});

test('HTTP confirmation requires exact text and current context, then sends at most once',async()=>{
  const database=new JobDatabase(':memory:');
  const store=new RecruitingStore(':memory:');
  let messages=structuredClone(original),sends=0,resumeSends=0;
  const platformResume={available:true,choices:[],buttonLabel:'发送简历'};
  const browser={lastStatus:{state:'connected'},snapshot:async()=>({accountId:peer.accountId,friends:[],peer,messages,platformResume}),openConversation:async()=>({accountId:peer.accountId,friends:[],peer,messages,platformResume}),send:async()=>{sends++;return {confirmed:true,message:'Fixture delivered'};},sendResume:async()=>{resumeSends++;return {confirmed:true,message:'Fixture resume delivered'};}};
  const router=createRecruitingRouter(database,{store,browser,draft:async()=>({text:'A grounded fixture reply'})});
  const app=express();app.use('/api/recruiting',router);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/recruiting`;
  const token=(await (await fetch(base+'/session')).json()).token;
  const call=async(endpoint,body,override=token)=>{const response=await fetch(base+endpoint,{method:'POST',headers:{'content-type':'application/json','x-workbench-token':override},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  try {
    assert.equal((await call('/sync',{},'wrong')).status,403);
    const synced=await call('/sync',{});assert.equal(synced.status,200);
    let result=await call('/draft',{conversationId:synced.body.conversationId});const draft=result.body;
    assert.equal((await call('/confirm',{id:draft.id,text:draft.text,version:draft.version,confirmed:false})).status,400);
    assert.equal((await call('/confirm',{id:draft.id,text:'tampered',version:draft.version,confirmed:true})).status,400);
    assert.equal(sends,0);
    messages=[...original,{id:'incoming-2',sender:'recruiter',text:'One more question.'}];
    assert.equal((await call('/confirm',{id:draft.id,text:draft.text,version:draft.version,confirmed:true})).status,400);
    assert.equal(store.draft(draft.id).status,'stale');assert.equal(sends,0);
    const fresh=(await call('/draft',{conversationId:synced.body.conversationId})).body;
    const confirmation={id:fresh.id,text:fresh.text,version:fresh.version,confirmed:true};
    assert.equal((await call('/confirm',confirmation)).body.status,'sent');
    assert.equal((await call('/confirm',confirmation)).status,400);assert.equal(sends,1);
    const resume=(await call('/resume/prepare',{conversationId:synced.body.conversationId})).body;
    assert.equal(resume.kind,'resume');assert.equal(resumeSends,0);
    assert.equal((await call('/draft/edit',{id:resume.id,text:'Different attachment'})).status,400);
    const resumeConfirmation={id:resume.id,text:resume.text,version:resume.version,confirmed:true};
    assert.equal((await call('/confirm',{...resumeConfirmation,confirmed:false})).status,400);assert.equal(resumeSends,0);
    assert.equal((await call('/confirm',resumeConfirmation)).body.status,'sent');assert.equal(resumeSends,1);
    assert.equal((await call('/confirm',resumeConfirmation)).status,400);assert.equal(resumeSends,1);
  } finally {await new Promise(resolve=>server.close(resolve));router.close();database.close();}
});

test('platform resume button supports direct sending and explicit attachment selection',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const mode of ['direct','choice']) {
      const context=await browser.newContext();const page=await context.newPage();
      await page.route('**/*',route=>route.request().url()==='https://www.zhipin.com/web/geek/chat' ? route.fulfill({contentType:'text/html; charset=utf-8',body:`<div class="main-wrap"><div class="chat-user"></div></div><div class="chat-conversation"><div class="message-content"><div class="chat-record"></div></div><div class="message-controls"><div class="chat-op"><button id="send-resume">发送简历</button></div></div></div><div class="choose-resume-dialog" style="display:none"><div class="list-item"><span class="resume-name">robotics.pdf</span></div><div class="list-item"><span class="resume-name">ai.pdf</span></div><button class="btn-confirm">发送</button></div><script>window._PAGE={encryptUserId:'account-fixture'};window.resumeCount=0;window.selectedResume='';window.peer={encryptBossId:'boss-fixture',encryptJobId:'job-fixture',name:'Fixture recruiter'};document.querySelector('.chat-user').__vue__={list:[window.peer]};document.querySelector('.chat-conversation').__vue__={selectedFriend$:window.peer};document.querySelector('.chat-record').__vue__={list$:[{mid:'in-1',isSelf:false,text:'Please share your resume',status:0}]};window.ack=()=>{window.resumeCount++;document.querySelector('.chat-record').__vue__.list$.push({mid:'resume-'+window.resumeCount,isSelf:true,text:'附件简历已发送',status:1});};document.querySelector('#send-resume').onclick=()=>{if('${mode}'==='choice')document.querySelector('.choose-resume-dialog').style.display='block';else window.ack();};document.querySelectorAll('.list-item').forEach(row=>row.onclick=()=>{window.selectedResume=row.textContent;});document.querySelector('.btn-confirm').onclick=()=>{if(window.selectedResume){window.ack();document.querySelector('.choose-resume-dialog').style.display='none';}};</script>`}) : route.abort());
      await page.goto('https://www.zhipin.com/web/geek/chat');
      const connector=new BossLiveBrowser();connector.browser={isConnected:()=>true};connector.page=page;
      const snapshot=await connector.snapshot();assert.equal(snapshot.platformResume.available,true);
      const version=fingerprint(snapshot.messages.map(message=>[message.id,message.sender,message.text]));
      await assert.rejects(()=>connector.sendResume(peer,'old-version'),/收到新消息/);assert.equal(await page.evaluate(()=>window.resumeCount),0);
      let result=await connector.sendResume(peer,version);
      if(mode==='choice') {
        assert.equal(result.needsSelection,true);assert.equal(await page.evaluate(()=>window.resumeCount),0);
        await assert.rejects(()=>connector.sendResume(peer,version,{resumeName:'missing.pdf'}),/选择/);
        result=await connector.sendResume(peer,version,{resumeName:'robotics.pdf'});
        assert.equal(await page.evaluate(()=>window.selectedResume),'robotics.pdf');
      }
      assert.equal(result.confirmed,true);assert.equal(await page.evaluate(()=>window.resumeCount),1);
      await context.close();
    }
  } finally {await browser.close();}
});

test('BOSS browser adapter checks recipient, refuses existing text and confirms a new outgoing message',async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext();const page=await context.newPage();
  await page.route('**/*',route=>route.request().url()==='https://www.zhipin.com/web/geek/chat'?route.fulfill({contentType:'text/html; charset=utf-8',body:`<div class="main-wrap"><div class="chat-user"></div></div><div class="chat-conversation"><div class="message-content"><div class="chat-record"></div></div><div class="message-controls"><div id="chat-input" class="chat-input" contenteditable="true"></div><div class="chat-op"><button class="btn-send">Send</button></div></div></div><script>window._PAGE={encryptUserId:'account-fixture'};window.sentCount=0;window.peer={encryptBossId:'boss-fixture',encryptJobId:'job-fixture',name:'Fixture recruiter',brandName:'Fixture Robotics',title:'CTO'};document.querySelector('.chat-user').__vue__={list:[window.peer]};document.querySelector('.chat-conversation').__vue__={selectedFriend$:window.peer};document.querySelector('.chat-record').__vue__={list$:[{mid:'incoming-1',isSelf:false,text:'A fixture incoming message',status:0}]};document.querySelector('.btn-send').onclick=()=>{window.sentCount++;document.querySelector('.chat-record').__vue__.list$.push({mid:'outgoing-'+window.sentCount,isSelf:true,text:document.querySelector('#chat-input').innerText,status:1});document.querySelector('#chat-input').innerText='';};</script>`}):route.abort());
  try {
    await page.goto('https://www.zhipin.com/web/geek/chat');
    const connector=new BossLiveBrowser();connector.browser={isConnected:()=>true};connector.page=page;
    const snapshot=await page.evaluate(readBossDom);
    assert.equal(snapshot.peer.bossId,peer.bossId);assert.equal(snapshot.messages[0].sender,'recruiter');
    const version=fingerprint(snapshot.messages.map(message=>[message.id,message.sender,message.text]));
    await assert.rejects(()=>connector.send(peer,'A reply','wrong-version'),/收到新消息/);
    await page.locator('#chat-input').fill('Manual unsent text');
    await assert.rejects(()=>connector.send(peer,'A reply',version),/未发送内容/);
    await page.locator('#chat-input').fill('');
    const result=await connector.send(peer,'A confirmed fixture reply',version);
    assert.equal(result.confirmed,true);assert.equal(await page.evaluate(()=>window.sentCount),1);
    await assert.rejects(()=>connector.send({...peer,accountId:'different-account'},'No',version),/账号已变化/);
    assert.equal(await page.evaluate(()=>window.sentCount),1);
  } finally {await browser.close();}
});

test('workbench queue, review dialog, edited reply and WeChat handoff work through the UI',async()=>{
  const database=new JobDatabase(':memory:');
  database.db.prepare('INSERT INTO jobs(job_id,job_name,company_name,city_name,brand_scale_name,boss_title,description,first_seen_at_ms,last_seen_at_ms,raw_json,job_url) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(peer.jobId,'机器人智能体平台全栈工程师',peer.company,'上海','20-99人','CTO','Develop the robot device platform and AI agent integration.',Date.now(),Date.now(),'{}','https://www.zhipin.com/job_detail/job-fixture.html');
  const store=new RecruitingStore(':memory:');
  store.saveSettings({wechatId:'candidatewx123',autoDraft:true});store.saveConversation(peer,original);
  let applications=0,sends=0;
  const fake={lastStatus:{state:'connected',message:'Fixture browser'},snapshot:async()=>({accountId:peer.accountId,friends:[],peer,messages:original}),openConversation:async()=>({accountId:peer.accountId,friends:[],peer,messages:original}),startApplication:async()=>{applications++;return {confirmed:false,message:'Fixture contact started'};},send:async()=>{sends++;return {confirmed:true,message:'Fixture reply delivered'};}};
  const router=createRecruitingRouter(database,{store,browser:fake,draft:async input=>({text:input.kind==='wechat'?'我的微信是 candidatewx123，方便的话我们继续聊。':'A fixture reply for review.'})});
  const app=express();app.use(express.static(publicDir));app.use('/api/recruiting',router);app.get('/workbench',(request,response)=>response.type('html').send(fs.readFileSync(path.join(templatesDir,'workbench.njk'),'utf8')));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1050}});
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/workbench`);
    await page.locator('.work-item').first().click();await page.locator('#queue-role').click();
    await page.locator('#prepare-application').click();await page.locator('#review-send').click();
    await page.getByRole('button',{name:'返回修改'}).click();assert.equal(applications,0);
    await page.locator('#review-send').click();await page.locator('#confirm-send').click();
    await page.waitForFunction(()=>document.querySelector('#review-pane').textContent.includes('发送结果待核实'));
    assert.equal(applications,1);
    await page.locator('[data-view=inbox]').click();await page.locator('.work-item').first().click();
    await page.locator('#draft-reply').click();await page.locator('#draft-text').fill('An edited, reviewed fixture reply.');
    await page.locator('#review-send').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#confirm-text').innerText(),'An edited, reviewed fixture reply.');
    await page.locator('#confirm-send').click();await page.waitForFunction(()=>document.querySelector('#review-pane h3')?.textContent.endsWith('/ 已发送'));
    assert.equal(sends,1);
    await page.locator('.work-item').first().click();await page.locator('#draft-wechat').click();
    await page.waitForFunction(()=>document.querySelector('#draft-text')?.value.includes('candidatewx123'));
    assert.equal(sends,1);
    await page.locator('#mark-added').click();await page.locator('[data-view=wechat]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.work-item').length===1);
    assert.equal(store.listConversations()[0].stage,'wechat_added');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));router.close();database.close();}
});
