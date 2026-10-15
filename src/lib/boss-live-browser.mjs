import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import { manualBrowserPortFilePath, rootDir } from './paths.mjs';
import { isDebugPortOpen } from './local-browser.mjs';
import { fingerprint } from './recruiting-store.mjs';

export function readBossDom(operation) {
  const conversation=document.querySelector('.chat-conversation');
  const store=document.querySelector('.main-wrap')?.__vue__?.$store?.state;
  const accountId=String(window._PAGE?.encryptUserId || store?.userInfo?.encryptUserId || store?.userInfo?.userId || window._PAGE?.uid || '');
  const mapPeer=item=>({bossId:String(item.encryptBossId || item.friendId || ''),jobId:String(item.encryptJobId || ''),uniqueId:String(item.uniqueId || ''),accountId,name:item.name || '',company:item.brandName || '',title:item.title || '',jobName:item.positionName || '',lastMessage:item.lastText,unread:Number(item.unreadCount || 0),lastIsSelf:typeof item.lastIsSelf==='boolean' ? item.lastIsSelf : undefined});
  const rawFriends=document.querySelector('.main-wrap .chat-user')?.__vue__?.list;
  const friends=Array.isArray(rawFriends) ? rawFriends.map(mapPeer).filter(peer=>peer.bossId) : [];
  const selected=conversation?.__vue__?.selectedFriend$ || conversation?.querySelector('.chat-record')?.__vue__?.boss;
  const peer=selected ? mapPeer(selected) : null;
  const raw=document.querySelector('.message-content .chat-record')?.__vue__?.list$;
  let messages=[];
  if (Array.isArray(raw)) messages=raw.map(item=>({id:String(item.mid || item.messageId || ''),sender:item.status===3 ? 'system' : item.isSelf===true ? 'me' : item.isSelf===false ? 'recruiter' : 'unknown',text:typeof item.text==='string' ? item.text : String(item.text?.content || item.dialog?.content || item.dialog?.text || ''),delivery:Number(item.status),type:item.messageType || 'unknown'})).filter(item=>item.text);
  if (!messages.length && conversation) {
    const nodes=conversation.querySelectorAll('.message-item').length ? conversation.querySelectorAll('.message-item') : conversation.querySelectorAll('.chat-message');
    messages=[...nodes].map((element,index)=>({id:element.getAttribute('data-mid') || element.id || `visible-${index}`,sender:element.matches('.item-myself,.message-self,.outgoing') ? 'me' : element.matches('.item-friend,.message-other,.incoming') ? 'recruiter' : 'unknown',text:(element.querySelector('.msg-text,.message-text')?.textContent || element.textContent || '').trim(),delivery:NaN,type:'visible'})).filter(item=>item.text);
  }
  const text=(document.body?.innerText || '').slice(0,15000);
  const blocked=/captcha|verify|security|geetest/i.test(location.pathname) || /请完成验证|安全验证|操作过于频繁|访问受限/.test(text);
  const visible=element=>element && element.getClientRects().length && getComputedStyle(element).visibility!=='hidden';
  const resumeButtons=[...(conversation?.querySelectorAll('button,a,[role="button"],.btn,.btn-resume') || [])].filter(element=>visible(element) && /^(发简历|发送简历|发送附件简历)$/.test((element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '').trim()));
  const resumeDialog=[...document.querySelectorAll('.choose-resume-dialog')].find(visible);
  const resumeChoices=resumeDialog ? [...resumeDialog.querySelectorAll('.list-item')].filter(visible).map(element=>(element.querySelector('.resume-name')?.textContent || element.textContent || '').trim()).filter(Boolean) : [];
  const platformResume={available:resumeButtons.length===1 || resumeChoices.length>0,buttonLabel:resumeButtons[0]?.innerText?.trim() || '',choices:resumeChoices};
  if(['send','resume','resume_selection'].includes(operation?.action)) {
    const expected=operation.peer;
    if(blocked || accountId!==expected.accountId || peer?.bossId!==expected.bossId || peer?.jobId!==expected.jobId || JSON.stringify(messages.map(message=>[message.id,message.sender,message.text]))!==operation.evidence) throw new Error('发送前账号、收件人或对话发生变化，请重新审阅。');
    if(operation.action==='resume') {
      if(resumeButtons.length!==1) throw new Error('未找到唯一的 BOSS“发送简历”按钮，请在 BOSS 打开对应会话后重试。');
      resumeButtons[0].click();return {clicked:true};
    }
    if(operation.action==='resume_selection') {
      if(!resumeDialog || !operation.resumeName) throw new Error('附件简历选择框已变化，请重新读取并选择。');
      const rows=[...resumeDialog.querySelectorAll('.list-item')].filter(element=>visible(element) && (element.querySelector('.resume-name')?.textContent || element.textContent || '').trim()===operation.resumeName);
      const confirm=resumeDialog.querySelector('.btn-confirm');
      if(rows.length!==1 || !visible(confirm) || confirm.disabled) throw new Error('无法唯一定位已确认的附件简历或发送按钮，未发送。');
      rows[0].click();confirm.click();return {clicked:true};
    }
    const input=document.querySelector('.chat-conversation .message-controls .chat-input, .chat-conversation #chat-input');
    if((input?.value ?? input?.innerText)!==operation.text) throw new Error('BOSS 输入框中的内容已与确认稿不同，请重新核对。');
    const button=document.querySelector('.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)');
    if(!button || button.disabled || !button.getClientRects().length) throw new Error('BOSS 发送按钮当前不可用。');
    button.click();return {clicked:true};
  }
  return {accountId,friends,peer,messages,platformResume,blocked,loginRequired:!accountId && /登录|扫码/.test(text),supported:Boolean(Array.isArray(rawFriends) || peer),url:location.origin+location.pathname,scope:'仅包含 BOSS 当前已加载的会话及历史消息'};
}

