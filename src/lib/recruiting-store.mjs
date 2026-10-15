import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { dataDir } from './paths.mjs';

export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class RecruitingStore {
  constructor(file = path.join(dataDir, 'recruiting.sqlite')) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leads (job_id TEXT PRIMARY KEY, stage TEXT NOT NULL DEFAULT 'queued', resume TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, peer_json TEXT NOT NULL, messages_json TEXT NOT NULL DEFAULT '[]', version TEXT NOT NULL DEFAULT '', last_message TEXT NOT NULL DEFAULT '', last_is_self INTEGER, unread INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT 'active', wechat_json TEXT NOT NULL DEFAULT '[]', last_synced INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, conversation_id TEXT, job_id TEXT, kind TEXT NOT NULL, text TEXT NOT NULL, version TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending_review', result TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
    `);
    if(!this.db.prepare('PRAGMA table_info(drafts)').all().some(column=>column.name==='payload_json')) this.db.exec("ALTER TABLE drafts ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}'");
    this.db.prepare("UPDATE drafts SET status='unconfirmed',result='程序在发送期间停止，请先到 BOSS 核实结果再重试。' WHERE status='sending'").run();
    this.db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES ('autoDraft','true')").run();
  }

  settings() {
    return Object.fromEntries(this.db.prepare('SELECT * FROM settings').all().map(row => [row.key, JSON.parse(row.value)]));
  }

  saveSettings(values) {
    const statement = this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    this.db.transaction(() => { for (const [key,value] of Object.entries(values)) statement.run(key, JSON.stringify(value)); })();
    return this.settings();
  }

  queue(jobId, resume = '') {
    this.db.prepare("INSERT INTO leads(job_id,resume,updated_at) VALUES (?,?,?) ON CONFLICT(job_id) DO UPDATE SET resume=excluded.resume,updated_at=excluded.updated_at").run(jobId,resume,Date.now());
    this.event(jobId,'queued',resume);
  }

  event(subject,action,detail='') {
    this.db.prepare('INSERT INTO events(subject,action,detail,created_at) VALUES (?,?,?,?)').run(subject,action,detail,Date.now());
  }

  listConversations() {
    return this.db.prepare('SELECT * FROM conversations ORDER BY unread DESC,last_synced DESC').all().map(row => this.parseConversation(row));
  }

  parseConversation(row) {
    return row ? { ...row, peer:JSON.parse(row.peer_json),messages:JSON.parse(row.messages_json),wechat:JSON.parse(row.wechat_json) } : null;
  }

  conversation(id) {
    return this.parseConversation(this.db.prepare('SELECT * FROM conversations WHERE id=?').get(id));
  }

  saveConversation(peer,messages = null) {
    const id = fingerprint([peer.bossId,peer.jobId,peer.accountId]);
    const previous = this.conversation(id);
    const version = messages ? fingerprint(messages.map(message => [message.id,message.sender,message.text])) : previous?.version || '';
    const incomingMessages = messages || previous?.messages || [];
    const latest = incomingMessages.at(-1);
    const contacts = incomingMessages.filter(message => message.sender === 'recruiter').flatMap(message => [...message.text.matchAll(/(?:微信(?:号)?|微(?:信)?|wx|wechat|v信)\s*[:：是为]?\s*([A-Za-z][A-Za-z0-9_-]{5,19})(?![A-Za-z0-9_-])/gi)].map(match => ({id:match[1],messageId:message.id,confirmed:false})));
    const stage = ['wechat_added','closed'].includes(previous?.stage) ? previous.stage : contacts.length ? 'wechat_received' : previous?.stage || 'active';
    this.db.prepare(`INSERT INTO conversations(id,peer_json,messages_json,version,last_message,last_is_self,unread,stage,wechat_json,last_synced) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET peer_json=excluded.peer_json,messages_json=excluded.messages_json,version=excluded.version,last_message=excluded.last_message,last_is_self=excluded.last_is_self,unread=excluded.unread,stage=excluded.stage,wechat_json=excluded.wechat_json,last_synced=excluded.last_synced`).run(id,JSON.stringify(peer),JSON.stringify(incomingMessages),version,peer.lastMessage ?? latest?.text ?? previous?.last_message ?? '',peer.lastIsSelf === undefined ? latest?.sender === 'me' ? 1 : 0 : Number(peer.lastIsSelf),peer.unread || 0,stage,JSON.stringify(contacts.length ? contacts : previous?.wechat || []),Date.now());
    if (messages && previous?.version && previous.version !== version) this.db.prepare("UPDATE drafts SET status='stale',updated_at=? WHERE conversation_id=? AND status='pending_review' AND version<>?").run(Date.now(),id,version);
    return this.conversation(id);
  }

  createDraft({conversationId=null,jobId=null,kind='reply',text='',version='',payload={}}) {
    const id=randomUUID();const now=Date.now();
    this.db.prepare('INSERT INTO drafts(id,conversation_id,job_id,kind,text,version,created_at,updated_at,payload_json) VALUES (?,?,?,?,?,?,?,?,?)').run(id,conversationId,jobId,kind,text,version,now,now,JSON.stringify(payload));
    this.event(id,'draft_created',kind);
    return this.draft(id);
  }

  draft(id) { return this.db.prepare('SELECT * FROM drafts WHERE id=?').get(id); }

  updateDraft(id,text) {
    const result=this.db.prepare("UPDATE drafts SET text=?,updated_at=? WHERE id=? AND status='pending_review'").run(text,Date.now(),id);
    if (!result.changes) throw new Error('这条草稿已不能编辑。');
    return this.draft(id);
  }

  claim(id,text,version) {
    const result=this.db.prepare("UPDATE drafts SET status='sending',updated_at=? WHERE id=? AND status='pending_review' AND text=? AND version=?").run(Date.now(),id,text,version);
    if (!result.changes) throw new Error('草稿已变化、失效或已经提交，请重新审阅。');
    this.event(id,'user_confirmed',fingerprint([text,version]));
  }

  finish(id,status,result) {
    this.db.prepare('UPDATE drafts SET status=?,result=?,updated_at=? WHERE id=?').run(status,result,Date.now(),id);
    this.event(id,status,result);
  }

  state() {
    return { settings:this.settings(),leads:this.db.prepare('SELECT * FROM leads ORDER BY updated_at DESC').all(),conversations:this.listConversations(),drafts:this.db.prepare('SELECT * FROM drafts ORDER BY created_at DESC LIMIT 100').all(),events:this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 50').all() };
  }
}
