import { executeTaskAction } from "./task-action.js";

const STATE_KEY = "sofia:main:action-state";
const STATE_TTL = 60 * 60 * 24;
const RESEARCH_KEY = "sofia:main:research-state";
const IDEMPOTENCY_KEY = "sofia:main:action-idempotency";

async function redis(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error("Redis request failed");
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function loadState() {
  try {
    const raw = await redis(["GET", STATE_KEY]);
    const state = raw ? JSON.parse(raw) : {};
    return state && typeof state === "object" ? state : {};
  } catch { return {}; }
}

async function saveState(state) {
  await redis(["SET", STATE_KEY, JSON.stringify(state), "EX", String(STATE_TTL)]);
}

function summarize(result) {
  if (!result || result.action === "none") return "";
  if (result.action === "list") return `Aufgabenabfrage (${result.scope || "all"}): ${(result.tasks || []).slice(0,8).map(t=>t.title).join("; ") || "keine"}`;
  if (result.task?.title) return `${result.action}: ${result.task.title}`;
  return result.action;
}

export async function executeUnifiedAction(message, referenceTime, options = {}) {
  const state = await loadState();
  const text = String(message || "").trim();
  const fingerprint = `${options.mode || "text"}|${text.toLocaleLowerCase("de-DE")}|${String(referenceTime || "").slice(0, 16)}`;
  try {
    const cachedRaw = await redis(["HGET", IDEMPOTENCY_KEY, fingerprint]);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.createdAt && Date.now() - Date.parse(cached.createdAt) < 90000) return cached.value;
    }
  } catch {}
  const taskResult = await executeTaskAction(text, referenceTime, { recentTaskId: state.lastTaskId || null });
  let suggestion = null;
  if (taskResult?.action === "create" && taskResult.task?.dueAt) suggestion = { type: "calendar_export", taskId: taskResult.task.id, text: "Soll ich daraus auch einen Kalendereintrag vorbereiten?" };
  const next = {
    updatedAt: new Date().toISOString(),
    lastMode: options.mode || "text",
    lastUserText: text.slice(0, 500),
    lastTaskId: taskResult?.task?.id || state.lastTaskId || null,
    lastAction: taskResult?.action || "none",
    lastActionSummary: summarize(taskResult)
  };
  if (taskResult?.action === "list" && Array.isArray(taskResult.tasks)) {
    next.lastTaskIds = taskResult.tasks.slice(0, 8).map(t => t.id);
  } else if (Array.isArray(state.lastTaskIds)) next.lastTaskIds = state.lastTaskIds;
  await saveState(next);
  const value = { taskAction: taskResult, state: next, suggestion };
  try {
    await redis(["HSET", IDEMPOTENCY_KEY, fingerprint, JSON.stringify({ createdAt: new Date().toISOString(), value })]);
    await redis(["EXPIRE", IDEMPOTENCY_KEY, "300"]);
  } catch {}
  return value;
}

export async function saveResearchState(items = [], query = "") {
  const payload = { query: String(query).slice(0,300), items: Array.isArray(items) ? items.slice(0,8) : [], updatedAt: new Date().toISOString() };
  await redis(["SET", RESEARCH_KEY, JSON.stringify(payload), "EX", String(STATE_TTL)]);
  return payload;
}

export async function getResearchState() {
  try { const raw = await redis(["GET", RESEARCH_KEY]); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function getActionState() {
  return loadState();
}
