const app = document.querySelector('#app');
const messages = document.querySelector('#messages');
const input = document.querySelector('#input');
const form = document.querySelector('#form');
const mode = document.querySelector('#mode');
const thought = document.querySelector('#thought');
const sendButton = document.querySelector('#sendButton');
const chatPanel = document.querySelector('.chatPanel');
const chatMinimize = document.querySelector('#chatMinimize');
const chatRestore = document.querySelector('#chatRestore');

let latestSofiaLife = null;
function updateSofiaLocation(life) {
  const node = document.getElementById('sofiaLocation');
  if (!node || typeof life?.location !== 'string' || !life.location.trim()) return;
  if (latestSofiaLife && Number.isInteger(latestSofiaLife.revision) &&
      (!Number.isInteger(life.revision) || life.revision < latestSofiaLife.revision)) return;
  latestSofiaLife = life;
  window.SofiaCharacterSettings?.sync?.(life);
  const scene=life.situation?.schema===1&&life.situation.revision===life.revision&&typeof life.situation.location==='string'?life.situation:life;
  const face=typeof app!=='undefined'?app?.querySelector?.('.sofia-avatar-v435'):null;if(face)face.dataset.tone=life.responseTone||'natural';
  document.getElementById('moodAuto')?.classList?.toggle('active',life.moodMode!=='manual');
  if (scene.mood && app?.dataset.mood !== scene.mood) applyMood(scene.mood);
  // The server supplies the same character state used by Text, Live and photos.
  node.textContent = (scene===life?life.statusLabel||life.location:scene.location.replace(/\s+in Hamburg$/i,'').replace(/^an der Universität$/i,'an der Uni')).trim().slice(0, 180);
  node.title = typeof scene.activity === 'string' ? scene.activity.slice(0, 240) : '';
}
window.SofiaLifeStatus = { update: updateSofiaLocation, get mood() { return undefined; } };

const MEMORY_KEY = 'sofia_memory';
const MAX_STORED_MESSAGES = 100;
const MAX_API_HISTORY = 20;
const MUTE_KEY = 'sofia_audio_muted';

let voiceOn = localStorage.getItem(MUTE_KEY) !== 'true';
let isResponding = false;
let pendingCameraImage = null;

/* =========================
   LOCAL CHAT MEMORY
========================= */

function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);

    if (!raw) {
      console.log('Sofia Memory: noch kein lokaler Speicher vorhanden.');
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const cleaned = parsed.filter(item =>
      item &&
      ['user', 'assistant'].includes(item.role) &&
      typeof item.content === 'string'
    ).slice(-MAX_STORED_MESSAGES);

    console.log(
      `Sofia Memory: ${cleaned.length} Nachrichten geladen.`
    );

    return cleaned;

  } catch (error) {
    console.error(
      'Sofia Memory konnte nicht geladen werden:',
      error
    );

    return [];
  }
}

let conversationHistory = typeof window!=='undefined'&&window.SofiaWorkspace?.filterHistory(loadMemory()) || loadMemory();

function saveMemory() {
  try {
    if (conversationHistory.length > MAX_STORED_MESSAGES) {
      conversationHistory =
        conversationHistory.slice(-MAX_STORED_MESSAGES);
    }

    localStorage.setItem(
      MEMORY_KEY,
      JSON.stringify(conversationHistory)
    );

    console.log(
      `Sofia Memory gespeichert: ${conversationHistory.length} Nachrichten`
    );

  } catch (error) {
    console.error(
      'Sofia Memory konnte nicht gespeichert werden:',
      error
    );
  }
}

/* =========================
   MESSAGES
========================= */

let chatScrollFrame = null;
let chatPinnedToLatest = true;
let restoringChat = false;
let chatAutoScroll = false;
let savedChatPosition=null,chatPositionRestored=false;
try{const value=JSON.parse(localStorage.getItem('sofia-chat-position-v496')||'null');if(value&&Number.isFinite(value.at)&&Date.now()-value.at>=0&&Date.now()-value.at<86400000&&Array.isArray(value.anchors))savedChatPosition=value;}catch{}
function saveChatPosition(){if(!messages||!messages.querySelectorAll?.('.msg')?.length)return;const captured=captureChatViewport();const anchors=captured.anchors.filter(x=>x.id||x.createdAt).map(x=>({id:x.id,role:x.role,createdAt:x.createdAt,offset:x.offset}));try{localStorage.setItem('sofia-chat-position-v496',JSON.stringify({...captured,anchors,anchor:null,at:Date.now()}));}catch{}}
function restoreSavedChatPosition(){if(chatPositionRestored||!savedChatPosition)return false;const nodes=[...messages.querySelectorAll('.msg')];if(!savedChatPosition.pinned&&!savedChatPosition.anchors.some(a=>nodes.some(n=>a.id&&n.id===a.id||a.createdAt&&n.dataset.createdAt===a.createdAt&&(n.classList.contains('user')?'user':'assistant')===a.role)))return false;restoreChatViewport(savedChatPosition);chatPositionRestored=true;return true;}
window.addEventListener?.('pagehide',saveChatPosition);
typeof document!=='undefined'&&document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='hidden')saveChatPosition();});
function updateLatestButton(){if(typeof document==='undefined')return;const button=document.getElementById('chatLatest');if(button)button.hidden=chatPinnedToLatest;}

function stopAutoChatScroll(){chatPositionRestored=true;chatAutoScroll=false;if(chatScrollFrame!==null){cancelAnimationFrame(chatScrollFrame);chatScrollFrame=null;}}
for(const event of ['wheel','touchstart','pointerdown'])messages?.addEventListener(event,stopAutoChatScroll,{passive:true});
messages?.addEventListener('scroll', () => {
  if(chatAutoScroll){if(messages.scrollHeight-messages.clientHeight-messages.scrollTop<=64){chatAutoScroll=false;chatPinnedToLatest=true;}updateLatestButton();return;}
  chatPinnedToLatest = messages.scrollHeight - messages.clientHeight - messages.scrollTop <= 64;
  if(!chatPinnedToLatest&&chatScrollFrame!==null){cancelAnimationFrame(chatScrollFrame);chatScrollFrame=null;}
  updateLatestButton();
}, { passive: true });
// Restored thumbnails can finish loading after the history has been positioned.
messages?.addEventListener('load', event => {
  if (event.target?.tagName === 'IMG' && chatPinnedToLatest) scrollChatToLatest('auto');
}, true);

function scrollChatToLatest(behavior = 'auto', force = false) {
  if (!messages || restoringChat) return;
  if(!chatPinnedToLatest&&!force){updateLatestButton();return;}
  if(force)chatPinnedToLatest=true;chatAutoScroll=true;updateLatestButton();
  if(window.SofiaWorkspace?.motion?.()==='auto'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)behavior='auto';
  if (chatScrollFrame !== null) cancelAnimationFrame(chatScrollFrame);
  const run = () => {messages.scrollTo({ top: messages.scrollHeight, behavior });window.SofiaWorkspace?.readVisible();};
  chatScrollFrame = requestAnimationFrame(() => {
    run();
    chatScrollFrame = requestAnimationFrame(() => {
      run();
      chatScrollFrame = null;
    });
  });
}

function captureChatViewport() {
  if (!messages) return null;
  const top = messages.getBoundingClientRect().top;
  const nodes = [...messages.querySelectorAll('.msg')];
  const visible=nodes.filter(node=>node.getBoundingClientRect().bottom>top).slice(0,3);
  const anchors=visible.map(node=>({id:node.id,role:node.classList?.contains('user')?'user':'assistant',content:node.dataset?.messageText,createdAt:node.dataset?.createdAt,
    text:node.textContent,className:node.className,occurrence:nodes.filter(n=>n.className===node.className&&n.textContent===node.textContent).indexOf(node),offset:node.getBoundingClientRect().top-top}));
  return {pinned:chatPinnedToLatest,top:messages.scrollTop,height:messages.scrollHeight,anchor:anchors[0]||null,anchors};
}

function restoreChatViewport(snapshot) {
  if (!messages || !snapshot) return;
  if (snapshot.pinned) { scrollChatToLatest('auto',true); return; }
  chatAutoScroll=false;
  if (chatScrollFrame !== null) cancelAnimationFrame(chatScrollFrame);
  const nodes=[...messages.querySelectorAll('.msg')];
  let node=null,anchor=null;for(const candidate of snapshot.anchors||[snapshot.anchor]){if(!candidate)continue;node=candidate.id?document.getElementById(candidate.id):candidate.createdAt?
    nodes.find(n=>(!candidate.content||n.dataset.messageText===candidate.content)&&n.dataset.createdAt===candidate.createdAt&&(n.classList.contains('user')?'user':'assistant')===candidate.role):
    nodes.filter(n=>n.className===candidate.className&&n.textContent===candidate.text)[candidate.occurrence];if(node){anchor=candidate;break;}}
  messages.scrollTop = node ? messages.scrollTop + node.getBoundingClientRect().top - messages.getBoundingClientRect().top - anchor.offset :
    Math.max(0,snapshot.top+messages.scrollHeight-snapshot.height);
  chatPinnedToLatest = false;updateLatestButton();
  chatScrollFrame = null;
}
window.SofiaChatViewport = { capture:captureChatViewport, restore:restoreChatViewport, latest:()=>scrollChatToLatest('smooth',true), reveal:()=>applyChatState('full'), showCurrent:()=>{if(chatPanel?.classList.contains('chat-hidden'))applyChatState('compact');} };

function addMessage(text, who = 'sofia', imageRequestId = null, contactId = null, createdAt = new Date().toISOString(), replyTo = null) {
  if (!messages || window.SofiaWorkspace?.isHidden({role:who==='user'?'user':'assistant',content:text,createdAt})) return;

  const div = document.createElement('div');

  if(contactId)div.dataset.contactId=contactId;
  div.className = 'msg ' + who;
  div.dataset.messageText = text;
  if(who==='sofia'&&window.SofiaMessageText)window.SofiaMessageText.render(div,text);else div.textContent = text;

  messages.appendChild(div);

  if (imageRequestId) {
    div.dataset.portraitRequestId = imageRequestId;
    window.SofiaImages?.anchor(imageRequestId, div);
  }
  window.SofiaTimeline?.decorate(div,createdAt);
  window.SofiaWorkspace?.decorateReply(div,replyTo);
  window.SofiaUI?.refreshDays(messages);
  window.SofiaWorkspace?.added(div,restoringChat);
  scrollChatToLatest('smooth');
  return div;
}

// API calendar timestamps without an offset are Europe/Berlin wall time.
// Resolve them explicitly; never inherit the device's local time zone.
function calendarStartDate(value) {
  const text = String(value || '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
  if (!match) throw new Error('Der Kalendertermin enthält kein gültiges Datum mit Uhrzeit.');
  const wallTime = match[1] + 'T' + match[2] + ':' + (match[3] || '00');
  const wallUtc = Date.parse(wallTime + 'Z');
  if (!Number.isFinite(wallUtc) || new Date(wallUtc).toISOString().slice(0, 19) !== wallTime) {
    throw new Error('Der Kalendertermin enthält ein ungültiges Datum oder eine ungültige Uhrzeit.');
  }
  if (match[4]) {
    const explicit = new Date(wallTime + match[4]);
    if (Number.isNaN(explicit.getTime())) throw new Error('Die Zeitzone des Kalendertermins ist ungültig.');
    return explicit;
  }
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const berlinWallUtc = timestamp => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
    return Date.parse(parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute + ':' + parts.second + 'Z');
  };
  // Sample both sides of a possible DST transition, then verify candidates.
  const offsets = new Set([-86400000, 0, 86400000].map(delta => {
    const sample = wallUtc + delta;
    return berlinWallUtc(sample) - sample;
  }));
  const candidates = [...offsets].map(offset => wallUtc - offset)
    .filter(timestamp => berlinWallUtc(timestamp) === wallUtc);
  if (!candidates.length) {
    throw new Error('Diese Uhrzeit existiert in Europe/Berlin wegen der Zeitumstellung nicht. Bitte wähle eine andere Uhrzeit.');
  }
  if (candidates.length > 1) {
    throw new Error('Diese Uhrzeit kommt in Europe/Berlin wegen der Zeitumstellung zweimal vor. Bitte wähle eine eindeutige Uhrzeit.');
  }
  return new Date(candidates[0]);
}

