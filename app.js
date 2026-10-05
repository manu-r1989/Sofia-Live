const app = document.querySelector('#app');
const messages = document.querySelector('#messages');
const input = document.querySelector('#input');
const form = document.querySelector('#form');
const mode = document.querySelector('#mode');
const thought = document.querySelector('#thought');

let voiceOn = true;
let isResponding = false;
const conversationHistory = [];

function addMessage(text, who = 'sofia') {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function applyMood(mood) {
  const validMoods = [
    'entspannt',
    'flirty',
    'amüsiert',
    'skeptisch',
    'genervt',
    'ernst'
  ];

  const next = validMoods.includes(mood)
    ? mood
    : 'entspannt';

  app.dataset.mood = next;

  document.querySelectorAll('[data-mood]').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.mood === next
    );
  });
}

function speak(text) {
  if (!voiceOn || !('speechSynthesis' in window)) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(
    text.replace(/[😏😂🙄]/g, '')
  );

  utterance.lang = 'de-DE';
  utterance.rate = 0.96;
  utterance.pitch = 1.08;

  utterance.onstart = () => {
    app.dataset.speaking = 'true';
    if (mode) mode.textContent = 'spricht…';
  };

  utterance.onend = () => {
    app.dataset.speaking = 'false';
    if (mode) mode.textContent = 'bereit';
  };

  speechSynthesis.speak(utterance);
}

async function askSofia(userMessage) {
  if (isResponding) return;

  isResponding = true;
  input.disabled = true;

  if (mode) mode.textContent = 'denkt nach…';
  if (thought) thought.textContent = '…';

  try {
    console.log('Sende Nachricht an /api/chat:', userMessage);

    const response = await fetch('/api/chat', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        message: userMessage,
        history: conversationHistory.slice(-16)
      })
    });

    console.log('API Status:', response.status);

    const data = await response.json();

    console.log('API Antwort:', data);

    if (!response.ok) {
      throw new Error(
        data.error || 'Sofia konnte nicht antworten.'
      );
    }

    const reply =
      data.reply ||
      'Hm. Da ist gerade etwas schiefgelaufen.';

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

    if (conversationHistory.length > 32) {
      conversationHistory.splice(
        0,
        conversationHistory.length - 32
      );
    }

    applyMood(data.mood);

    addMessage(reply, 'sofia');

    if (thought) thought.textContent = reply;
    if (mode) mode.textContent = 'bereit';

    speak(reply);

  } catch (error) {
    console.error('Sofia API Fehler:', error);

    const errorMessage =
      'Okay… meine Verbindung ist gerade weg. Versuch es noch einmal. 🙄';

    addMessage(errorMessage, 'sofia');

    if (thought) thought.textContent = errorMessage;
    if (mode) mode.textContent = 'Verbindungsfehler';

  } finally {
    isResponding = false;
    input.disabled = false;
    input.focus();
  }
}

if (!form) {
  console.error('FEHLER: #form wurde nicht gefunden.');
}

if (!input) {
  console.error('FEHLER: #input wurde nicht gefunden.');
}

form.addEventListener('submit', event => {
  event.preventDefault();

  const value = input.value.trim();

  if (!value || isResponding) return;

  addMessage(value, 'user');

  input.value = '';

  askSofia(value);
});


/* ---------- MOOD BUTTONS ---------- */

document.querySelectorAll('[data-mood]').forEach(button => {
  button.addEventListener('click', () => {
    applyMood(button.dataset.mood);
  });
});


/* ---------- VOICE ---------- */

const voiceToggle =
  document.querySelector('#voiceToggle');

if (voiceToggle) {
  voiceToggle.onclick = event => {
    voiceOn = !voiceOn;

    event.currentTarget.classList.toggle(
      'active',
      voiceOn
    );

    if (!voiceOn && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  };
}


const mute =
  document.querySelector('#mute');

if (mute) {
  mute.onclick = event => {
    voiceOn = !voiceOn;

    event.currentTarget.classList.toggle(
      'on',
      !voiceOn
    );

    if (!voiceOn && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  };
}


/* ---------- FOCUS ---------- */

const focus =
  document.querySelector('#focus');

if (focus) {
  focus.onclick = event => {
    app.classList.toggle('focus');
    event.currentTarget.classList.toggle('on');
  };
}


/* ---------- CAMERA ---------- */

const camera =
  document.querySelector('#camera');

if (camera) {
  camera.onclick = event => {
    event.currentTarget.classList.toggle('on');

    if (thought) {
      thought.textContent =
        event.currentTarget.classList.contains('on')
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

if (mic && SpeechRecognition) {

  const recognition =
    new SpeechRecognition();

  recognition.lang = 'de-DE';
  recognition.interimResults = false;

  recognition.onstart = () => {
    mic.classList.add('active');

    if (mode) {
      mode.textContent = 'hört zu…';
    }
  };

  recognition.onend = () => {
    mic.classList.remove('active');

    if (!isResponding && mode) {
      mode.textContent = 'bereit';
    }
  };

  recognition.onresult = event => {
    input.value =
      event.results[0][0].transcript;

    form.requestSubmit();
  };

  mic.onclick = () => {
    recognition.start();
  };

} else if (mic) {

  mic.onclick = () => {
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
    new Date().toLocaleTimeString(
      'de-DE',
      {
        hour: '2-digit',
        minute: '2-digit'
      }
    );
}

updateClock();
setInterval(updateClock, 1000);

console.log('Sofia V3.2 Frontend geladen.');
