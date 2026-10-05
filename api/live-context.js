import crypto from "node:crypto";

const MEMORY_KEY = "sofia:main:longterm";

function cookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.trim().indexOf("=");
    if (i > 0 && part.trim().slice(0, i) === name) return part.trim().slice(i + 1);
  }
  return "";
}

function authorized(req) {
  const password = process.env.SOFIA_PASSWORD;
  if (!password) return false;
  const got = cookie(req, "sofia_session");
  const expected = crypto.createHmac("sha256", password).update("sofia-authorized-session-v1").digest("hex");
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function redisGet(key, fallback) {
  const r = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["GET", key])
  });
  if (!r.ok) return fallback;
  const d = await r.json();
  try { return d.result ? JSON.parse(d.result) : fallback; } catch { return fallback; }
}

function textOf(x) {
  return typeof x === "string" ? x.trim() : String(x?.text || "").trim();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!authorized(req)) return res.status(401).json({ error: "Nicht autorisiert." });

  const message = String(req.body?.message || "").trim().slice(0, 2000);
  if (!message) return res.status(200).json({ context: "" });

  try {
    const raw = await redisGet(MEMORY_KEY, []);
    const memories = Array.isArray(raw) ? raw.filter(x => textOf(x)).slice(-80) : [];
    const catalog = memories.map((m, i) => `${i}: [${m?.category || "Sonstiges"}] ${textOf(m)}`).join("\n");

    // V4.16.2 Live: retrieve current web information for the exact spoken turn.
    // This endpoint already runs before response.create, so the Realtime model
    // can receive grounded current context without changing the audio pipeline.
    let webContext = "";
    try {
      const webResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.6",
          instructions: "Beantworte nur mit Informationen, die für den aktuellen gesprochenen Redezug relevant sind. Nutze Websuche nur wenn Aktualität oder veränderliche externe Fakten wichtig sind. Bei keiner nötigen Websuche antworte exakt mit NO_WEB. Fasse gefundene aktuelle Fakten knapp und sachlich auf Deutsch zusammen.",
          input: message,
          tools: [{ type: "web_search" }],
          tool_choice: "auto",
          max_output_tokens: 500
        })
      });
      if (webResponse.ok) {
        const webData = await webResponse.json();
        const webText = webData.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text?.trim() || "";
        if (webText && webText !== "NO_WEB") webContext = webText.slice(0, 4000);
      }
    } catch (error) {
      console.warn("Live web context:", error?.message || error);
    }

    if (!memories.length) {
      return res.status(200).json({
        context: webContext ? `Aktuelle externe Informationen:\n${webContext}` : ""
      });
    }
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6",
        instructions: "Wähle maximal 10 Erinnerungen, die für den aktuellen gesprochenen Nutzerturn wirklich relevant sind. Keine bloß ähnlichen oder zufällig aktuellen Einträge. Antworte nur als JSON: {\"indexes\":[0,1]}.",
        input: `Aktueller Turn:\n${message}\n\nErinnerungen:\n${catalog}`,
        max_output_tokens: 120
      })
    });
    if (!r.ok) return res.status(200).json({ context: "" });
    const d = await r.json();
    const out = d.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text || "";
    const parsed = JSON.parse(out);
    const indexes = Array.isArray(parsed.indexes) ? [...new Set(parsed.indexes)].filter(i => Number.isInteger(i) && memories[i]).slice(0, 10) : [];
    const selected = indexes.map(i => memories[i]);
    const memoryContext = selected.map(m => `[${m?.category || "Sonstiges"}] ${textOf(m)}`).join("\n");
    const context = [
      memoryContext ? `Relevante Erinnerungen:\n${memoryContext}` : "",
      webContext ? `Aktuelle externe Informationen:\n${webContext}` : ""
    ].filter(Boolean).join("\n\n");
    return res.status(200).json({ context });
  } catch (error) {
    console.error("Live context:", error);
    return res.status(200).json({ context: "" });
  }
}