function addCalendarDownload(action) {
  if (!messages || !action || typeof action !== 'object') return;
  let start;
  try { start = calendarStartDate(action.start); }
  catch (error) {
    pendingCalendarAction = null;
    addMessage(error.message);
    return;
  }
  pendingCalendarAction = action;

  const end = new Date(start.getTime() + (Number(action.duration_minutes) || 15) * 60000);
  const pad = n => String(n).padStart(2, '0');
  const utc = d => d.getUTCFullYear() + pad(d.getUTCMonth()+1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  const esc = value => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const alarm = Math.max(0, Number(action.alarm_minutes) || 0);
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sofia Live//Calendar Reminder//DE','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:sofia-' + Date.now() + '@sofia-live','DTSTAMP:' + utc(new Date()),'DTSTART:' + utc(start),'DTEND:' + utc(end),'SUMMARY:' + esc(action.title),'DESCRIPTION:' + esc(action.notes || ''),'BEGIN:VALARM','TRIGGER:-PT' + alarm + 'M','ACTION:DISPLAY','DESCRIPTION:' + esc(action.title),'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const row = document.createElement('div');
  row.className = 'msg sofia calendarDownload';
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sofia-erinnerung.ics';
  link.textContent = 'Zum Kalender hinzufügen';
  link.setAttribute('aria-label', 'Kalendereintrag herunterladen und öffnen');
  link.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(url), 30000), { once: true });
  row.appendChild(link);
  messages.appendChild(row);
  scrollChatToLatest('smooth');
}

window.SofiaCalendarDownload = addCalendarDownload;

/* =========================
   V4.17 TASK REMINDERS
========================= */

const TASK_NOTICE_KEY = 'sofia_task_notices_v417';
let taskReminderTimer = null;
let taskStartupBriefShown = false;

function taskNoticeMap() {
  try { return JSON.parse(localStorage.getItem(TASK_NOTICE_KEY) || '{}') || {}; }
  catch { return {}; }
}

function saveTaskNoticeMap(value) {
  localStorage.setItem(TASK_NOTICE_KEY, JSON.stringify(value));
}

function taskLocalDate(value) {
  if (!value) return null;
  try { return calendarStartDate(value); }
  catch { return null; }
}

async function enableTaskNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try { return await Notification.requestPermission(); }
  catch { return 'denied'; }
}

function addNotificationOptIn() {
  if (!messages || !('Notification' in window) || Notification.permission !== 'default') return;
  if (messages.querySelector('.taskNotificationOptIn')) return;
  const row = document.createElement('div');
  row.className = 'msg sofia taskNotificationOptIn';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Aufgaben-Benachrichtigungen aktivieren';
  button.addEventListener('click', async () => {
    const result = await enableTaskNotifications();
    button.textContent = result === 'granted' ? 'Benachrichtigungen aktiviert' : 'Benachrichtigungen nicht aktiviert';
    button.disabled = true;
  }, { once: true });
  row.appendChild(button);
  messages.appendChild(row);
  scrollChatToLatest('smooth');
}

async function checkTaskReminders({ startup = false } = {}) {
  try {
    const response = await fetch('/api/tasks?status=open', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    const now = Date.now();
    const notices = taskNoticeMap();
    const due = tasks.filter(task => {
      const when = taskLocalDate(task.remindAt || task.dueAt);
      return when && when.getTime() <= now;
    });

    if (startup && !taskStartupBriefShown) {
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
      const todayTasks = tasks.filter(task => String(task.dueAt || '').slice(0, 10) === today);
      if (due.length || todayTasks.length) {
        taskStartupBriefShown = true;
        const parts = [];
        if (due.length) parts.push(due.length + ' überfällig');
        const futureToday = todayTasks.filter(task => {
          const when = taskLocalDate(task.dueAt);
          return when && when.getTime() > now;
        });
        if (futureToday.length) parts.push(futureToday.length + ' heute fällig');
        addMessage('Kurzer Überblick: ' + parts.join(', ') + '.', 'sofia');
      }
    }

    for (const task of due) {
      const stamp = task.remindAt || task.dueAt || '';
      const key = `${task.id}|${stamp}`;
      if (notices[key]) continue;
      notices[key] = new Date().toISOString();
      if (!startup) addMessage(`Erinnerung: ${task.title}`, 'sofia');
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Sofia · Erinnerung', { body: task.title, tag: key }); } catch {}
      }
    }
    const liveKeys = new Set(tasks.map(task => `${task.id}|${task.remindAt || task.dueAt || ''}`));
    for (const key of Object.keys(notices)) {
      if (!liveKeys.has(key)) delete notices[key];
    }
    saveTaskNoticeMap(notices);
  } catch (error) {
    console.warn('Task reminders:', error);
  }
}

function startTaskReminderChecks() {
  if (taskReminderTimer) clearInterval(taskReminderTimer);
  checkTaskReminders({ startup: true });
  taskReminderTimer = setInterval(() => {
    if (document.visibilityState === 'visible') checkTaskReminders();
  }, 30000);
}


window.addEventListener('load', startTaskReminderChecks);

window.SofiaTasks = { checkReminders: checkTaskReminders, offerNotifications: addNotificationOptIn };




window.SofiaChatDelete=async (turn,restore=false)=>{
 if(isResponding||window.SofiaImages?.isGenerating)throw Error('Bitte zuerst die laufende Antwort abwarten.');
 const operation=restore?'restore_message':turn.imageId?'hide_photo_chat':'delete_message';
 const response=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,...(turn.imageId?{imageId:turn.imageId}:{messageReference:turn})}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Löschen konnte nicht bestätigt werden.');
 const source=data.reference||turn;
 if(!turn.imageId){const list=window.SofiaWorkspace?.hiddenMessages?.()||[];window.SofiaWorkspace?.acceptHidden(restore?list.filter(x=>!(x.role===source.role&&x.content===source.content&&x.createdAt===source.createdAt)):[...list,source]);conversationHistory=window.SofiaWorkspace?.filterHistory(conversationHistory)||conversationHistory;saveMemory();if(!restore)for(const node of [...messages.querySelectorAll('.msg[data-created-at]')]){if(node.dataset.messageText===turn.content&&node.dataset.createdAt===turn.createdAt&&node.classList.contains(turn.role==='user'?'user':'sofia'))node.remove();}window.SofiaUI?.refreshDays(messages);}
 else if(!restore){document.getElementById('portrait-slot-'+turn.imageId)?.remove();document.getElementById('portrait-'+turn.imageId)?.remove();}
 lastServerHistorySignature='';await syncConversationFromServer({silent:true});
};
let lastServerHistorySignature = '';
let historySyncTimer = null;
let historySyncInFlight = false;
let historySyncWaiters = [];
let pendingCalendarAction = null;

function historySignature(history) {
  return JSON.stringify(history);
}

async function syncConversationFromServer({ silent = false, afterWrite = false } = {}) {
  if (isResponding || (typeof navigator!=='undefined' && navigator.onLine===false)) return false;
  if(historySyncInFlight){if(afterWrite&&typeof historySyncWaiters!=='undefined')return new Promise(resolve=>historySyncWaiters.push(resolve));return false;}
  historySyncInFlight = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(15000) : undefined
    });

    if (response.status === 401) {
      if (!silent) window.location.reload();
      return false;
    }

    if (!response.ok) return false;

    const data = await response.json();
    if (isResponding) return false;
    updateSofiaLocation(data.life);
    if (!Array.isArray(data.history)) return false;

    window.SofiaWorkspace?.acceptHidden(data.hiddenMessages||[]);
    const serverHistory = data.history.filter(item =>
      item &&
      (item.role === 'user' || item.role === 'assistant') &&
      typeof item.content === 'string'
    ).map(({role,content,imageRequestId,contactId,createdAt,replyTo})=>({role,content,...(imageRequestId?{imageRequestId}:{}),...(contactId?{contactId}:{}),...(createdAt?{createdAt}:{}),...(replyTo?{replyTo}:{})})).slice(-MAX_STORED_MESSAGES);

    window.SofiaWorkspace?.reconcileSubmission(serverHistory);
    const localPending=(typeof conversationHistory!=='undefined'?conversationHistory:[]).filter(x=>x.delivery==='unconfirmed');
    if(localPending.length && !localPending.every(x=>window.SofiaWorkspace?.hasReceipt?.(serverHistory,{text:x.content,at:Date.parse(x.createdAt),replyTo:x.replyTo}))){window.SofiaImages?.restore(data.images);return false;}
    void window.SofiaSocial?.sync();
    const signature = historySignature(serverHistory);
    if (signature === lastServerHistorySignature) { window.SofiaImages?.restore(data.images); return true; }

    window.SofiaWorkspace?.reconcile(serverHistory,conversationHistory);
    lastServerHistorySignature = signature;
    conversationHistory = window.SofiaWorkspace?.filterHistory(serverHistory)||serverHistory;
    saveMemory();

    if (messages) {
      const viewport = captureChatViewport();
      restoringChat = true;
      try {
      messages.innerHTML = '';
      conversationHistory.forEach(item =>
        addMessage(item.content, item.role === 'user' ? 'user' : 'sofia', item.imageRequestId, item.contactId,item.createdAt||null,item.replyTo)
      );
      if (pendingCalendarAction) addCalendarDownload(pendingCalendarAction);
      window.SofiaImages?.restore(data.images);
      } finally { restoringChat = false; }
      restoreChatViewport(viewport);
      restoreSavedChatPosition();
      window.SofiaWorkspace?.refresh();
      void window.SofiaSocial?.sync();
    }

    return true;
  } catch (error) {
    if (!silent) console.warn('History sync:', error);
    return false;
  } finally {
    historySyncInFlight = false;
    focusPendingContact();
    const waiters=typeof historySyncWaiters!=='undefined'?historySyncWaiters.splice(0):[];
    if(waiters.length)void syncConversationFromServer({silent:true}).then(result=>waiters.forEach(resolve=>resolve(result)));
  }
}

function startConversationSync() {
  if (historySyncTimer) clearInterval(historySyncTimer);

  historySyncTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && !isResponding) {
      syncConversationFromServer({ silent: true });
    }
  }, 15000);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncConversationFromServer({ silent: true });
  }
});

window.addEventListener('focus', () => {
  syncConversationFromServer({ silent: true });
});

