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
  document.getElementById('moodAuto')?.classList?.toggle('active',life.moodMode!=='manual');
  if (life.mood && app?.dataset.mood !== life.mood) applyMood(life.mood);
  // The server supplies the same character state used by Text, Live and photos.
  node.textContent = (life.statusLabel || life.location).trim().slice(0, 180);
  node.title = typeof life.activity === 'string' ? life.activity.slice(0, 240) : '';
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

let conversationHistory = loadMemory();

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

messages?.addEventListener('scroll', () => {
  chatPinnedToLatest = messages.scrollHeight - messages.clientHeight - messages.scrollTop <= 64;
}, { passive: true });
// Restored thumbnails can finish loading after the history has been positioned.
messages?.addEventListener('load', event => {
  if (event.target?.tagName === 'IMG' && chatPinnedToLatest) scrollChatToLatest('auto');
}, true);

function scrollChatToLatest(behavior = 'auto') {
  if (!messages || restoringChat) return;
  if (chatScrollFrame !== null) cancelAnimationFrame(chatScrollFrame);
  const run = () => messages.scrollTo({ top: messages.scrollHeight, behavior });
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
  const anchor = nodes.find(node => node.getBoundingClientRect().bottom > top);
  return { pinned:chatPinnedToLatest, top:messages.scrollTop, height:messages.scrollHeight,
    anchor:anchor ? {id:anchor.id, text:anchor.textContent, className:anchor.className,
      occurrence:nodes.filter(n=>n.className===anchor.className && n.textContent===anchor.textContent).indexOf(anchor),
      offset:anchor.getBoundingClientRect().top-top} : null };
}

function restoreChatViewport(snapshot) {
  if (!messages || !snapshot) return;
  if (snapshot.pinned) { scrollChatToLatest('auto'); return; }
  if (chatScrollFrame !== null) cancelAnimationFrame(chatScrollFrame);
  const anchor = snapshot.anchor;
  const node = anchor && (anchor.id ? document.getElementById(anchor.id) :
    [...messages.querySelectorAll('.msg')].filter(n=>n.className===anchor.className && n.textContent===anchor.text)[anchor.occurrence]);
  messages.scrollTop = node ? messages.scrollTop + node.getBoundingClientRect().top - messages.getBoundingClientRect().top - anchor.offset :
    Math.max(0, snapshot.top + messages.scrollHeight - snapshot.height);
  chatPinnedToLatest = false;
  chatScrollFrame = null;
}
window.SofiaChatViewport = { capture:captureChatViewport, restore:restoreChatViewport };

