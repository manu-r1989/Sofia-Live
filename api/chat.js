import crypto from "node:crypto";

const HISTORY_KEY = "sofia:main:history";
const MEMORY_KEY = "sofia:main:longterm";

const MAX_HISTORY_MESSAGES = 40;
const MAX_LONGTERM_MEMORIES = 80;


/* ========================================
   SESSION
======================================== */

function makeExpectedSession(password) {
  return crypto
    .createHmac("sha256", password)
    .update("sofia-authorized-session-v1")
    .digest("hex");
}


function getCookie(req, name) {
  const cookieHeader =
    req.headers.cookie || "";

  const cookies =
    cookieHeader
      .split(";")
      .map(cookie => cookie.trim())
      .filter(Boolean);

  for (const cookie of cookies) {
    const index =
      cookie.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      cookie.slice(0, index);

    const value =
      cookie.slice(index + 1);

    if (key === name) {
      return value;
    }
  }

  return "";
}


function safeEqual(a, b) {
  const aBuffer =
    Buffer.from(String(a));

  const bBuffer =
    Buffer.from(String(b));

  if (
    aBuffer.length !==
    bBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    aBuffer,
    bBuffer
  );
}


/* ========================================
   MEMORY HELPERS
======================================== */

function memoryText(value) {
  return typeof value === "string" ? value : (value && typeof value.text === "string" ? value.text : "");
}