// Recovery reads shared state only; never resends a turn or starts Live.
window.SofiaChatCleanupTurns=()=>conversationHistory;
window.addEventListener('sofia-companion-photo',event=>{const request=event.detail;if(!request?.id)return;addMessage('Gib mir einen kleinen Moment.','sofia',request.id,null,request.acknowledgedAt||new Date().toISOString());void window.SofiaImages?.generate(request,{resume:true});});
window.SofiaChatCleanupRefresh=()=>syncConversationFromServer({silent:true,afterWrite:true});
window.addEventListener('sofia-social-updated',()=>{syncConversationFromServer({silent:true});});
let pendingContactOpen=null;
let contactLoading=null;
async function loadMissingContact(id){
  if(contactLoading||typeof fetch==='undefined')return;
  contactLoading=id;
  try{
    const response=await fetch('/api/session?social=1&contact='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();if(pendingContactOpen!==id)return;
    if(!response.ok||data.contact?.id!==id||typeof data.contact.text!=='string'){pendingContactOpen=null;if(typeof setThought==='function')setThought('Die Nachricht ist nicht mehr verfügbar.');return;}
    if(!messages.querySelector('[data-contact-id="'+id+'"]')){
      const node=addMessage(data.contact.text,'sofia',data.contact.imageId,id,data.contact.createdAt);
      if(node)messages.prepend(node);
    }
  }catch{if(typeof setThought==='function')setThought('Die Nachricht konnte gerade nicht geladen werden.');}
  finally{contactLoading=null;if(pendingContactOpen&&pendingContactOpen!==id)focusPendingContact();}
  if(messages?.querySelector('[data-contact-id="'+pendingContactOpen+'"]'))focusPendingContact();
}
function focusPendingContact(){
  if(!pendingContactOpen||document.visibilityState!=='visible')return;
  const node=messages?.querySelector('[data-contact-id="'+pendingContactOpen+'"]');
  if(!node){void loadMissingContact(pendingContactOpen);return;}
  const id=pendingContactOpen;pendingContactOpen=null;
  setChatMinimized(false);
  if(chatScrollFrame!==null)cancelAnimationFrame(chatScrollFrame);
  chatScrollFrame=null;chatPinnedToLatest=false;
  node.scrollIntoView({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  node.classList.add('contact-highlight');setTimeout(()=>node.classList.remove('contact-highlight'),5000);
  window.dispatchEvent(new CustomEvent('sofia-contact-visible',{detail:{contactId:id}}));
  const url=new URL(window.location.href);if(url.searchParams.get('contact')===id){url.searchParams.delete('contact');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);}
}
window.addEventListener('sofia-contact-open',event=>{
  const id=event.detail?.contactId;if(!/^[0-9a-f-]{36}$/i.test(id||''))return;
  pendingContactOpen=id;void syncConversationFromServer({silent:true}).then(()=>focusPendingContact());
});
window.addEventListener('load',()=>{const id=new URL(window.location.href).searchParams.get('contact');if(id)window.dispatchEvent(new CustomEvent('sofia-contact-open',{detail:{contactId:id}}));});
window.addEventListener('online', () => { syncConversationFromServer({silent:true}); });
window.addEventListener('pageshow', () => { syncConversationFromServer({silent:true}); });

function restoreConversation() {
  if (
    !messages ||
    conversationHistory.length === 0
  ) {
    return;
  }

  conversationHistory.forEach(item => {
    addMessage(
      item.content,
      item.role === 'user'
        ? 'user'
        : 'sofia',
      item.imageRequestId,item.contactId,item.createdAt||null,item.replyTo
    );
  });

  if(!restoreSavedChatPosition())scrollChatToLatest('auto');

  window.addEventListener('load', () => {
    if(!restoreSavedChatPosition())scrollChatToLatest('auto');
  }, { once: true });

  console.log(
    `Sofia: ${conversationHistory.length} alte Nachrichten wiederhergestellt.`
  );
}

/* =========================
   MOOD
========================= */

function applyMood(mood) {
  const validMoods = [
    'entspannt',
    'flirty',
    'amüsiert',
    'skeptisch',
    'genervt',
    'ernst'
  ];

  const next =
    validMoods.includes(mood)
      ? mood
      : 'entspannt';

  if (app) {
    app.dataset.mood = next;
  }

  window.SofiaAvatar?.setMood?.(next);

  document
    .querySelectorAll('.moods [data-mood]')
    .forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.mood === next
      );
    });
}

/* =========================
   VOICE
========================= */

let ttsAudio = null;
async function speak(text) {
  if (!voiceOn || !text || window.SofiaLive?.isActive?.()) return;
  try {
    if (ttsAudio) { ttsAudio.pause(); ttsAudio=null; }
    const response=await fetch('/api/tts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,mood:app?.dataset.mood,tone:latestSofiaLife?.responseTone})});
    if(!response.ok) throw new Error(`TTS ${response.status}`);
    const url=URL.createObjectURL(await response.blob());
    const audio=new Audio(url); ttsAudio=audio;
    audio.onplay=()=>{window.SofiaAvatar?.speak?.();if(mode)mode.textContent='spricht…';};
    audio.onended=()=>{URL.revokeObjectURL(url);if(ttsAudio===audio)ttsAudio=null;window.SofiaAvatar?.idle?.();if(mode)mode.textContent='bereit';};
    audio.onerror=()=>{URL.revokeObjectURL(url);if(ttsAudio===audio)ttsAudio=null;};
    await audio.play();
  } catch(error) { console.warn('Sofia TTS:',error); }
}

/* =========================
   SOFIA API
========================= */

function confirmLocalHistory(history,data) {
  // A persisted Text receipt acknowledges the supplied history, not an old task outcome.
  if(!Number.isInteger(data?.memoryMessages))return history;
  return history.map(({delivery,...turn})=>turn);
}

function chatFailureFeedback(status,code,actionPossible,resultReceived,retryAt=null) {
 const busy=status===429&&code==='test_busy',knownRejected=status===429;
 const uncertainAction=!busy&&actionPossible&&!resultReceived&&!knownRejected;
 const descriptions={test_busy:['Bitte kurz warten','Es läuft noch eine Anfrage. Bitte warte kurz.'],test_rate_limit:['Anfragegrenze','Es wurden gerade zu viele Anfragen gestellt.'],test_daily_limit:['Test-Tageslimit','Das Tageslimit der Testversion ist erreicht.'],test_limit_unknown:['Testlimit','Die Test-Nutzungsgrenze ist erreicht; die genaue Ursache ist nicht bekannt.'],api_credit_exhausted:['API-Guthaben aufgebraucht','Der KI-Anbieter meldet aufgebrauchtes API-Guthaben. Bitte prüfe die API-Abrechnung.'],api_spend_limit:['API-Ausgabenlimit','Der KI-Anbieter meldet ein erreichtes Ausgabenlimit. Bitte prüfe die API-Limits.'],api_usage_limit:['API-Nutzungslimit','Der KI-Anbieter meldet ein erreichtes Nutzungslimit. Bitte prüfe die API-Limits.'],api_billing_limit:['API-Abrechnung prüfen','Der KI-Anbieter meldet ein Abrechnungs- oder Kontingentproblem. Der genaue Grund ist nicht bestätigt.'],api_rate_limit:['Anfragegrenze','Der KI-Anbieter begrenzt gerade weitere Anfragen.'],api_overloaded:['Dienst ausgelastet','Der KI-Dienst ist gerade ausgelastet.']};
 descriptions.chat_response_incomplete=['Antwort abgebrochen','Meine Antwort wurde beim Erstellen abgebrochen. Der unvollständige Antworttext wurde nicht gespeichert. Bitte prüfe mögliche Aufgabenbelege vor einer erneuten Anfrage.'];
 descriptions.chat_response_invalid=['Antwort nicht lesbar','Meine Antwort konnte nicht vollständig gelesen werden. Bitte prüfe mögliche Aufgabenbelege vor einer erneuten Anfrage.'];
 descriptions.reply_source_unavailable=['Originalantwort fehlt','Die ausgewählte Originalantwort ist nicht mehr verfügbar. Bitte wähle sie erneut im Chat aus.'];
 const description=descriptions[code]||[status===429?'Anfrage abgewiesen':'Verbindungsfehler',status===429?'Die Anfrage wurde begrenzt. Die genaue Ursache ist nicht bekannt.':uncertainAction?'Die Verbindung ist unterbrochen. Bitte prüfe zuerst den Aufgabenstand, bevor du die Aktion wiederholst.':'Meine Verbindung ist gerade unterbrochen. Bitte prüfe vor einer Wiederholung den Verlauf.'];
 const at=Date.parse(retryAt),wait=Number.isFinite(at)&&at>Date.now()?' Erneut möglich ab '+new Date(at).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' (Hamburg).':'';
 return {uncertainAction,statusLabel:description[0],message:description[1]+wait};
}

async function askSofia(userMessage, imageDataUrl = null, options = {}) {
  // Freeze the selected photograph before awaiting Live history or network work.
  const referenceImageId=options.referenceImageId ?? window.SofiaImages?.referenceId;
  if (isResponding) return;
  if(typeof navigator!=='undefined' && navigator.onLine===false){addMessage('Ich bin gerade offline. Deine Nachricht wird nicht automatisch gesendet.');return;}
  window.SofiaActionFeedback?.clear();
  let actionResultReceived = false;

  isResponding = true;

  if (input) {
    input.disabled = true;
  }

  if (mode) {
    mode.textContent = 'denkt nach…';
  }

  if (thought) {
    thought.textContent = '…';
  }

  // Live Voice writes completed turns to the same localStorage history.
  // Refresh BEFORE adding/saving the new text turn; otherwise the stale
  // in-memory text history would overwrite the just-mirrored Live turn.
  const latestLocalHistory =
    loadMemory();

  if (latestLocalHistory.length) {
    conversationHistory =
      latestLocalHistory;
  }

  conversationHistory.push({
    role: 'user',
    createdAt: new Date().toISOString(),
    content: userMessage,
    ...(options.replyTo?{replyTo:options.replyTo}:{})
  });

  saveMemory();

  try {
    // If the previous turn came from Live Voice, wait until that turn has
    // reached the shared Redis history before asking the text backend.
    try {
      await (window.SofiaLiveHistoryReady || Promise.resolve());
    } catch {}

    const historyForAPI =
      conversationHistory
        .slice(0, -1)
        .slice(-MAX_API_HISTORY);

    const response =
      await fetch('/api/chat', {
        method: 'POST',

        credentials: 'same-origin',

        headers: {
          'Content-Type':
            'application/json'
        },

        signal:typeof AbortSignal!=='undefined' && typeof AbortSignal.timeout==='function'?AbortSignal.timeout(90000):undefined,
        body: JSON.stringify({
          message: userMessage,
          conversationMode:window.SofiaCompanion?.mode?.(),
          replyTo: options.replyTo || null,
          ...(options.replyTransform?{replyTransform:options.replyTransform}:{}),
          history: historyForAPI,
          image: imageDataUrl,
          referenceImageId,
          mood: window.SofiaLifeStatus?.mood
        })
      });

    /*
      Session abgelaufen:
      Seite neu laden, damit die Login-Maske
      aus index.html wieder übernehmen kann.
    */

    if (response.status === 401) {
      window.location.reload();
      return;
    }

    const data =
      await response.json();

    if (!response.ok) {
      if(data.taskAction){actionResultReceived=true;window.SofiaActionFeedback?.show(data.taskAction);}
      const error=new Error('Sofia konnte nicht antworten.');error.status=response.status;error.code=data.code||(response.status===429 && /^Ein Testaufruf läuft bereits/.test(data.error||'')?'test_busy':undefined);error.retryAt=data.retryAt;throw error;
    }

    window.SofiaWorkspace?.confirmSubmission(userMessage);
    updateSofiaLocation(data.life);
    actionResultReceived = true;
    window.SofiaActionFeedback?.show(data.taskAction);

    const reply =
      data.reply ||
      'Hm. Da ist gerade etwas schiefgelaufen.';

    conversationHistory=confirmLocalHistory(conversationHistory,data);
    conversationHistory.push({
      role: 'assistant',
      createdAt: data.createdAt || new Date().toISOString(),
      content: reply,
      ...(data.replyTo?{replyTo:data.replyTo}:{}),
      ...(data.imageRequest ? { imageRequestId:data.imageRequest.id } : {})
    });

    saveMemory();

    applyMood(latestSofiaLife?.mood || data.mood);

    addMessage(
      reply,
      'sofia',
      data.imageRequest?.id,null,data.createdAt || new Date().toISOString(),data.replyTo||null
    );
    if (data.imageRequest) void window.SofiaImages?.generate(window.SofiaImages.bindRequest(data.imageRequest,referenceImageId,options.referenceLocked===true));

    if (thought) {
      thought.textContent = data.imageRequest && /^Gib mir einen kleinen Moment[.!]?$/i.test(reply.trim()) ? '' : reply;
    }

    if (mode) {
      mode.textContent = 'bereit';
      window.SofiaImages?.updateStatus?.();
    }

    if (data.taskAction?.action === 'create' && (data.taskAction.task?.remindAt || data.taskAction.task?.dueAt)) {
      addNotificationOptIn();
      checkTaskReminders();
    }

    if (data.calendarAction) {
      const action = data.calendarAction;
      const nativeCalendar = window.webkit?.messageHandlers?.calendar;
      if (nativeCalendar?.postMessage) {
        try {
          const result = await nativeCalendar.postMessage({
            title: action.title,
            start: action.start,
            durationMinutes: action.duration_minutes || 15,
            alarmMinutes: action.alarm_minutes || 0,
            notes: action.notes || ''
          });
          if (!result?.ok) console.warn('Nativer Kalender:', result?.status || 'save_failed');
        } catch (calendarError) {
          console.warn('Nativer Kalender:', calendarError);
        }
      } else {
        addCalendarDownload(action);
      }
    }

    if(!data.imageRequest || !/^Gib mir einen kleinen Moment[.!]?$/i.test(reply.trim()))window.dispatchEvent(new CustomEvent('sofia-voice-reply',{detail:{text:reply,voiceMessage:options.voiceMessage===true,audioReply:options.audioReply===true}}));

  } catch (error) {
    console.warn('Sofia API Fehler',{code:error?.name==='TimeoutError'?'request_timeout':'request_failed',...(Number.isInteger(error?.status)?{status:error.status}:{})});

    const pendingTurn=conversationHistory.at(-1);
    if(pendingTurn?.role==='user'){pendingTurn.delivery='unconfirmed';saveMemory();}
    const actionPossible = /aufgabe|erinner|termin|kalender|erledig|lösch|verschieb|priorität|\b(?:ändere|änder|mach das|nochmal)\b/i.test(userMessage);
    const failure=chatFailureFeedback(error?.status,error?.code,actionPossible,actionResultReceived,error?.retryAt);
    if (failure.uncertainAction) window.SofiaActionFeedback?.show({ ok: false, status: 'execution_failed' });

    const errorMessage = failure.message;

    window.SofiaWorkspace?.failSubmission(userMessage,{uncertain:!Number.isInteger(error?.status)||error.status>=500});
    const failureNode=addMessage(errorMessage,'sofia');
    window.SofiaDiagnostics={lastError:{at:new Date().toISOString(),status:Number.isInteger(error?.status)?error.status:null,code:/^[a-z_]{1,60}$/.test(error?.code||'')?error.code:'request_failed',label:failure.statusLabel}};
    window.SofiaWorkspace?.failed(failureNode,userMessage,{uncertain:failure.uncertainAction,image:!!imageDataUrl,knownRejected:error?.status===429,replyTo:options.replyTo||null,referenceImageId,replyTransform:options.replyTransform||null,retryAt:error?.retryAt});

    if (thought) {
      thought.textContent =
        errorMessage;
    }

    if (mode) {
      mode.textContent = failure.statusLabel;
    }

  } finally {
    isResponding = false;

    if (input) {
      input.disabled = false;
      input.focus();
    }
  }
}

/* =========================
   SEND
========================= */

function submitChatMessage(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (!input || isResponding) return false;

  const value = input.value.trim();
  if (!value && !pendingCameraImage) return false;

  if(typeof navigator!=='undefined' && navigator.onLine===false){addMessage('Ich bin gerade offline. Dein Entwurf bleibt im Textfeld und wird nicht automatisch gesendet.');return false;}
  const messageText = value || 'Was siehst du auf diesem Foto?';
  const imageForRequest = pendingCameraImage;
  chatPinnedToLatest=true;updateLatestButton();

  const referenceImageId=window.SofiaWorkspace?.draftReferenceId ?? window.SofiaImages?.referenceId;
  const replyTo=window.SofiaWorkspace?.takeReply() || null;
  addMessage(imageForRequest ? `📷 ${messageText}` : messageText, 'user',null,null,new Date().toISOString(),replyTo);
  input.value = '';
  window.SofiaWorkspace?.beginSubmission(messageText,replyTo,referenceImageId);
  window.SofiaUI?.resizeComposer(input);
  pendingCameraImage = null;
  document.querySelector('#cameraAttachment')?.remove();
  camera?.classList.remove('on');

  Promise.resolve(askSofia(messageText, imageForRequest,{replyTo,referenceImageId}))
    .finally(() => window.SofiaLive?.clearImageContext?.());
  return false;
}

if (form && input) {
  // action verhindert selbst dann Navigation, falls ein Browser
  // das Formular nativ behandeln möchte.
  form.setAttribute('action', 'javascript:void(0)');
  form.setAttribute('method', 'post');

  form.addEventListener('submit', submitChatMessage, true);

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submitChatMessage(event);
    }
  });
}

