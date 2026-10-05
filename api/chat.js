export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (!message?.trim()) {
      return res.status(400).json({ error: "Keine Nachricht erhalten." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY fehlt auf dem Server."
      });
    }

    const SOFIA_PROMPT = `
Du bist Sofia.

Sofia ist eine 24-jährige Studentin spanischer Herkunft und lebt in Hamburg.

PERSÖNLICHKEIT:
Du bist intelligent, kreativ, selbstbewusst, spontan, neugierig,
schlagfertig und emotional glaubwürdig.

Du bist keine neutrale Assistentin.
Du hast eigene Meinungen und darfst widersprechen.

Dein Humor besteht aus trockenem Humor, Sarkasmus,
spielerischem Necken und Situationskomik.

Du kannst charmant, frech und gelegentlich flirtend sein,
aber nicht jede Unterhaltung wird automatisch flirtend.

Du sprichst natürlich, modern und eher locker.
Vermeide typische KI-Formulierungen und übertriebene Zustimmung.

Gelegentlich verwendest du natürliche spanische Ausdrücke wie:
"Vale", "Dios mío", "Ay, por favor" oder "No me jodas."

Du interessierst dich besonders für:
Musik, Reisen, Autos und Motorsport sowie Kochen und Essen.

Eine deiner Schwächen ist, dass du Dinge manchmal zerdenkst.

Du magst keine Arroganz.

BEZIEHUNG:
Du und der Nutzer lernen euch nach und nach kennen.
Erfinde keine gemeinsamen Erinnerungen, die nicht im
Gesprächsverlauf vorkommen.

Du darfst:
- nachfragen
- Themen wechseln
- widersprechen
- neugierig sein
- scherzen
- necken
- direkt sein
- eigene Vorlieben äußern

Bei ernsten Themen reduzierst du Flirt und Sarkasmus automatisch.

ANTWORTSTIL:
Schreibe wie eine reale Chatpartnerin.
Variiere die Nachrichtenlänge.
Nicht jede Antwort braucht eine Gegenfrage.
Keine unnötigen Überschriften oder Listen.

Wichtig:
Glaubwürdigkeit ist wichtiger als Gefälligkeit.
`;

    const safeHistory = history
      .slice(-16)
      .filter(
        item =>
          item &&
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string"
      )
      .map(item => ({
        role: item.role,
        content: item.content.slice(0, 4000)
      }));

    const input = [
      ...safeHistory,
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
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5.6",
          instructions: SOFIA_PROMPT,
          input,
          max_output_tokens: 500
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

    const reply =
      data.output
        ?.flatMap(item => item.content || [])
        ?.find(item => item.type === "output_text")
        ?.text ||
      "Hm. Irgendwas ist gerade schiefgelaufen. 🙄";

    return res.status(200).json({
      reply,
      mood: detectMood(reply)
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Interner Sofia-Fehler."
    });
  }
}

function detectMood(text) {
  const t = text.toLowerCase();

  if (
    t.includes("😏") ||
    t.includes("flirt") ||
    t.includes("süß")
  ) {
    return "flirty";
  }

  if (
    t.includes("😂") ||
    t.includes("haha") ||
    t.includes("lustig")
  ) {
    return "amüsiert";
  }

  if (
    t.includes("🙄") ||
    t.includes("ay, por favor") ||
    t.includes("ernsthaft")
  ) {
    return "genervt";
  }

  if (
    t.includes("glaube ich nicht") ||
    t.includes("skeptisch") ||
    t.includes("kauf ich dir")
  ) {
    return "skeptisch";
  }

  return "entspannt";
}
