import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../lib/paths.mjs';
import { readUserConfig } from '../lib/user-config.mjs';
import { randomBytes } from 'node:crypto';
import { RecruitingStore } from '../lib/recruiting-store.mjs';
import { BossLiveBrowser } from '../lib/boss-live-browser.mjs';
import { draftRecruitingReply } from '../lib/recruiting-agent.mjs';
import { findStartupMatches } from '../lib/startup-matches.mjs';
import { normalizeJobRecord } from '../lib/normalize-job.mjs';
import { allCities, getCityByName } from '../lib/cities.mjs';

export function createRecruitingRouter(database,{store=new RecruitingStore(),browser=new BossLiveBrowser(),draft=draftRecruitingReply,matchJobs=findStartupMatches}={}) {
  const router=express.Router();
  const token=randomBytes(32).toString('hex');
  let monitor=false,busy=false,modelBusy=false,lastError='',lastSync=0;
  const resumeDir=process.env.JOBTRENDING_RESUME_DIR || path.join(dataDir,'resumes');
  const resumes=()=>fs.existsSync(resumeDir) ? fs.readdirSync(resumeDir).filter(name=>name.toLowerCase().endsWith('.pdf')) : [];
  const jobById=id=>database.db.prepare('SELECT * FROM jobs WHERE job_id=?').get(id);
  const execute=handler=>async(request,response)=>{try{response.json(await handler(request));}catch(error){lastError=error.message;response.status(400).json({error:error.message});}};
  const locked=async task=>{
    if(busy) throw new Error('BOSS 正在执行另一项操作，请稍后再试。');
    busy=true;try{return await task();}finally{busy=false;}
  };
  const persistSnapshot=snapshot=>{
    for(const peer of snapshot.friends) store.saveConversation(peer);
    return snapshot.peer?.bossId ? store.saveConversation({...snapshot.peer,platformResume:snapshot.platformResume},snapshot.messages) : null;
  };

  async function generate(conversationId,kind='reply') {
    if(modelBusy) throw new Error('正在生成一条回复，请等待完成。');
    const conversation=store.conversation(conversationId);
    if(!conversation?.version || !conversation.messages.length) throw new Error('请先读取这条实时会话，再生成回复。');
    if(conversation.stage==='closed') throw new Error('这条会话已结束。');
    const settings=store.settings();
    if(kind==='wechat' && !settings.wechatId) throw new Error('请先在“设置”中保存你的微信联系方式。');
    const job=jobById(conversation.peer.jobId) || {job_name:conversation.peer.jobName,company_name:conversation.peer.company,boss_title:conversation.peer.title};
    modelBusy=true;
    try {
      const result=await draft({job,conversation:JSON.stringify(conversation.messages),kind,wechatId:settings.wechatId || '',goal:settings.goal || readUserConfig('recruiting-policy').goal || ''});
      const created=store.createDraft({conversationId,jobId:conversation.peer.jobId,kind,text:result.text,version:conversation.version});
      if(store.conversation(conversationId).version!==conversation.version) store.finish(created.id,'stale','生成草稿期间收到了新消息。');
      return store.draft(created.id);
    } finally {modelBusy=false;}
  }

  async function sync(auto=false) {
    const conversation=await locked(async()=>{
      const snapshot=await browser.snapshot();
      let current=persistSnapshot(snapshot);
      if(auto) {
        const followed=new Set(store.state().leads.map(lead=>lead.job_id));
        const target=snapshot.friends.find(peer=>followed.has(peer.jobId) && peer.lastIsSelf===false && peer.unread>0);
        if(target) current=persistSnapshot(await browser.openConversation(target));
      }
      lastSync=Date.now();lastError='';return current;
    });
    if(auto && store.settings().autoDraft && conversation && conversation.stage!=='closed' && conversation.messages.at(-1)?.sender==='recruiter' && !store.db.prepare('SELECT 1 FROM drafts WHERE conversation_id=? AND version=?').get(conversation.id,conversation.version)) await generate(conversation.id);
    return {conversationId:conversation?.id,lastSync};
  }

  const timer=setInterval(()=>{
    if(!monitor || busy || modelBusy) return;
    sync(true).catch(error=>{lastError=error.message;monitor=false;store.event('monitor','stopped',lastError);});
  },15000);
  timer.unref();

  router.use((request,response,next)=>{
    const hosts=[`127.0.0.1:${request.socket.localPort}`,`localhost:${request.socket.localPort}`];
    if(!hosts.includes(request.headers.host)) return response.status(403).json({error:'工作台仅允许本机访问。'});
    if(request.method!=='GET') {
      if(request.headers.origin && !hosts.some(host=>request.headers.origin===`http://${host}`)) return response.status(403).json({error:'请求来源与当前工作台不一致。'});
      if(request.headers['x-workbench-token']!==token) return response.status(403).json({error:'请刷新工作台后再执行本次操作。'});
      if(!request.is('application/json')) return response.status(415).json({error:'请求数据格式不正确。'});
    }
    next();
  });
  router.use(express.json({limit:'64kb'}));
  router.get('/session',(request,response)=>response.json({token}));
  router.get('/state',execute(()=>{
    const state=store.state();
    return {...state,leads:state.leads.map(lead=>({...lead,job:jobById(lead.job_id)})),browser:browser.lastStatus,monitor,busy,modelBusy,lastError,lastSync,resumes:resumes(),cities:allCities};
  }));
  router.get('/jobs',execute(request=>{
    const rows=matchJobs(database.db,{directOnly:false,city:String(request.query.city || '')}).companies.flatMap(company=>company.jobs);
    const text=String(request.query.q || '').trim().toLowerCase();
    const filtered=text ? rows.filter(job=>[job.job_name,job.company_name,job.boss_title,job.description].join(' ').toLowerCase().includes(text)) : rows;
    const page=Math.max(1,Number.parseInt(request.query.page,10)||1);
    return {total:filtered.length,page,jobs:filtered.slice((page-1)*40,page*40)};
  }));
  router.post('/settings',execute(request=>{
    const body=request.body;
    if(typeof body.wechatId!=='string' || body.wechatId.length>80 || typeof body.autoDraft!=='boolean') throw new Error('请填写微信联系方式，并选择是否自动拟稿。');
    if(body.goal!==undefined && (typeof body.goal!=='string' || body.goal.length>2000)) throw new Error('Goal must be text up to 2000 characters.');
    return store.saveSettings({wechatId:body.wechatId.trim(),autoDraft:body.autoDraft,goal:body.goal===undefined ? store.settings().goal || '' : body.goal.trim()});
  }));
  router.post('/login',execute(()=>browser.launchLogin()));
  router.post('/connect',execute(()=>locked(async()=>{persistSnapshot(await browser.connect());lastError='';lastSync=Date.now();return browser.lastStatus;})));
  router.post('/sync',execute(()=>sync()));
  router.post('/search',execute(request=>locked(async()=>{
    const keyword=String(request.body.keyword || '').trim();
    const city=request.body.city==='全国' ? {name:'全国',code:100010000} : getCityByName(request.body.city);
    if(!keyword || keyword.length>80 || !city) throw new Error('Select a supported city and enter a search keyword.');
    const raw=await browser.search(keyword,city.code);
    const now=Date.now();
    const jobs=raw.map(item=>normalizeJobRecord(item,{keyword,searchCity:city,pageNumber:1,collectedAtMs:now})).filter(Boolean);
    database.saveNormalizedJobs(jobs);
    store.event('search','live_search',`${keyword} / ${city.name} / ${jobs.length}`);
    return {observedAt:now,total:jobs.length,jobs:jobs.map(job=>jobById(job.jobId)),scope:'仅为实时搜索的第一页，完整职位描述仍需核对。'};
  })));
  router.post('/monitor',execute(async request=>{
    if(typeof request.body.enabled!=='boolean') throw new Error('请选择开启或暂停实时监测。');
    if(request.body.enabled) await sync();
    monitor=request.body.enabled;store.event('monitor',monitor?'started':'stopped');return {monitor};
  }));
  router.post('/queue',execute(request=>{
    const job=jobById(String(request.body.jobId || ''));
    if(!job) throw new Error('未找到该职位。');
    const resume=String(request.body.resume || '');
    if(resume && !resumes().includes(resume)) throw new Error('请选择列表中的简历文件。');
    store.queue(job.job_id,resume);return {queued:true};
  }));
  router.post('/conversation/read',execute(request=>locked(async()=>{
    const conversation=store.conversation(String(request.body.id || ''));
    if(!conversation) throw new Error('未找到该会话。');
    const result=persistSnapshot(await browser.openConversation(conversation.peer));lastSync=Date.now();return result;
  })));
  router.post('/conversation/stage',execute(request=>{
    const stages=['active','closed','wechat_added'];
    if(!stages.includes(request.body.stage)) throw new Error('不支持这个会话阶段。');
    const result=store.db.prepare('UPDATE conversations SET stage=? WHERE id=?').run(request.body.stage,String(request.body.id || ''));
    if(!result.changes) throw new Error('未找到该会话。');
    store.event(request.body.id,request.body.stage,'已由你手动确认。');return {updated:true};
  }));
  router.post('/draft',execute(request=>generate(String(request.body.conversationId || ''),request.body.kind==='wechat'?'wechat':'reply')));
  router.post('/resume/prepare',execute(request=>locked(async()=>{
    const conversation=store.conversation(String(request.body.conversationId || ''));
    if(!conversation || conversation.stage==='closed') throw new Error('请先选择有效的会话。');
    const snapshot=await browser.openConversation(conversation.peer);
    const current=persistSnapshot(snapshot);
    const resume=snapshot.platformResume;
    if(!resume?.available) throw new Error('当前 BOSS 页面未识别到“发送简历”按钮，请在 BOSS 打开该会话后重新读取。');
    const resumeName=String(request.body.resumeName || '');
    if(resume.choices.length && !resumeName) return {needsSelection:true,conversationId:current.id,choices:resume.choices};
    if(resumeName && !resume.choices.includes(resumeName)) throw new Error('附件简历列表已变化，请重新读取后选择。');
    return store.createDraft({conversationId:current.id,jobId:current.peer.jobId,kind:'resume',text:`向 ${current.peer.name}（${current.peer.company}）发送 BOSS 中${resumeName ? `的附件简历“${resumeName}”` : '当前设置的附件简历'}。此操作不从电脑重新上传文件。`,version:current.version,payload:{resumeName}});
  })));
  router.post('/application/prepare',execute(request=>{
    const job=jobById(String(request.body.jobId || ''));
    if(!job) throw new Error('未找到该职位。');
    if(!store.db.prepare('SELECT 1 FROM leads WHERE job_id=?').get(job.job_id)) throw new Error('请先将该职位加入投递队列。');
    return store.createDraft({jobId:job.job_id,kind:'application',text:`向以下职位发起 BOSS 沟通：${job.company_name} / ${job.job_name}。BOSS 可能发送默认招呼语，不会自动发送附件简历。`});
  }));
  router.post('/draft/edit',execute(request=>{
    if(typeof request.body.text!=='string' || !request.body.text.trim() || request.body.text.length>3000) throw new Error('草稿内容须为 1 至 3000 个字符。');
    const draft=store.draft(String(request.body.id || ''));
    if(['application','resume'].includes(draft?.kind)) throw new Error('发送操作说明不能直接修改，请重新选择附件或收件人。');
    return store.updateDraft(request.body.id,request.body.text.trim());
  }));
  router.post('/draft/discard',execute(request=>{
    const draft=store.draft(String(request.body.id || ''));
    if(!draft || !['pending_review','stale','selection_required'].includes(draft.status)) throw new Error('当前草稿状态不支持放弃。');
    store.finish(draft.id,'discarded','已由你放弃。');return {discarded:true};
  }));
  router.post('/confirm',execute(request=>locked(async()=>{
    const body=request.body;
    if(body.confirmed!==true || typeof body.text!=='string' || typeof body.version!=='string') throw new Error('请先确认当前显示的完整内容和收件人。');
    const item=store.draft(String(body.id || ''));
    if(!item || item.status!=='pending_review' || item.text!==body.text || item.version!==body.version) throw new Error('草稿已变化，或已不处于待确认状态。');
    let conversation;
    if(item.kind!=='application') {
      conversation=store.conversation(item.conversation_id);
      if(!conversation || conversation.stage==='closed') throw new Error('会话不存在或已结束。');
      const current=persistSnapshot(await browser.openConversation(conversation.peer));
      if(current.version!==item.version) throw new Error('收到新消息，旧草稿已失效，请重新生成回复。');
    } else await browser.snapshot();
    store.claim(item.id,body.text,body.version);
    try {
      const result=item.kind==='application' ? await browser.startApplication(jobById(item.job_id)) : item.kind==='resume' ? await browser.sendResume(conversation.peer,item.version,JSON.parse(item.payload_json)) : await browser.send(conversation.peer,item.text,item.version);
      store.finish(item.id,result.confirmed?'sent':result.needsSelection?'selection_required':'unconfirmed',result.message);
      if(result.snapshot) persistSnapshot(result.snapshot);
      if(item.kind==='application') store.db.prepare("UPDATE leads SET stage='contact_started',updated_at=? WHERE job_id=?").run(Date.now(),item.job_id);
      const ownWechat=store.settings().wechatId;
      if(result.confirmed && ['reply','wechat'].includes(item.kind) && item.conversation_id && ownWechat && item.text.includes(ownWechat)) store.db.prepare("UPDATE conversations SET stage='wechat_offered' WHERE id=? AND stage NOT IN ('wechat_received','wechat_added')").run(item.conversation_id);
      return store.draft(item.id);
    } catch(error) {store.finish(item.id,'unconfirmed',error.message+' 再次尝试发送前，请先到 BOSS 核实结果。');throw error;}
  })));
  router.close=()=>{clearInterval(timer);store.db.close();};
  return router;
}