if (sendButton) {
  document.getElementById('chatLatest')?.addEventListener('click',()=>scrollChatToLatest('smooth',true));
  window.SofiaChatSend=(message,options={})=>{
    if(isResponding||window.SofiaImages?.isGenerating||navigator.onLine===false||!String(message||'').trim())return false;
    window.SofiaWorkspace?.beginSubmission(message,options.replyTo||null,options.referenceImageId);if(input?.value===message)input.value='';window.SofiaWorkspace?.saveDraft();chatPinnedToLatest=true;addMessage(message,'user',null,null,undefined,options.replyTo||null);void askSofia(message,null,options);return true;
  };
  window.SofiaPhotoAction=(message,referenceImageId)=>{
    if(referenceImageId!==undefined&&!/^[a-f0-9-]{36}$/.test(referenceImageId))return false;
    if(isResponding||window.SofiaImages?.isGenerating||!String(message||'').trim())return false;
    if(typeof navigator!=='undefined'&&navigator.onLine===false)return false;
    window.SofiaWorkspace?.beginSubmission(message,null,referenceImageId);chatPinnedToLatest=true;addMessage(message,'user');void askSofia(message,null,{referenceImageId,referenceLocked:referenceImageId!==undefined});return true;
  };
  if(window.SofiaUI?.bindSendButton)window.SofiaUI.bindSendButton(sendButton,submitChatMessage,input);
  else sendButton.addEventListener('click',event=>{event.preventDefault();submitChatMessage(event);});
}

/* =========================
   MOBILE CHAT PANEL
========================= */

const CHAT_STATES = ['compact', 'full', 'hidden'];
let chatStateStep = 0;
let hiddenChatViewport=null;

function applyChatState(state) {
  if (!chatPanel) return;
  const next = ['hidden', 'compact', 'full'].includes(state) ? state : 'full';
  const viewport=chatPanel.classList.contains('chat-hidden')?hiddenChatViewport:window.SofiaChatViewport?.capture?.();
  if(next==='hidden')hiddenChatViewport=viewport;
  chatStateStep=CHAT_STATES.indexOf(next);
  chatPanel.dataset.chatSize=next;
  chatPanel.classList.toggle('chat-hidden', next === 'hidden');
  chatPanel.classList.toggle('minimized', next === 'compact');
  chatPanel.classList.toggle('chat-full', next === 'full');
  app?.classList.toggle('chat-is-hidden', next === 'hidden');

  if (chatMinimize) {
    const target=CHAT_STATES[(chatStateStep+1)%CHAT_STATES.length];
    const names={compact:'Halbe Größe',full:'Volle Größe',hidden:'Ausgeblendet'};
    const label='Chatgröße: '+names[next]+' · '+({compact:'Halbe Größe anzeigen',full:'Volle Größe anzeigen',hidden:'Chat ausblenden'}[target]);
    if(window.SofiaIcons?.set)window.SofiaIcons.set(chatMinimize,{compact:'half',full:'full',hidden:'hide'}[target]);
    else chatMinimize.textContent=target==='hidden'?'▾':target==='full'?'□':'▤';
    chatMinimize.title = label;
    chatMinimize.setAttribute('aria-label',label);
    chatMinimize.setAttribute('aria-expanded', next === 'hidden' ? 'false' : 'true');
  }
  try{localStorage.setItem('sofia_chat_size_v41001',next);}catch{}
  if (next !== 'hidden') window.SofiaChatViewport?.restore?.(viewport);
}

function setChatMinimized(minimized) {
  applyChatState(minimized ? 'compact' : 'full');
}

if (chatMinimize) {
  chatMinimize.addEventListener('click', event => {
    event.preventDefault();

    chatStateStep = (chatStateStep + 1) % CHAT_STATES.length;
    applyChatState(CHAT_STATES[chatStateStep]);
  });
}


if (chatRestore) {
  chatRestore.addEventListener('click', event => {
    event.preventDefault();
    applyChatState('compact');
  });
}

function enforceLandscapeChat() {
  // Rotation and keyboard resize must not replace the explicitly chosen size.
  if(chatPanel)chatPanel.dataset.chatSize=CHAT_STATES[chatStateStep];
}

window.addEventListener('orientationchange', () => {
  window.setTimeout(enforceLandscapeChat, 120);
});
window.addEventListener('resize', enforceLandscapeChat);
let savedChatSize=null;try{savedChatSize=localStorage.getItem('sofia_chat_size_v41001');}catch{}
let startChatSize='full';try{const selected=localStorage.getItem('sofia_chat_start_v4180');if([...CHAT_STATES,'last'].includes(selected))startChatSize=selected;}catch{}
applyChatState(startChatSize==='last'?(CHAT_STATES.includes(savedChatSize)?savedChatSize:'full'):startChatSize);

if (app) {
  let previousLive = app.dataset.live === 'true';

  const liveObserver = new MutationObserver(() => {
    const isLive = app.dataset.live === 'true';

    // Beim Start des Sprachchats auf dem Handy automatisch minimieren.
    // Danach kann der Nutzer den Chat jederzeit wieder öffnen.
    if (isLive && !previousLive && window.matchMedia('(max-width: 850px)').matches) {
      setChatMinimized(true);
    }

    previousLive = isLive;
  });

  liveObserver.observe(app, {
    attributes: true,
    attributeFilter: ['data-live']
  });
}

/* =========================
   LONG-TERM MEMORY UI
========================= */

let memoryOverlay = null;
let memoryList = null;
let memoryCount = null;
let memoryStatus = null;