function addMessage(text, who = 'sofia', imageRequestId = null, contactId = null) {
  if (!messages) return;

  const div = document.createElement('div');

  if(contactId)div.dataset.contactId=contactId;
  div.className = 'msg ' + who;
  div.textContent = text;

  messages.appendChild(div);

  if (imageRequestId) {
    div.dataset.portraitRequestId = imageRequestId;
    window.SofiaImages?.anchor(imageRequestId, div);
  }
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



let lastServerHistorySignature = '';
let historySyncTimer = null;
let historySyncInFlight = false;
let pendingCalendarAction = null;

function historySignature(history) {
  return JSON.stringify(history);
}

async function syncConversationFromServer({ silent = false } = {}) {
  if (isResponding || historySyncInFlight || (typeof navigator!=='undefined' && navigator.onLine===false)) return false;
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

    const serverHistory = data.history.filter(item =>
      item &&
      (item.role === 'user' || item.role === 'assistant') &&
      typeof item.content === 'string'
    ).map(({role,content,imageRequestId,contactId})=>({role,content,...(imageRequestId?{imageRequestId}:{}),...(contactId?{contactId}:{})})).slice(-MAX_STORED_MESSAGES);

    const localPending=(typeof conversationHistory!=='undefined'?conversationHistory:[]).filter(x=>x.delivery==='unconfirmed');
    if(localPending.length && !localPending.every(x=>serverHistory.some((s,i)=>s.role==='user'&&s.content===x.content&&serverHistory[i+1]?.role==='assistant'))){window.SofiaImages?.restore(data.images);return false;}
    void window.SofiaSocial?.sync();
    const signature = historySignature(serverHistory);
    if (signature === lastServerHistorySignature) { window.SofiaImages?.restore(data.images); return true; }

    lastServerHistorySignature = signature;
    conversationHistory = serverHistory;
    saveMemory();

    if (messages) {
      const viewport = captureChatViewport();
      restoringChat = true;
      try {
      messages.innerHTML = '';
      conversationHistory.forEach(item =>
        addMessage(item.content, item.role === 'user' ? 'user' : 'sofia', item.imageRequestId, item.contactId)
      );
      if (pendingCalendarAction) addCalendarDownload(pendingCalendarAction);
      window.SofiaImages?.restore(data.images);
      } finally { restoringChat = false; }
      restoreChatViewport(viewport);
      void window.SofiaSocial?.sync();
    }

    return true;
  } catch (error) {
    if (!silent) console.warn('History sync:', error);
    return false;
  } finally {
    historySyncInFlight = false;
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
window.addEventListener('sofia-social-updated',()=>{syncConversationFromServer({silent:true});});
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
      item.imageRequestId
    );
  });

  scrollChatToLatest('auto');

  window.addEventListener('load', () => {
    scrollChatToLatest('auto');
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
    const response=await fetch('/api/tts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
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

function chatFailureFeedback(status,code,actionPossible,resultReceived) {
  const busy=status===429 && code==='test_busy';
  const uncertainAction=!busy && actionPossible && !resultReceived;
  return {uncertainAction,statusLabel:status===429?(busy?'Bitte kurz warten':'Nutzungspause'):'Verbindungsfehler',message:busy?'Einen kleinen Moment, es läuft noch eine Anfrage. Bitte warte kurz.':status===429?'Ich brauche gerade eine kurze Pause. Bitte versuche es später noch einmal.':uncertainAction?'Die Verbindung ist gerade unterbrochen. Bitte prüfe zuerst den Aufgabenstand, bevor du die Aktion wiederholst.':'Meine Verbindung ist gerade unterbrochen. Sobald sie wieder da ist, können wir weiterreden.'};
}

async function askSofia(userMessage, imageDataUrl = null) {
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
    content: userMessage
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
          history: historyForAPI,
          image: imageDataUrl,
          referenceImageId: window.SofiaImages?.referenceId,
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
      const error=new Error('Sofia konnte nicht antworten.');error.status=response.status;error.code=response.status===429 && /^Ein Testaufruf läuft bereits/.test(data.error||'')?'test_busy':data.code;throw error;
    }

    updateSofiaLocation(data.life);
    actionResultReceived = true;
    window.SofiaActionFeedback?.show(data.taskAction);

    const reply =
      data.reply ||
      'Hm. Da ist gerade etwas schiefgelaufen.';

    conversationHistory=confirmLocalHistory(conversationHistory,data);
    conversationHistory.push({
      role: 'assistant',
      content: reply,
      ...(data.imageRequest ? { imageRequestId:data.imageRequest.id } : {})
    });

    saveMemory();

    applyMood(latestSofiaLife?.mood || data.mood);

    addMessage(
      reply,
      'sofia',
      data.imageRequest?.id
    );
    if (data.imageRequest) void window.SofiaImages?.generate(data.imageRequest);

    if (thought) {
      thought.textContent = reply;
    }

    if (mode) {
      mode.textContent = 'bereit';
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

    speak(reply);

  } catch (error) {
    console.warn('Sofia API Fehler',{code:error?.name==='TimeoutError'?'request_timeout':'request_failed',...(Number.isInteger(error?.status)?{status:error.status}:{})});

    const pendingTurn=conversationHistory.at(-1);
    if(pendingTurn?.role==='user'){pendingTurn.delivery='unconfirmed';saveMemory();}
    const actionPossible = /aufgabe|erinner|termin|kalender|erledig|lösch|verschieb|priorität|\b(?:ändere|änder|mach das|nochmal)\b/i.test(userMessage);
    const failure=chatFailureFeedback(error?.status,error?.code,actionPossible,actionResultReceived);
    if (failure.uncertainAction) window.SofiaActionFeedback?.show({ ok: false, status: 'execution_failed' });

    const errorMessage = failure.message;

    addMessage(
      errorMessage,
      'sofia'
    );

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

  addMessage(imageForRequest ? `📷 ${messageText}` : messageText, 'user');
  input.value = '';
  pendingCameraImage = null;
  document.querySelector('#cameraAttachment')?.remove();
  camera?.classList.remove('on');

  Promise.resolve(askSofia(messageText, imageForRequest))
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitChatMessage(event);
    }
  });
}

if (sendButton) {
  sendButton.addEventListener('click', event => {
    event.preventDefault();
    submitChatMessage(event);
  });
}

/* =========================
   MOBILE CHAT PANEL
========================= */

const CHAT_STATES = ['hidden', 'compact', 'full', 'compact'];
let chatStateStep = 1;

