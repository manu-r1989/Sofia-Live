import crypto from "node:crypto";

const TASKS_KEY = "sofia:main:tasks";
const MAX_TASKS = 250;

function cookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const item = part.trim(), i = item.indexOf("=");
    if (i > 0 && item.slice(0, i) === name) return item.slice(i + 1);
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
async function redis(command) {
  const r = await fetch(process.env.KV_REST_API_URL, { method:"POST", headers:{ Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,"Content-Type":"application/json" }, body:JSON.stringify(command) });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  const d = await r.json(); if (d.error) throw new Error(d.error); return d.result;
}
async function loadTasks() {
  const raw = await redis(["GET", TASKS_KEY]); if (!raw) return [];
  try { const value=JSON.parse(raw); return Array.isArray(value)?value:[]; } catch { return []; }
}
async function saveTasks(tasks) { await redis(["SET", TASKS_KEY, JSON.stringify(tasks.slice(-MAX_TASKS))]); }
function normalizeTask(input, existing=null) {
  const now=new Date().toISOString();
  const title=String(input?.title ?? existing?.title ?? "").trim().slice(0,200); if(!title)return null;
  const status=["open","completed"].includes(input?.status)?input.status:(existing?.status||"open");
  return {
    id:existing?.id||`task_${crypto.randomUUID()}`, title, status,
    dueAt:input?.dueAt===null?null:(String(input?.dueAt ?? existing?.dueAt ?? "").trim()||null),
    remindAt:input?.remindAt===null?null:(String(input?.remindAt ?? existing?.remindAt ?? "").trim()||null),
    recurrence:input?.recurrence ?? existing?.recurrence ?? null,
    priority:["low","normal","high"].includes(input?.priority)?input.priority:(existing?.priority||"normal"),
    notes:String(input?.notes ?? existing?.notes ?? "").trim().slice(0,1000),
    createdAt:existing?.createdAt||now, updatedAt:now,
    completedAt:status==="completed"?(existing?.completedAt||now):null
  };
}
export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(!authorized(req))return res.status(401).json({error:"Nicht autorisiert."});
  if(!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return res.status(500).json({error:"Redis-Konfiguration fehlt."});
  try {
    let tasks=await loadTasks();
    if(req.method==="GET"){const status=String(req.query?.status||"open");return res.status(200).json({tasks:status==="all"?tasks:tasks.filter(t=>t.status===status)});}
    if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
    const action=String(req.body?.action||"").trim();
    if(action==="create"){const task=normalizeTask(req.body?.task);if(!task)return res.status(400).json({error:"Titel fehlt."});tasks.push(task);await saveTasks(tasks);return res.status(200).json({ok:true,task});}
    const id=String(req.body?.id||"").trim(), index=tasks.findIndex(t=>t.id===id);
    if(index<0)return res.status(404).json({error:"Aufgabe nicht gefunden."});
    if(action==="update"){const task=normalizeTask(req.body?.task,tasks[index]);if(!task)return res.status(400).json({error:"Ungültige Aufgabe."});tasks[index]=task;await saveTasks(tasks);return res.status(200).json({ok:true,task});}
    if(action==="complete"){tasks[index]=normalizeTask({status:"completed"},tasks[index]);await saveTasks(tasks);return res.status(200).json({ok:true,task:tasks[index]});}
    if(action==="delete"){const [task]=tasks.splice(index,1);await saveTasks(tasks);return res.status(200).json({ok:true,task});}
    return res.status(400).json({error:"Unbekannte Aktion."});
  } catch(error){console.error("Tasks API:",error);return res.status(500).json({error:"Task-Fehler."});}
}