function createMemoryUI() {
  if (memoryOverlay) {
    return;
  }

  memoryOverlay =
    document.createElement('div');

  memoryOverlay.id =
    'sofiaMemoryOverlay';

  Object.assign(
    memoryOverlay.style,
    {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background:
        'rgba(4, 7, 12, 0.78)',
      backdropFilter:
        'blur(16px)',
      WebkitBackdropFilter:
        'blur(16px)'
    }
  );

  const panel =
    document.createElement('section');

  Object.assign(
    panel.style,
    {
      width: 'min(560px, 100%)',
      maxHeight: '82vh',
      display: 'flex',
      flexDirection: 'column',
      border:
        '1px solid rgba(255,255,255,0.14)',
      borderRadius: '24px',
      background:
        'rgba(18, 21, 28, 0.96)',
      boxShadow:
        '0 24px 80px rgba(0,0,0,0.45)',
      overflow: 'hidden'
    }
  );

  /* HEADER */

  const header =
    document.createElement('div');

  Object.assign(
    header.style,
    {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      padding: '20px 20px 16px',
      borderBottom:
        '1px solid rgba(255,255,255,0.09)'
    }
  );

  const titleWrap =
    document.createElement('div');

  const title =
    document.createElement('div');

  title.id='sofia-memory-title';
  title.textContent =
    'Erinnerungen';

  Object.assign(
    title.style,
    {
      fontSize: '19px',
      fontWeight: '600',
      color: '#fff'
    }
  );

  memoryCount =
    document.createElement('div');

  memoryCount.textContent =
    'Langzeiterinnerungen';

  Object.assign(
    memoryCount.style,
    {
      marginTop: '4px',
      fontSize: '12px',
      opacity: '0.55',
      color: '#fff'
    }
  );

  titleWrap.appendChild(title);
  titleWrap.appendChild(memoryCount);

  const closeButton =
    document.createElement('button');

  closeButton.type =
    'button';

  closeButton.textContent =
    '×';

  closeButton.setAttribute(
    'aria-label',
    'Erinnerungen schließen'
  );

  Object.assign(
    closeButton.style,
    {
      width: '38px',
      height: '38px',
      flexShrink: '0',
      border: '0',
      borderRadius: '50%',
      background:
        'rgba(255,255,255,0.08)',
      color: '#fff',
      fontSize: '25px',
      lineHeight: '1',
      cursor: 'pointer'
    }
  );

  closeButton.addEventListener(
    'click',
    closeMemoryView
  );

  header.appendChild(
    titleWrap
  );

  header.appendChild(
    closeButton
  );

  /* STATUS */

  memoryStatus =
    document.createElement('div');

  Object.assign(
    memoryStatus.style,
    {
      display: 'none',
      padding: '12px 20px 0',
      fontSize: '13px',
      color:
        'rgba(255,255,255,0.65)'
    }
  );

  /* LIST */

  memoryList =
    document.createElement('div');
  memoryList.id='sofia-memory-list';

  Object.assign(
    memoryList.style,
    {
      padding: '12px 14px 18px',
      overflowY: 'auto',
      WebkitOverflowScrolling:
        'touch'
    }
  );

  panel.appendChild(header);
  panel.appendChild(memoryStatus);
  panel.appendChild(memoryList);
  const bottomClose=document.createElement('button');bottomClose.type='button';bottomClose.className='memory-close-bottom';bottomClose.textContent='Schließen';bottomClose.onclick=closeMemoryView;panel.appendChild(bottomClose);

  memoryOverlay.appendChild(
    panel
  );

  /*
    Klick außerhalb des Panels schließt Memory.
  */

  memoryOverlay.addEventListener(
    'click',
    event => {
      if (
        event.target === memoryOverlay
      ) {
        closeMemoryView();
      }
    }
  );

  document.body.appendChild(
    memoryOverlay
  );
}

function setMemoryStatus(
  text,
  visible = true
) {
  if (!memoryStatus) return;

  memoryStatus.textContent =
    text;

  memoryStatus.style.display =
    visible
      ? 'block'
      : 'none';
}

function openMemoryView(section='memory') {
  memorySection=section;
  createMemoryUI();
  const heading=document.getElementById('sofia-memory-title');if(heading)heading.textContent={conversation:'Gespräch',photos:'Fotos',memory:'Erinnerungen und Vorhaben'}[section]||'Erinnerungen';

  memoryOverlay.style.display =
    'flex';
  memoryOverlay._restoreUI=window.SofiaUI?.enhanceDialog(memoryOverlay,heading?.textContent||'Erinnerungen',closeMemoryView);
  memoryOverlay.querySelector('button')?.focus();

  document.body.style.overflow =
    'hidden';

  memoryList.scrollTop=0;
  loadLongTermMemories();
  return memoryOverlay;
}

async function closeMemoryView() {
  if(flushCharacterSettings && !await flushCharacterSettings())return false;
  flushCharacterSettings=null;
  if (!memoryOverlay) return true;

  memoryOverlay.style.display =
    'none';

  document.body.style.overflow =
    '';
  memoryOverlay._restoreUI?.();memoryOverlay._restoreUI=null;
  return true;
}

let memoryFilterState={query:'',category:'Alle Kategorien',review:false};
async function loadLongTermMemories() {
  if (
    !memoryList ||
    !memoryCount
  ) {
    return;
  }

  memoryList.replaceChildren();

  setMemoryStatus(
    'Wird geladen…'
  );

  try {
    const response =
      await fetch(
        '/api/memory',
        {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store'
        }
      );

    if (response.status === 401) {
      window.location.reload();
      return;
    }

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        'Memory konnte nicht geladen werden.'
      );
    }

    const memoryItems =
      Array.isArray(data.items)
        ? data.items
        : (Array.isArray(data.memories) ? data.memories.map(text => ({text, category: 'Persönliches'})) : []);

    const memories = memoryItems.map(item => item.text);
    const tools=document.createElement('div');tools.className='memory-tools';tools.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:12px 0';
    const projects=document.createElement('button');projects.type='button';projects.textContent='Gemeinsame Vorhaben';projects.onclick=()=>window.SofiaProjects?.open();
    const search=document.createElement('input');search.type='search';search.placeholder='Erinnerungen durchsuchen';search.setAttribute('aria-label','Erinnerungen durchsuchen');search.style.cssText='flex:1;min-width:150px';
    const categoryFilter=document.createElement('select');categoryFilter.setAttribute('aria-label','Erinnerungen nach Kategorie filtern');
    for(const name of ['Alle Kategorien',...new Set(memoryItems.map(x=>x.category||'Sonstiges'))]){const o=document.createElement('option');o.value=name;o.textContent=name;categoryFilter.append(o);}
    const reviewLabel=document.createElement('label'),reviewOnly=document.createElement('input');reviewOnly.type='checkbox';reviewOnly.setAttribute('aria-label','Nur Erinnerungen mit Prüfhinweisen');reviewLabel.append(reviewOnly,document.createTextNode(' Nur Prüfhinweise ('+memoryItems.filter(x=>x.review?.length).length+')'));const filtered=document.createElement('span');filtered.setAttribute('role','status');
    function filterMemories(){let count=0;for(const row of memoryList.querySelectorAll('[data-memory-text]')){row.hidden=!row.dataset.memoryText.includes(search.value.toLowerCase().trim())||(categoryFilter.value!=='Alle Kategorien'&&row.dataset.memoryCategory!==categoryFilter.value)||(reviewOnly.checked&&row.dataset.memoryReview!=='true');if(!row.hidden)count++;}filtered.textContent=count+' passende Erinnerungen';}
    search.value=memoryFilterState.query;categoryFilter.value=[...categoryFilter.options].some(x=>x.value===memoryFilterState.category)?memoryFilterState.category:'Alle Kategorien';reviewOnly.checked=memoryFilterState.review;
    search.oninput=categoryFilter.onchange=reviewOnly.onchange=()=>{memoryFilterState={query:search.value,category:categoryFilter.value,review:reviewOnly.checked};filterMemories();};const categoryLabel=document.createElement('label');categoryLabel.textContent='Kategorie';categoryLabel.append(categoryFilter);tools.append(projects,search,categoryLabel,reviewLabel,filtered);memoryList.append(tools);


    memoryCount.textContent =
      memories.length === 1
        ? '1 Langzeiterinnerung'
        : `${memories.length} Langzeiterinnerungen`;

    if(memorySection!=='memory')memoryCount.textContent=memorySection==='photos'?'Fototypen und eigene Fotos':'Antworten, Rückfragen und Themen';
    setMemoryStatus(
      '',
      false
    );

    if (
      memories.length === 0
    ) {
      renderEmptyMemory();
      const userNodes=[...memoryList.children];
    renderCharacterMemories(data.character);filterMemories();
    if(memorySection!=='memory')for(const node of userNodes)node.hidden=true;
      return;
    }

    const categoryOrder = [
      'Personen',
      'Vorlieben',
      'Projekte & Arbeit',
      'Ziele & Pläne',
      'Gewohnheiten',
      'Beziehung',
      'Persönliches',
      'Sonstiges'
    ];

    const groupedItems = [...memoryItems].sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.category);
      const bIndex = categoryOrder.indexOf(b.category);
      const aOrder = aIndex === -1 ? categoryOrder.length : aIndex;
      const bOrder = bIndex === -1 ? categoryOrder.length : bIndex;
      return aOrder - bOrder;
    });

    const userHeading=document.createElement('h3');userHeading.textContent='Über dich';memoryList.append(userHeading);
    let lastCategory = '';
    groupedItems.forEach((item, index) => {
      const category = item.category || 'Sonstiges';
      if (category !== lastCategory) {
        const heading = document.createElement('div');
        heading.textContent = category;
        Object.assign(heading.style, {
          padding: '14px 4px 8px',
          color: 'rgba(255,255,255,0.5)',
          fontSize: '11px',
          fontWeight: '700',
          letterSpacing: '.08em',
          textTransform: 'uppercase'
        });
        memoryList.appendChild(heading);
        lastCategory = category;
      }
      renderMemoryItem(item.text, index, category,item);
    });
    const userNodes=[...memoryList.children];
    renderCharacterMemories(data.character);filterMemories();
    if(memorySection!=='memory')for(const node of userNodes)node.hidden=true;

  } catch (error) {
    console.error(
      'Memory laden fehlgeschlagen:',
      error
    );

    memoryCount.textContent =
      'Langzeiterinnerungen';

    setMemoryStatus(
      'Diese Ansicht konnte gerade nicht geladen werden.'
    );
  }
}

let memorySection='memory';
let flushCharacterSettings=null;
let characterSettingsError=null;
let characterSettingsFocus=false;
window.SofiaCharacterSettings={open(section='conversation'){characterSettingsFocus=true;return openMemoryView(section);},flush:()=>flushCharacterSettings?flushCharacterSettings():Promise.resolve(true)};
const CHARACTER_SETTINGS_DRAFT='sofia_character_settings_pending_v1';
function readCharacterSettingsDraft(){
  try{const draft=JSON.parse(localStorage.getItem(CHARACTER_SETTINGS_DRAFT)||'null');
    if(!draft||!draft.value||!draft.base||!Number.isFinite(draft.at)||Date.now()-draft.at>7*86400000||draft.at>Date.now())return null;
    return draft;
  }catch{return null;}
}
function storeCharacterSettingsDraft(value,base){
  try{localStorage.setItem(CHARACTER_SETTINGS_DRAFT,JSON.stringify({value,base,at:Date.now()}));return true;}catch{return false;}
}
function clearCharacterSettingsDraft(snapshot){
  try{const draft=readCharacterSettingsDraft();if(draft&&JSON.stringify(draft.value)===snapshot)localStorage.removeItem(CHARACTER_SETTINGS_DRAFT);}catch{}
}
if(typeof window.addEventListener==='function')window.addEventListener('online',()=>{if(memoryOverlay?.style.display==='flex')flushCharacterSettings?.();});


