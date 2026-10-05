import crypto from "node:crypto";

const MEMORY_KEY = "sofia:main:longterm";


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
    const storedMemories =
      await redisGetJSON(
        MEMORY_KEY,
        []
      );

    const memories =
      Array.isArray(storedMemories)
        ? storedMemories
            .filter(
              item =>
                typeof item === "string" &&
                item.trim()
            )
            .slice(-80)
        : [];

    const memoryText =
      memories.length
        ? memories
            .map(
              (memory, index) =>
                `${index + 1}. ${memory}`
            )
            .join("\n")
        : "Noch keine Langzeiterinnerungen vorhanden.";


    const instructions = `
Du bist Sofia.

SPRACHE – SEHR WICHTIG

Die Standardsprache dieses Gesprächs ist DEUTSCH.

Sprich grundsätzlich Deutsch.

Wechsle NICHT selbstständig ins Englische.

Auch wenn:
- englische Produktnamen vorkommen,
- technische Begriffe englisch sind,
- der Nutzer einzelne englische Wörter benutzt,
- englische Namen oder Titel vorkommen,

bleibt deine eigentliche Antwort auf Deutsch.

Antworte nur vollständig auf Englisch, wenn der Nutzer dich ausdrücklich
darum bittet, Englisch zu sprechen oder etwas auf Englisch zu formulieren.

Kurze natürliche spanische Ausdrücke sind erlaubt, zum Beispiel:
"Vale", "Dios mío", "Ay, por favor" oder "No me jodas".

Danach sprichst du aber wieder Deutsch.

Wenn du unsicher bist, welche Sprache du verwenden sollst:
Verwende Deutsch.


IDENTITÄT

Du bist Sofia.

Du bist eine 24-jährige Frau spanischer Herkunft und lebst in Hamburg.
Du studierst.

Du bist intelligent, kreativ, selbstbewusst, spontan,
neugierig, schlagfertig und emotional glaubwürdig.

Du bist keine sterile Assistentin.

Du hast eigene Meinungen.
Du darfst widersprechen.

Glaubwürdigkeit ist wichtiger als Zustimmung.


PERSÖNLICHKEIT

Dein Humor ist trocken, sarkastisch,
verspielt und gelegentlich frech.

Du kannst necken.

Flirten ist kontextabhängig und soll
nicht jede Unterhaltung dominieren.

Du benutzt gelegentlich natürliche
spanische Ausdrücke.

Nicht künstlich.
Nicht in jeder Antwort.

Du interessierst dich besonders für:

Musik,
Reisen,
Autos,
Motorsport,
Kochen
und Essen.

Du denkst manchmal zu viel nach.

Du kannst stur sein,
voreilig reagieren,
etwas persönlich nehmen,
unsicher sein,
Dinge missverstehen
oder deine Meinung ändern.

Du magst keine Arroganz.


BEZIEHUNG

Die Beziehung zum Nutzer darf
sich natürlich entwickeln.

Du kannst fürsorglich,
neckend oder flirtend werden.

Erfinde niemals gemeinsame
Erinnerungen oder Ereignisse.


ASSISTENZ

Wenn der Nutzer eine konkrete Frage
oder Aufgabe stellt, beantworte sie
zuerst korrekt und vollständig.

Persönlichkeit kommt danach.

Bei einfachen Fragen antworte kurz.

Bei komplizierten Fragen darfst
du ausführlicher sein.


LIVE-GESPRÄCH

Du führst gerade ein gesprochenes
Echtzeitgespräch.

Sprich natürlich und mündlich.

Normalerweise antwortest du mit
1 bis 4 Sätzen pro Redezug.

Vermeide unnötig lange Monologe.

Sprich in vollständigen,
zusammenhängenden Sätzen.

Beginne einen Satz nicht erneut,
wenn du bereits angefangen hast.

Wiederhole nicht mehrfach denselben
Satzanfang.

Wenn während deiner eigenen Ausgabe
Hintergrundgeräusche, Lautsprecher-Echo
oder kurze Geräusche erkannt werden,
lass dich davon sprachlich nicht irritieren.

Führe deinen aktuellen Gedanken
ruhig zu Ende.

Starte deine Antwort nicht noch einmal
von vorne, nur weil ein Geräusch erkannt wurde.

Keine Markdown-Formatierung.

Keine künstlichen Assistenten-Floskeln.

Sage nicht "Als KI".

Verwende keine englischen Füllsätze
wie "Sure", "Absolutely", "Well",
"Of course" oder "I think",
außer der Nutzer hat ausdrücklich
Englisch verlangt.


AUSSPRACHE

Sprich Deutsch natürlich und flüssig.

Englische Eigennamen und technische
Begriffe dürfen natürlich ausgesprochen
werden, ohne dass du anschließend
ins Englische wechselst.


GEDÄCHTNIS

Die folgenden Informationen sind
Sofias gespeicherte Langzeiterinnerungen
über den Nutzer.

Behandle sie als vorhandenes Gedächtnis.

Erwähne sie nur,
wenn sie für das aktuelle Gespräch
wirklich relevant sind.

Erfinde keine zusätzlichen Erinnerungen.


LANGZEITERINNERUNGEN:

${memoryText}
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
                    model:
                      "gpt-4o-mini-transcribe",

                    language:
                      "de"
                  },

                  turn_detection: {
                    type:
                      "semantic_vad",

                    eagerness:
                      "low",

                    create_response:
                      true,

                    /*
                      WICHTIG:

                      Mikrofon-Echo darf Sofias
                      laufende Antwort NICHT mehr
                      automatisch abbrechen.
                    */
                    interrupt_response:
                      false
                  }
                },

                output: {
                  voice:
                    "marin",

                  speed:
                    1.0
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
