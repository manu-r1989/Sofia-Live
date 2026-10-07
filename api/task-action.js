import { addCalendarDays, nextRecurringDates, normalizeTaskDate, validateTaskPatch } from "../lib/task-dates.js";

const TASKS_KEY = "sofia:main:tasks";

async function redis(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error("Redis request failed");
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function loadTasks() {
  try {
    const raw=await redis(["GET",TASKS_KEY]);
    if(!raw)return [];
    const value=JSON.parse(raw);
    if(!Array.isArray(value))throw new Error("Invalid task store");
    return value;
  } catch { const error=new Error("Task store unavailable");error.code="task_store_unavailable";throw error; }
}
async function saveTasks(tasks) {
  try { await redis(["SET",TASKS_KEY,JSON.stringify(tasks.slice(-250))]); }
  catch { const error=new Error("Task write outcome unconfirmed");error.code="task_write_unconfirmed";throw error; }
}


async function interpret(message, tasks, referenceTime, recentTaskId = null) {
  const catalog = tasks.slice(-80).map(t =>
    `[${t.id}] ${t.title}${t.dueAt ? ` | fällig ${t.dueAt}` : ""} | ${t.status}`
  ).join("\n") || "(keine Aufgaben)";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: "gpt-5.6",
      instructions: `Du bist ein strikter Task-Action-Parser. Erkenne nur Aufgabenverwaltung, nicht bloße Gesprächsinhalte.
Erlaubte Aktionen: none, create, update, complete, delete, list, calendar_export.
create bei klarer Aufgabenabsicht, einer klaren eigenen Verpflichtung oder einer ausdrücklichen Erinnerung. Bei Erinnerungen setze remindAt und, falls keine andere Fälligkeit genannt ist, dueAt auf den Erinnerungszeitpunkt.
complete, delete und update nur wenn eine bestehende Aufgabe eindeutig gemeint ist; verwende deren exakte id. Kurze Folgeanweisungen wie "mach die morgen", "lösch die" oder "die ist erledigt" dürfen recentTaskId verwenden, sofern der Bezug eindeutig ist.
list bei Fragen nach Aufgaben oder danach, was ansteht. Setze scope passend: today für heute, week für diese/nächsten 7 Tage, overdue für überfällige Aufgaben, sonst all.\ncalendar_export wenn eine bestehende Aufgabe ausdrücklich in den Kalender übernommen werden soll; verwende deren exakte id.
Explizite neue Kalendereinträge ohne Aufgabenabsicht sind none, weil sie separat verarbeitet werden.
Bei update enthält task ausschließlich ausdrücklich zu ändernde Felder. Unveränderte Felder vollständig weglassen; keine Standardwerte einsetzen. null nur bei ausdrücklich gewünschtem Entfernen von dueAt, remindAt oder recurrence. Leere notes nur bei ausdrücklich gewünschtem Löschen der Notizen. Ein reiner Termin-Follow-up darf Priorität, Notizen und Wiederholung nicht ändern.
Relative Zeiten anhand der Referenzzeit Europe/Berlin auflösen. dueAt und remindAt müssen Hamburger Ortszeit im Format YYYY-MM-DDTHH:mm:ss ohne Zeitzonen-Suffix sein, zum Beispiel 2026-10-08T10:00:00. Niemals Z, +02:00, +01:00 oder UTC-Konvertierung verwenden. Ohne Termin null ausgeben. recurrence nur als null, "daily", "weekly" oder "monthly" ausgeben.
Das folgende task-Beispiel gilt für create; bei update ist task ein sparsames Objekt nur mit geänderten Feldern.
Antworte ausschließlich als JSON:
{"action":"none|create|update|complete|delete|list|calendar_export","id":null,"task":{"title":"","dueAt":null,"remindAt":null,"priority":"normal","notes":"","recurrence":null},"status":"open","scope":"all|today|week|overdue"}`,
      input: `Referenzzeit: ${referenceTime}\nZuletzt relevante Aufgabe: ${recentTaskId || "(keine)"}\nNutzer: ${message}\n\nAufgaben:\n${catalog}`,
      max_output_tokens: 1200
    })
  });
  if (!response.ok) {const error=new Error("Task classifier request failed");error.code="task_provider_failed";error.providerStatus=response.status;throw error;}
  const data = await response.json();
  if(data.status === "incomplete") {const error=new Error("Task classifier output incomplete");error.code="task_classifier_incomplete";throw error;}
  const text = data.output?.flatMap(x => x.content || [])?.find(x => x.type === "output_text")?.text || "";
  let parsed;
  try { parsed = JSON.parse(text); } catch { const error=new Error("Invalid task classifier JSON");error.code="task_classifier_invalid_json";throw error; }
  if (!parsed || !["none", "create", "update", "complete", "delete", "list", "calendar_export"].includes(parsed.action)) {
    throw new Error("Invalid task classifier action");
  }
  return parsed;
}