async function saveCharacterEdit(field,value,topic,revision=latestSofiaLife?.revision,retrySettings=false,settingsBase=null) {
  if(field==='settings')characterSettingsError=null;
  const response=await fetch('/api/memory',{method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'character',field,value,topic,revision})});
  if(response.status===401){window.location.reload();return false;}
  const data=await response.json();
  if(response.status===409&&field==='settings'&&retrySettings){
    const fresh=await fetch('/api/memory',{credentials:'same-origin',cache:'no-store'});
    if(fresh.ok){const state=await fresh.json();if(Number.isInteger(state.character?.revision)){updateSofiaLocation(state.character);const merged=settingsBase?{...state.character.settings,...Object.fromEntries(Object.entries(value).filter(([key,item])=>JSON.stringify(item)!==JSON.stringify(settingsBase[key])))}:value;return saveCharacterEdit(field,merged,topic,state.character.revision,false);}}
  }
  if(!response.ok){const error=data.error || 'Änderung konnte nicht gespeichert werden.';if(field==='settings')characterSettingsError=error;setMemoryStatus(error);const note=document.getElementById('moodStatus');if(note)note.textContent=error;return false;}
  updateSofiaLocation(data.character);const note=document.getElementById('moodStatus');if(note)note.textContent='';return true;
}

function renderCharacterMemories(character) {
  if(!character || !memoryList)return;
  updateSofiaLocation(character);
  const heading=document.createElement('h3');heading.textContent='Über Sofia';memoryList.append(heading);
  const note=document.createElement('p');note.textContent='Charakteralltag und Gesprächsbezüge. „Vergessen“ entfernt den gespeicherten Bezug; Nachrichten im Chat bleiben erhalten.';note.style.cssText='font-size:12px;opacity:.65';memoryList.append(note);
  const section=label=>{const group=document.createElement('details');group.style.cssText='padding:12px 0;border-top:1px solid rgba(255,255,255,.1)';const summary=document.createElement('summary');summary.textContent=label;summary.style.cssText='cursor:pointer;font-weight:600';group.append(summary);memoryList.append(group);return group;};
  const groups={settings:section('Gespräch und Fotos'),day:section('Aktueller Alltag'),interests:section('Interessen'),plans:section('Sofias eigene Vorhaben'),references:section('Persönliche Gesprächsbezüge'),preferences:section('Vorlieben'),habits:section('Gesprächsgewohnheiten'),development:section('Jüngste Entwicklungen')};groups.settings.open=true;
  if(characterSettingsFocus){characterSettingsFocus=false;memoryList.scrollTop=0;}
  const date=at=>new Date(at).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric'});
  const status=(text)=>setMemoryStatus(text);
  const apply=async(field,value,topic,button)=>{button.disabled=true;status('Wird gespeichert …');try{if(await saveCharacterEdit(field,value,topic,latestSofiaLife?.revision??character.revision)){await loadLongTermMemories();status(field==='forget'?'Bezug vergessen.':'Gespeichert.');}}catch{status('Änderung konnte nicht gespeichert werden.');}finally{button.disabled=false;}};
  const row=(group,label,value,field,topic,kind)=>{
    const item=document.createElement('div');item.style.cssText='padding:12px 0;border-top:1px solid rgba(255,255,255,.08)';
    const text=document.createElement('div');text.textContent=label+': '+value;item.append(text);
    if(field){const edit=document.createElement('button');edit.type='button';edit.textContent='Bearbeiten';edit.setAttribute('aria-label',label+' bearbeiten');edit.onclick=async()=>{const next=window.prompt(label+' bearbeiten:',value);if(next!==null&&next.trim())await apply(field,next.trim(),topic,edit);};item.append(edit);}
    if(kind){const forget=document.createElement('button');forget.type='button';forget.textContent='Vergessen';forget.setAttribute('aria-label',label+' vergessen');forget.onclick=()=>apply('forget',kind,topic,forget);item.append(forget);}
    group.append(item);return item;
  };
  const history=(item,events)=>{for(const event of (events||[]).slice(-4)){const detail=document.createElement('small');detail.style.cssText='display:block;opacity:.65;margin-top:4px';detail.textContent=date(event.at)+': '+(event.progress||event.value||event.status||'')+(event.reason?' · '+event.reason:'');item.append(detail);}};
  for(const [field,label]of [['location','Ort'],['activity','Tätigkeit'],['outfit','Outfit'],['hairstyle','Frisur']])row(groups.day,label,character[field]||'',field);
  row(groups.day,'Stimmung',character.mood+' ('+(character.moodMode==='manual'?'manuell':'automatisch')+')');
  row(groups.day,'Wochenrahmen',character.weekFrame?character.weekFrame.day+' · '+character.weekFrame.frame:'noch kein Eintrag');
  const settings=character.settings||{},controls=document.createElement('div');controls.style.cssText='display:grid;gap:12px;padding:12px 0';
  const select=(label,choices,value)=>{const wrapper=document.createElement('label');wrapper.textContent=label+' ';const input=document.createElement('select');for(const [key,text]of choices){const option=document.createElement('option');option.value=key;option.textContent=text;input.append(option);}input.value=value;wrapper.append(input);controls.append(wrapper);return input;};
  const initiative=select('Gesprächsinitiative',[['quiet','Zurückhaltend'],['balanced','Ausgewogen'],['active','Aktiv']],settings.initiative||'balanced');
  const length=select('Antwortlänge',[['auto','Nach Bedarf'],['short','Kurz'],['detailed','Ausführlich']],settings.replyLength||'auto');
  const questions=select('Häufigkeit eigener Rückfragen',[['rare','Selten'],['balanced','Gelegentlich'],['frequent','Öfter, wenn es passt']],settings.questionFrequency||'balanced');
  const topics=select('Neue Gesprächsthemen',[['follow','Bei meinem Thema bleiben'],['balanced','Nach Gesprächsanlass'],['suggest','Gelegentlich etwas vorschlagen']],settings.topicInitiative||'balanced');
  const motifs=document.createElement('fieldset');motifs.style.cssText='border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:12px;display:grid;gap:10px';
  const legend=document.createElement('legend');legend.textContent='Eigene Fototypen · Mehrfachauswahl';motifs.append(legend);
  const selected=Array.isArray(settings.photoKinds)?settings.photoKinds:settings.photoMix==='selfies'?['selfie']:settings.photoMix==='moments'?['environment']:['selfie','environment'];
  const photoKinds=[];
  for(const [key,label]of [['selfie','Selfie'],['full_selfie','Ganzkörperselfie · selbst aufgenommen'],['portrait','Porträtfoto · von jemand anderem aufgenommen'],['full_portrait','Ganzkörperfoto · von jemand anderem aufgenommen'],['environment','Alltag und Umgebung · aus Sofias Perspektive']]){const wrapper=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=key;input.checked=selected.includes(key);wrapper.textContent=label+' ';wrapper.append(input);motifs.append(wrapper);photoKinds.push(input);}
  const photoSection=document.createElement('details'),photoSummary=document.createElement('summary');
  const summarizePhotos=()=>{photoSummary.textContent='Fototypen · '+photoKinds.filter(x=>x.checked).length+' ausgewählt';};summarizePhotos();photoSection.append(photoSummary,motifs);controls.append(photoSection);
  const photoLabel=document.createElement('label'),photos=document.createElement('input');photos.type='checkbox';photos.checked=settings.photos!==false;photoLabel.textContent='Gelegentliche eigene Fotos (max. 2 pro Stunde) ';photoLabel.append(photos);controls.append(photoLabel);
  const help=document.createElement('small');help.textContent='Die Motivauswahl gilt für selbst angebotene Fotos. Ausdrücklich angefragte Bilder bleiben möglich. Nachrichtenhäufigkeit und Ruhezeiten findest du unter Einstellungen → Eigeninitiative.';help.style.opacity='.65';controls.append(help);
  const values=()=>({initiative:initiative.value,replyLength:length.value,questionFrequency:questions.value,topicInitiative:topics.value,photos:photos.checked,photoKinds:photoKinds.filter(x=>x.checked).map(x=>x.value)});
  let serverValues=values();
  let settingsRevision=character.revision;
  let committed=JSON.stringify(serverValues),saving=null;
  const draft=readCharacterSettingsDraft();
  if(draft){
    const changed=key=>JSON.stringify(draft.value[key])!==JSON.stringify(draft.base[key]);
    if(changed('initiative')&&['quiet','balanced','active'].includes(draft.value.initiative))initiative.value=draft.value.initiative;
    if(changed('replyLength')&&['auto','short','detailed'].includes(draft.value.replyLength))length.value=draft.value.replyLength;
    if(changed('questionFrequency')&&['rare','balanced','frequent'].includes(draft.value.questionFrequency))questions.value=draft.value.questionFrequency;
    if(changed('topicInitiative')&&['follow','balanced','suggest'].includes(draft.value.topicInitiative))topics.value=draft.value.topicInitiative;
    if(changed('photos')&&typeof draft.value.photos==='boolean')photos.checked=draft.value.photos;
    if(changed('photoKinds')&&Array.isArray(draft.value.photoKinds))for(const input of photoKinds)input.checked=draft.value.photoKinds.includes(input.value);
  }
  summarizePhotos();
  const feedback=document.createElement('small');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const settingsStatus=text=>{feedback.textContent=text;status(text);};
  feedback.textContent=draft?'Ungespeicherte Auswahl wiederhergestellt. Bitte speichern.':'Änderungen werden automatisch gespeichert.';

  function applySettings(value){
    if(['quiet','balanced','active'].includes(value.initiative))initiative.value=value.initiative;
    if(['auto','short','detailed'].includes(value.replyLength))length.value=value.replyLength;
    if(['rare','balanced','frequent'].includes(value.questionFrequency))questions.value=value.questionFrequency;
    if(['follow','balanced','suggest'].includes(value.topicInitiative))topics.value=value.topicInitiative;
    if(typeof value.photos==='boolean')photos.checked=value.photos;
    if(Array.isArray(value.photoKinds))for(const input of photoKinds)input.checked=value.photoKinds.includes(input.value);
    summarizePhotos();
  }
  function synchronizeSettings(life){
    if(saving||!life?.settings||!Number.isInteger(life.revision)||life.revision<=settingsRevision)return;
    const local=values(),base=JSON.parse(committed),fresh={...serverValues,...life.settings};
    const merged={...fresh,...Object.fromEntries(Object.entries(local).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(base[key])))};
    serverValues={initiative:fresh.initiative,replyLength:fresh.replyLength,questionFrequency:fresh.questionFrequency||'balanced',topicInitiative:fresh.topicInitiative||'balanced',photos:fresh.photos,photoKinds:fresh.photoKinds};
    committed=JSON.stringify(serverValues);settingsRevision=life.revision;applySettings(merged);
    if(JSON.stringify(values())===committed){clearCharacterSettingsDraft(JSON.stringify(values()));feedback.textContent='Gespeicherte Einstellungen aktualisiert.';}
    else {storeCharacterSettingsDraft(values(),serverValues);feedback.textContent=characterSettingsError?'Noch nicht gespeichert. '+characterSettingsError+' Deine Auswahl bleibt auf diesem Gerät erhalten.':'Serverstand aktualisiert. Deine ungespeicherte Auswahl bleibt erhalten.';}
  }
  window.SofiaCharacterSettings.sync=synchronizeSettings;
  const save=document.createElement('button');save.type='button';save.textContent='Gesprächseinstellungen speichern';
  async function flushSettings(force=false){
    if(saving)return saving.then(ok=>ok?flushSettings(force):false);
    const value=values(),snapshot=JSON.stringify(value);
    if(!force&&snapshot===committed){clearCharacterSettingsDraft(snapshot);return true;}
    if(value.photos&&!value.photoKinds.length){settingsStatus('Bitte mindestens einen Fototyp wählen oder eigene Fotos deaktivieren.');return false;}
    const retained=storeCharacterSettingsDraft(value,JSON.parse(committed));
    save.disabled=true;settingsStatus('Wird gespeichert …');
    saving=(async()=>{
      try{if(!await saveCharacterEdit('settings',value,undefined,latestSofiaLife?.revision??character.revision,true,JSON.parse(committed))){settingsStatus('Noch nicht gespeichert. '+(characterSettingsError||'Bitte erneut versuchen.')+(retained?' Auswahl bleibt auf diesem Gerät erhalten.':' Bitte diese Ansicht offen lassen.'));return false;}committed=snapshot;clearCharacterSettingsDraft(snapshot);settingsStatus('Gespeichert.');return true;}
      catch{settingsStatus(retained?'Verbindung fehlgeschlagen. Auswahl bleibt auf diesem Gerät erhalten.':'Verbindung fehlgeschlagen. Bitte diese Ansicht offen lassen.');return false;}
      finally{save.disabled=false;saving=null;synchronizeSettings(latestSofiaLife);}
    })();
    const ok=await saving;
    return ok&&JSON.stringify(values())!==committed?flushSettings():ok;
  }
  flushCharacterSettings=flushSettings;
  for(const input of [initiative,length,questions,topics,photos,...photoKinds])input.onchange=()=>{summarizePhotos();storeCharacterSettingsDraft(values(),JSON.parse(committed));return flushSettings();};
  save.onclick=()=>flushSettings(true);controls.append(save,feedback);
  groups.settings.append(controls);
  if(memorySection==='memory'){groups.settings.hidden=true;}
  else{
    heading.hidden=true;note.hidden=true;
    for(const [key,group]of Object.entries(groups))if(key!=='settings')group.hidden=true;
    groups.settings.querySelector('summary').textContent=memorySection==='photos'?'Eigene Fotos':'Gesprächsverhalten';
    const conversationControls=[initiative,length,questions,topics];
    for(const field of conversationControls)field.parentElement.hidden=memorySection==='photos';
    photoSection.hidden=photoLabel.hidden=help.hidden=memorySection==='conversation';
    save.textContent=memorySection==='photos'?'Fotoeinstellungen speichern':'Gesprächseinstellungen speichern';
    if(memorySection==='photos'){const socialPhotos=document.createElement('button');socialPhotos.type='button';socialPhotos.textContent='Fotos in eigenständigen Kontakten';socialPhotos.onclick=async()=>{const open=()=>window.SofiaSocial?.preferences?.({section:'photos'});if(window.SofiaUI?.navigateFrom)return window.SofiaUI.navigateFrom(memoryOverlay,open,()=>openMemoryView('photos'),closeMemoryView);if(await closeMemoryView())open();};groups.settings.append(socialPhotos);}
  }


  for(const pref of character.preferences||[])if(pref.value)history(row(groups.preferences,'Vorliebe: '+pref.topic,pref.value,'preference',pref.topic,'preference'),pref.history);
  for(const interest of character.interests||[])if(!interest.dismissed){const item=row(groups.interests,'Interesse: '+interest.topic,interest.description+(interest.progress?' · '+interest.progress:''),'interest',interest.topic,'interest');history(item,interest.history);}
  const labels={planned:'Geplant',active:'In Arbeit',completed:'Abgeschlossen',paused:'Pausiert'};
  for(const plan of character.plans||[])if(!plan.dismissed){const item=row(groups.plans,(labels[plan.status]||'Vorhaben')+': '+plan.topic,plan.text+(plan.progress?' · '+plan.progress:''),'plan',plan.topic,'plan');if(plan.nextStep&&plan.status!=='completed'){const step=document.createElement('small');step.textContent='Nächster Schritt: '+plan.nextStep;item.append(step);}history(item,plan.history);}
  for(const thread of character.threads||[])if(thread.status!=='dismissed')row(groups.references,thread.status==='resolved'?'Erledigt':'Offen',thread.text+(thread.eventDate?' · '+date(thread.eventDate+'T12:00:00Z'):''),'thread',thread.topic,'thread');
  for(const phrase of character.sharedPhrases||[])if(phrase.count>=2)row(groups.references,'Vertraute Formulierung',phrase.text,null,phrase.text,'sharedPhrase');
  for(const habit of character.habits||[])if(habit.count>=2)row(groups.habits,habit.topic,habit.value,null,habit.topic,'habit');
  for(const event of (character.development||[]).slice(-6).reverse())row(groups.development,date(event.at)+' · '+event.topic,event.text+(event.reason?' · '+event.reason:''));
  for(const [key,group]of Object.entries(groups))if(!['settings','day'].includes(key)&&group.children.length===1){const empty=document.createElement('p');empty.textContent='Noch keine gespeicherten Einträge.';empty.style.opacity='.65';group.append(empty);}
  const add=document.createElement('button');add.type='button';add.textContent='Sofias Vorliebe ergänzen';add.onclick=async()=>{const topic=window.prompt('Thema der Vorliebe:');if(!topic?.trim())return;const value=window.prompt('Sofias Vorliebe:');if(value?.trim())await apply('preference',value.trim(),topic.trim(),add);};groups.preferences.append(add);
}