function applyChatState(state) {
  if (!chatPanel) return;
  const next = ['hidden', 'compact', 'full'].includes(state) ? state : 'compact';
  chatPanel.classList.toggle('chat-hidden', next === 'hidden');
  chatPanel.classList.toggle('minimized', next === 'compact');
  chatPanel.classList.toggle('chat-full', next === 'full');
  app?.classList.toggle('chat-is-hidden', next === 'hidden');

  if (chatMinimize) {
    chatMinimize.textContent = next === 'hidden' ? '▴' : next === 'full' ? '▾' : '•';
    chatMinimize.title = next === 'hidden' ? 'Chat einblenden' : next === 'compact' ? 'Chat vergrößern' : 'Chat verkleinern';
    chatMinimize.setAttribute('aria-expanded', next === 'hidden' ? 'false' : 'true');
  }
  if (next !== 'hidden') scrollChatToLatest('auto');
}

function setChatMinimized(minimized) {
  chatStateStep = minimized ? 1 : 2;
  applyChatState(minimized ? 'compact' : 'full');
}

if (chatMinimize) {
  chatMinimize.addEventListener('click', event => {
    event.preventDefault();

    // Querformat: Der Bedienbereich überlagert Sofia nicht.
    // Deshalb bleibt der Chat dort immer vollständig sichtbar.
    if (window.matchMedia('(orientation: landscape)').matches) {
      chatStateStep = 2;
      applyChatState('full');
      return;
    }

    chatStateStep = (chatStateStep + 1) % CHAT_STATES.length;
    applyChatState(CHAT_STATES[chatStateStep]);
  });
}


if (chatRestore) {
  chatRestore.addEventListener('click', event => {
    event.preventDefault();
    chatStateStep = 1;
    applyChatState('compact');
  });
}

function enforceLandscapeChat() {
  if (window.matchMedia('(orientation: landscape)').matches) {
    chatStateStep = 2;
    applyChatState('full');
  }
}

window.addEventListener('orientationchange', () => {
  window.setTimeout(enforceLandscapeChat, 120);
});
window.addEventListener('resize', enforceLandscapeChat);
enforceLandscapeChat();

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

  title.textContent =
    'Sofias Memory';

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
    'Memory schließen'
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

function openMemoryView() {
  createMemoryUI();

  memoryOverlay.style.display =
    'flex';

  document.body.style.overflow =
    'hidden';

  loadLongTermMemories();
}

function closeMemoryView() {
  if (!memoryOverlay) return;

  memoryOverlay.style.display =
    'none';

  document.body.style.overflow =
    '';
}

async function loadLongTermMemories() {
  if (
    !memoryList ||
    !memoryCount
  ) {
    return;
  }

  memoryList.replaceChildren();

  setMemoryStatus(
    'Memory wird geladen…'
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

    memoryCount.textContent =
      memories.length === 1
        ? '1 Langzeiterinnerung'
        : `${memories.length} Langzeiterinnerungen`;

    setMemoryStatus(
      '',
      false
    );

    if (
      memories.length === 0
    ) {
      renderEmptyMemory();
      renderCharacterMemories(data.character);
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
      renderMemoryItem(item.text, index, category);
    });
    renderCharacterMemories(data.character);

  } catch (error) {
    console.error(
      'Memory laden fehlgeschlagen:',
      error
    );

    memoryCount.textContent =
      'Langzeiterinnerungen';

    setMemoryStatus(
      'Memory konnte gerade nicht geladen werden.'
    );
  }
}

async function saveCharacterEdit(field,value,topic,revision=latestSofiaLife?.revision) {
  const response=await fetch('/api/memory',{method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'character',field,value,topic,revision})});
  if(response.status===401){window.location.reload();return false;}
  const data=await response.json();
  if(!response.ok){const error=data.error || 'Änderung konnte nicht gespeichert werden.';setMemoryStatus(error);const note=document.getElementById('moodStatus');if(note)note.textContent=error;return false;}
  updateSofiaLocation(data.character);const note=document.getElementById('moodStatus');if(note)note.textContent='';return true;
}

