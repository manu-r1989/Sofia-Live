const TASKS_KEY = "sofia:main:tasks";

async function redisGet() {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["GET", TASKS_KEY])
  });
  if (!response.ok) throw new Error("Redis request failed");
  const data = await response.json();
  try { return data.result ? JSON.parse(data.result) : []; } catch { return []; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const tasks = await redisGet();
    const now = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date()).replace(" ", "T");
    const today = now.slice(0, 10);
    const open = (Array.isArray(tasks) ? tasks : []).filter(t => t?.status === "open");
    const overdue = open.filter(t => t.dueAt && String(t.dueAt) < now);
    const todayTasks = open.filter(t => String(t.dueAt || "").slice(0, 10) === today);
    const high = open.filter(t => t.priority === "high");
    return res.status(200).json({
      today: todayTasks.slice(0, 12), overdue: overdue.slice(0, 12), highPriority: high.slice(0, 12),
      counts: { open: open.length, today: todayTasks.length, overdue: overdue.length, highPriority: high.length }
    });
  } catch (error) {
    console.error("Daily brief:", error);
    return res.status(500).json({ error: "Briefing konnte nicht geladen werden." });
  }
}