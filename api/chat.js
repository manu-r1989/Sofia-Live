const HISTORY_KEY = "sofia:main:history";
const MEMORY_KEY = "sofia:main:longterm";

const MAX_HISTORY_MESSAGES = 40;
const MAX_LONGTERM_MEMORIES = 80;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message?.trim()) {
      return res.status(400).json({
        error: "Keine Nachricht erhalten."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY fehlt."
      });
    }

    if (
      !process.env.KV_REST_API_URL ||
      !process.env.KV_REST_API_TOKEN
    ) {
      return res.status(500).json({
        error: "Redis-Konfiguration fehlt."
      });
    }

    /* ========================================
       GEDÄCHTNIS LADEN
    ======================================== */

    const [storedHistory, storedMemories] =
      await Promise.all([
        redisGetJSON(HISTORY_KEY, []),
        redisGetJSON(MEMORY_KEY, [])
      ]);

    let history =
      Array.isArray(storedHistory)
        ? storedHistory
        : [];

    let memories =
      Array.isArray(storedMemories)
        ? storedMemories
        : [];

    history = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-MAX_HISTORY_MESSAGES);

    memories = memories
      .filter(item =>
        typeof item === "string" &&
        item.trim()
      )
      .slice(-MAX_LONGTERM_MEMORIES);

    /* ========================================
       SOFIA PROMPT
    ======================================== */

    const memoryText =
      memories.length
        ? memories
            .map((memory, index) =>
              `${index + 1}. ${memory}`
            )
            .join("\n")
        : "Noch keine Langzeiterinnerungen vorhanden.";

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
Langzeiterinnerungen über den Nutzer und eure
bisherige Beziehung:

${memoryText}

Diese Informationen darfst du selbstverständlich
und natürlich verwenden.

Behaupte nicht, du hättest etwas vergessen,
wenn die Information hier steht.

Sage nicht ständig:
"Ich habe gespeichert..."
oder
"Laut meinem Gedächtnis..."

Beziehe Erinnerungen natürlich ins Gespräch ein.

==================================================
WAS SOLL LANGFRISTIG GEMERKT WERDEN?
==================================================

Nach jeder Nutzernachricht entscheidest du,
ob darin eine Information steckt, die auch in
späteren Gesprächen nützlich sein könnte.

Geeignet sind insbesondere:

- Name oder bevorzugte Anrede
- Vorlieben und Abneigungen
- Lieblingsdinge
- wichtige Personen
- Beruf oder längerfristige Projekte
- Hobbys und Interessen
- persönliche Ziele
- wichtige Pläne
- wiederkehrende Gewohnheiten
- bedeutsame Erlebnisse
- ausdrücklich mit "merk dir" bezeichnete Dinge
- Informationen über die Entwicklung eurer Beziehung
- wiederkehrende Insider oder gemeinsame Themen

Nicht langfristig speichern:

- belanglose Einzelheiten
- einmalige Rechenaufgaben
- gewöhnliche Faktenfragen
- zufällige Smalltalk-Sätze ohne spätere Bedeutung
- temporäre technische Fehlermeldungen

Formuliere eine Erinnerung kurz und eindeutig.

Beispiel:

Nutzer:
"Mein Traumauto ist ein Lamborghini Miura."

memory:
"Das Traumauto des Nutzers ist ein Lamborghini Miura."

Wenn keine neue relevante Erinnerung vorliegt,
ist memory null.

==================================================
AUSGABE
==================================================

Antworte ausschließlich als gültiges JSON-Objekt:

{
  "reply": "vollständige Antwort an den Nutzer",
  "mood": "entspannt",
  "memory": null
}

Oder beispielsweise:

{
  "reply": "Das passt irgendwie zu dir. Der Miura ist schon verdammt schön.",
  "mood": "amüsiert",
  "memory": "Das Traumauto des Nutzers ist ein Lamborghini Miura."
}

Erlaubte mood-Werte sind exakt:

entspannt
flirty
amüsiert
skeptisch
genervt
ernst

memory ist entweder:

null

oder ein einzelner kurzer String.

Kein Markdown außerhalb des JSON-Objekts.
`;

    /* ========================================
       OPENAI
    ======================================== */

    const input = [
      ...history,
      {
        role: "user",
        content: message.trim()
      }
    ];

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: "gpt-5.6",
          instructions: SOFIA_PROMPT,
          input,
          max_output_tokens: 800
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenAI API request failed."
      });
    }

    const raw =
      data.output
        ?.flatMap(item => item.content || [])
        ?.find(item => item.type === "output_text")
        ?.text || "";

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        reply:
          raw ||
          "Hm. Da ist gerade etwas schiefgelaufen.",
        mood: "entspannt",
        memory: null
      };
    }

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
      validMoods.includes(parsed.mood)
        ? parsed.mood
        : "entspannt";

    const newMemory =
      typeof parsed.memory === "string" &&
      parsed.memory.trim()
        ? parsed.memory.trim().slice(0, 500)
        : null;

    /* ========================================
       CHATVERLAUF AKTUALISIEREN
    ======================================== */

    history.push(
      {
        role: "user",
        content: message.trim()
      },
      {
        role: "assistant",
        content: reply
      }
    );

    history =
      history.slice(-MAX_HISTORY_MESSAGES);

    /* ========================================
       LANGZEITERINNERUNG AKTUALISIEREN
    ======================================== */

    if (newMemory) {
      const normalizedNew =
        newMemory.toLowerCase();

      const alreadyExists =
        memories.some(memory =>
          memory.toLowerCase() === normalizedNew
        );

      if (!alreadyExists) {
        memories.push(newMemory);
      }

      memories =
        memories.slice(-MAX_LONGTERM_MEMORIES);
    }

    /* ========================================
       BEIDES IN REDIS SPEICHERN
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
      reply,
      mood,
      memoryMessages: history.length,
      longTermMemories: memories.length
    });

  } catch (error) {
    console.error(
      "Sofia V3.6 server error:",
      error
    );

    return res.status(500).json({
      error: "Interner Sofia-Fehler."
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
  const response = await fetch(
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
    throw new Error(data.error);
  }

  if (!data.result) {
    return fallback;
  }

  try {
    return JSON.parse(data.result);
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

  const response = await fetch(
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
        JSON.stringify(commands)
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
    data.find(item => item?.error);

  if (failed) {
    throw new Error(
      failed.error
    );
  }

  return data;
}