function renderCharacterMemories(character) {
  if(!character || !memoryList)return;
  updateSofiaLocation(character);
  const heading=document.createElement('h3');heading.textContent='Über Sofia';memoryList.append(heading);
  const note=document.createElement('p');note.textContent='Fiktiver Charakteralltag und eigene Vorlieben — getrennt von deinen Erinnerungen.';note.style.cssText='font-size:12px;opacity:.65';memoryList.append(note);
  const row=(label,value,field,topic,removable=false)=>{
    const item=document.createElement('div');item.style.cssText='padding:12px 0;border-top:1px solid rgba(255,255,255,.1)';
    const text=document.createElement('div');text.textContent=label+': '+value;item.append(text);
    const button=document.createElement('button');button.type='button';button.textContent='Bearbeiten';
    button.onclick=async()=>{const next=window.prompt(label+' bearbeiten:',value);if(next===null || !next.trim())return;button.disabled=true;try{if(await saveCharacterEdit(field,next,topic,character.revision))await loadLongTermMemories();}catch{setMemoryStatus('Änderung konnte nicht gespeichert werden.');}finally{button.disabled=false;}};item.append(button);
    if(removable){const remove=document.createElement('button');remove.type='button';remove.textContent='Entfernen';remove.onclick=async()=>{remove.disabled=true;try{if(await saveCharacterEdit(field,'',topic,character.revision))await loadLongTermMemories();}catch{setMemoryStatus('Änderung konnte nicht gespeichert werden.');}finally{remove.disabled=false;}};item.append(remove);}
    memoryList.append(item);return item;
  };
  for(const [field,label]of [['location','Ort'],['activity','Tätigkeit'],['outfit','Outfit'],['hairstyle','Frisur']])row(label,character[field]||'',field);
  const mood=document.createElement('p');mood.textContent='Stimmung: '+character.mood+' ('+(character.moodMode==='manual'?'manuell':'automatisch')+')';memoryList.append(mood);
  for(const pref of character.preferences||[])if(pref.value){const item=row('Vorliebe: '+pref.topic,pref.value,'preference',pref.topic,true);for(const event of pref.history||[]){const detail=document.createElement('small');detail.style.cssText='display:block;opacity:.65';detail.textContent=new Date(event.at).toLocaleDateString('de-DE')+': '+event.value+' — '+event.reason;item.append(detail);}}
  const settings=character.settings||{};
  const controls=document.createElement('div');controls.style.cssText='display:grid;gap:10px;padding:12px 0';
  const select=(label,choices,value)=>{const wrapper=document.createElement('label');wrapper.textContent=label+' ';const input=document.createElement('select');for(const [key,text]of choices){const option=document.createElement('option');option.value=key;option.textContent=text;input.append(option);}input.value=value;wrapper.append(input);controls.append(wrapper);return input;};
  const initiative=select('Gesprächsinitiative',[['quiet','Zurückhaltend'],['balanced','Ausgewogen'],['active','Aktiv']],settings.initiative||'balanced');
  const length=select('Antwortlänge',[['auto','Nach Bedarf'],['short','Kurz'],['detailed','Ausführlich']],settings.replyLength||'auto');
  const photoLabel=document.createElement('label'),photos=document.createElement('input');photos.type='checkbox';photos.checked=settings.photos!==false;photoLabel.textContent='Gelegentliche eigene Fotos (max. 2 pro Stunde) ';photoLabel.append(photos);controls.append(photoLabel);
  const save=document.createElement('button');save.type='button';save.textContent='Gesprächseinstellungen speichern';save.onclick=async()=>{save.disabled=true;try{if(await saveCharacterEdit('settings',{initiative:initiative.value,replyLength:length.value,photos:photos.checked},undefined,character.revision))await loadLongTermMemories();}catch{setMemoryStatus('Einstellungen konnten nicht gespeichert werden.');}finally{save.disabled=false;}};controls.append(save);memoryList.append(controls);
  const habits=document.createElement('p');habits.textContent='Gelernte Gesprächsgewohnheiten: '+((character.habits||[]).filter(x=>x.count>=2).map(x=>x.topic+': '+x.value).join('; ')||'noch keine');memoryList.append(habits);
  const reset=document.createElement('button');reset.type='button';reset.textContent='Gesprächsgewohnheiten zurücksetzen';reset.onclick=async()=>{try{if(await saveCharacterEdit('habits','reset',undefined,character.revision))await loadLongTermMemories();}catch{setMemoryStatus('Zurücksetzen nicht möglich.');}};memoryList.append(reset);
  for(const interest of character.interests||[])if(!interest.dismissed)row('Interesse: '+interest.topic,interest.progress||interest.description,'interest',interest.topic,true);
  const week=document.createElement('p');week.textContent='Wochenrahmen: '+(character.weekFrame?character.weekFrame.day+' — '+character.weekFrame.frame:'noch kein Eintrag');memoryList.append(week);
  const planHeading=document.createElement('h3');planHeading.textContent='Sofias eigene Vorhaben';memoryList.append(planHeading);
  const planLabels={planned:'Geplant',active:'In Arbeit',completed:'Abgeschlossen',paused:'Pausiert'};
  for(const plan of character.plans||[])if(!plan.dismissed){const item=row((planLabels[plan.status]||'Vorhaben')+': '+plan.topic,plan.text,'plan',plan.topic,true);for(const event of plan.history||[]){const detail=document.createElement('small');detail.style.cssText='display:block;opacity:.65';detail.textContent=new Date(event.at).toLocaleDateString('de-DE')+': '+(planLabels[event.status]||event.status)+' — '+event.reason;item.append(detail);}}
  const developmentHeading=document.createElement('h3');developmentHeading.textContent='Jüngste Entwicklungen';memoryList.append(developmentHeading);
  const developments=(character.development||[]).slice(-6).reverse();
  if(!developments.length){const empty=document.createElement('p');empty.textContent='Entwicklungen entstehen aus den Gesprächen.';memoryList.append(empty);}
  for(const event of developments){const entry=document.createElement('p');entry.textContent=new Date(event.at).toLocaleDateString('de-DE')+' · '+event.topic+': '+event.text+(event.reason?' — '+event.reason:'');memoryList.append(entry);}
  const phrases=document.createElement('p');phrases.textContent='Vertraute Gesprächsbezüge: '+((character.sharedPhrases||[]).filter(x=>x.count>=2).map(x=>x.text).join('; ')||'noch keine');memoryList.append(phrases);
  const resetPhrases=document.createElement('button');resetPhrases.type='button';resetPhrases.textContent='Vertraute Gesprächsbezüge zurücksetzen';resetPhrases.onclick=async()=>{try{if(await saveCharacterEdit('sharedPhrases','reset',undefined,character.revision))await loadLongTermMemories();}catch{setMemoryStatus('Zurücksetzen nicht möglich.');}};memoryList.append(resetPhrases);
  const threadHeading=document.createElement('h3');threadHeading.textContent='Persönliche Gesprächsfäden';memoryList.append(threadHeading);
  for(const thread of character.threads||[])if(thread.status!=='dismissed')row(thread.status==='resolved'?'Erledigt':'Offen',thread.text,'thread',thread.topic,true);
  const add=document.createElement('button');add.type='button';add.textContent='Sofias Vorliebe ergänzen';add.onclick=async()=>{const topic=window.prompt('Thema der Vorliebe:');if(!topic?.trim())return;const value=window.prompt('Sofias Vorliebe:');if(!value?.trim())return;try{if(await saveCharacterEdit('preference',value,topic,character.revision))await loadLongTermMemories();}catch{setMemoryStatus('Änderung konnte nicht gespeichert werden.');}};memoryList.append(add);
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
  category = 'Sonstiges'
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

  editButton.addEventListener('click', async () => {
    const next = window.prompt('Erinnerung bearbeiten:', memory);
    if (next == null || !next.trim()) return;

    const categories = [
      'Personen',
      'Vorlieben',
      'Projekte & Arbeit',
      'Ziele & Pläne',
      'Gewohnheiten',
      'Beziehung',
      'Persönliches',
      'Sonstiges'
    ];

    const categoryInput = window.prompt(
      'Kategorie bearbeiten:\n' + categories.join('\n'),
      category
    );

    if (categoryInput == null) return;

    const nextCategory = categoryInput.trim();
    if (!categories.includes(nextCategory)) {
      setMemoryStatus('Unbekannte Kategorie. Bitte eine vorhandene Kategorie verwenden.');
      return;
    }

    if (next.trim() === memory && nextCategory === category) return;

    editButton.disabled = true;
    editButton.textContent = '…';

    try {
      const response = await fetch('/api/memory', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          old_memory: memory,
          new_memory: next.trim(),
          category: nextCategory
        })
      });

      if (response.status === 401) {
        window.location.reload();
        return;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erinnerung konnte nicht geändert werden.');
      await loadLongTermMemories();
    } catch (error) {
      console.error('Memory bearbeiten fehlgeschlagen:', error);
      setMemoryStatus('Die Erinnerung konnte nicht geändert werden.');
      editButton.disabled = false;
      editButton.textContent = 'Bearbeiten';
    }
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
        deleteButton
      );
    }
  );

  textWrap.appendChild(categoryLabel);
  textWrap.appendChild(text);

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
  button
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
            memory
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

setToolsOpen(localStorage.getItem('sofia_tools_open') !== '0');

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



