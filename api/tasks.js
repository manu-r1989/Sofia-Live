import crypto from "node:crypto";
import { nextRecurringDates } from "./task-dates.js";
import { withTaskMutationLock } from "./action-engine.js";

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
  const r = await fetch(process.env.KV_REST_API_URL, { method:"POST", headers:{ Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,"Content-Type":"application/json" }, signal:AbortSignal.timeout(10000), body:JSON.stringify(command) });
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
    if(req.method==="GET"){
      const tasks=await loadTasks();
      const status=String(req.query?.status||"open");
      const filtered=(status==="all"?tasks:tasks.filter(t=>t.status===status)).slice().sort((a,b)=>{
        const rank={high:0,normal:1,low:2},pa=rank[a.priority]??1,pb=rank[b.priority]??1;
        if(pa!==pb)return pa-pb;
        if(a.dueAt&&b.dueAt)return String(a.dueAt).localeCompare(String(b.dueAt));
        if(a.dueAt)return -1;if(b.dueAt)return 1;return String(a.createdAt||"").localeCompare(String(b.createdAt||""));
      });
      return res.status(200).json({tasks:filtered});
    }
    if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
    return await withTaskMutationLock(async () => {
      const tasks=await loadTasks();
      const action=String(req.body?.action||"").trim();
      if(action==="create"){const task=normalizeTask(req.body?.task);if(!task)return res.status(400).json({error:"Titel fehlt."});tasks.push(task);await saveTasks(tasks);return res.status(200).json({ok:true,task});}
      const id=String(req.body?.id||"").trim(), index=tasks.findIndex(t=>t.id===id);
      if(index<0)return res.status(404).json({error:"Aufgabe nicht gefunden."});
      if(action==="update"){const task=normalizeTask(req.body?.task,tasks[index]);if(!task)return res.status(400).json({error:"Ungültige Aufgabe."});tasks[index]=task;await saveTasks(tasks);return res.status(200).json({ok:true,task});}
      if(action==="complete"){
        const next=nextRecurringDates(tasks[index]);
        if(next){
          tasks[index]=normalizeTask({status:"open",...next},tasks[index]);
          await saveTasks(tasks);return res.status(200).json({ok:true,recurring:true,task:tasks[index]});
        }
        tasks[index]=normalizeTask({status:"completed"},tasks[index]);await saveTasks(tasks);return res.status(200).json({ok:true,task:tasks[index]});
      }
      if(action==="delete"){const [task]=tasks.splice(index,1);await saveTasks(tasks);return res.status(200).json({ok:true,task});}
      return res.status(400).json({error:"Unbekannte Aktion."});
    });
  } catch(error){
    if(error?.code==="ACTION_BUSY")return res.status(409).json({ok:false,status:"in_progress",error:"Eine Aufgabenaktion wird gerade verarbeitet. Bitte warte kurz und prüfe den Aufgabenstand."});
    console.error("Tasks API:",error);return res.status(500).json({ok:false,status:"execution_failed",error:"Die Aufgabenaktion konnte nicht sicher bestätigt werden. Bitte prüfe den Aufgabenstand vor einem erneuten Versuch."});
  }
}
