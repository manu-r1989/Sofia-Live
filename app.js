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
   MEMORY
========================= */

function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);

    if (!raw) {
      console.log('Sofia Memory: noch kein Speicher vorhanden.');
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

  const div =
    document.createElement('div');

  div.className =
    'msg ' + who;

  div.textContent =
    text;

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

  /*
    Vorhandene Begrüßung im HTML bleibt bestehen.
    Danach wird die gespeicherte Unterhaltung geladen.
  */

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
    mode.textContent =
      'denkt nach…';
  }

  if (thought) {
    thought.textContent = '…';
  }

  /*
    WICHTIG:
    Die User-Nachricht wird JETZT sofort
    gespeichert – noch bevor die API
    aufgerufen wird.
  */

  conversationHistory.push({
    role: 'user',
    content: userMessage
  });

  saveMemory();

  try {

    /*
      Die letzte Nachricht ist bereits
      conversationHistory enthalten.

      Deshalb schicken wir sie NICHT noch
      einmal als separate History-Nachricht
      plus message doppelt.

      /api/chat erwartet allerdings message
      separat. Deshalb entfernen wir die
      aktuelle Nachricht aus historyForAPI.
    */

    const historyForAPI =
      conversationHistory
        .slice(0, -1)
        .slice(-MAX_API_HISTORY);

    const response =
      await fetch('/api/chat', {

        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          message: userMessage,
          history: historyForAPI
        })
      });

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

    /*
      Sofia-Antwort ebenfalls
      sofort dauerhaft speichern.
    */

    conversationHistory.push({
      role: 'assistant',
      content: reply
    });

    saveMemory();

    applyMood(
      data.mood
    );

    addMessage(
      reply,
      'sofia'
    );

    if (thought) {
      thought.textContent =
        reply;
    }

    if (mode) {
      mode.textContent =
        'bereit';
    }

    speak(reply);

  } catch (error) {

    console.error(
      'Sofia API Fehler:',
      error
    );

    /*
      User-Nachricht bleibt gespeichert.
      Das ist absichtlich so.
    */

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
  `Sofia V3.4 gestartet. Memory: ${conversationHistory.length} Nachrichten.`
);
