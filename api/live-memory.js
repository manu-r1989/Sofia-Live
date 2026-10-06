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
  const header =
    req.headers.cookie || "";

  for (const cookie of header.split(";")) {
    const trimmed =
      cookie.trim();

    const index =
      trimmed.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      trimmed.slice(0, index);

    const value =
      trimmed.slice(index + 1);

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


function isAuthorized(req) {
  const password =
    process.env.SOFIA_PASSWORD;

  if (!password) {
    return false;
  }

  const received =
    getCookie(
      req,
      "sofia_session"
    );

  if (!received) {
    return false;
  }

  const expected =
    makeExpectedSession(
      password
    );

  return safeEqual(
    received,
    expected
  );
}


/* ========================================
   MEMORY HELPERS
======================================== */

function getMemoryText(value) {
  return typeof value === "string" ? value : (value && typeof value.text === "string" ? value.text : "");
}

function normalizeMemory(value) {
  return String(getMemoryText(value) || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function memorySimilarity(a, b) {
  const tokens = value =>
    new Set(
      normalizeMemory(value)
        .split(/[^a-z0-9äöüß]+/i)
        .filter(token => token.length >= 3)
    );

  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  left.forEach(token => {
    if (right.has(token)) intersection += 1;
  });

  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function findSimilarMemoryIndex(memories, target, threshold = 0.78) {
  let bestIndex = -1;
  let bestScore = threshold;

  memories.forEach((memory, index) => {
    const score = memorySimilarity(getMemoryText(memory), target);
    if (score >= bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
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
    Erst exakte normalisierte
    Übereinstimmung.
  */

  let index =
    memories.findIndex(
      memory =>
        normalizeMemory(memory) ===
        normalizedTarget
    );

  if (index !== -1) {
    return index;
  }

  /*
    Fallback für ältere,
    leicht unterschiedlich
    formulierte Memories.
  */

  index =
    memories.findIndex(memory => {
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

  return index;
}


function applyMemoryAction(
  memories,
  memoryAction
) {
  const result =
    [...memories];

  const action =
    memoryAction?.action;

  const oldMemory =
    typeof memoryAction?.old_memory ===
    "string"
      ? memoryAction.old_memory.trim()
      : "";

  const newMemory =
    typeof memoryAction?.new_memory ===
    "string"
      ? memoryAction.new_memory.trim()
      : "";

  /* ADD */

  if (
    action === "add" &&
    newMemory
  ) {
    const similarIndex = findSimilarMemoryIndex(result, newMemory);
    const duplicate =
      result.some(
        memory =>
          normalizeMemory(memory) ===
          normalizeMemory(newMemory)
      );

    if (!duplicate && similarIndex === -1) {
      result.push({ text: newMemory, category: memoryAction.category || "Sonstiges", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
  }

  /* UPDATE */

  if (
    action === "update" &&
    newMemory
  ) {
    const index =
      findMemoryIndex(
        result,
        oldMemory
      );

    if (index !== -1) {
      result[index] = { text: newMemory, category: memoryAction.category || result[index]?.category || "Sonstiges", createdAt: result[index]?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    } else {
      const similarIndex = findSimilarMemoryIndex(result, newMemory);
      const duplicate =
        result.some(
          memory =>
            normalizeMemory(memory) ===
            normalizeMemory(newMemory)
        );

      if (!duplicate && similarIndex === -1) {
        result.push({ text: newMemory, category: memoryAction.category || "Sonstiges", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
    }
  }

  /* DELETE */

  if (
    action === "delete" &&
    oldMemory
  ) {
    const index =
      findMemoryIndex(
        result,
        oldMemory
      );

    if (index !== -1) {
      result.splice(
        index,
        1
      );
    }
  }

  return result.slice(
    -MAX_LONGTERM_MEMORIES
  );
}


/* ========================================
   API
======================================== */

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({
      error: "Nicht autorisiert."
    });
  }

  if (
    !process.env.OPENAI_API_KEY ||
    !process.env.KV_REST_API_URL ||
    !process.env.KV_REST_API_TOKEN
  ) {
    return res.status(500).json({
      error:
        "Server-Konfiguration fehlt."
    });
  }

  const {
    userText,
    assistantText,
    imageRequestId
  } = req.body || {};

  if (
    typeof userText !== "string" ||
    !userText.trim()
  ) {
    return res.status(400).json({
      error:
        "Kein User-Transkript vorhanden."
    });
  }

  /*
    Begrenzung gegen versehentlich
    riesige Requests.
  */

  if (
    userText.length > 8000 ||
    (
      typeof assistantText === "string" &&
      assistantText.length > 8000
    )
  ) {
    return res.status(413).json({
      error:
        "Live-Transkript ist zu lang."
    });
  }

  try {
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
        ? storedHistory.filter(
            item =>
              item &&
              ["user", "assistant"]
                .includes(item.role) &&
              typeof item.content ===
                "string"
          )
        : [];

    let memories =
      Array.isArray(storedMemories)
        ? storedMemories.map(item => {
            if (typeof item === "string" && item.trim()) return { text: item.trim(), category: "Sonstiges", createdAt: null, updatedAt: null };
            if (item && typeof item === "object" && typeof item.text === "string" && item.text.trim()) return { ...item, text: item.text.trim() };
            return null;
          }).filter(Boolean)
        : [];

    history =
      history.slice(
        -MAX_HISTORY_MESSAGES
      );

    memories =
      memories.slice(
        -MAX_LONGTERM_MEMORIES
      );

    const cleanUser =
      userText.trim();

    const cleanAssistant =
      typeof assistantText === "string"
        ? assistantText.trim()
        : "";

    const memoryText =
      memories.length
        ? memories
            .map(
              (memory, index) =>
                `${index + 1}. [${memory.category || "Sonstiges"}] ${getMemoryText(memory)}`
            )
            .join("\n")
        : "Noch keine Langzeiterinnerungen vorhanden.";


    /* ========================================
       MEMORY CLASSIFIER
    ======================================== */

    const instructions = `
Du verwaltest ausschließlich das Langzeitgedächtnis einer persönlichen Assistentin namens Sofia.

Du bekommst:
1. vorhandene Langzeiterinnerungen,
2. eine neue Aussage des Nutzers aus einem gesprochenen Live-Gespräch,
3. optional Sofias Antwort.

Entscheide, ob das Langzeitgedächtnis geändert werden muss.

Speicherwürdig sind insbesondere:
- bevorzugter Name oder Anrede
- Vorlieben und Abneigungen
- Lieblingsdinge
- wichtige Personen
- Beruf, Studium oder wichtige Projekte
- Hobbys und längerfristige Interessen
- Ziele und Pläne
- wiederkehrende Gewohnheiten
- wichtige persönliche Ereignisse
- explizite Aufforderungen wie "merk dir"
- stabile Informationen, die in späteren Gesprächen nützlich sind
- stabile, wiederkehrende Entwicklung der Beziehung, etablierte Spitznamen oder Insider

Für "Beziehung" gilt eine höhere Speicherschwelle: Ein einzelner Flirt,
Witz oder freundlicher Moment reicht nicht. Speichere nur tatsächlich
wiederkehrende oder ausdrücklich etablierte Dynamiken und erfinde keinen
Beziehungsstatus oder Gefühle des Nutzers.

Nicht speichern:
- gewöhnlicher Smalltalk
- flüchtige Stimmung
- einmalige Fragen
- Mathematikaufgaben
- allgemeines Wissen
- belanglose Momentaufnahmen
- Sofias eigene Aussagen
- Dinge, die nur für den aktuellen Gesprächszug wichtig sind

WICHTIG:

Wenn der Nutzer eine bereits gespeicherte Information zum selben Thema ändert:
action = "update"

Wenn der Nutzer ausdrücklich sagt, dass etwas vergessen werden soll und keinen Ersatz nennt:
action = "delete"

Wenn es eine neue langfristig relevante Information ist:
action = "add"

Sonst:
action = "none"

old_memory muss bei update/delete möglichst exakt eine EXISTIERENDE Erinnerung aus der Liste sein.

new_memory muss bei add/update eine kurze, neutrale und eigenständig verständliche Erinnerung sein.

Speichere keine Vermutungen.
Verwende eine hohe Speicherschwelle: Explizite Aussagen des Nutzers haben
höchste Verlässlichkeit, wiederholt bestätigte Angaben sind ebenfalls
speicherwürdig. Indirekte Schlüsse, Interpretation von Tonfall oder bloße
Plausibilität führen zu action = "none".

Antworte ausschließlich als gültiges JSON:

{
  "action": "none",
  "old_memory": null,
  "new_memory": null,
  "category": null
}

Erlaubte action-Werte:
"none"
"add"
"update"
"delete"

Bei add/update setze zusätzlich category auf genau einen dieser Werte:
"Personen", "Vorlieben", "Projekte & Arbeit", "Ziele & Pläne", "Gewohnheiten", "Beziehung", "Persönliches", "Sonstiges".
Bei none/delete ist category null.

VORHANDENE ERINNERUNGEN:

${memoryText}
`.trim();

    const input =
      cleanAssistant
        ? `
Nutzer sagte im Live-Gespräch:
${cleanUser}

Sofia antwortete:
${cleanAssistant}
`.trim()
        : `
Nutzer sagte im Live-Gespräch:
${cleanUser}
`.trim();


    const openAIResponse =
      await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            model:
              "gpt-5.6",

            instructions,

            input,

            max_output_tokens:
              300
          })
        }
      );

    const openAIData =
      await openAIResponse.json();

    if (!openAIResponse.ok) {
      console.error(
        "Live Memory OpenAI:",
        openAIData
      );

      throw new Error(
        openAIData?.error?.message ||
        "Memory-Auswertung fehlgeschlagen."
      );
    }


    /* ========================================
       OUTPUT TEXT FINDEN
    ======================================== */

    let outputText = "";

    if (
      typeof openAIData.output_text ===
      "string"
    ) {
      outputText =
        openAIData.output_text;
    }

    if (
      !outputText &&
      Array.isArray(
        openAIData.output
      )
    ) {
      for (
        const item
        of openAIData.output
      ) {
        if (
          !Array.isArray(
            item.content
          )
        ) {
          continue;
        }

        for (
          const content
          of item.content
        ) {
          if (
            content.type ===
              "output_text" &&
            typeof content.text ===
              "string"
          ) {
            outputText +=
              content.text;
          }
        }
      }
    }


    /* ========================================
       JSON PARSEN
    ======================================== */

    let memoryAction = {
      action: "none",
      old_memory: null,
      new_memory: null,
      category: null
    };

    try {
      const parsed =
        JSON.parse(
          outputText.trim()
        );

      const validActions = [
        "none",
        "add",
        "update",
        "delete"
      ];

      if (
        validActions.includes(
          parsed.action
        )
      ) {
        memoryAction = {
          action:
            parsed.action,

          old_memory:
            typeof parsed.old_memory ===
            "string"
              ? parsed.old_memory
              : null,

          new_memory:
            typeof parsed.new_memory === "string"
              ? parsed.new_memory
              : null,

          category:
            ["Personen","Vorlieben","Projekte & Arbeit","Ziele & Pläne","Gewohnheiten","Beziehung","Persönliches","Sonstiges"].includes(parsed.category)
              ? parsed.category
              : null
        };
      }

    } catch (error) {
      console.warn(
        "Live Memory JSON ungültig:",
        outputText
      );
    }


    /* ========================================
       HISTORY
    ======================================== */

    history.push({
      role: "user",
      content: cleanUser
    });

    if (cleanAssistant) {
      history.push({
        role: "assistant",
        ...(typeof imageRequestId === "string" && /^[a-f0-9-]{36}$/.test(imageRequestId) ? { imageRequestId } : {}),
        content: cleanAssistant
      });
    }

    history =
      history.slice(
        -MAX_HISTORY_MESSAGES
      );


    /* ========================================
       LONG TERM MEMORY
    ======================================== */

    memories =
      applyMemoryAction(
        memories,
        memoryAction
      );


    /* ========================================
       REDIS
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


    return res.status(200).json({
      ok: true,

      memoryAction,

      historyMessages:
        history.length,

      longTermMemories:
        memories.length
    });

  } catch (error) {
    console.error(
      "Sofia V4.1 Live Memory:",
      error
    );

    return res.status(500).json({
      error:
        "Live Memory konnte nicht gespeichert werden."
    });
  }
}


/* ========================================
   REDIS
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

        body: JSON.stringify([
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
      `Redis Pipeline HTTP ${response.status}`
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
        item &&
        item.error
    );

  if (failed) {
    throw new Error(
      failed.error
    );
  }

  return data;
}

