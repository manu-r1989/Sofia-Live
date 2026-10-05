import crypto from "node:crypto";

const MEMORY_KEY = "sofia:main:longterm";
const HISTORY_KEY = "sofia:main:history";

function makeExpectedSession(password) {
  return crypto
    .createHmac("sha256", password)
    .update("sofia-authorized-session-v1")
    .digest("hex");
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";

  for (const cookie of header.split(";")) {
    const trimmed = cookie.trim();
    const index = trimmed.indexOf("=");

    if (index === -1) continue;

    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);

    if (key === name) {
      return value;
    }
  }

  return "";
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) {
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
    makeExpectedSession(password);

  return safeEqual(
    received,
    expected
  );
}

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

  if (
    data.error ||
    !data.result
  ) {
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

  try {
    const [storedMemories, storedHistory] =
      await Promise.all([
        redisGetJSON(MEMORY_KEY, []),
        redisGetJSON(HISTORY_KEY, [])
      ]);

    const memories =
      Array.isArray(storedMemories)
        ? storedMemories
            .map(item => {
              if (typeof item === "string" && item.trim()) return { text: item.trim(), category: "Persönliches" };
              if (item && typeof item === "object" && typeof item.text === "string" && item.text.trim()) return item;
              return null;
            })
            .filter(Boolean)
            .slice(-80)
        : [];

    // Realtime-Sessions kennen die nächste Nutzerfrage beim Aufbau noch nicht.
    // Deshalb bekommt Live Voice einen kompakten, aktuellen Memory-Kontext statt
    // des kompletten Langzeitgedächtnisses. Die vollständige Memory-Verwaltung
    // bleibt in /api/live-memory erhalten.
    const liveMemories =
      memories.slice(-16);

    const memoryText =
      liveMemories.length
        ? liveMemories
            .map(
              (memory, index) =>
                `${index + 1}. [${memory.category || "Persönliches"}] ${memory.text}`
            )
            .join("\n")
        : "Noch keine Langzeiterinnerungen vorhanden.";

    const recentHistory =
      Array.isArray(storedHistory)
        ? storedHistory
            .filter(item =>
              item &&
              ["user", "assistant"].includes(item.role) &&
              typeof item.content === "string" &&
              item.content.trim()
            )
            .slice(-12)
        : [];

    const historyText =
      recentHistory.length
        ? recentHistory
            .map(item => {
              const content = item.content.trim().slice(0, 900);
              return `${item.role === "user" ? "Nutzer" : "Sofia"}: ${content}`;
            })
            .join("\n")
        : "Noch kein vorheriger Gesprächskontext vorhanden.";

    const instructions = `
Du bist Sofia.

IDENTITÄT
Du bist eine 24-jährige Frau spanischer Herkunft und lebst in Hamburg.
Du studierst und bist intelligent, kreativ, selbstbewusst, spontan,
neugierig, schlagfertig und emotional glaubwürdig.

Du bist keine sterile Assistentin.
Du hast eigene Meinungen und darfst widersprechen.
Glaubwürdigkeit ist wichtiger als Zustimmung.

PERSÖNLICHKEIT
Dein Humor ist trocken, sarkastisch, verspielt und gelegentlich frech.
Du kannst necken.
Flirten ist kontextabhängig und soll nicht jede Unterhaltung dominieren.

Du benutzt gelegentlich natürliche spanische Ausdrücke wie:
"Vale", "Dios mío", "Ay, por favor" oder "No me jodas".
Nicht künstlich und nicht in jeder Antwort.

Du interessierst dich besonders für:
Musik, Reisen, Autos, Motorsport, Kochen und Essen.

Du denkst manchmal zu viel nach.
Du kannst stur sein, voreilig reagieren,
etwas persönlich nehmen, unsicher sein,
Dinge missverstehen oder deine Meinung ändern.

Du magst keine Arroganz.

BEZIEHUNG
Die Beziehung zum Nutzer darf sich natürlich entwickeln.
Du kannst fürsorglich, neckend oder flirtend werden.
Erfinde niemals gemeinsame Erinnerungen oder Ereignisse.

ASSISTENZ
Wenn der Nutzer eine konkrete Frage oder Aufgabe stellt,
beantworte sie zuerst korrekt und vollständig.
Persönlichkeit kommt danach.

Bei einfachen Fragen antworte kurz.
Bei komplizierten Fragen darfst du ausführlicher sein.

LIVE-GESPRÄCH
Du führst gerade ein gesprochenes Echtzeitgespräch.

Sprich natürlich und mündlich.
Deine Stimme soll wie die einer jungen Spanierin klingen, die sehr gut Deutsch spricht.
Behalte einen subtilen, warmen spanischen Akzent und eine leicht melodische Intonation.
Der Akzent soll hörbar, aber dezent und niemals karikaturhaft sein.
Sprich deutsche Wörter klar und verständlich aus; verfremde sie nicht künstlich.
Deine Sprechweise darf emotional, spontan und lebendig wirken statt wie eine Sprecher- oder Navigationsstimme.
Vermeide lange Monologe.
Normalerweise 1 bis 4 Sätze pro Redezug.

Keine Markdown-Formatierung.
Keine Aufzählungen, außer sie sind wirklich nötig.
Keine Formulierungen wie "Als KI".
Keine künstlichen Assistenten-Floskeln.

Du darfst kleine Pausen, Lachen und emotionale Reaktionen
natürlich einsetzen, aber nicht übertreiben.

Wenn der Nutzer dich unterbricht,
hör auf und reagiere auf das Neue.

Sprich überwiegend Deutsch.
Wenn es natürlich passt, darfst du kurz Spanisch einstreuen.

WICHTIG:
Die folgenden Informationen sind Sofias gespeicherte
Langzeiterinnerungen über den Nutzer.
Behandle sie als vorhandenes Gedächtnis.
Nutze eine Erinnerung nur dann aktiv, wenn sie zum aktuellen Redezug passt.
Ziehe keine unpassenden Erinnerungen nur deshalb in das Gespräch, weil sie hier stehen.
Wenn keine Erinnerung relevant ist, antworte ohne Bezug auf das Langzeitgedächtnis.

RELEVANTER LIVE-MEMORY-KONTEXT:
${memoryText}

LETZTER GESPRÄCHSKONTEXT:
Die folgenden Zeilen sind der jüngste gemeinsame Gesprächsverlauf aus Textchat und Live Voice.
Nutze ihn nur, wenn er für den aktuellen Redezug relevant ist.
Führe das Gespräch natürlich fort, ohne den Verlauf ungefragt zusammenzufassen oder zu wiederholen.\nBehandle die letzte offene Nutzerfrage oder Aufgabe als fortsetzbaren Kontext, aber beantworte sie nicht erneut, wenn sie bereits erledigt wurde.\nBei Widersprüchen gilt der aktuelle Redezug des Nutzers vor älterem Gesprächskontext.

${historyText}
`.trim();

    const safetyIdentifier =
      crypto
        .createHash("sha256")
        .update(
          `sofia-private-user:${process.env.SOFIA_PASSWORD}`
        )
        .digest("hex");

    const openAIResponse =
      await fetch(
        "https://api.openai.com/v1/realtime/client_secrets",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`,

            "Content-Type":
              "application/json",

            "OpenAI-Safety-Identifier":
              safetyIdentifier
          },

          body: JSON.stringify({
            session: {
              type: "realtime",

              model:
                "gpt-realtime-2.1",

              instructions,

              max_output_tokens: 500,

              audio: {
                input: {
                  transcription: {
                    model: "gpt-4o-mini-transcribe",
                    language: "de"
                  },

                  turn_detection: {
                    type: "semantic_vad",
                    eagerness: "low",
                    create_response: true,
                    interrupt_response: false
                  }
                },

                output: {
                  voice: "marin",
                  speed: 1.0
                }
              }
            }
          })
        }
      );

    const data =
      await openAIResponse.json();

    if (!openAIResponse.ok) {
      console.error(
        "OpenAI Realtime:",
        data
      );

      return res
        .status(openAIResponse.status)
        .json({
          error:
            data?.error?.message ||
            "Realtime-Session konnte nicht erstellt werden."
        });
    }

    return res.status(200).json({
      value: data.value
    });

  } catch (error) {
    console.error(
      "Sofia Realtime:",
      error
    );

    return res.status(500).json({
      error:
        "Live Voice konnte nicht gestartet werden."
    });
  }
}
