// Read-only summaries of actual saved work. Opening a target never advances it.
import {flowCursor} from './continuity-state.js';
const active=rows=>(rows||[]).filter(x=>!x.archived);
const stamp=x=>x.updatedAt||x.turns?.at(-1)?.at||x.createdAt||x.at||'';
const sort=rows=>rows.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||a.key.localeCompare(b.key));
export function activitySummary(state){
 const f=state.featureState,c=f.continuity,j=f.journey,v=f.expansion,resume=[],recent=[];
 const row=(kind,x,detail='',status='',extra={})=>({key:kind+':'+x.id,kind,id:x.id,title:x.title||x.goal,at:stamp(x),detail,status,...extra});
 for(const s of active(c.studySessions))if(s.status!=='done')resume.push(row('study',s,s.answers.length+'/'+s.cards.length+' beantwortet',s.status));
 for(const r of active(c.flowRuns))if(r.status!=='done'){const step=flowCursor(r);resume.push(row('flow',r,r.results.length+' Schritte bestätigt · '+(step?.title||''),r.status));}
 for(const r of active(j.runs))if(r.status!=='done')resume.push(row('guided',r,r.results.length+'/'+r.steps.length+' Schritte bestätigt',r.status));
 for(const p of active(j.paths)){const next=p.units.find(u=>!u.done);if(next)resume.push(row('path',p,p.units.filter(u=>u.done).length+'/'+p.units.length+' Einheiten abgeschlossen','active',{unitId:next.id}));}
 for(const t of active(j.trainings))if(t.rounds.length<18)resume.push(row('training',t,t.rounds.length+' gespeicherte Runden','active'));
 for(const s of active(v.sessions))if(s.turns.length<40)resume.push(row('session',s,s.turns.length+' gespeicherte Beiträge','active'));
 if(v.focus&&['running','paused'].includes(v.focus.status))resume.push(row('focus',{...v.focus,title:v.focus.goal,createdAt:v.focus.startedAt},v.focus.status==='paused'?'Restzeit gespeichert':'Nächste Etappe selbst bestätigen',v.focus.status));
 if(v.quiz&&v.quiz.at<v.quiz.cards.length)resume.push(row('quiz',{...v.quiz,createdAt:state.updatedAt||v.quiz.endsAt||new Date(0).toISOString()},v.quiz.at+'/'+v.quiz.cards.length+' Fragen beantwortet','active'));
 for(const [kind,rows]of [['note',f.studio.notes],['document',f.studio.documents],['report',j.reports],['research',c.folders],['project',c.projectFolders],['path',j.paths],['training',j.trainings],['world',j.worlds],['album',j.albums],['session',v.sessions],['practice',c.practice]])for(const x of active(rows))recent.push(row(kind,x));
 return {resume:sort(resume),recent:sort(recent).filter(r=>!resume.some(x=>x.key===r.key))};
}
export function projectSummary(state,projects,tasks,refs){
 const c=state.featureState.continuity;
 return c.projectFolders.filter(f=>!f.archived).map(folder=>{
  const project=projects.items.find(p=>p.id===folder.projectId),resources=state.projectResources.filter(r=>r.projectId===folder.projectId),steps=state.steps.filter(s=>!s.archived&&s.projectId===folder.projectId).map(s=>{const task=s.taskId?tasks.find(t=>t.id===s.taskId):null;return {...s,missingTask:!!s.taskId&&!task,progress:s.taskId?(task?.status==='completed'?100:0):s.progress};});
  return {folder,project:project||null,resources,steps,next:project?.status==='active'?steps.filter(s=>s.progress<100&&!s.missingTask&&s.dependencies.every(id=>steps.some(d=>d.id===id&&d.progress===100))):[],sources:folder.refs.map(r=>{const current=refs.find(x=>x.type===r.type&&x.id===r.id);return {...r,available:!!current,changed:!!current&&current.digest!==r.digest};})};
 });
}
export function practiceSummary(state,refs){
 const f=state.featureState,c=f.continuity;
 return c.practice.filter(p=>!p.archived).map(p=>{const source=refs.find(s=>s.type===p.source.type&&s.id===p.source.id),targets=p.kind==='cards'?p.targetIds.map(id=>f.cards.find(x=>x.id===id&&!x.archived)):p.targetIds.map(id=>f.journey.trainings.find(x=>x.id===id&&!x.archived));return {id:p.id,available:targets.filter(Boolean).length,total:p.targetIds.length,sourceAvailable:!!source,sourceChanged:!!source&&source.digest!==p.source.digest,attempts:p.kind==='cards'?targets.filter(Boolean).reduce((n,c)=>n+c.attempts,0):targets.filter(Boolean).reduce((n,t)=>n+t.rounds.length,0),correct:p.kind==='cards'?targets.filter(Boolean).reduce((n,c)=>n+c.correct,0):null};});
}
