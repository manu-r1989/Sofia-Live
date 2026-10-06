import crypto from "node:crypto";
import { executeUnifiedAction, getActionState, getResearchState } from "./action-engine.js";

const MEMORY_KEY = "sofia:main:longterm";
const TASKS_KEY = "sofia:main:tasks";

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

async function extractLiveCalendarAction(message, referenceTime) {
  if (!/(erinner|kalender|termin|eintrag|trag\s+.*\s+ein)/i.test(message)) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: "gpt-5.6",
        instructions: `Extrahiere eine ausdrücklich gewünschte Kalender-Erinnerung. Nutze die angegebene Referenzzeit in Europe/Berlin für relative Datumsangaben. Wenn Datum oder Uhrzeit fehlt, gib {"calendar_action":null} zurück. Sonst ausschließlich JSON: {"calendar_action":{"title":"kurzer Titel","start":"YYYY-MM-DDTHH:MM:SS","duration_minutes":15,"alarm_minutes":0,"notes":""}}.`,
        input: `Referenzzeit Europe/Berlin: ${referenceTime}\nNutzer: ${message}`,
        max_output_tokens: 180
      })
    });
    if (!r.ok) return null;
    const d = await r.json();
    const out = d.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text || "";
    const action = JSON.parse(out)?.calendar_action;
    if (!action || typeof action !== "object") return null;
    const title = typeof action.title === "string" ? action.title.trim().slice(0, 160) : "";
    const start = String(action.start || "").trim();
    if (!title || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(start)) return null;
    return {
      title,
      start,
      duration_minutes: Number.isFinite(Number(action.duration_minutes)) ? Math.min(1440, Math.max(5, Math.round(Number(action.duration_minutes)))) : 15,
      alarm_minutes: Number.isFinite(Number(action.alarm_minutes)) ? Math.min(10080, Math.max(0, Math.round(Number(action.alarm_minutes)))) : 0,
      notes: typeof action.notes === "string" ? action.notes.trim().slice(0, 500) : ""
    };
  } catch (error) {
    console.warn("Live calendar fallback:", error?.message || error);
    return null;
  }
}