export function taskIntentCandidate(message, options = {}) {
  const text=String(message || "").trim();
  if(!text)return false;
  // Only gate the classifier; it still decides whether an action is intended.
  // Normalize umlauts so word boundaries also work for "überfällig".
  const intentText = text.toLocaleLowerCase("de-DE")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  const likelyTaskIntent = /\b(?:aufgaben?|tasks?|to[ -]?dos?|erledig\w*|abgehakt|abhak\w*|loesch\w*|verschieb\w*|streiche\w*|faellig\w*|priorit\w*|erinner\w*|offen\w*|ueberfaellig\w*|wiederhol\w*)\b/.test(intentText)
    || /\b(?:ich\s+(?:muss|soll|werde)|(?:muss|soll)\s+ich|steht\b.*\ban|steht\b.*\baus|ansteht|anstehen)\b/.test(intentText)
    || /\b(?:setz\w*|leg\w*|trag\w*|notier\w*)\b.*\b(?:liste|ein|an|drauf)\b/.test(intentText);
  const likelyFollowUp = Boolean(options.recentTaskId) && (
    /^(?:(?:sofia|bitte)\b[\s,!:]*)*(?:mach\w*|verschieb\w*|loesch\w*|streich\w*|erledigt)\b/.test(intentText)
    || /^(?:(?:sofia|bitte)\b[\s,!:]*)*(?:die|das|doch|lieber|erst|schon)\b.{0,50}\b(?:morgen|heute|uebermorgen|freitag|montag|dienstag|mittwoch|donnerstag|samstag|sonntag|um\s+\d|taeglich|woechentlich|monatlich)\b/.test(intentText)
    || /^(?:(?:bitte|doch|lieber|erst)\s+)*(?:(?:morgen|heute|uebermorgen)(?:\s+um\s+\d{1,2}(?::\d{2})?)?|am\s+(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\d{1,2}\.)|um\s+\d{1,2}(?::\d{2})?)[.!?\s]*$/.test(intentText)
    || /\b(?:kalender|termin|export\w*|priorit\w*|taeglich|woechentlich|monatlich)\b/.test(intentText)
  );
  if (!likelyTaskIntent && !likelyFollowUp) return false;
  return true;
}