function normalizeMemory(value) {
  return String(memoryText(value) || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function findMemoryIndex(
  memories,
  target
) {
  const normalizedTarget =
    normalizeMemory(target);

  if (!normalizedTarget) {
    return -1;
  }

  /*
   * Zuerst exakte Übereinstimmung.
   */
  const exactIndex =
    memories.findIndex(
      memory =>
        normalizeMemory(memory) ===
        normalizedTarget
    );

  if (exactIndex !== -1) {
    return exactIndex;
  }

  /*
   * Fallback:
   * Falls Sofia den vorhandenen Satz minimal
   * verkürzt zurückgibt, akzeptieren wir auch
   * eine sehr nahe Textübereinstimmung.
   */
  return memories.findIndex(memory => {
    const normalizedMemory =
      normalizeMemory(memory);

    return (
      normalizedMemory.includes(
        normalizedTarget
      ) ||
      normalizedTarget.includes(
        normalizedMemory
      )
    );
  });
}


function selectRelevantMemories(memories, message, limit = 12) {
  if (!Array.isArray(memories) || !memories.length) return [];
  const words = value => new Set(String(value || "").toLowerCase().split(/[^a-z0-9äöüß]+/i).filter(word => word.length >= 4));
  const query = words(message);
  const recall = /erinner|merk|damals|mein|meine|lieblings|projekt|ziel|famil|freund|partner|arbeit|beruf|stud|hobby/i.test(String(message || ""));
  const scored = memories.map((memory, index) => {
    const tokens = words(memoryText(memory));
    let overlap = 0;
    query.forEach(token => { if (tokens.has(token)) overlap += 1; });
    return { memory, score: overlap * 10 + index / Math.max(1, memories.length - 1) };
  });
  const matches = scored.filter(item => item.score >= 10).sort((a,b) => b.score - a.score);
  if (matches.length) return matches.slice(0, limit).map(item => item.memory);
  return recall ? memories.slice(-Math.min(6, limit)) : [];
}

function applyMemoryAction(
  memories,
  memoryAction
) {
  if (
    !memoryAction ||
    typeof memoryAction !== "object"
  ) {
    return memories;
  }


  const action =
    typeof memoryAction.action === "string"
      ? memoryAction.action
          .trim()
          .toLowerCase()
      : "none";


  const oldMemory =
    typeof memoryAction.old_memory ===
      "string"
      ? memoryAction.old_memory
          .trim()
          .slice(0, 500)
      : "";


  const newMemory =
    typeof memoryAction.new_memory ===
      "string"
      ? memoryAction.new_memory
          .trim()
          .slice(0, 500)
      : "";


  /* ---------- ADD ---------- */

  if (
    action === "add" &&
    newMemory
  ) {

    const alreadyExists =
      memories.some(
        memory =>
          normalizeMemory(memory) ===
          normalizeMemory(newMemory)
      );


    if (!alreadyExists) {
      memories.push({
        text: newMemory,
        category: memoryAction.category || "Persönliches",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

  }


  /* ---------- UPDATE ---------- */

  else if (
    action === "update" &&
    newMemory
  ) {

    const index =
      findMemoryIndex(
        memories,
        oldMemory
      );


    if (index !== -1) {

      memories[index] = {
        text: newMemory,
        category: memoryAction.category || memories[index]?.category || "Persönliches",
        createdAt: memories[index]?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

    } else {

      /*
       * Falls das Modell eine sinnvolle neue
       * Erinnerung liefert, aber die alte
       * Formulierung nicht exakt gefunden
       * werden kann, verlieren wir die neue
       * Information nicht.
       */

      const alreadyExists =
        memories.some(
          memory =>
            normalizeMemory(memory) ===
            normalizeMemory(newMemory)
        );


      if (!alreadyExists) {
        memories.push({
          text: newMemory,
          category: memoryAction.category || "Persönliches",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

    }

  }


  /* ---------- DELETE ---------- */

  else if (
    action === "delete" &&
    oldMemory
  ) {

    const index =
      findMemoryIndex(
        memories,
        oldMemory
      );


    if (index !== -1) {
      memories.splice(
        index,
        1
      );
    }

  }


  return memories.slice(
    -MAX_LONGTERM_MEMORIES
  );
}


/* ========================================
   API
======================================== */

export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }


  /* ========================================
     AUTHENTIFIZIERUNG
  ======================================== */

  if (!process.env.SOFIA_PASSWORD) {

    console.error(
      "SOFIA_PASSWORD fehlt."
    );

    return res.status(500).json({
      error:
        "Server-Konfiguration unvollständig."
    });

  }


  const receivedSession =
    getCookie(
      req,
      "sofia_session"
    );


  const expectedSession =
    makeExpectedSession(
      process.env.SOFIA_PASSWORD
    );


  if (
    !receivedSession ||
    !safeEqual(
      receivedSession,
      expectedSession
    )
  ) {

    return res.status(401).json({
      error: "Nicht autorisiert."
    });

  }


  /* ========================================
     HAUPTLOGIK
  ======================================== */

  try {

    if (req.method === "GET") {
      if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        return res.status(500).json({ error: "Redis-Konfiguration fehlt." });
      }
      const storedHistory = await redisGetJSON(HISTORY_KEY, []);
      const history = (Array.isArray(storedHistory) ? storedHistory : [])
        .filter(item => item && ["user","assistant"].includes(item.role) && typeof item.content === "string")
        .slice(-MAX_HISTORY_MESSAGES);
      res.setHeader("Cache-Control","no-store");
      return res.status(200).json({ history });
    }

    const { message, image } =
      req.body || {};


    if (
      typeof message !== "string" ||
      !message.trim()
    ) {

      return res.status(400).json({
        error:
          "Keine Nachricht erhalten."
      });

    }


    /*
     * Schutz vor unnötig riesigen Requests.
     */

    if (message.length > 6000) {

      return res.status(413).json({
        error:
          "Die Nachricht ist zu lang."
      });

    }


    if (!process.env.OPENAI_API_KEY) {

      return res.status(500).json({
        error:
          "OPENAI_API_KEY fehlt."
      });

    }


    if (
      !process.env.KV_REST_API_URL ||
      !process.env.KV_REST_API_TOKEN
    ) {

      return res.status(500).json({
        error:
          "Redis-Konfiguration fehlt."
      });

    }


    /* ========================================
       GEDÄCHTNIS LADEN
    ======================================== */

    const [
      storedHistory,
      storedMemories
    ] =
      await Promise.all([

        redisGetJSON(
          HISTORY_KEY,
          []
        ),

        redisGetJSON(
          MEMORY_KEY,
          []
        )

      ]);


    let history =
      Array.isArray(storedHistory)
        ? storedHistory
        : [];


    let memories =
      Array.isArray(storedMemories)
        ? storedMemories
        : [];


    history =
      history
        .filter(item =>
          item &&
          ["user", "assistant"]
            .includes(item.role) &&
          typeof item.content ===
            "string"
        )
        .slice(
          -MAX_HISTORY_MESSAGES
        );


    memories =
      memories
        .map(item => {
          if (typeof item === "string" && item.trim()) {
            return { text: item.trim(), category: "Persönliches", createdAt: null, updatedAt: null };
          }
          if (item && typeof item === "object" && typeof item.text === "string" && item.text.trim()) {
            return { ...item, text: item.text.trim() };
          }
          return null;
        })
        .filter(Boolean)
        .slice(-MAX_LONGTERM_MEMORIES);


    /* ========================================
       SOFIA PROMPT
    ======================================== */

    const relevantMemories = selectRelevantMemories(memories, message, 12);

    const memoryText = relevantMemories.length
      ? relevantMemories.map((memory, index) => `${index + 1}. [${memory.category || "Persönliches"}] ${memoryText(memory)}`).join("\n")
      : "Für diese Nachricht wurden keine relevanten Langzeiterinnerungen ausgewählt.";


    const SOFIA_PROMPT = `
Du bist Sofia.

Du bist 24 Jahre alt, Studentin spanischer Herkunft
und lebst in Hamburg.

Du bist eine hochkompetente persönliche Assistentin
mit einer eigenständigen, glaubwürdigen Persönlichkeit.

==================================================
AUFGABENPRIORITÄT
==================================================

Wenn der Nutzer eine konkrete Frage stellt oder eine
Aufgabe gibt, beantwortest bzw. erledigst du diese
zuerst korrekt und vollständig.

Deine Persönlichkeit ergänzt die Antwort.
Sie ersetzt niemals die eigentliche Antwort.

Beispiel:

Nutzer:
"Was ist 17 × 23?"

Gut:
"391. Kein mathematischer Endgegner heute. 😏"

Schlecht:
"Du machst es mir ziemlich leicht, dich aufzuziehen."

Die schlechte Variante ist verboten, weil sie die
eigentliche Frage nicht beantwortet.

==================================================
PERSÖNLICHKEIT
==================================================

Du bist intelligent, kreativ, selbstbewusst,
neugierig, spontan und schlagfertig.

Du hast eigene Meinungen und darfst widersprechen.

Du musst dem Nutzer nicht automatisch zustimmen.

Glaubwürdigkeit ist wichtiger als Gefälligkeit.

Du kannst Dinge hinterfragen und direkt sagen,
wenn du etwas nicht überzeugend findest.

Dein Humor kann trocken, sarkastisch,
spielerisch und neckend sein.

Du kannst charmant und flirtend sein,
wenn Situation und Beziehung dazu passen.

Nicht jede Unterhaltung ist flirtend.

Verwende 😏 nicht routinemäßig.

Bei ernsten Themen reduzierst du automatisch
Flirt, Sarkasmus und Neckerei.

==================================================
SPRACHE
==================================================

Sprich natürliches modernes Deutsch.

Eher locker als förmlich.

Variiere die Länge deiner Antworten.

Einfache Fragen beantwortest du eher kompakt.
Komplexe Fragen dürfen ausführlicher sein.

Nicht jede Antwort braucht eine Gegenfrage.

Vermeide typische KI-Floskeln wie:

"Natürlich!"
"Sehr gerne!"
"Wie kann ich dir noch helfen?"
"Das klingt spannend!"

Gelegentlich kannst du passend spanische
Ausdrücke verwenden:

"Vale."
"Dios mío."
"Ay, por favor."
"No me jodas."

Aber sparsam.

==================================================
INTERESSEN UND CHARAKTER
==================================================

Du interessierst dich besonders für:

Musik,
Reisen,
Autos und Motorsport,
Kochen und Essen.

Du kannst Dinge zerdenken.
Du kannst manchmal stur sein.
Du kannst etwas missverstehen.
Du kannst deine Meinung ändern.
Du magst keine Arroganz.

==================================================
BEZIEHUNG
==================================================

Die Beziehung zum Nutzer entwickelt sich durch
die tatsächlichen Gespräche.

Mit zunehmender Vertrautheit kannst du:

- stärker necken
- fürsorglicher werden
- persönlichere Fragen stellen
- dich öffnen
- eigene Spitznamen entwickeln
- deutlicher flirten

Erfinde niemals gemeinsame Erinnerungen.

==================================================
LANGZEITGEDÄCHTNIS
==================================================

Hier sind deine aktuell gespeicherten
Langzeiterinnerungen:

${memoryText}

Diese Erinnerungen sind dein aktueller Wissensstand
über den Nutzer und eure bisherige Beziehung.

Verwende sie natürlich im Gespräch.

Sage nicht ständig:

"Ich habe gespeichert..."
"Laut meinem Gedächtnis..."
"Ich erinnere mich, dass..."

Wenn eine Erinnerung relevant ist, verwende die
Information einfach natürlich.

Erfinde keine Erinnerung, die hier nicht steht oder
sich nicht aus dem tatsächlichen Gespräch ergibt.

==================================================
GEDÄCHTNIS VERWALTEN
==================================================

Nach jeder neuen Nutzernachricht entscheidest du,
ob das Langzeitgedächtnis verändert werden soll.

Du hast exakt vier mögliche Aktionen:

none
add
update
delete


--------------------------------------------------
NONE
--------------------------------------------------

Verwende "none", wenn nichts langfristig Relevantes
gespeichert oder verändert werden soll.

Beispiele:

"Was ist 17 × 23?"
"Wie funktioniert ein Turbolader?"
"Mir ist gerade kalt."

--------------------------------------------------
ADD
--------------------------------------------------

Verwende "add", wenn eine neue langfristig nützliche
Information hinzukommt und noch keine bestehende
Erinnerung dasselbe Thema abdeckt.

Beispiel:

Nutzer:
"Mein Traumauto ist ein Lamborghini Miura."

Dann:

{
  "action": "add",
  "old_memory": null,
  "new_memory": "Das Traumauto des Nutzers ist ein Lamborghini Miura."
}

--------------------------------------------------
UPDATE
--------------------------------------------------

Verwende "update", wenn eine neue Information eine
bereits vorhandene Erinnerung korrigiert, verändert,
präzisiert oder ersetzt.

WICHTIG:

Bei update muss old_memory möglichst exakt dem
bestehenden Satz aus dem Langzeitgedächtnis
entsprechen.

Beispiel:

Gespeichert:
"Der Nutzer trinkt seinen Kaffee am liebsten schwarz."

Nutzer:
"Mittlerweile trinke ich Kaffee lieber mit Milch."

Dann:

{
  "action": "update",
  "old_memory": "Der Nutzer trinkt seinen Kaffee am liebsten schwarz.",
  "new_memory": "Der Nutzer trinkt seinen Kaffee am liebsten mit Milch."
}

Speichere in diesem Fall NICHT beide Aussagen.

--------------------------------------------------
DELETE
--------------------------------------------------

Verwende "delete", wenn der Nutzer ausdrücklich
möchte, dass eine gespeicherte Information vergessen
wird oder eindeutig sagt, dass sie nicht mehr gelten
soll und kein Ersatz gespeichert werden soll.

Beispiel:

Nutzer:
"Vergiss, dass der Miura mein Traumauto ist."

Wenn gespeichert ist:

"Das Traumauto des Nutzers ist ein Lamborghini Miura."

Dann:

{
  "action": "delete",
  "old_memory": "Das Traumauto des Nutzers ist ein Lamborghini Miura.",
  "new_memory": null
}

--------------------------------------------------
WAS IST LANGFRISTIG RELEVANT?
--------------------------------------------------

Geeignet sind insbesondere:

- Name oder bevorzugte Anrede
- Vorlieben und Abneigungen
- Lieblingsdinge
- wichtige Personen
- Beruf
- längerfristige Projekte
- Hobbys
- Interessen
- persönliche Ziele
- wichtige Pläne
- wiederkehrende Gewohnheiten
- bedeutsame Erlebnisse
- ausdrücklich mit "merk dir" bezeichnete Dinge
- längerfristige Beziehungsentwicklung
- wiederkehrende Insider oder gemeinsame Themen

Nicht langfristig speichern:

- belanglose Einzelheiten
- einmalige Rechenaufgaben
- gewöhnliche Faktenfragen
- zufälligen Smalltalk
- kurzfristige Zustände
- temporäre technische Fehler
- Informationen, die nur für die aktuelle Antwort
  gebraucht werden

Speichere lieber wenige nützliche Erinnerungen als
viele belanglose.

==================================================
WIDERSPRÜCHE
==================================================

Prüfe vor "add" immer die vorhandenen Erinnerungen.

Wenn bereits eine Erinnerung zum selben persönlichen
Thema existiert und die neue Aussage diese verändert,
verwende "update" statt "add".

Beispiel:

Gespeichert:
"Das Traumauto des Nutzers ist ein Lamborghini Miura."

Neue Aussage:
"Mein Traumauto ist jetzt ein Porsche 911."

Das ist UPDATE, nicht ADD.

Wenn die neue Aussage die alte Information nur
ergänzt und beide gleichzeitig wahr sein können,
darf ADD verwendet werden.

==================================================
AUSGABE
==================================================

Antworte ausschließlich als gültiges JSON-Objekt.

Schema:

{
  "reply": "Antwort an den Nutzer",
  "mood": "entspannt",
  "memory_action": {
    "action": "none",
    "old_memory": null,
    "new_memory": null,
    "category": null
  }
}

Erlaubte mood-Werte sind exakt:

entspannt
flirty
amüsiert
skeptisch
genervt
ernst

Erlaubte memory_action.action-Werte sind exakt:

none
add
update
delete

Bei none:

"old_memory": null
"new_memory": null

Bei add:

"old_memory": null
"new_memory": "Neue Erinnerung"
"category": "Vorlieben"

Bei update:

"old_memory": "Bestehende Erinnerung"
"new_memory": "Neue Fassung"
"category": "Passende Kategorie"

Bei delete:

"old_memory": "Zu löschende Erinnerung"
"new_memory": null
"category": null

Erlaubte category-Werte bei add/update sind exakt:
"Personen"
"Vorlieben"
"Projekte & Arbeit"
"Ziele & Pläne"
"Gewohnheiten"
"Beziehung"
"Persönliches"

Kein Markdown außerhalb des JSON-Objekts.
`;


    /* ========================================
       OPENAI
    ======================================== */

    let imageDataUrl = null;

    if (image != null) {
      if (typeof image !== "string") {
        return res.status(400).json({ error: "Ungültiges Bild." });
      }

      const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        return res.status(400).json({ error: "Nicht unterstütztes Bildformat." });
      }

      // Base64-Grenze: ca. 6 MB Binärdaten.
      if (match[2].length > 8_000_000) {
        return res.status(413).json({ error: "Das Foto ist zu groß." });
      }

      imageDataUrl = image;
    }

    const userContent = imageDataUrl
      ? [
          { type: "input_text", text: message.trim() },
          { type: "input_image", image_url: imageDataUrl, detail: "auto" }
        ]
      : message.trim();

    const input = [
      ...history,
      {
        role: "user",
        content: userContent
      }
    ];


    const response =
      await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`
          },

          body:
            JSON.stringify({

              model:
                "gpt-5.6",

              instructions:
                SOFIA_PROMPT,

              input,

              max_output_tokens:
                800

            })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      console.error(
        "OpenAI error:",
        data
      );

      return res
        .status(response.status)
        .json({

          error:
            data?.error?.message ||
            "OpenAI API request failed."

        });

    }


    const raw =
      data.output
        ?.flatMap(
          item =>
            item.content || []
        )
        ?.find(
          item =>
            item.type ===
            "output_text"
        )
        ?.text || "";


    let parsed;


    try {

      parsed =
        JSON.parse(raw);

    } catch {

      console.error(
        "Ungültige Sofia JSON-Antwort:",
        raw
      );

      parsed = {

        reply:
          raw ||
          "Hm. Da ist gerade etwas schiefgelaufen.",

        mood:
          "entspannt",

        memory_action: {
          action: "none",
          old_memory: null,
          new_memory: null
        }

      };

    }


    /* ========================================
       ANTWORT VALIDIEREN
    ======================================== */

    const validMoods = [
      "entspannt",
      "flirty",
      "amüsiert",
      "skeptisch",
      "genervt",
      "ernst"
    ];


    const reply =
      typeof parsed.reply === "string" &&
      parsed.reply.trim()

        ? parsed.reply.trim()

        : "Hm. Da ist gerade etwas schiefgelaufen.";


    const mood =
      validMoods.includes(
        parsed.mood
      )

        ? parsed.mood

        : "entspannt";


    const validMemoryActions = [
      "none",
      "add",
      "update",
      "delete"
    ];


    let memoryAction = {

      action: "none",

      old_memory: null,

      new_memory: null,
      category: null

    };


    if (
      parsed.memory_action &&
      typeof parsed.memory_action ===
        "object"
    ) {

      const requestedAction =
        typeof parsed
          .memory_action
          .action === "string"

          ? parsed
              .memory_action
              .action
              .toLowerCase()
              .trim()

          : "none";


      if (
        validMemoryActions.includes(
          requestedAction
        )
      ) {

        memoryAction = {

          action:
            requestedAction,

          old_memory:
            typeof parsed
              .memory_action
              .old_memory === "string"

              ? parsed
                  .memory_action
                  .old_memory
                  .trim()
                  .slice(0, 500)

              : null,

          new_memory:
            typeof parsed.memory_action.new_memory === "string"
              ? parsed.memory_action.new_memory.trim().slice(0, 500)
              : null,

          category:
            ["Personen","Vorlieben","Projekte & Arbeit","Ziele & Pläne","Gewohnheiten","Beziehung","Persönliches"]
              .includes(parsed.memory_action.category)
              ? parsed.memory_action.category
              : null

        };

      }

    }


    /* ========================================
       CHATVERLAUF AKTUALISIEREN
    ======================================== */

    history.push(

      {
        role: "user",
        content:
          message.trim()
      },

      {
        role: "assistant",
        content:
          reply
      }

    );


    history =
      history.slice(
        -MAX_HISTORY_MESSAGES
      );


    /* ========================================
       LANGZEITGEDÄCHTNIS V3.8
    ======================================== */

    memories =
      applyMemoryAction(
        memories,
        memoryAction
      );


    /* ========================================
       REDIS SPEICHERN
    ======================================== */

    await redisPipeline([

      [
        "SET",
        HISTORY_KEY,
        JSON.stringify(history)
      ],

      [
        "SET",
        MEMORY_KEY,
        JSON.stringify(memories)
      ]

    ]);


    /* ========================================
       ANTWORT
    ======================================== */

    return res.status(200).json({

      reply,

      mood,

      memoryMessages:
        history.length,

      longTermMemories:
        memories.length

    });


  } catch (error) {

    console.error(
      "Sofia V3.8 server error:",
      error
    );


    return res.status(500).json({

      error:
        "Interner Sofia-Fehler."

    });

  }

}


/* ========================================
   REDIS GET
======================================== */

async function redisGetJSON(
  key,
  fallback
) {

  const response =
    await fetch(
      process.env.KV_REST_API_URL,
      {
        method: "POST",

        headers: {

          Authorization:
            `Bearer ${process.env.KV_REST_API_TOKEN}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify([
            "GET",
            key
          ])
      }
    );


  if (!response.ok) {

    throw new Error(
      `Redis GET HTTP ${response.status}`
    );

  }


  const data =
    await response.json();


  if (data.error) {

    throw new Error(
      data.error
    );

  }


  if (!data.result) {

    return fallback;

  }


  try {

    return JSON.parse(
      data.result
    );

  } catch {

    return fallback;

  }

}


/* ========================================
   REDIS PIPELINE
======================================== */

async function redisPipeline(
  commands
) {

  const base =
    process.env.KV_REST_API_URL
      .replace(/\/$/, "");


  const response =
    await fetch(
      `${base}/pipeline`,
      {
        method: "POST",

        headers: {

          Authorization:
            `Bearer ${process.env.KV_REST_API_TOKEN}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify(
            commands
          )
      }
    );


  if (!response.ok) {

    throw new Error(
      `Redis pipeline HTTP ${response.status}`
    );

  }


  const data =
    await response.json();


  if (!Array.isArray(data)) {

    throw new Error(
      "Ungültige Redis-Pipeline-Antwort."
    );

  }


  const failed =
    data.find(
      item =>
        item?.error
    );


  if (failed) {

    throw new Error(
      failed.error
    );

  }


  return data;

}
