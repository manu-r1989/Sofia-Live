const app = document.querySelector('#app');
const messages = document.querySelector('#messages');
const input = document.querySelector('#input');
const form = document.querySelector('#form');
const mode = document.querySelector('#mode');
const thought = document.querySelector('#thought');
const sendButton = document.querySelector('#sendButton');
const chatPanel = document.querySelector('.chatPanel');
const chatMinimize = document.querySelector('#chatMinimize');

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
    );

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

function scrollChatToLatest(behavior = 'auto') {
  if (!messages) return;

  const run = () => {
    messages.scrollTo({
      top: messages.scrollHeight,
      behavior
    });
  };

  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
}

function addMessage(text, who = 'sofia') {
  if (!messages) return;

  const div = document.createElement('div');

  div.className = 'msg ' + who;
  div.textContent = text;

  messages.appendChild(div);

  scrollChatToLatest('smooth');
}

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
        : 'sofia'
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

  document
    .querySelectorAll('[data-mood]')
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

function speak(text) {
  if (
    !voiceOn ||
    !('speechSynthesis' in window)
  ) {
    return;
  }

  speechSynthesis.cancel();

  const utterance =
    new SpeechSynthesisUtterance(
      text.replace(/[😏😂🙄]/g, '')
    );

  utterance.lang = 'de-DE';
  utterance.rate = 0.96;
  utterance.pitch = 1.08;

  utterance.onstart = () => {
    if (app) {
      app.dataset.speaking = 'true';
    }

    if (mode) {
      mode.textContent = 'spricht…';
    }
  };

  utterance.onend = () => {
    if (app) {
      app.dataset.speaking = 'false';
    }

    if (mode) {
      mode.textContent = 'bereit';
    }
  };

  speechSynthesis.speak(utterance);
}

/* =========================
   SOFIA API
========================= */

async function askSofia(userMessage, imageDataUrl = null) {
  if (isResponding) return;

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

  conversationHistory.push({
    role: 'user',
    content: userMessage
  });

  saveMemory();

  try {
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

        body: JSON.stringify({
          message: userMessage,
          history: historyForAPI,
          image: imageDataUrl
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
      throw new Error(
        data.error ||
        'Sofia konnte nicht antworten.'
      );
    }

    const reply =
      data.reply ||
      'Hm. Da ist gerade etwas schiefgelaufen.';

    conversationHistory.push({
      role: 'assistant',
      content: reply
    });

    saveMemory();

    applyMood(data.mood);

    addMessage(
      reply,
      'sofia'
    );

    if (thought) {
      thought.textContent = reply;
    }

    if (mode) {
      mode.textContent = 'bereit';
    }

    speak(reply);

  } catch (error) {
    console.error(
      'Sofia API Fehler:',
      error
    );

    const errorMessage =
      'Okay… meine Verbindung ist gerade weg. Versuch es noch einmal. 🙄';

    addMessage(
      errorMessage,
      'sofia'
    );

    if (thought) {
      thought.textContent =
        errorMessage;
    }

    if (mode) {
      mode.textContent =
        'Verbindungsfehler';
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

function setChatMinimized(minimized) {
  if (!chatPanel) return;

  chatPanel.classList.toggle('minimized', Boolean(minimized));

  if (chatMinimize) {
    chatMinimize.textContent = minimized ? '▴' : '▾';
    chatMinimize.title = minimized ? 'Chat anzeigen' : 'Chat minimieren';
    chatMinimize.setAttribute('aria-expanded', minimized ? 'false' : 'true');
  }

  if (!minimized) {
    scrollChatToLatest('auto');
  }
}

if (chatMinimize) {
  chatMinimize.addEventListener('click', event => {
    event.preventDefault();
    setChatMinimized(!chatPanel?.classList.contains('minimized'));
  });
}

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

    const memories =
      Array.isArray(data.memories)
        ? data.memories
        : [];

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
      return;
    }

    memories.forEach(
      (memory, index) => {
        renderMemoryItem(
          memory,
          index
        );
      }
    );

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
  index
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

  const text =
    document.createElement('div');

  text.textContent =
    memory;

  Object.assign(
    text.style,
    {
      flex: '1',
      paddingTop: '3px',
      color:
        'rgba(255,255,255,0.9)',
      fontSize: '14px',
      lineHeight: '1.45',
      wordBreak: 'break-word'
    }
  );

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

  item.appendChild(number);
  item.appendChild(text);
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
  document.querySelector(
    '[data-view="memory"]'
  );

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
   MOOD BUTTONS
========================= */

document
  .querySelectorAll('[data-mood]')
  .forEach(button => {
    button.addEventListener(
      'click',
      () => {
        applyMood(
          button.dataset.mood
        );
      }
    );
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

restoreConversation();

console.log(
  `Sofia V3.9 gestartet. Lokaler Chat: ${conversationHistory.length} Nachrichten.`
);
