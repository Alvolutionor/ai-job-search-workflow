let token='',state=null,view='jobs',jobs=[],total=0,page=1,selectedJob=null,selectedConversation=null,selectedDraft=null,fetching=false;
const $=selector=>document.querySelector(selector);
const escape=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const time=value=>value ? new Date(value).toLocaleString('zh-CN') : '尚未同步';
const titles={jobs:'寻找岗位',queue:'投递队列',inbox:'实时会话',review:'待确认发送',wechat:'微信交接',settings:'设置'};
const labels={disconnected:'未连接',connected:'已连接',login_opening:'正在打开登录',login_browser_running:'登录浏览器已打开',login_required:'需要登录',verification_required:'需要安全验证',unsupported_page:'未识别到聊天页面',queued:'待投递',contact_started:'已发起沟通',active:'沟通中',closed:'已结束',wechat_received:'收到对方微信',wechat_offered:'已提供我的微信',wechat_added:'已添加微信',pending_review:'待你确认',sending:'正在发送',sent:'已发送',unconfirmed:'发送结果待核实',failed:'操作失败',stale:'草稿已失效',discarded:'已放弃',reply:'回复消息',wechat:'提供微信',application:'发起沟通',resume:'发送附件简历',selection_required:'需要选择附件',me:'我',recruiter:'招聘方',unknown:'身份待确认',system:'系统消息',draft_created:'已生成草稿',user_confirmed:'你已确认',live_search:'实时搜索',started:'已开启',stopped:'已停止'};
const label=value=>labels[value] || value;
const notice=(text,error=false)=>{const el=$('#notice');el.hidden=!text;el.textContent=text;el.className=error?'error':'';};

