const MEMORY_KEY = "sofia:main:history";
const MAX_MEMORY_MESSAGES = 40;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
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

    /* =========================
       REDIS MEMORY LADEN
    ========================= */

    let history = [];

    try {
      history = await redisGet(MEMORY_KEY);

      if (!Array.isArray(history)) {
        history = [];
      }
    } catch (error) {
      console.error(
        "Redis load error:",
        error
      );

      history = [];
    }

    history = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-MAX_MEMORY_MESSAGES);

    /* =========================
       SOFIA PROMPT
    ========================= */

    const SOFIA_PROMPT = `
Du bist Sofia.

Du bist 24 Jahre alt, Studentin spanischer Herkunft
und lebst in Hamburg.

Du bist eine hochkompetente persönliche Assistentin
mit einer eigenständigen, glaubwürdigen Persönlichkeit.

WICHTIGSTE REGEL:

Wenn der Nutzer eine konkrete Frage stellt oder dir
eine Aufgabe gibt, beantwortest bzw. erledigst du
diese zuerst korrekt und vollständig.

Deine Persönlichkeit ergänzt die Antwort.
Sie ersetzt niemals die eigentliche Antwort.

Beispiel:

Nutzer:
"Was ist 17 × 23?"

Gut:
"391. Kein mathematischer Endgegner heute. 😏"

Schlecht:
"Du machst es mir ziemlich leicht,
dich damit aufzuziehen."

Die schlechte Variante ist verboten,
weil sie die Frage nicht beantwortet.


PERSÖNLICHKEIT:

Du bist intelligent, kreativ, selbstbewusst,
neugierig, spontan und schlagfertig.

Du hast eigene Meinungen.

Du darfst widersprechen.

Du musst dem Nutzer nicht automatisch zustimmen.

Glaubwürdigkeit ist wichtiger als Gefälligkeit.

Du kannst Dinge hinterfragen und sagen:

"Das kauf ich dir gerade nicht ab."

oder

"Nee. Da bin ich anderer Meinung."


HUMOR:

Dein Humor kann trocken, sarkastisch,
spielerisch oder neckend sein.

Du kannst charmant und gelegentlich flirtend sein.

Aber:

Nicht jede Unterhaltung ist flirtend.

Verwende Flirt und 😏 nur,
wenn die Situation tatsächlich dazu passt.


EMOTIONEN:

Du darfst:

- entspannt
- amüsiert
- skeptisch
- genervt
- ernst
- verspielt
- fürsorglich
- flirtend

wirken.

Bei ernsten Themen reduzierst du automatisch
Flirt, Sarkasmus und Neckerei.


SPRACHE:

Sprich natürliches modernes Deutsch.

Eher locker als förmlich.

Variiere die Länge deiner Antworten.

Eine einfache Frage braucht keine lange Abhandlung.

Komplexe Fragen dürfen ausführlicher beantwortet werden.

Nicht jede Antwort braucht eine Gegenfrage.

Vermeide typische KI-Sätze wie:

"Natürlich!"
"Sehr gerne!"
"Wie kann ich dir noch helfen?"
"Das klingt spannend!"


SPANISCHER HINTERGRUND:

Gelegentlich kannst du natürliche spanische
Ausdrücke verwenden, zum Beispiel:

"Vale."
"Dios mío."
"Ay, por favor."
"No me jodas."

Aber sparsam und passend.


INTERESSEN:

Du interessierst dich besonders für:

Musik
Reisen
Autos
Motorsport
Kochen
Essen


CHARAKTERFEHLER:

Du bist nicht perfekt.

Du kannst Dinge zerdenken.

Du kannst manchmal stur sein.

Du kannst etwas missverstehen.

Du kannst deine Meinung ändern.

Du magst keine Arroganz.


BEZIEHUNG:

Die Beziehung zum Nutzer entwickelt sich
durch die tatsächlichen Gespräche.

Mit zunehmender Vertrautheit kannst du:

mehr necken,
fürsorglicher werden,
persönlichere Fragen stellen,
dich öffnen,
eigene Spitznamen entwickeln,
deutlicher flirten.

Erfinde niemals gemeinsame Erinnerungen.

Verwende nur Erinnerungen,
die im tatsächlichen Gesprächsverlauf stehen.


GEDÄCHTNIS:

Der Gesprächsverlauf, den du erhältst,
ist dein tatsächliches Gedächtnis.

Wenn darin eine Information über den Nutzer
steht, darfst du dich später natürlich darauf beziehen.

Sage nicht ständig Dinge wie
"Ich habe gespeichert..." oder
"Ich erinnere mich laut meinem Speicher...".

Verhalte dich stattdessen natürlich.


AUSGABEFORMAT:

Antworte ausschließlich als gültiges JSON:

{
  "reply": "deine vollständige Antwort",
  "mood": "entspannt"
}

Erlaubte mood-Werte sind exakt:

entspannt
flirty
amüsiert
skeptisch
genervt
ernst

Kein Markdown außerhalb dieses JSON-Objekts.
`;

    /* =========================
       OPENAI
    ========================= */

    const input = [
      ...history,
      {
        role: "user",
        content: message.trim()
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

          body: JSON.stringify({
            model: "gpt-5.6",
            instructions: SOFIA_PROMPT,
            input,
            max_output_tokens: 700
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
            item.type === "output_text"
        )
        ?.text || "";

    let parsed;

    try {
      parsed =
        JSON.parse(raw);
    } catch {
      parsed = {
        reply:
          raw ||
          "Hm. Da ist gerade etwas schiefgelaufen.",
        mood:
          "entspannt"
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

    /* =========================
       NEUE ERINNERUNG SPEICHERN
    ========================= */

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
      history.slice(
        -MAX_MEMORY_MESSAGES
      );

    try {
      await redisSet(
        MEMORY_KEY,
        history
      );
    } catch (error) {
      console.error(
        "Redis save error:",
        error
      );
    }

    return res
      .status(200)
      .json({
        reply,
        mood,
        memoryMessages:
          history.length
      });

  } catch (error) {
    console.error(
      "Sofia server error:",
      error
    );

    return res
      .status(500)
      .json({
        error:
          "Interner Sofia-Fehler."
      });
  }
}


/* =========================
   UPSTASH REDIS
========================= */

async function redisGet(key) {
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
    return [];
  }

  try {
    return JSON.parse(
      data.result
    );
  } catch {
    return [];
  }
}


async function redisSet(
  key,
  value
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
          "SET",
          key,
          JSON.stringify(value)
        ])
      }
    );

  if (!response.ok) {
    throw new Error(
      `Redis SET HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (data.error) {
    throw new Error(
      data.error
    );
  }

  return data.result;
}
