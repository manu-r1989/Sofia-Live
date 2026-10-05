import crypto from "node:crypto";

const KEY = "sofia:main:identity";
const MAX_ITEMS = 24;

function getCookie(req, name) {
  for (const raw of String(req.headers.cookie || "").split(";")) {
    const s = raw.trim(), i = s.indexOf("=");
    if (i > 0 && s.slice(0, i) === name) return s.slice(i + 1);
  }
  return "";
}
function authorized(req) {
  const password = process.env.SOFIA_PASSWORD;
  if (!password) return false;
  const a = Buffer.from(getCookie(req, "sofia_session"));
  const b = Buffer.from(crypto.createHmac("sha256", password).update("sofia-authorized-session-v1").digest("hex"));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function redis(command) {
  const r = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  return r.json();
}
async function getItems() {
  const d = await redis(["GET", KEY]);
  try { return d.result ? JSON.parse(d.result) : []; } catch { return []; }
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorized(req)) return res.status(401).json({ error: "Nicht autorisiert." });
  try {
    if (req.method === "GET") {
      const items = await getItems();
      return res.status(200).json({ items: Array.isArray(items) ? items : [] });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const userText = String(req.body?.userText || "").trim().slice(0, 2000);
    const assistantText = String(req.body?.assistantText || "").trim().slice(0, 3000);
    if (!userText || !assistantText) return res.status(200).json({ saved: false });

    const items = Array.isArray(await getItems()) ? await getItems() : [];
    const catalog = items.map((x, i) => `${i}: ${x.text}`).join("\n") || "(leer)";
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6",
        instructions: `Pflege ausschließlich Sofias eigene stabile Präferenzen oder Positionen. Speichere keine Fakten über den Nutzer, keine erfundenen Erlebnisse, keine Stimmung und keine beiläufige Formulierung. Nur wenn Sofia im Dialog eine klare eigene Präferenz/Position ausdrückt, die später konsistent bleiben sollte. Antworte nur JSON: {"action":"none|add|update","index":null,"text":null}.`,
        input: `Bestehende Sofia-Positionen:\n${catalog}\n\nNutzer: ${userText}\nSofia: ${assistantText}`,
        max_output_tokens: 140
      })
    });
    if (!r.ok) return res.status(200).json({ saved: false });
    const d = await r.json();
    const raw = d.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text || "";
    const a = JSON.parse(raw);
    let next = [...items], saved = false;
    if (a.action === "add" && typeof a.text === "string" && a.text.trim()) {
      if (!next.some(x => String(x.text).toLowerCase() === a.text.trim().toLowerCase())) {
        next.push({ text: a.text.trim(), updatedAt: new Date().toISOString() }); saved = true;
      }
    } else if (a.action === "update" && Number.isInteger(a.index) && next[a.index] && typeof a.text === "string" && a.text.trim()) {
      next[a.index] = { text: a.text.trim(), updatedAt: new Date().toISOString() }; saved = true;
    }
    next = next.slice(-MAX_ITEMS);
    if (saved) await redis(["SET", KEY, JSON.stringify(next)]);
    return res.status(200).json({ saved });
  } catch (e) {
    console.error("Sofia identity:", e);
    return res.status(200).json({ saved: false });
  }
}
