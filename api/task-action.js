const TASKS_KEY = "sofia:main:tasks";

async function redis(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error("Redis request failed");
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function loadTasks() {
  const raw = await redis(["GET", TASKS_KEY]);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function saveTasks(tasks) {
  await redis(["SET", TASKS_KEY, JSON.stringify(tasks.slice(-250))]);
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text) ? text : null;
}

async function interpret(message, tasks, referenceTime) {
  const catalog = tasks.slice(-80).map(t =>
    `[${t.id}] ${t.title}${t.dueAt ? ` | fällig ${t.dueAt}` : ""} | ${t.status}`
  ).join("\n") || "(keine Aufgaben)";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-5.6",
      instructions: `Du bist ein strikter Task-Action-Parser. Erkenne nur Aufgabenverwaltung, nicht bloße Gesprächsinhalte.
Erlaubte Aktionen: none, create, update, complete, delete, list.
create nur bei klarer Absicht, etwas als Aufgabe oder To-do festzuhalten, oder bei einer klar formulierten eigenen Verpflichtung wie "Ich muss Freitag X erledigen".
complete, delete und update nur wenn eine bestehende Aufgabe eindeutig gemeint ist; verwende deren exakte id.
list bei Fragen nach Aufgaben oder danach, was ansteht.
Reine Kalender- oder Erinnerungswünsche sind none, weil sie separat verarbeitet werden.
Relative Zeiten anhand der Referenzzeit Europe/Berlin auflösen.
Antworte ausschließlich als JSON:
{"action":"none|create|update|complete|delete|list","id":null,"task":{"title":"","dueAt":null,"remindAt":null,"priority":"normal","notes":"","recurrence":null},"status":"open"}`,
      input: `Referenzzeit: ${referenceTime}\nNutzer: ${message}\n\nAufgaben:\n${catalog}`,
      max_output_tokens: 260
    })
  });
  if (!response.ok) return { action: "none" };
  const data = await response.json();
  const text = data.output?.flatMap(x => x.content || [])?.find(x => x.type === "output_text")?.text || "";
  try { return JSON.parse(text); } catch { return { action: "none" }; }
}

export async function executeTaskAction(message, referenceTime) {
  let tasks = await loadTasks();
  const parsed = await interpret(message, tasks, referenceTime);
  const action = String(parsed?.action || "none");
  if (action === "none") return { ok: true, action: "none" };

  if (action === "list") {
    const result = parsed?.status === "all" ? tasks : tasks.filter(t => t.status === "open");
    return { ok: true, action, tasks: result };
  }

  const now = new Date().toISOString();
  if (action === "create") {
    const title = String(parsed?.task?.title || "").trim().slice(0, 200);
    if (!title) return { ok: true, action: "none" };
    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      title,
      status: "open",
      dueAt: normalizeDate(parsed.task.dueAt),
      remindAt: normalizeDate(parsed.task.remindAt),
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

  if (action === "complete") {
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
      dueAt: patch.dueAt === null ? null : (normalizeDate(patch.dueAt) || tasks[index].dueAt),
      remindAt: patch.remindAt === null ? null : (normalizeDate(patch.remindAt) || tasks[index].remindAt),
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