function renderEmptyMemory() {
  if (!memoryList) return;

  const empty =
    document.createElement('div');

  empty.textContent =
    'Noch keine Langzeiterinnerungen gespeichert.';

  Object.assign(
    empty.style,
    {
      padding: '30px 14px',
      textAlign: 'center',
      color:
        'rgba(255,255,255,0.5)',
      fontSize: '14px'
    }
  );

  memoryList.appendChild(
    empty
  );
}

function renderMemoryItem(
  memory,
  index,
  category = 'Sonstiges',
  metadata = {}
) {
  if (!memoryList) return;

  const item =
    document.createElement('div');

  Object.assign(
    item.style,
    {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '14px',
      marginBottom: '8px',
      border:
        '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      background:
        'rgba(255,255,255,0.035)'
    }
  );

  const number =
    document.createElement('div');

  number.textContent =
    String(index + 1);

  Object.assign(
    number.style,
    {
      width: '26px',
      height: '26px',
      flexShrink: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      background:
        'rgba(255,255,255,0.08)',
      color:
        'rgba(255,255,255,0.55)',
      fontSize: '11px'
    }
  );

  const textWrap =
    document.createElement('div');

  Object.assign(textWrap.style, {
    flex: '1',
    minWidth: '0'
  });

  const categoryLabel =
    document.createElement('div');

  categoryLabel.textContent =
    category;

  Object.assign(categoryLabel.style, {
    marginBottom: '4px',
    color: 'rgba(255,255,255,0.42)',
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '.04em'
  });

  const text =
    document.createElement('div');

  text.textContent =
    memory;

  Object.assign(
    text.style,
    {
      paddingTop: '0',
      color:
        'rgba(255,255,255,0.9)',
      fontSize: '14px',
      lineHeight: '1.45',
      wordBreak: 'break-word'
    }
  );

  const editButton =
    document.createElement('button');

  editButton.type = 'button';
  editButton.textContent = 'Bearbeiten';

  Object.assign(editButton.style, {
    flexShrink: '0',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    padding: '7px 9px',
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.65)',
    fontSize: '11px',
    cursor: 'pointer'
  });

  let editor=null;
  editButton.addEventListener('click', () => {
    if(editor)return;
    editor=document.createElement('div');editor.style.cssText='margin-top:12px;display:grid;gap:8px';
    const content=document.createElement('textarea');content.value=memory;content.maxLength=500;content.setAttribute('aria-label','Erinnerungstext');content.style.cssText='width:100%;min-height:80px;box-sizing:border-box';
    const picker=document.createElement('select');picker.setAttribute('aria-label','Erinnerungskategorie');
    for(const name of ['Personen','Vorlieben','Projekte & Arbeit','Ziele & Pläne','Gewohnheiten','Beziehung','Persönliches','Sonstiges']){const option=document.createElement('option');option.value=name;option.textContent=name;picker.append(option);}picker.value=category;
    const save=document.createElement('button'),cancel=document.createElement('button'),feedback=document.createElement('p');save.type=cancel.type='button';save.textContent='Änderung speichern';cancel.textContent='Abbrechen';feedback.setAttribute('role','status');
    cancel.onclick=()=>{editor.remove();editor=null;};
    save.onclick=async()=>{const value=content.value.trim();if(!value){feedback.textContent='Bitte einen Erinnerungstext eingeben.';return;}save.disabled=true;
      try{const r=await fetch('/api/memory',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({old_memory:memory,new_memory:value,category:picker.value,memoryId:metadata.id})});const d=await r.json();if(!r.ok)throw Error(d.error||'Die Erinnerung konnte nicht geändert werden.');await loadLongTermMemories();setMemoryStatus('Erinnerung geändert.');}
      catch(error){feedback.textContent=error.message;save.disabled=false;}
    };
    editor.append(content,picker,save,cancel,feedback);textWrap.append(editor);content.focus();
  });

  const deleteButton =
    document.createElement('button');

  deleteButton.type =
    'button';

  deleteButton.textContent =
    'Löschen';

  Object.assign(
    deleteButton.style,
    {
      flexShrink: '0',
      border:
        '1px solid rgba(255,255,255,0.1)',
      borderRadius: '10px',
      padding: '7px 9px',
      background:
        'rgba(255,255,255,0.05)',
      color:
        'rgba(255,255,255,0.65)',
      fontSize: '11px',
      cursor: 'pointer'
    }
  );

  deleteButton.addEventListener(
    'click',
    () => {
      deleteLongTermMemory(
        memory,
        deleteButton,metadata.id
      );
    }
  );

  textWrap.appendChild(categoryLabel);
  textWrap.appendChild(text);
  const details=document.createElement('small');details.className='memory-provenance';const stamp=metadata.updatedAt||metadata.createdAt;details.textContent='Über dich · '+(Number.isFinite(Date.parse(stamp))?(metadata.updatedAt?'Zuletzt geändert: ':'Gespeichert: ')+new Date(stamp).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Zeitpunkt nicht hinterlegt');textWrap.append(details);
  const origin=document.createElement('small');origin.className='memory-provenance';origin.textContent='Quelle: '+(metadata.provenance?.label||'Bei älteren Einträgen nicht hinterlegt')+' · Dauerhafte Nutzererinnerung';textWrap.append(origin);
  for(const hint of metadata.review||[]){const note=document.createElement('p');note.className='memory-review-note';note.textContent=hint;note.setAttribute('role','note');textWrap.append(note);}item.dataset.memoryReview=String(!!metadata.review?.length);item.dataset.memoryId=metadata.id||'';

  item.dataset.memoryText=memory.toLowerCase();
  item.dataset.memoryCategory=category;
  item.appendChild(number);
  item.appendChild(textWrap);
  item.appendChild(editButton);
  item.appendChild(deleteButton);

  memoryList.appendChild(
    item
  );
}

