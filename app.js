const app = document.querySelector('#app');
const messages = document.querySelector('#messages');
const input = document.querySelector('#input');
const form = document.querySelector('#form');
const mode = document.querySelector('#mode');
const thought = document.querySelector('#thought');

const MEMORY_KEY = 'sofia_memory';
const MAX_STORED_MESSAGES = 100;
const MAX_API_HISTORY = 20;

let voiceOn = true;
let isResponding = false;

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

function addMessage(text, who = 'sofia') {
  if (!messages) return;

  const div = document.createElement('div');

  div.className = 'msg ' + who;
  div.textContent = text;

  messages.appendChild(div);

  messages.scrollTop =
    messages.scrollHeight;
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

async function askSofia(userMessage) {
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
          history: historyForAPI
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

if (form && input) {
  form.addEventListener(
    'submit',
    event => {
      event.preventDefault();

      const value =
        input.value.trim();

      if (
        !value ||
        isResponding
      ) {
        return;
      }

      addMessage(
        value,
        'user'
      );

      input.value = '';

      askSofia(value);
    }
  );
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
   VOICE BUTTONS
========================= */

const voiceToggle =
  document.querySelector('#voiceToggle');

if (voiceToggle) {
  voiceToggle.onclick =
    event => {
      voiceOn =
        !voiceOn;

      event.currentTarget
        .classList.toggle(
          'active',
          voiceOn
        );

      if (
        !voiceOn &&
        'speechSynthesis' in window
      ) {
        speechSynthesis.cancel();
      }
    };
}

const mute =
  document.querySelector('#mute');

if (mute) {
  mute.onclick =
    event => {
      voiceOn =
        !voiceOn;

      event.currentTarget
        .classList.toggle(
          'on',
          !voiceOn
        );

      if (
        !voiceOn &&
        'speechSynthesis' in window
      ) {
        speechSynthesis.cancel();
      }
    };
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
   CAMERA
========================= */

const camera =
  document.querySelector('#camera');

if (camera) {
  camera.onclick =
    event => {
      event.currentTarget
        .classList.toggle('on');

      if (thought) {
        thought.textContent =
          event.currentTarget
            .classList.contains('on')
            ? 'Kamera-Modus aktiv. 👀'
            : 'Kamera-Modus aus.';
      }
    };
}

/* =========================
   MICROPHONE
========================= */

const mic =
  document.querySelector('#mic');

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (
  mic &&
  SpeechRecognition
) {
  const recognition =
    new SpeechRecognition();

  recognition.lang =
    'de-DE';

  recognition.interimResults =
    false;

  recognition.onstart =
    () => {
      mic.classList.add(
        'active'
      );

      if (mode) {
        mode.textContent =
          'hört zu…';
      }
    };

  recognition.onend =
    () => {
      mic.classList.remove(
        'active'
      );

      if (
        !isResponding &&
        mode
      ) {
        mode.textContent =
          'bereit';
      }
    };

  recognition.onresult =
    event => {
      if (!input) return;

      input.value =
        event.results[0][0]
          .transcript;

      form.requestSubmit();
    };

  mic.onclick =
    () => {
      recognition.start();
    };

} else if (mic) {
  mic.onclick =
    () => {
      if (thought) {
        thought.textContent =
          'Spracheingabe wird von diesem Browser nicht unterstützt.';
      }
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