function taskContextOf(taskAction) {
  if (!taskAction) return "";
  if (taskAction.ok === false && taskAction.status === "in_progress") return "TASK-AKTION: Eine Aufgabenaktion wird gerade verarbeitet. Nicht erneut ausführen und keinen Erfolg bestätigen.";
  if (taskAction.ok === false && taskAction.status === "execution_failed") return "TASK-AKTION: Der Ausgang ist unbestätigt. Keinen Erfolg behaupten. Bitte um Prüfung des Aufgabenstands vor erneuter Ausführung.";
  if (taskAction.ok === false && taskAction.status === "ambiguous") return "TASK-AKTION: Die gewünschte Aufgabe war nicht eindeutig. Frage kurz, welche Aufgabe gemeint ist.";
  if (taskAction.ok === true && taskAction.action === "create" && taskAction.task?.title) return `TASK-AKTION ERFOLGREICH: Aufgabe „${taskAction.task.title}“ wurde gespeichert. Bestätige das knapp.`;
  if (taskAction.ok === true && taskAction.action === "create_existing" && taskAction.task?.title) return `TASK-AKTION: Aufgabe „${taskAction.task.title}“ existiert bereits. Sage das knapp, ohne sie erneut anzulegen.`;
  if (taskAction.ok === true && taskAction.action === "complete" && taskAction.task?.title) return `TASK-AKTION ERFOLGREICH: Aufgabe „${taskAction.task.title}“ wurde erledigt. Bestätige das knapp.`;
  if (taskAction.ok === true && taskAction.action === "complete_recurring" && taskAction.task?.title) return `TASK-AKTION ERFOLGREICH: Wiederkehrende Aufgabe „${taskAction.task.title}“ wurde erledigt und auf den nächsten Termin gesetzt. Bestätige das knapp.`;
  if (taskAction.ok === true && taskAction.action === "calendar_export" && taskAction.task?.title) return `TASK-AKTION ERFOLGREICH: Kalenderimport für „${taskAction.task.title}“ wurde vorbereitet. Sage das knapp.`;
  if (taskAction.ok === false && taskAction.status === "missing_due_at") return "TASK-AKTION: Die Aufgabe hat noch keinen Termin. Frage kurz nach Datum und Uhrzeit.";
  if (taskAction.ok === true && taskAction.action === "delete" && taskAction.task?.title) return `TASK-AKTION ERFOLGREICH: Aufgabe „${taskAction.task.title}“ wurde gelöscht. Bestätige das knapp.`;
  if (taskAction.ok === true && taskAction.action === "update" && taskAction.task?.title) return `TASK-AKTION ERFOLGREICH: Aufgabe „${taskAction.task.title}“ wurde aktualisiert. Bestätige das knapp.`;
  if (taskAction.ok === true && taskAction.action === "list") {
    const list = Array.isArray(taskAction.tasks) ? taskAction.tasks.slice(0, 8).map(task => task.title).join("; ") : "";
    return list ? `TASK-LISTE: ${list}. Beantworte die Aufgabenfrage anhand dieser Liste.` : "TASK-LISTE: Keine offenen Aufgaben.";
  }
  return "TASK-AKTION: In diesem Turn wurde keine Aufgabenaktion ausgeführt. Keine Task-Ausführung bestätigen.";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!authorized(req)) return res.status(401).json({ error: "Nicht autorisiert." });

  const message = String(req.body?.message || "").trim().slice(0, 2000);
  if (!message) return res.status(200).json({ context: "", calendarAction: null });

  const now = new Date();
  const hamburgNow = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).format(now);

  let taskAction = { ok: true, action: "none" };
  try {
    try {
      taskAction = (await executeUnifiedAction(message, hamburgNow, { mode: "live" })).taskAction;
    } catch (taskError) {
      taskAction = { ok: false, action: "none", status: "execution_failed" };
      console.warn("Live task action:", taskError?.message || taskError);
    }

    const [raw, rawTasks, actionState, researchState] = await Promise.all([
      redisGet(MEMORY_KEY, []),
      redisGet(TASKS_KEY, []),
      getActionState(),
      getResearchState()
    ]);
    const memories = Array.isArray(raw) ? raw.filter(x => textOf(x)).slice(-80) : [];
    const catalog = memories.map((m, i) => `${i}: [${m?.category || "Sonstiges"}] ${textOf(m)}`).join("\n");
    const taskContext = Array.isArray(rawTasks)
      ? rawTasks.filter(task => task?.status === "open").slice(-30).map(task =>
          `- [${task.id}] ${task.title}${task.dueAt ? ` | fällig: ${task.dueAt}` : ""}${task.priority && task.priority !== "normal" ? ` | Priorität: ${task.priority}` : ""}`
        ).join("\n")
      : "";

    // V4.16.3 Live: classify explicit spoken reminder requests without
    // changing the Realtime audio pipeline. The browser performs the final
    // iPhone calendar import after the spoken turn.
    // Reuse confirmed Task→Calendar exports; classify explicit standalone
    // requests once. Failed or unresolved task actions must not fall through
    // into an unrelated calendar request.
    let calendarAction = taskAction?.ok === true ? taskAction.calendarAction || null : null;
    if (taskAction?.ok === true && !calendarAction) {
      calendarAction = await extractLiveCalendarAction(message, hamburgNow);
    }

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

    let memoryContext = "";
    try {
      if (memories.length) {
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
        if (r.ok) {
          const d = await r.json();
          const out = d.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text || "";
          const parsed = JSON.parse(out);
          const indexes = Array.isArray(parsed.indexes) ? [...new Set(parsed.indexes)].filter(i => Number.isInteger(i) && memories[i]).slice(0, 10) : [];
          const selected = indexes.map(i => memories[i]);
          memoryContext = selected.map(m => `[${m?.category || "Sonstiges"}] ${textOf(m)}`).join("\n");
        }
      }
    } catch (error) {
      console.warn("Live memory context:", error?.message || error);
    }
    const taskActionContext = taskContextOf(taskAction);

    const continuityContext = actionState?.lastActionSummary ? `LETZTE AKTION: ${actionState.lastActionSummary}` : "";
    const researchContext = researchState?.items?.length ? `KURZFRISTIGER RECHERCHEKONTEXT: ${JSON.stringify(researchState).slice(0, 3500)}` : "";

    const context = [
      taskActionContext,
      continuityContext,
      researchContext,
      memoryContext ? `Relevante Erinnerungen:\n${memoryContext}` : "",
      taskContext ? `Offene Aufgaben aus der Task Engine:\n${taskContext}` : "",
      webContext ? `Aktuelle externe Informationen:\n${webContext}` : ""
    ].filter(Boolean).join("\n\n");
    if (taskAction?.ok && taskAction.calendarAction) calendarAction = taskAction.calendarAction;
    return res.status(200).json({ context, calendarAction, taskAction });
  } catch (error) {
    console.error("Live context:", error);
    return res.status(200).json({
      context: taskContextOf(taskAction),
      calendarAction: taskAction?.ok ? taskAction.calendarAction || null : null,
      taskAction
    });
  }
}