async function deleteLongTermMemory(
  memory,
  button,
  memoryId
) {
  /*
    Absichtliche Sicherheitsabfrage:
    Ein versehentliches Antippen auf dem
    iPhone löscht nicht sofort eine Erinnerung.
  */

  const confirmed =
    window.confirm(
      `Diese Erinnerung wirklich löschen?\n\n${memory}`
    );

  if (!confirmed) {
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent =
      '…';
  }

  try {
    const response =
      await fetch(
        '/api/memory',
        {
          method: 'DELETE',

          credentials:
            'same-origin',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            memory,memoryId
          })
        }
      );

    if (response.status === 401) {
      window.location.reload();
      return;
    }

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        'Erinnerung konnte nicht gelöscht werden.'
      );
    }

    await loadLongTermMemories();

  } catch (error) {
    console.error(
      'Memory löschen fehlgeschlagen:',
      error
    );

    setMemoryStatus(
      'Die Erinnerung konnte nicht gelöscht werden.'
    );

    if (button) {
      button.disabled = false;
      button.textContent =
        'Löschen';
    }
  }
}

/* =========================
   VIEW BUTTONS
========================= */

const memoryViewButton =
  document.querySelector('#memoryAction');

const chatViewButton =
  document.querySelector(
    '[data-view="chat"]'
  );

if (memoryViewButton) {
  memoryViewButton.addEventListener(
    'click',
    event => {
      event.preventDefault();
      openMemoryView();
    }
  );
}

if (chatViewButton) {
  chatViewButton.addEventListener(
    'click',
    () => {
      closeMemoryView();
    }
  );
}

/*
  Escape schließt Memory auf Geräten
  mit Tastatur.
*/

document.addEventListener(
  'keydown',
  event => {
    if (
      event.key === 'Escape' &&
      memoryOverlay &&
      memoryOverlay.style.display !== 'none'
    ) {
      closeMemoryView();
    }
  }
);

/* =========================
   MOOD POPOVER
========================= */

const toolsToggle = document.querySelector('#toolsToggle');
const actionBar = document.querySelector('.actions');

function setToolsOpen(open) {
  const next = Boolean(open);
  app?.classList.toggle('tools-closed', !next);
  toolsToggle?.setAttribute('aria-expanded', String(next));
  toolsToggle?.classList.toggle('on', next);
  localStorage.setItem('sofia_tools_open', next ? '1' : '0');
}

toolsToggle?.addEventListener('click', () => {
  setToolsOpen(app?.classList.contains('tools-closed'));
});

setToolsOpen(false);

const moodToggle = document.querySelector('#moodToggle');
const moodPanel = document.querySelector('#moodPanel');

function setMoodPanelOpen(open) {
  const next = Boolean(open);
  app?.classList.toggle('mood-open', next);
  moodPanel?.setAttribute('aria-hidden', String(!next));
  moodToggle?.setAttribute('aria-expanded', String(next));
  moodToggle?.classList.toggle('on', next);
}

moodToggle?.addEventListener('click', event => {
  event.stopPropagation();
  setMoodPanelOpen(!app?.classList.contains('mood-open'));
});

document.addEventListener('pointerdown', event => {
  if (!app?.classList.contains('mood-open')) return;
  if (moodPanel?.contains(event.target) || moodToggle?.contains(event.target)) return;
  setMoodPanelOpen(false);
});

/* =========================
   MOOD BUTTONS
========================= */

document
  .querySelectorAll('.moods [data-mood]')
  .forEach(button => {
    button.addEventListener(
      'click',
      () => {
        void (async()=>{
          try {
            if(!latestSofiaLife){await syncConversationFromServer({silent:true});}
            if(await saveCharacterEdit('mood',button.dataset.mood))applyMood(button.dataset.mood);
          } catch { console.warn('Stimmung konnte gerade nicht gespeichert werden.'); }
        })();

        if (moodToggle) {
          const chosen = button.textContent.trim();
          moodToggle.title = `Stimmung: ${chosen}`;
          moodToggle.setAttribute('aria-label', `Stimmung: ${chosen}`);
        }

        setMoodPanelOpen(false);
      }
    );
  });

document.querySelector('#moodAuto')?.addEventListener('click',async()=>{
  try{if(!latestSofiaLife)await syncConversationFromServer({silent:true});await saveCharacterEdit('mood','auto');}
  catch{console.warn('Automatische Stimmung konnte gerade nicht aktiviert werden.');}
  setMoodPanelOpen(false);
});

/* =========================
   LIVE + MUTE CONTROLS
========================= */

const voiceToggle = document.querySelector('#voiceToggle');
const mute = document.querySelector('#mute');

function setTopLiveState(state = 'inactive') {
  if (!voiceToggle) return;
  const active = state === 'active';
  const connecting = state === 'connecting';
  voiceToggle.classList.toggle('active', active);
  voiceToggle.classList.toggle('live-active', active);
  voiceToggle.classList.toggle('live-connecting', connecting);
  voiceToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
  voiceToggle.title = active
    ? 'Live-Sprachchat beenden'
    : connecting
      ? 'Live-Sprachchat wird verbunden'
      : 'Live-Sprachchat starten';
  voiceToggle.setAttribute('aria-label',voiceToggle.title);
}

function syncTopLiveButton() {
  if (!app) return;
  setTopLiveState(app.dataset.live === 'true' ? 'active' : 'inactive');
}

if (voiceToggle) {
  voiceToggle.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    const liveButton = document.querySelector('#liveVoiceButton');
    if (!liveButton) {
      if (thought) thought.textContent = 'Live Voice ist noch nicht bereit.';
      return;
    }
    liveButton.click();
  };
}

if (app) {
  const observer = new MutationObserver(syncTopLiveButton);
  observer.observe(app, { attributes: true, attributeFilter: ['data-live'] });
}

syncTopLiveButton();

window.addEventListener('sofia-live-state', event => {
  const state = event.detail?.state || 'inactive';
  setTopLiveState(state);
  chatPanel?.classList.toggle('liveCompact', state === 'active');
});

if (mute) {
  const applyMuteState = muted => {
    const nextMuted = Boolean(muted);
    localStorage.setItem(MUTE_KEY, nextMuted ? 'true' : 'false');
    voiceOn = !nextMuted;
    window.SofiaLive?.setMuted?.(nextMuted);
    if (nextMuted && 'speechSynthesis' in window) speechSynthesis.cancel();
  if(nextMuted&&ttsAudio){ttsAudio.pause();ttsAudio=null;window.SofiaAvatar?.idle?.();}
    mute.classList.toggle('on', nextMuted);
    mute.setAttribute('aria-pressed', nextMuted ? 'true' : 'false');
    const label = mute.querySelector('span');
    if (label) label.textContent = nextMuted ? 'Ton an' : 'Stumm';
  };

  applyMuteState(localStorage.getItem(MUTE_KEY) === 'true');

  mute.onclick = event => {
    event.preventDefault();
    applyMuteState(!event.currentTarget.classList.contains('on'));
  };

  window.addEventListener('sofia-live-ready', () => {
    applyMuteState(localStorage.getItem(MUTE_KEY) === 'true');
  });
}

/* =========================
   FOCUS
========================= */

const focus =
  document.querySelector('#focus');

if (focus) {
  focus.onclick =
    event => {
      if (app) {
        app.classList.toggle(
          'focus'
        );
      }

      event.currentTarget
        .classList.toggle(
          'on'
        );
    };
}

/* =========================
   CAMERA / FOTO-FRAGEN
========================= */

const camera = document.querySelector('#camera');
let cameraOverlay = null;
let cameraStream = null;

function clearCameraAttachment() {
  pendingCameraImage = null;
  document.querySelector('#cameraAttachment')?.remove();
  camera?.classList.remove('on');
  window.SofiaLive?.clearImageContext?.();
}

function showCameraAttachment(dataUrl) {
  clearCameraAttachment();
  pendingCameraImage = dataUrl;
  camera?.classList.add('on');
  window.SofiaLive?.setImageContext?.(dataUrl);

  const preview = document.createElement('div');
  preview.id = 'cameraAttachment';
  preview.className = 'cameraAttachment';
  preview.innerHTML = `<img alt="Foto-Vorschau"><button type="button" aria-label="Foto entfernen">×</button>`;
  preview.querySelector('img').src = dataUrl;
  preview.querySelector('button').onclick = clearCameraAttachment;
  form?.insertBefore(preview, input);
  input?.focus();
}

async function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  cameraOverlay?.remove();
  cameraOverlay = null;
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    if (thought) thought.textContent = 'Die Kamera ist in diesem Browser nicht verfügbar.';
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });

    cameraOverlay = document.createElement('div');
    cameraOverlay.className = 'cameraOverlay';
    cameraOverlay.innerHTML = `
      <div class="cameraView">
        <video autoplay playsinline muted></video>
        <div class="cameraTop"><button type="button" data-close>×</button></div>
        <div class="cameraBottom"><button type="button" class="shutter" data-shot aria-label="Foto aufnehmen"></button></div>
      </div>`;
    document.body.appendChild(cameraOverlay);

    const video = cameraOverlay.querySelector('video');
    video.srcObject = cameraStream;
    await video.play();

    cameraOverlay.querySelector('[data-close]').onclick = closeCamera;
    cameraOverlay.querySelector('[data-shot]').onclick = () => captureCameraPhoto(video);
  } catch (error) {
    console.error('Kamera:', error);
    if (thought) thought.textContent = 'Die Rückkamera konnte nicht geöffnet werden.';
    await closeCamera();
  }
}

function captureCameraPhoto(video) {
  const maxSide = 1600;
  const sourceW = video.videoWidth || 1280;
  const sourceH = video.videoHeight || 960;
  const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sourceW * scale);
  canvas.height = Math.round(sourceH * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.80);

  const review = document.createElement('div');
  review.className = 'cameraReview';
  review.innerHTML = `
    <img alt="Aufgenommenes Foto">
    <div><button type="button" data-retake>Wiederholen</button><button type="button" class="primary" data-use>Verwenden</button></div>`;
  review.querySelector('img').src = dataUrl;
  cameraOverlay.querySelector('.cameraView').appendChild(review);
  cameraOverlay.querySelector('video').style.visibility = 'hidden';
  cameraOverlay.querySelector('.cameraBottom').style.display = 'none';

  review.querySelector('[data-retake]').onclick = () => {
    review.remove();
    cameraOverlay.querySelector('video').style.visibility = '';
    cameraOverlay.querySelector('.cameraBottom').style.display = '';
  };
  review.querySelector('[data-use]').onclick = async () => {
    showCameraAttachment(dataUrl);
    await closeCamera();
    if (thought) thought.textContent = 'Foto angehängt. Was möchtest du darüber wissen?';
  };
}

if (camera) {
  camera.onclick = event => {
    event.preventDefault();
    openCamera();
  };
}


/* =========================
   CLOCK
========================= */

function updateClock() {
  const clock =
    document.querySelector('#clock');

  if (!clock) return;

  clock.textContent =
    new Date()
      .toLocaleTimeString(
        'de-DE',
        {
          hour: '2-digit',
          minute: '2-digit'
        }
      );
}

updateClock();

setInterval(
  updateClock,
  1000
);

/* =========================
   START
========================= */

syncConversationFromServer().then(ok => {
  if (!ok) restoreConversation();
  startConversationSync();
});

console.log(
  `Sofia V3.9 gestartet. Lokaler Chat: ${conversationHistory.length} Nachrichten.`
);





