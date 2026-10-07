import crypto from "node:crypto";
import { executeTaskAction, taskIntentCandidate } from "./task-action.js";

const STATE_KEY = "sofia:main:action-state";
const STATE_TTL = 60 * 60 * 24;
const RESEARCH_KEY = "sofia:main:research-state";
const IDEMPOTENCY_KEY = "sofia:main:action-idempotency";

async function redis(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error("Redis request failed");
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function loadState(strict = false) {
  try {
    const raw = await redis(["GET", STATE_KEY]);
    const state = raw ? JSON.parse(raw) : {};
    return state && typeof state === "object" ? state : {};
  } catch (error) { if (strict) throw error; return {}; }
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

// A mode-independent rolling retry window also spans minute boundaries.
// Reserve before execution so a crashed request cannot immediately be replayed.
const ACTION_LOCK_KEY = "sofia:main:action-lock:v2";
const RESERVE_ACTION = `
local cached = redis.call("GET", KEYS[1])
if cached then
  local value = cjson.decode(cached)
  local task = value.taskAction and value.taskAction.task
  local rawState = redis.call("GET", KEYS[3])
  local state = rawState and cjson.decode(rawState) or {}
  local target = state.lastTaskId
  local previous = value.contextTaskId
  if target == cjson.null then target = nil end
  if previous == cjson.null then previous = nil end
  if not task or task.id == target or previous == target then return {"cached", cached} end
  redis.call("DEL", KEYS[1])
end
if not redis.call("SET", KEYS[2], ARGV[1], "NX", "EX", 180) then
  return {"busy", ""}
end
redis.call("SET", KEYS[1], ARGV[2], "EX", 300)
return {"acquired", ""}
`;
const FINISH_ACTION = `
if redis.call("GET", KEYS[2]) ~= ARGV[1] then return 0 end
if ARGV[2] == "" then redis.call("DEL", KEYS[1])
else redis.call("SET", KEYS[1], ARGV[2], "EX", 90) end
redis.call("DEL", KEYS[2])
return 1
`;

// Direct Tasks API writes must share the same lock as text/live actions.
const RELEASE_TASK_LOCK = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])
`;

export async function withTaskMutationLock(callback) {
  const token = crypto.randomUUID();
  const acquired = await redis(["SET", ACTION_LOCK_KEY, token, "NX", "EX", "180"]);
  if (acquired !== "OK") {
    const error = new Error("Eine Aufgabenaktion wird bereits verarbeitet.");
    error.code = "ACTION_BUSY";
    throw error;
  }
  try {
    return await callback();
  } finally {
    try { await redis(["EVAL", RELEASE_TASK_LOCK, "1", ACTION_LOCK_KEY, token]); }
    catch { console.warn("Task lock release failed; waiting for lease expiry."); }
  }
}

export async function executeUnifiedAction(message, referenceTime, options = {}) {
  const text = String(message || "").trim();
  if (!text) return { taskAction: { ok: true, action: "none" } };
  // Conversation must not acquire task locks or depend on the task store.
  // A possible follow-up remains eligible; its actual target is read under lock.
  if (!taskIntentCandidate(text,{recentTaskId:"possible-follow-up"})) return { taskAction:{ok:true,action:"none"} };
  const fingerprint = crypto.createHash("sha256")
    .update(text.toLocaleLowerCase("de-DE").replace(/\s+/g, " ")).digest("hex");
  const resultKey = `${IDEMPOTENCY_KEY}:v2:${fingerprint}`;
  const token = crypto.randomUUID();
  const pending = { taskAction: { ok: false, action: "none", status: "in_progress" } };
  let reservation;
  try {
    reservation = await redis(["EVAL", RESERVE_ACTION, "3", resultKey, ACTION_LOCK_KEY, STATE_KEY, token, JSON.stringify(pending)]);
  } catch {
    return { taskAction: { ok: false, action: "none", status: "execution_failed" } };
  }
  if (reservation?.[0] === "cached") {
    try { return JSON.parse(reservation[1]); } catch { return pending; }
  }
  if (reservation?.[0] !== "acquired") return pending;

  let value;
  try {
    // Read continuity only after acquiring the shared action lock.
    const state = await loadState(true);
    const taskResult = await executeTaskAction(text, referenceTime, { recentTaskId: state.lastTaskId || null });
    let suggestion = null;
    if (taskResult?.ok && taskResult.action === "create" && taskResult.task?.dueAt) {
      suggestion = { type: "calendar_export", taskId: taskResult.task.id, text: "Soll ich daraus auch einen Kalendereintrag vorbereiten?" };
    }
    let next = state;
    if (taskResult?.ok && taskResult.action !== "none") {
      next = {
        ...state,
        updatedAt: new Date().toISOString(),
        lastMode: options.mode || "text",
        lastUserText: text.slice(0, 500),
        lastTaskId: taskResult?.task?.id || state.lastTaskId || null,
        lastAction: taskResult.action,
        lastActionSummary: summarize(taskResult)
      };
      if (taskResult.action === "list" && Array.isArray(taskResult.tasks)) {
        next.lastTaskIds = taskResult.tasks.slice(0, 8).map(t => t.id);
        next.lastTaskId = taskResult.tasks.length === 1 ? taskResult.tasks[0].id : null;
      }
    }
    value = { taskAction: taskResult, state: next, suggestion, contextTaskId: state.lastTaskId || null };
    if (next !== state) {
      try { await saveState(next); }
      catch { value.continuityWarning = "state_save_failed"; }
    }
  } catch (error) {
    // A failed write may have reached Redis before its response was lost.
    // Cache uncertain outcomes too; never blindly replay a mutation.
    const code=["task_provider_failed","task_classifier_incomplete","task_classifier_invalid_json"].includes(error?.code)?error.code:error?.code==="INVALID_TASK"?"task_invalid_fields":"task_execution_failed";
    value = { taskAction: { ok: false, action: "none", status: "execution_failed", code, ...(Number.isInteger(error?.providerStatus)?{providerStatus:error.providerStatus}:{}) } };
  }

  try {
    const payload = value.taskAction?.ok && ["none", "list", "calendar_export"].includes(value.taskAction.action) ? "" : JSON.stringify(value);
    const finished = await redis(["EVAL", FINISH_ACTION, "2", resultKey, ACTION_LOCK_KEY, token, payload]);
    if (finished !== 1) value.continuityWarning = "action_finalize_failed";
  } catch {
    // The pending reservation remains as retry protection if finalization fails.
    value.continuityWarning = "action_finalize_failed";
  }
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