export async function executeTaskAction(message, referenceTime, options = {}) {
  const text = String(message || "").trim();
  if (!text) return { ok: true, action: "none" };
  if (!taskIntentCandidate(text,options)) return { ok:true, action:"none" };
  const tasks = await loadTasks();
  const parsed = await interpret(text, tasks, referenceTime, options.recentTaskId || null);
  const action = String(parsed?.action || "none");
  if (action === "none") return { ok: true, action: "none" };
  if (action === "create" || action === "update") validateTaskPatch(parsed.task);

  if (action === "list") {
    let result = (parsed?.status === "all" ? tasks : tasks.filter(t => t.status === "open")).slice();
    const scope = ["today","week","overdue"].includes(parsed?.scope) ? parsed.scope : "all";
    const ref = String(referenceTime || "").replace(" ", "T").slice(0, 19);
    const today = ref.slice(0, 10);
    if (scope === "today") result = result.filter(t => String(t.dueAt || "").slice(0, 10) === today);
    if (scope === "overdue") result = result.filter(t => t.dueAt && String(t.dueAt) < ref);
    if (scope === "week") {
      const endText = addCalendarDays(ref, 7);
      result = result.filter(t => t.dueAt && String(t.dueAt) >= ref && String(t.dueAt) <= endText);
    }
    result = result.sort((a, b) => {
        const priority = { high: 0, normal: 1, low: 2 };
        const pa = priority[a.priority] ?? 1, pb = priority[b.priority] ?? 1;
        if (pa !== pb) return pa - pb;
        if (a.dueAt && b.dueAt) return String(a.dueAt).localeCompare(String(b.dueAt));
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      });
    return { ok: true, action, scope, tasks: result };
  }

  const now = new Date().toISOString();
  if (action === "create") {
    const title = String(parsed?.task?.title || "").trim().slice(0, 200);
    if (!title) throw new Error("Missing task title");
    const dueAt = normalizeTaskDate(parsed.task.dueAt);
    const remindAt = normalizeTaskDate(parsed.task.remindAt);
    const duplicate = tasks.find(t =>
      t.status === "open" &&
      String(t.title || "").toLocaleLowerCase("de-DE") === title.toLocaleLowerCase("de-DE") &&
      String(t.dueAt || "") === String(dueAt || "") &&
      Date.now() - Date.parse(t.createdAt || 0) < 120000
    );
    if (duplicate) return { ok: true, action: "create_existing", task: duplicate };

    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      title,
      status: "open",
      dueAt,
      remindAt,
      recurrence: parsed.task.recurrence || null,
      priority: ["low","normal","high"].includes(parsed.task.priority) ? parsed.task.priority : "normal",
      notes: String(parsed.task.notes || "").trim().slice(0, 1000),
      createdAt: now,
      updatedAt: now,
      completedAt: null
    };
    tasks.push(task);
    await saveTasks(tasks);
    return { ok: true, action, task };
  }

  const id = String(parsed?.id || "");
  const index = tasks.findIndex(t => t.id === id);
  if (index < 0) return { ok: false, action, status: "ambiguous" };

  if (action === "calendar_export") {
    const task = tasks[index];
    if (!task.dueAt) return { ok: false, action, status: "missing_due_at", task };
    return {
      ok: true,
      action,
      task,
      calendarAction: {
        title: task.title,
        start: task.dueAt,
        duration_minutes: 15,
        alarm_minutes: 0,
        notes: task.notes || ""
      }
    };
  }

  if (action === "complete") {
    const next = nextRecurringDates(tasks[index]);
    if (next) {
      tasks[index] = { ...tasks[index], ...next, updatedAt: now, completedAt: null, status: "open" };
      await saveTasks(tasks);
      return { ok: true, action: "complete_recurring", task: tasks[index], nextDueAt: next.dueAt };
    }
    tasks[index] = { ...tasks[index], status: "completed", completedAt: now, updatedAt: now };
  } else if (action === "delete") {
    const [task] = tasks.splice(index, 1);
    await saveTasks(tasks);
    return { ok: true, action, task };
  } else if (action === "update") {
    const patch = parsed.task || {};
    tasks[index] = {
      ...tasks[index],
      title: String(patch.title || tasks[index].title).trim().slice(0, 200),
      dueAt: patch.dueAt === null ? null : (normalizeTaskDate(patch.dueAt) || tasks[index].dueAt),
      remindAt: patch.remindAt === null ? null : (normalizeTaskDate(patch.remindAt) || tasks[index].remindAt),
      priority: ["low","normal","high"].includes(patch.priority) ? patch.priority : tasks[index].priority,
      notes: patch.notes == null ? tasks[index].notes : String(patch.notes).trim().slice(0, 1000),
      recurrence: patch.recurrence === undefined ? tasks[index].recurrence : patch.recurrence,
      updatedAt: now
    };
  } else {
    return { ok: true, action: "none" };
  }

  await saveTasks(tasks);
  return { ok: true, action, task: tasks[index] };
}