export class BossLiveBrowser {
  constructor() { this.browser=null;this.page=null;this.lastStatus={state:'disconnected',message:'请先打开 BOSS 登录，完成登录后再连接。'}; }

  port() {
    try { const value=JSON.parse(fs.readFileSync(manualBrowserPortFilePath,'utf8')).port;return Number.isInteger(value) ? value : 9222; } catch { return 9222; }
  }

  async launchLogin() {
    if(await isDebugPortOpen(this.port())) return {state:'login_browser_running',message:'BOSS 登录浏览器已打开，请在那里完成登录，保持窗口开启后点击“连接”。'};
    if(this.loginOpeningAt && Date.now()-this.loginOpeningAt<15000) return {state:'login_opening',message:'BOSS 登录浏览器正在启动，完成登录后请点击“连接”。'};
    this.loginOpeningAt=Date.now();
    const child=spawn(process.execPath,[path.join(rootDir,'src','cli','login.mjs')],{cwd:rootDir,windowsHide:true,stdio:'ignore'});
    child.on('error',()=>{});
    return {state:'login_opening',message:'请在 BOSS 浏览器完成登录和安全验证，保持窗口开启后点击“连接”。'};
  }

  async connect() {
    const port=this.port();
    if (!(await isDebugPortOpen(port))) throw new Error('BOSS 登录浏览器尚未启动，请点击“打开 BOSS 登录”。');
    if (!this.browser?.isConnected()) {
      this.browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:8000});
      this.browser.on('disconnected',()=>{this.page=null;this.lastStatus={state:'disconnected',message:'BOSS 浏览器已断开，请登录后重新连接。'};});
    }
    const context=this.browser.contexts()[0];
    if (!context) throw new Error('没有可连接的浏览器会话，请重新打开 BOSS 登录。');
    this.page=context.pages().find(page=>page.url().startsWith('https://www.zhipin.com/web/geek/chat')) || await context.newPage();
    if (!this.page.url().startsWith('https://www.zhipin.com/web/geek/chat')) await this.page.goto('https://www.zhipin.com/web/geek/chat',{waitUntil:'domcontentloaded',timeout:20000});
    await this.page.waitForTimeout(1200);
    return await this.snapshot();
  }

  async snapshot() {
    if (!this.page || this.page.isClosed() || !this.browser?.isConnected()) {
      this.lastStatus={state:'disconnected',message:'BOSS 尚未连接，请先连接已登录的浏览器。'};
      throw new Error(this.lastStatus.message);
    }
    if (new URL(this.page.url()).origin!=='https://www.zhipin.com') throw new Error('浏览器标签页已离开 BOSS 网站，请重新连接。');
    const snapshot=await this.page.evaluate(readBossDom);
    if (snapshot.blocked) { this.lastStatus={state:'verification_required',message:'请在 BOSS 浏览器手动完成安全验证。'};throw new Error(this.lastStatus.message); }
    if (!snapshot.accountId) { this.lastStatus={state:'login_required',message:'请先登录 BOSS。'};throw new Error(this.lastStatus.message); }
    if (!snapshot.supported) { this.lastStatus={state:'unsupported_page',message:'未识别到 BOSS 聊天界面，请打开会话列表后重试。'};throw new Error(this.lastStatus.message); }
    this.lastStatus={state:'connected',message:'已连接，正在读取 BOSS 实时会话。',lastReadAt:Date.now(),accountId:snapshot.accountId,scope:snapshot.scope};
    return snapshot;
  }

  async openConversation(peer) {
    let snapshot=await this.snapshot();
    if (snapshot.accountId!==peer.accountId) throw new Error('BOSS 账号已变化，请重新连接并核对会话。');
    if (snapshot.peer?.bossId===peer.bossId && snapshot.peer?.jobId===peer.jobId) return snapshot;
    const index=snapshot.friends.findIndex(item=>item.bossId===peer.bossId && item.jobId===peer.jobId);
    if (index<0) throw new Error('BOSS 已加载列表中没有这条会话，请在 BOSS 打开该会话后重新同步。');
    await this.page.evaluate(index=>document.querySelector('.chat-content .user-list .user-list-content')?.__vue__?.scrollToIndex?.(index),index);
    await this.page.waitForTimeout(400);
    const handle=await this.page.evaluateHandle(peer=>[...document.querySelectorAll('.chat-user li[role=listitem]')].find(element=>{const source=element.__vue__?.source;return source && String(source.encryptBossId || source.friendId || '')===peer.bossId && String(source.encryptJobId || '')===peer.jobId;}) || null,peer);
    const element=handle.asElement();
    if (!element) throw new Error('无法准确定位这条会话，未发送任何消息。');
    const history=this.page.waitForResponse(response=>response.url().startsWith('https://www.zhipin.com/wapi/zpchat/geek/historyMsg') && response.status()===200,{timeout:12000});
    history.catch(()=>{});
    await element.click();
    await history;
    await this.page.waitForTimeout(300);
    snapshot=await this.snapshot();
    if (snapshot.peer?.bossId!==peer.bossId || snapshot.peer?.jobId!==peer.jobId) throw new Error('当前收件人与确认对象不符，未发送任何消息。');
    return snapshot;
  }

  async send(peer,text,version) {
    const before=await this.openConversation(peer);
    const digest=snapshot=>fingerprint(snapshot.messages.map(message=>[message.id,message.sender,message.text]));
    if (digest(before)!==version) throw new Error('收到新消息，请同步后重新审阅草稿。');
    const input=this.page.locator('.chat-conversation .message-controls .chat-input, .chat-conversation #chat-input').first();
    if (!(await input.count())) throw new Error('未找到 BOSS 消息输入框。');
    const existing=await input.evaluate(element=>element.value ?? element.innerText ?? '');
    if (existing.trim()) throw new Error('BOSS 输入框中已有未发送内容，请先到 BOSS 核对或清除。');
    await input.fill(text);
    const current=await this.snapshot();
    if (current.accountId!==peer.accountId || current.peer?.bossId!==peer.bossId || current.peer?.jobId!==peer.jobId || digest(current)!==version) {
      if(current.accountId===peer.accountId && current.peer?.bossId===peer.bossId && current.peer?.jobId===peer.jobId) await input.evaluate((element,text)=>{if((element.value ?? element.innerText)===text){if('value' in element)element.value='';else element.innerText='';element.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));}},text).catch(()=>{});
      throw new Error('准备消息时收件人或对话发生变化，请重新审阅。');
    }
    await this.page.evaluate(readBossDom,{action:'send',peer,text,evidence:JSON.stringify(before.messages.map(message=>[message.id,message.sender,message.text]))});
    const oldIds=new Set(before.messages.map(message=>message.id));
    for (let attempt=0;attempt<12;attempt++) {
      await this.page.waitForTimeout(600);
      const after=await this.snapshot();
      if (after.accountId!==peer.accountId || after.peer?.bossId!==peer.bossId || after.peer?.jobId!==peer.jobId) return {confirmed:false,message:'点击发送后会话发生变化，请先到 BOSS 核实结果，再决定是否重试。'};
      if (after.messages.some(message=>message.sender==='me' && message.text===text && !oldIds.has(message.id) && [1,2].includes(message.delivery))) return {confirmed:true,message:'BOSS 已显示新发出的消息及发送状态。',snapshot:after};
    }
    return {confirmed:false,message:'已点击发送，但尚未确认发送结果。请先到 BOSS 检查，不要直接重试。'};
  }

  async startApplication(job) {
    const session=await this.snapshot();
    const page=await this.browser.contexts()[0].newPage();
    await page.goto(`https://www.zhipin.com/job_detail/${encodeURIComponent(job.job_id)}.html`,{waitUntil:'domcontentloaded',timeout:20000});
    const info=await page.evaluate(()=>({accountId:String(window._PAGE?.encryptUserId || window._PAGE?.uid || ''),blocked:/security|captcha|verify/.test(location.pathname),closed:/职位已关闭|职位已下线/.test(document.body?.innerText || '')}));
    if(info.accountId!==session.accountId) throw new Error('无法核实职位页面的 BOSS 账号，未发起投递。');
    if (info.blocked || info.closed) throw new Error('职位已关闭或需要 BOSS 安全验证，未发起投递。');
    const button=page.locator('.btn-startchat').filter({hasText:/立即沟通|继续沟通/}).first();
    if (!(await button.count())) throw new Error('未找到可识别的 BOSS 沟通按钮。');
    await button.click();
    return {confirmed:false,message:'已点击 BOSS 沟通按钮，平台可能发送默认招呼语。请同步会话确认结果；未发送附件简历。'};
  }

  async sendResume(peer,version,{resumeName=''}={}) {
    const before=await this.openConversation(peer);
    const evidence=JSON.stringify(before.messages.map(message=>[message.id,message.sender,message.text]));
    if(fingerprint(before.messages.map(message=>[message.id,message.sender,message.text]))!==version) throw new Error('收到新消息，请重新确认发送附件简历。');
    if(before.platformResume.choices.length) {
      if(!resumeName || !before.platformResume.choices.includes(resumeName)) throw new Error('请先选择 BOSS 中要发送的附件简历。');
      await this.page.evaluate(readBossDom,{action:'resume_selection',peer,evidence,resumeName});
    } else {
      await this.page.evaluate(readBossDom,{action:'resume',peer,evidence});
    }
    const oldIds=new Set(before.messages.map(message=>message.id));
    for(let attempt=0;attempt<12;attempt++) {
      await this.page.waitForTimeout(600);
      const after=await this.snapshot();
      if(after.accountId!==peer.accountId || after.peer?.bossId!==peer.bossId || after.peer?.jobId!==peer.jobId) return {confirmed:false,message:'点击发送简历后会话发生变化，请先到 BOSS 核实结果。'};
      if(after.platformResume.choices.length && !resumeName) return {confirmed:false,needsSelection:true,message:'BOSS 已弹出附件列表，请选择具体简历后再次确认。',snapshot:after};
      const sent=after.messages.find(message=>!oldIds.has(message.id) && message.sender==='me' && [1,2].includes(message.delivery) && /附件简历已发送|已发送附件简历/.test(message.text));
      if(sent) return {confirmed:true,message:'BOSS 已显示附件简历发送成功的记录。',snapshot:after};
    }
    return {confirmed:false,message:'已点击 BOSS 附件简历发送按钮，发送结果尚未确认，请在 BOSS 核实。'};
  }

  async search(keyword,cityCode) {
    await this.snapshot();
    const page=await this.browser.contexts()[0].newPage();
    try {
      const responsePromise=page.waitForResponse(response=>response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json') && response.request().method()!=='OPTIONS',{timeout:20000});
      responsePromise.catch(()=>{});
      await page.goto(`https://www.zhipin.com/web/geek/jobs?${new URLSearchParams({query:keyword,city:String(cityCode)})}`,{waitUntil:'domcontentloaded',timeout:20000});
      const response=await responsePromise;
      const payload=await response.json();
      if(payload.code!==0 || !Array.isArray(payload.zpData?.jobList)) throw new Error('BOSS 未返回可用搜索结果，请在登录浏览器完成可能出现的验证。');
      return payload.zpData.jobList;
    } finally {await page.close().catch(()=>{});}
  }
}
