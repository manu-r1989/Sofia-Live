const app = document.querySelector('#app');
const messages = document.querySelector('#messages');
const input = document.querySelector('#input');
const form = document.querySelector('#form');
const mode = document.querySelector('#mode');
const thought = document.querySelector('#thought');

const MEMORY_KEY = 'sofia_conversation_v33';
const MAX_STORED_MESSAGES = 100;
const MAX_API_HISTORY = 20;

let voiceOn = true;
let isResponding = false;
let conversationHistory = loadMemory();

/* ---------- MEMORY ---------- */

function loadMemory() {
  try {
    const saved = localStorage.getItem(MEMORY_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(item =>
      item &&
      ['user', 'assistant'].includes(item.role) &&
      typeof item.content === 'string'
    );
  } catch (error) {
    console.error('Sofia Memory konnte nicht geladen werden:', error);
    return [];
  }
}

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
  } catch (error) {
    console.error('Sofia Memory konnte nicht gespeichert werden:', error);
  }
}

function clearMemory() {
  conversationHistory = [];
  localStorage.removeItem(MEMORY_KEY);
  console.log('Sofia Memory gelöscht.');
}

/* ---------- CHAT ---------- */

function addMessage(text, who = 'sofia') {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = text;

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function restoreConversation() {
  if (!messages || conversationHistory.length === 0) return;

  conversationHistory.forEach(item => {
    addMessage(
      item.content,
      item.role === 'user' ? 'user' : 'sofia'
    );
  });

  console.log(
    `Sofia V3.3: ${conversationHistory.length} gespeicherte Nachrichten geladen.`
  );
}

/* ---------- MOOD ---------- */

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

  document.querySelectorAll('[data-mood]').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.mood === next
    );
  });
}

/* ---------- VOICE ---------- */

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

/* ---------- API ---------- */

async function askSofia(userMessage) {
  if (isResponding) return;

  isResponding = true;
  input.disabled = true;

  if (mode) {
    mode.textContent = 'denkt nach…';
  }

  if (thought) {
    thought.textContent = '…';
  }

  try {
    const historyForAPI =
      conversationHistory.slice(-MAX_API_HISTORY);

    console.log(
      'Sende Nachricht an Sofia:',
      userMessage
    );

    const response =
      await fetch('/api/chat', {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          message: userMessage,
          history: historyForAPI
        })
      });

    console.log(
      'Sofia API Status:',
      response.status
    );

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

    /* Antwort jetzt dauerhaft speichern */

    conversationHistory.push(
      {
        role: 'user',
        content: userMessage
      },
      {
        role: 'assistant',
        content: reply
      }
    );

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
    input.disabled = false;
    input.focus();
  }
}

/* ---------- SEND ---------- */

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

/* ---------- MOOD BUTTONS ---------- */

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

/* ---------- VOICE BUTTON ---------- */

const voiceToggle =
  document.querySelector('#voiceToggle');

if (voiceToggle) {
  voiceToggle.onclick =
    event => {

      voiceOn = !voiceOn;

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

      voiceOn = !voiceOn;

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

/* ---------- FOCUS ---------- */

const focus =
  document.querySelector('#focus');

if (focus) {
  focus.onclick =
    event => {

      app.classList.toggle(
        'focus'
      );

      event.currentTarget
        .classList.toggle(
          'on'
        );
    };
}

/* ---------- CAMERA ---------- */

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

/* ---------- MICROPHONE ---------- */

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

/* ---------- CLOCK ---------- */

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

/* ---------- START ---------- */

restoreConversation();

console.log(
  'Sofia V3.3 mit lokalem Gedächtnis geladen.'
);

/*
  Falls du Sofias lokales Gedächtnis
  irgendwann manuell löschen möchtest:

  Öffne die Browser-Konsole und führe aus:

  localStorage.removeItem('sofia_conversation_v33')
*/