async function api(endpoint,body) {
  const response=await fetch('/api/recruiting'+endpoint,body===undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':token},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok) throw new Error(result.error || '请求失败，请稍后重试。');return result;
}

async function action(task,message='') {
  try {notice(message);await task();await refresh();} catch(error) {notice(error.message,true);}
}

async function refresh() {
  if(fetching)return;fetching=true;
  try {
    state=await api('/state');
    if(!$('#city').dataset.ready) {
      const options=state.cities.map(city=>`<option value="${escape(city.name)}">${escape(city.name)}</option>`).join('');
      $('#city').innerHTML='<option value="">All cities</option>'+options;
      $('#live-city').innerHTML='<option value="">Select a city</option><option value="全国">Nationwide</option>'+options;
      $('#city').dataset.ready='true';
    }
    $('#connection-state').textContent=label(state.browser.state);
    $('#connection-state').className='connection-pill '+(state.browser.state==='connected'?'connected':'');
    $('#connection-detail').textContent=`${state.browser.message} 上次同步：${time(state.lastSync)}`;
    $('#monitor-button').textContent=state.monitor?'暂停实时监测':'开始实时监测';
    $('#queue-count').textContent=state.leads.length;
    $('#inbox-count').textContent=state.conversations.length;
    $('#review-count').textContent=state.drafts.filter(draft=>draft.status==='pending_review').length;
    $('#wechat-count').textContent=state.conversations.filter(conversation=>conversation.stage.startsWith('wechat_')).length;
    if(state.lastError)notice(state.lastError,true);
    renderList();
    if(selectedConversation && view==='inbox')renderConversation(false);
    if(selectedDraft)renderDraft(false);
  } finally {fetching=false;}
}

async function loadJobs() {
  const params=new URLSearchParams({q:$('#query').value,city:$('#city').value,page:String(page)});
  const result=await api('/jobs?'+params);jobs=result.jobs;total=result.total;
  $('#jobs-count').textContent=total;renderList();
}

function switchView(next) {
  view=next;$('#view-title').textContent=titles[view];
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  $('#search-tools').hidden=view!=='jobs';$('#pagination').hidden=view!=='jobs';
  selectedDraft=null;selectedConversation=null;selectedJob=null;
  $('#review-pane').innerHTML='<p class="muted">选择会话生成回复，或从投递队列准备发起沟通。</p>';
  $('#detail-pane').innerHTML='<div class="empty-state"><h2>'+escape(titles[view])+'</h2><p>选择一项查看详情。</p></div>';
  renderList();if(view==='settings')renderSettings();
}

function renderList() {
  if(!state)return;
  let items=[];
  if(view==='jobs')items=jobs.map(job=>({type:'job',id:job.job_id,title:job.job_name,subtitle:`${job.company_name} · ${job.city_name}`,preview:job.salary_desc,tag:job.directContact?job.boss_title:''}));
  if(view==='queue')items=state.leads.map(lead=>({type:'job',id:lead.job_id,title:lead.job?.job_name,subtitle:lead.job?.company_name,preview:lead.resume || '尚未选择简历',tag:label(lead.stage)}));
  if(view==='inbox' || view==='wechat')items=state.conversations.filter(conversation=>view!=='wechat' || conversation.stage.startsWith('wechat_')).map(conversation=>({type:'conversation',id:conversation.id,title:conversation.peer.name || '未知联系人',subtitle:conversation.peer.company,preview:conversation.last_message,tag:conversation.unread?`${conversation.unread} 条未读`:label(conversation.stage)}));
  if(view==='review')items=state.drafts.map(draft=>({type:'draft',id:draft.id,title:label(draft.kind),subtitle:state.conversations.find(conversation=>conversation.id===draft.conversation_id)?.peer.company || state.leads.find(lead=>lead.job_id===draft.job_id)?.job?.company_name,preview:draft.text,tag:label(draft.status)}));
  $('#list-label').textContent=titles[view];$('#list-total').textContent=view==='jobs'?`${total} 个岗位`:String(items.length);
  $('#work-list').innerHTML=items.length?items.map(item=>`<button class="work-item ${[selectedJob,selectedConversation,selectedDraft].includes(item.id)?'selected':''}" data-item="${escape(item.type)}" data-id="${escape(item.id)}"><h3>${escape(item.title)}</h3><p>${escape(item.subtitle)}</p><p class="preview">${escape(item.preview)}</p>${item.tag?`<span class="tag">${escape(item.tag)}</span>`:''}</button>`).join(''):'<p class="muted" style="padding:20px">'+(view==='inbox'?'连接 BOSS 并同步后，将显示真实会话。':view==='wechat'?'交换微信后，联系人会显示在这里。':'这个阶段暂时没有记录。')+'</p>';
  $('#page-label').textContent=`${page} / ${Math.max(1,Math.ceil(total/40))}`;$('#previous-page').disabled=page<=1;$('#next-page').disabled=page*40>=total;
}

function currentJob() {return jobs.find(job=>job.job_id===selectedJob) || state.leads.find(lead=>lead.job_id===selectedJob)?.job;}

function renderJob() {
  const job=currentJob();if(!job)return;
  const lead=state.leads.find(item=>item.job_id===selectedJob);
  $('#detail-pane').innerHTML=`<h2>${escape(job.job_name)}</h2><div class="job-meta"><strong>${escape(job.company_name)}</strong><span>${escape(job.city_name)}</span><span>${escape(job.brand_scale_name)}</span><span>${escape(job.salary_desc || '薪资未知')}</span></div><p class="muted">招聘方：${escape(job.boss_name)} / ${escape(job.boss_title)}。招聘者的身份标注仍需核实。</p><p class="source-note">最近采集：${time(job.last_seen_at_ms)}。历史职位不代表当前仍在招聘。</p><div class="detail-actions"><a href="${escape(job.job_url)}" target="_blank" rel="noopener noreferrer">查看 BOSS 原职位</a></div><div class="detail-section"><h3>职位原始描述</h3><pre class="description">${escape(job.description || '尚未采集完整职位描述，投递前请先查看 BOSS 当前页面。')}</pre></div>`;
  $('#review-pane').innerHTML=`<h3>${lead?'已加入待投递队列':'加入投递队列'}</h3><p class="muted">请先核对岗位是否合适。发起沟通可能触发 BOSS 默认招呼语；选择本地简历不会自动发送附件。</p><label for="resume-choice">本次使用的简历</label><select id="resume-choice"><option value="">请选择简历</option>${state.resumes.map(name=>`<option ${lead?.resume===name?'selected':''}>${escape(name)}</option>`).join('')}</select><div class="review-actions"><button id="queue-role" class="primary">${lead?'保存简历选择':'加入投递队列'}</button>${lead?'<button id="prepare-application">准备沟通，等待确认</button>':''}</div>`;
  $('#queue-role').onclick=()=>action(async()=>{await api('/queue',{jobId:job.job_id,resume:$('#resume-choice').value});await refresh();renderJob();},'正在保存投递队列…');
  if(lead)$('#prepare-application').onclick=()=>action(async()=>{const draft=await api('/application/prepare',{jobId:job.job_id});selectedDraft=draft.id;await refresh();renderDraft();});
}

function renderConversation(rebuild=true) {
  const conversation=state.conversations.find(item=>item.id===selectedConversation);if(!conversation)return;
  const pane=$('#detail-pane');const oldScroll=pane.scrollTop;
  pane.innerHTML=`<div class="thread-meta"><h2>${escape(conversation.peer.name)}</h2><p>${escape(conversation.peer.company)} · ${escape(conversation.peer.title)}</p><p class="muted">${escape(conversation.peer.jobName)} · ${escape(label(conversation.stage))} · 最近读取：${time(conversation.last_synced)}</p><div class="detail-actions"><button id="read-thread">读取最新对话</button><button id="close-thread">结束此会话</button></div></div><div class="thread-messages">${conversation.messages.length?conversation.messages.map(message=>`<div class="message ${escape(message.sender)}"><span class="sender">${escape(label(message.sender))}</span><p>${escape(message.text)}</p></div>`).join(''):'<p class="muted">目前只有会话预览。请先读取对话，再根据真实消息拟写回复。</p>'}</div>${conversation.wechat.map(contact=>`<div class="contact-entry"><p class="muted">可能是对方的微信号，请对照原始消息核实。</p><span class="wechat-id">${escape(contact.id)}</span></div>`).join('')}<div class="detail-actions"><button id="mark-added">我已添加对方微信</button></div>`;
  pane.scrollTop=oldScroll;
  $('#read-thread').onclick=()=>action(()=>api('/conversation/read',{id:conversation.id}),'正在读取这位招聘者的对话…');
  $('#close-thread').onclick=()=>action(()=>api('/conversation/stage',{id:conversation.id,stage:'closed'}));
  $('#mark-added').onclick=()=>action(()=>api('/conversation/stage',{id:conversation.id,stage:'wechat_added'}));
  if(rebuild) {
    selectedDraft=null;
    $('#review-pane').innerHTML=`<h3>准备下一条回复</h3><p class="muted">Draft a message toward your chosen goal, or choose a contact exchange.</p><div class="review-actions"><button id="draft-reply" class="primary">生成回复草稿</button><button id="draft-wechat">拟写提供微信的消息</button></div><label for="platform-resume-choice">BOSS 平台附件简历</label><select id="platform-resume-choice"><option value="">${conversation.peer.platformResume?.choices?.length ? "请选择具体附件" : "BOSS 当前设置的附件简历"}</option>${(conversation.peer.platformResume?.choices || []).map(name=>`<option>${escape(name)}</option>`).join('')}</select><div class="review-actions"><button id="prepare-resume">发送附件简历</button></div><p class="muted">生成草稿时不会发送消息。</p>`;
    $('#draft-reply').onclick=()=>makeDraft(conversation.id,'reply');$('#draft-wechat').onclick=()=>makeDraft(conversation.id,'wechat');
    $('#prepare-resume').onclick=()=>makeResumeDraft(conversation.id,$('#platform-resume-choice').value);
  }
}

function makeResumeDraft(id,resumeName) {action(async()=>{const result=await api('/resume/prepare',{conversationId:id,resumeName});if(result.needsSelection){await refresh();renderConversation();notice('请选择 BOSS 中的具体附件简历，再确认发送。');return;}selectedDraft=result.id;await refresh();renderDraft();},'正在核对 BOSS 的附件简历发送按钮…');}

function makeDraft(id,kind) {action(async()=>{const result=await api('/draft',{conversationId:id,kind});selectedDraft=result.id;await refresh();renderDraft();},'Claude 正在结合你的真实经历和当前对话拟写回复…');}

function renderDraft(rebuild=true) {
  const draft=state.drafts.find(item=>item.id===selectedDraft);if(!draft)return;
  const conversation=state.conversations.find(item=>item.id===draft.conversation_id);
  if(!rebuild && $('#draft-text')?.dataset.id===draft.id && draft.status==='pending_review')return;
  if(view==='review' && conversation){selectedConversation=conversation.id;renderConversation(false);}
  const job=state.leads.find(lead=>lead.job_id===draft.job_id)?.job;
  $('#review-pane').innerHTML=`<h3>${escape(label(draft.kind))} / ${escape(label(draft.status))}</h3><p>${escape(conversation?.peer.name || job?.company_name || 'BOSS 招聘方')}<br><span class="muted">${escape(conversation?.peer.company || job?.job_name || '')}</span></p><textarea id="draft-text" data-id="${escape(draft.id)}" ${draft.status!=='pending_review' || ['application','resume'].includes(draft.kind)?'readonly':''} aria-label="待确认发送的完整内容">${escape(draft.text)}</textarea><p class="muted">${escape(draft.result || '请核对收件人和完整内容，目前尚未发送。')}</p>${draft.status==='pending_review'?'<div class="review-actions"><button id="review-send" class="primary">审阅并确认</button><button id="discard-draft">放弃草稿</button></div>':draft.status==='selection_required'?'<div class="review-actions"><button id="choose-platform-resume">选择附件并重新确认</button></div>':''}`;
  if(draft.status==='selection_required')$('#choose-platform-resume').onclick=()=>{selectedConversation=draft.conversation_id;renderConversation();};
  if(draft.status==='pending_review') {
    $('#discard-draft').onclick=()=>action(()=>api('/draft/discard',{id:draft.id}));
    $('#review-send').onclick=()=>action(async()=>{
      let current=draft;
      if(!['application','resume'].includes(draft.kind) && $('#draft-text').value.trim()!==draft.text)current=await api('/draft/edit',{id:draft.id,text:$('#draft-text').value});
      $('#confirm-title').textContent=current.kind==='application'?'确认发起 BOSS 沟通':current.kind==='resume'?'确认发送附件简历':'确认本条消息';
      $('#confirm-recipient').textContent=`收件人：${conversation?.peer.name || job?.company_name || ''} / ${conversation?.peer.company || job?.job_name || ''}`;
      $('#confirm-text').textContent=current.text;$('#confirm-send').textContent=current.kind==='application'?'确认发起沟通':current.kind==='resume'?'确认发送附件简历':'确认发送';
      const dialog=$('#confirm-dialog');dialog.returnValue='';dialog.showModal();
      dialog.addEventListener('close',()=>{if(dialog.returnValue==='send')action(()=>api('/confirm',{id:current.id,text:current.text,version:current.version,confirmed:true}),'正在核对收件人和最新对话，确认无误后发送…');},{once:true});
    });
  }
}

function renderSettings() {
  $('#detail-pane').innerHTML=`<h2>求职偏好设置</h2><p class="muted">Choose your communication goal. Search terms, cities and ranking rules are configured in your local configuration files.</p><form id="settings-form" class="settings-form"><label>Communication goal<textarea id="user-goal" maxlength="2000">${escape(state.settings.goal || '')}</textarea></label><label>你的微信号或微信联系方式<input id="wechat-id" value="${escape(state.settings.wechatId || '')}" maxlength="80" autocomplete="off"></label><label class="check-label"><input id="auto-draft" type="checkbox" ${state.settings.autoDraft?'checked':''}>实时监测时自动生成回复草稿</label><p class="muted">自动拟稿覆盖当前会话，以及投递队列关联的未读会话。所有发送仍需你逐条确认。</p><button class="primary">保存设置</button></form><div class="detail-section"><h3>最近操作记录</h3>${state.events.slice(0,15).map(event=>`<div class="event-row"><strong>${escape(label(event.action))}</strong>${escape(event.detail)}<br><span class="muted">${time(event.created_at)}</span></div>`).join('')}</div>`;
  $('#settings-form').onsubmit=event=>{event.preventDefault();action(()=>api('/settings',{wechatId:$('#wechat-id').value,autoDraft:$('#auto-draft').checked,goal:$('#user-goal').value}),'设置已保存到本机。');};
}

document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>switchView(button.dataset.view));
$('#work-list').onclick=event=>{const item=event.target.closest('[data-item]');if(!item)return;if(item.dataset.item==='job'){selectedJob=item.dataset.id;selectedDraft=null;renderJob();}if(item.dataset.item==='conversation'){selectedConversation=item.dataset.id;renderConversation();}if(item.dataset.item==='draft'){selectedDraft=item.dataset.id;renderDraft();}renderList();};
$('#search-form').onsubmit=event=>{event.preventDefault();page=1;action(loadJobs);};
$('#live-search-form').onsubmit=event=>{event.preventDefault();action(async()=>{const result=await api('/search',{keyword:$('#live-keyword').value,city:$('#live-city').value});jobs=result.jobs;total=result.total;page=1;$('#source-note').textContent=`BOSS 实时采集于：${time(result.observedAt)}. ${result.scope}`;renderList();},'正在获取 BOSS 当前搜索结果的第一页…');};
$('#previous-page').onclick=()=>{page--;action(loadJobs);};$('#next-page').onclick=()=>{page++;action(loadJobs);};
$('#login-button').onclick=()=>action(async()=>{const result=await api('/login',{});notice(result.message);});
$('#connect-button').onclick=()=>action(()=>api('/connect',{}),'正在连接你的 BOSS 浏览器…');
$('#sync-button').onclick=()=>action(()=>api('/sync',{}),'正在读取实时会话列表…');
$('#monitor-button').onclick=()=>action(()=>api('/monitor',{enabled:!state.monitor}));
(async()=>{try{token=(await api('/session')).token;await refresh();await loadJobs();setInterval(()=>refresh().catch(error=>notice(error.message,true)),5000);}catch(error){notice(error.message,true);}})();
