import {createHash,randomUUID} from 'node:crypto';
import {dataPrefix} from './environment.js';
import {companionStoreCommand as command,normalizeCompanionState,companionState,COMPANION_CAS_SCRIPT,contactClock,portraitGallery,projectState,memoryVersion,filterCompanionMemories} from './character-image.js';
import {visibleConversation} from './message-context.js';

const key=x=>dataPrefix()+'portrait:'+x;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const uuid=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x);
const arr=x=>Array.isArray(x)?x:[];
const text=(x,n=1000)=>{if(typeof x!=='string'||x.trim().length>n)throw Error('Text fehlt oder ist zu lang.');return x.trim();};
const read=async k=>JSON.parse(await command('GET',k)||'null');
const snapshot=async()=>{const raw=await command('GET',key('companion'));return {raw:raw||'',state:normalizeCompanionState(raw?JSON.parse(raw):null)};};
async function save(raw,state){state.revision++;if(await command('EVAL',COMPANION_CAS_SCRIPT,1,key('companion'),raw,JSON.stringify(state))!==1)throw Error('Stand geändert. Bitte neu öffnen.');return state;}
export function conversationPreferences(v={}){
 if(!['brief','balanced','detailed'].includes(v.length)||!['off','balanced','playful'].includes(v.humor)||!['careful','normal'].includes(v.questions)||!['gentle','normal'].includes(v.transitions))throw Error('Gesprächsauswahl ungültig.');
 return {length:v.length,humor:v.humor,questions:v.questions,transitions:v.transitions};
}
export function growthRecord(collection,v,old=null,now=new Date()){
 const at=now.toISOString(),base={id:old?.id||randomUUID(),title:text(v.title,100),createdAt:old?.createdAt||at,updatedAt:at,archived:old?.archived===true};if(!base.title)throw Error('Titel fehlt.');
 if(collection==='routines'){
  if(!['morning','evening','learning'].includes(v.kind)||!Array.isArray(v.steps)||!v.steps.length||v.steps.length>12||!Array.isArray(v.days)||!v.days.length||v.days.some(x=>!Number.isInteger(x)||x<0||x>6))throw Error('Routine benötigt Schritte und gültige Wochentage.');
  return {...base,kind:v.kind,steps:v.steps.map(x=>{const title=text(x.title,180);if(!title)throw Error('Schritttitel fehlt.');return {id:old?.steps.some(s=>s.id===x.id)?x.id:randomUUID(),title};}),days:[...new Set(v.days)],paused:old?.paused||false,history:arr(old?.history).slice(-60)};
 }
 if(collection==='photoProjects'){
  if(!Array.isArray(v.imageIds)||v.imageIds.length>24||v.imageIds.some(x=>!uuid(x)))throw Error('Bitte höchstens 24 Fotos wählen.');
  return {...base,text:text(v.text||'',2000),imageIds:[...new Set(v.imageIds)]};
 }
 if(collection==='photoNotes'){if(!uuid(v.imageId))throw Error('Fotowahl ungültig.');return {...base,imageId:v.imageId,text:text(v.text||'',1200),tags:text(v.tags||'',300)};}
 if(collection==='learningGoals'){
  if(!['spanish','nature','travel'].includes(v.interest)||!Number.isInteger(v.weeklyTarget)||v.weeklyTarget<1||v.weeklyTarget>21)throw Error('Lernziel ungültig.');
  return {...base,interest:v.interest,weeklyTarget:v.weeklyTarget,text:text(v.text||'',1000)};
 }
 if(collection==='projectResources'){
  if(!uuid(v.projectId)||!['note','decision','question','task','photo','topic'].includes(v.kind))throw Error('Projektzuordnung ungültig.');
  if(['task','photo','topic'].includes(v.kind)&&!text(v.targetId||'',120))throw Error('Bitte eine vorhandene Quelle wählen.');
  return {...base,projectId:v.projectId,kind:v.kind,targetId:v.targetId||null,text:text(v.text||'',2000)};
 }
 throw Error('Bereich ungültig.');
}
export function routineView(routine,now=new Date()){
 const day=contactClock(now).day,weekday=new Date(day+'T12:00:00Z').getUTCDay(),marks=routine.history.filter(x=>x.day===day),steps=routine.steps.map(x=>({...x,status:marks.find(m=>m.stepId===x.id)?.status||'open'}));
 const week=routine.history.filter(x=>x.day>=contactClock(new Date(+now-6*86400000)).day&&x.day<=day);
 return {...routine,day,due:!routine.paused&&!routine.archived&&routine.days.includes(weekday),steps,completed:steps.filter(x=>x.status==='done').length,skipped:steps.filter(x=>x.status==='skipped').length,review:week};
}
export async function editGrowth(input){
 const {raw,state}=await snapshot();if(input?.revision!==state.revision)throw Error('Stand geändert. Bitte neu öffnen.');const v=input.value||{},at=new Date().toISOString();
 if(input.action==='conversation')state.conversationPreferences=conversationPreferences(v);
 else if(input.action==='memory_pause'){
  const category=text(v.category,60);if(!category)throw Error('Kategorie fehlt.');if(v.until!==null&&(!Number.isFinite(Date.parse(v.until))||Date.parse(v.until)<=Date.now()))throw Error('Bitte ein zukünftiges Ende wählen.');
  state.memoryPauses=state.memoryPauses.filter(x=>x.category!==category);if(v.until!==null){if(state.memoryPauses.length>=30)throw Error('Zu viele Kategorien.');state.memoryPauses.push({id:category,category,until:v.until});}
 }else if(['calendar_archive','calendar_restore'].includes(input.action)){const event=state.calendarEvents.find(x=>x.id===input.id);if(!event)throw Error('Termin fehlt.');event.archived=input.action==='calendar_archive';}
 else if(input.action==='calendar_off'){state.calendarSettings={...state.calendarSettings,enabled:false};}
 else if(['routine_mark','routine_pause'].includes(input.action)){
  const routine=state.routines.find(x=>x.id===input.id&&!x.archived);if(!routine)throw Error('Routine fehlt.');
  if(input.action==='routine_pause')routine.paused=v.paused===true;
  else{if(routine.paused||!routineView(routine).due)throw Error('Routine ist heute pausiert oder nicht vorgesehen.');if(!routine.steps.some(x=>x.id===v.stepId)||!['done','skipped','open'].includes(v.status))throw Error('Schrittauswahl ungültig.');const day=contactClock().day;routine.history=routine.history.filter(x=>!(x.day===day&&x.stepId===v.stepId));if(v.status!=='open')routine.history.push({day,stepId:v.stepId,title:routine.steps.find(x=>x.id===v.stepId).title,status:v.status,at});routine.history=routine.history.slice(-60);}
  routine.updatedAt=at;
 }else{
  const collection=input.collection;if(!['routines','photoProjects','photoNotes','learningGoals','projectResources'].includes(collection))throw Error('Bereich ungültig.');const old=state[collection].find(x=>x.id===input.id);
  if(['archive','restore'].includes(input.action)){if(!old)throw Error('Eintrag fehlt.');old.archived=input.action==='archive';old.updatedAt=at;}
  else if(input.action==='upsert'){
   if(input.id&&!old)throw Error('Eintrag fehlt.');if(!old&&state[collection].length>=60)throw Error('Bereich ist voll.');const record=growthRecord(collection,v,old);
   if(collection==='photoProjects'||collection==='photoNotes'){const images=await portraitGallery(),ids=record.imageIds||[record.imageId];if(ids.some(id=>!images.some(x=>x.id===id&&x.status==='done')))throw Error('Ein Foto ist nicht mehr verfügbar.');}
   if(collection==='projectResources'){const projects=await projectState();if(!projects.items.some(x=>x.id===record.projectId))throw Error('Vorhaben nicht mehr verfügbar.');let targets=[];if(record.kind==='task')targets=arr(await read(dataPrefix()+'tasks'));if(record.kind==='photo')targets=(await portraitGallery()).filter(x=>x.status==='done');if(record.kind==='topic')targets=state.topics.filter(x=>!x.archived);if(['task','photo','topic'].includes(record.kind)&&!targets.some(x=>x.id===record.targetId))throw Error('Quelle nicht mehr verfügbar.');}
   state[collection]=state[collection].filter(x=>x.id!==record.id);state[collection].push(record);
  }else throw Error('Aktion ungültig.');
 }
 return save(raw,state);
}

// A calendar file is a user-selected snapshot, never an account connection or a complete free/busy feed.
export function zonedInstant(value,zone='Europe/Berlin'){
 const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);if(!m)throw Error('Datum mit Uhrzeit benötigt.');
 const parts=m.slice(1).map(x=>Number(x||0)),[y,mo,d,h,mi,ss=0]=parts,wall=Date.UTC(y,mo-1,d,h,mi,ss);if(new Date(wall).toISOString().slice(0,19)!==`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]||'00'}`)throw Error('Kalenderdatum ungültig.');
 const format=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}),local=t=>format.format(new Date(t)).replace(' ','T');let guess=wall;
 for(let n=0;n<4;n++){const rendered=local(guess),parsed=Date.parse(rendered+'Z');guess+=wall-parsed;}
 const wanted=value.length===16?value+':00':value;if(local(guess)!==wanted)throw Error('Diese Ortszeit existiert wegen der Zeitumstellung nicht.');
 if(local(guess-3600000)===wanted||local(guess+3600000)===wanted)throw Error('Doppelte Ortszeit bei Zeitumstellung: bitte UTC-Termin exportieren.');return new Date(guess).toISOString();
}
function icsDate(property){
 const [spec,...rest]=property.split(':'),value=rest.join(':').trim(),m=value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);if(!m)throw Error('Kalenderdatum nicht unterstützt.');
 const date=`${m[1]}-${m[2]}-${m[3]}`,local=date+'T'+(m[4]||'00')+':'+(m[5]||'00')+':'+(m[6]||'00');
 if(m[7]){const result=new Date(local+'Z');if(!Number.isFinite(+result)||result.toISOString().slice(0,19)!==local)throw Error('Kalenderdatum ungültig.');return {iso:result.toISOString(),allDay:false};}
 const zone=spec.match(/TZID=([^;:]+)/)?.[1]?.replace(/^"|"$/g,'')||'Europe/Berlin';return {iso:zonedInstant(local,zone),allDay:!m[4],date};
}
const unescape=x=>x.replace(/\\[nN]/g,'\n').replace(/\\([,;\\])/g,'$1');
export function parseCalendar(file){
 if(typeof file!=='string'||Buffer.byteLength(file)>500000||(!file.includes('BEGIN:VCALENDAR')||!file.includes('END:VCALENDAR')))throw Error('Bitte eine ICS-Datei bis 500 KB wählen.');
 const lines=file.replace(/\r\n/g,'\n').replace(/\n[ \t]/g,'').split('\n'),events=[];let event=null;
 for(const line of lines){if(line==='BEGIN:VEVENT'){if(event)throw Error('Verschachtelter Termin ungültig.');event=[];continue;}if(line==='END:VEVENT'){
   if(!event)throw Error('Kalender ungültig.');const get=name=>event.find(x=>new RegExp('^'+name+'[;:]').test(x));if(event.some(x=>/^(RRULE|RDATE|EXDATE|RECURRENCE-ID)[;:]/.test(x)))throw Error('Serientermine bitte für den gewünschten Zeitraum als einzelne Vorkommen exportieren. Es wurden keine Termine übernommen.');
   if(get('STATUS')?.endsWith(':CANCELLED')||get('TRANSP')?.endsWith(':TRANSPARENT')){event=null;continue;}
   if(!get('DTSTART'))throw Error('Termin ohne Beginn.');const start=icsDate(get('DTSTART'));let end;
   if(get('DTEND'))end=icsDate(get('DTEND')).iso;
   else if(start.allDay){const day=new Date(start.date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+1);end=zonedInstant(day.toISOString().slice(0,10)+'T00:00');}
   else if(get('DURATION')){const m=get('DURATION').match(/:PT(?:(\d+)H)?(?:(\d+)M)?$/);if(!m)throw Error('Termindauer nicht unterstützt.');end=new Date(Date.parse(start.iso)+(Number(m[1]||0)*60+Number(m[2]||0))*60000).toISOString();}
   else throw Error('Termin ohne eindeutiges Ende.');
   if(Date.parse(end)<=Date.parse(start.iso))throw Error('Terminende muss nach Beginn liegen.');
   const title=text(unescape((get('SUMMARY')||'SUMMARY:Belegt').split(':').slice(1).join(':')),180),uid=(get('UID')||'UID:'+hash(event)).slice(4);
   events.push({id:hash(uid).slice(0,32),uid:hash(uid),title:title||'Belegt',start:start.iso,end,source:'imported'});event=null;if(events.length>500)throw Error('Bitte höchstens 500 Einzeltermine importieren.');
  }else if(event)event.push(line);}
 if(event||!events.length)throw Error('Keine vollständigen belegten Einzeltermine gefunden.');const map=new Map();for(const event of events){const previous=map.get(event.id);if(previous&&(previous.start!==event.start||previous.end!==event.end))throw Error('Mehrere unterschiedliche Vorkommen mit gleicher Termin-ID: bitte getrennte Einzeltermine exportieren.');map.set(event.id,event);}return [...map.values()];
}
export const overlaps=(a,b)=>Date.parse(a.start)<Date.parse(b.end)&&Date.parse(b.start)<Date.parse(a.end);
const activeCalendar=state=>state.calendarEvents.filter(x=>!x.archived&&(x.source==='planned'||state.calendarSettings.enabled));
export function availableSlots(state,input,now=new Date()){
 if(!Number.isInteger(input.minutes)||input.minutes<15||input.minutes>240||!/^\d{4}-\d{2}-\d{2}$/.test(input.date))throw Error('Datum und 15 bis 240 Minuten wählen.');
 const start=zonedInstant(input.date+'T'+(input.from||'08:00')),end=zonedInstant(input.date+'T'+(input.until||'20:00'));if(Date.parse(end)<=Date.parse(start))throw Error('Zeitraum ungültig.');const slots=[],events=activeCalendar(state);
 for(let at=Math.max(Date.parse(start),Math.ceil(+now/1800000)*1800000);at+input.minutes*60000<=Date.parse(end)&&slots.length<8;at+=1800000){const slot={start:new Date(at).toISOString(),end:new Date(at+input.minutes*60000).toISOString()};if(!events.some(x=>overlaps(x,slot)))slots.push(slot);}
 return slots;
}
export async function calendarPreview(input){
 if(input.consent!==true)throw Error('Bitte die Nutzung der ausgewählten Kalenderdatei freigeben.');const events=parseCalendar(input.file),{raw}=await snapshot(),id=randomUUID();await command('SET',key('calendar-preview:'+id),JSON.stringify({raw,events}),'EX',600);return {id,events,conflicts:events.flatMap((a,i)=>events.slice(i+1).filter(b=>overlaps(a,b)).map(b=>({a:a.id,b:b.id}))).slice(0,100)};
}
export async function calendarConfirm(input){
 if(input.confirm!==true||!uuid(input.id))throw Error('Bitte die konkrete Kalenderübernahme bestätigen.');const preview=await read(key('calendar-preview:'+input.id));if(!preview)throw Error('Vorschau abgelaufen.');const {raw,state}=await snapshot();if(raw!==preview.raw)throw Error('Stand geändert. Neue Vorschau erstellen.');
 const wanted=new Set(arr(input.ids));if(!wanted.size||[...wanted].some(id=>!preview.events.some(x=>x.id===id)))throw Error('Terminauswahl ungültig.');
 const selected=preview.events.filter(x=>wanted.has(x.id)),preserved=state.calendarEvents.filter(x=>x.source!=='imported'||!wanted.has(x.id));if(preserved.length+selected.length>500)throw Error('Kalenderspeicher voll.');state.calendarEvents=[...preserved,...selected];state.calendarSettings={enabled:true,lastImportAt:new Date().toISOString(),source:'ics'};await save(raw,state);await command('DEL',key('calendar-preview:'+input.id));return {state};
}
export async function slotPreview(input){
 const {state,raw}=await snapshot(),title=text(input.title,100);if(!title)throw Error('Termintitel fehlt.');const slot={start:input.start,end:input.end};if(!Number.isFinite(Date.parse(slot.start))||!Number.isFinite(Date.parse(slot.end))||Date.parse(slot.start)<=Date.now()||Date.parse(slot.end)<=Date.parse(slot.start)||Date.parse(slot.end)-Date.parse(slot.start)>240*60000)throw Error('Zeitraum ungültig.');if(activeCalendar(state).some(x=>overlaps(x,slot)))throw Error('Dieser Zeitraum ist inzwischen belegt.');
 if(input.projectId&&!(await projectState()).items.some(x=>x.id===input.projectId&&x.status==='active'))throw Error('Aktives Vorhaben fehlt.');const id=randomUUID(),event={id,title,...slot,source:'planned',projectId:input.projectId||null};await command('SET',key('slot-preview:'+id),JSON.stringify({raw,event}),'EX',600);return {id,event};
}
export function calendarICS(event,now=new Date()){
 const escape=x=>String(x).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'),stamp=x=>new Date(x).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const fold=line=>{let lines=[],part='';for(const c of line){if(Buffer.byteLength(part+c)>73){lines.push(part);part=' '+c;}else part+=c;}lines.push(part);return lines.join('\r\n');};
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sofia//Planung//DE','BEGIN:VEVENT','UID:'+escape(event.id)+'@sofia.local','DTSTAMP:'+stamp(now),'DTSTART:'+stamp(event.start),'DTEND:'+stamp(event.end),'SUMMARY:'+escape(event.title),'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
export async function slotConfirm(input){
 if(input.confirm!==true||!uuid(input.id))throw Error('Bitte den Termin bestätigen.');const preview=await read(key('slot-preview:'+input.id));if(!preview)throw Error('Vorschau abgelaufen.');const {raw,state}=await snapshot(),existing=state.calendarEvents.find(x=>x.id===preview.event.id);if(existing)return {state,ics:calendarICS(existing),event:existing};if(Date.parse(preview.event.start)<=Date.now())throw Error('Der vorgeschlagene Beginn liegt inzwischen in der Vergangenheit. Bitte neue Zeit wählen.');if(raw!==preview.raw||activeCalendar(state).some(x=>overlaps(x,preview.event)))throw Error('Kalenderstand geändert. Neue Vorschau erstellen.');if(state.calendarEvents.length>=500)throw Error('Kalenderspeicher voll.');state.calendarEvents.push(preview.event);await save(raw,state);return {state,ics:calendarICS(preview.event),event:preview.event};
}

export async function growthOverview(){
 const [state,projects,tasks,images]=await Promise.all([companionState(),projectState(),read(dataPrefix()+'tasks'),portraitGallery()]);const currentTasks=arr(tasks);
 const views=projects.items.map(project=>{const resources=state.projectResources.filter(x=>x.projectId===project.id&&!x.archived),taskIds=[...new Set([...(project.taskIds||[]),...resources.filter(x=>x.kind==='task').map(x=>x.targetId)])],linked=taskIds.map(id=>currentTasks.find(x=>x.id===id)).filter(Boolean),steps=state.steps.filter(x=>x.projectId===project.id&&!x.archived).map(step=>({...step,progress:step.taskId?(currentTasks.find(x=>x.id===step.taskId)?.status==='completed'?100:0):step.progress}));
  const next=steps.filter(x=>x.progress<100&&x.dependencies.every(id=>steps.find(s=>s.id===id)?.progress===100));return {...project,resources,tasks:linked,missingTasks:taskIds.filter(id=>!currentTasks.some(x=>x.id===id)),steps,completedTasks:linked.filter(x=>x.status==='completed').length,nextSteps:project.status==='active'?next.slice(0,3):[]};});
 return {state,projects:views,tasks:currentTasks.map(({id,title,status})=>({id,title,status})),images:images.filter(x=>x.status==='done'),routines:state.routines.map(x=>routineView(x)),learning:state.learningGoals.filter(x=>!x.archived).map(x=>({...x,completedRounds:state.activityResults.filter(r=>r.type==='quiz'&&r.interest===x.interest&&Date.parse(r.at)>Date.now()-7*86400000).length,dueCards:state.learningCards.filter(c=>c.interest===x.interest&&Date.parse(c.dueAt)<=Date.now()).length}))};
}
export async function memoryTrace(input){
 const [history,hidden,memories,state]=await Promise.all([read(dataPrefix()+'history'),read(dataPrefix()+'chat-hidden-messages'),read(dataPrefix()+'longterm'),companionState()]);const turn=visibleConversation(arr(history),arr(hidden)).find(x=>x.role==='assistant'&&x.createdAt===input.turn?.createdAt&&x.content===input.turn?.content);if(!turn)throw Error('Diese Antwort ist nicht mehr im verfügbaren Chat.');
 const active=filterCompanionMemories(arr(memories).map(x=>typeof x==='string'?{text:x}:x),state),references=arr(turn.memoryReferences).map(ref=>active.find(x=>memoryVersion(x)===ref)).filter(Boolean).map(x=>({...x,reference:memoryVersion(x)}));return {items:references,tracked:turn.memoryTraceVersion===1,description:'Von Sofia für diese Textantwort genannte Gedächtnisbezüge. Das ist eine Quellenangabe, kein technischer Nachweis der internen Modellgewichtung. Gelöschte oder aktuell ausgeschlossene Angaben werden nicht erneut angezeigt.'};
}
export const MEMORY_CORRECT_SCRIPT=`-- sofia-memory-correct
if (redis.call('GET',KEYS[1]) or '')~=ARGV[1] or (redis.call('GET',KEYS[2]) or '')~=ARGV[2] then return 0 end
redis.call('SET',KEYS[1],ARGV[3]);redis.call('SET',KEYS[2],ARGV[4]);return 1`;
export async function correctMemory(input){
 const memoryRaw=await command('GET',dataPrefix()+'longterm')||'',{state,raw}=await snapshot(),items=arr(JSON.parse(memoryRaw||'[]')).map(x=>typeof x==='string'?{text:x}:x),index=items.findIndex(x=>memoryVersion(x)===input.reference);
 if(index<0)throw Error('Die Angabe hat sich geändert. Bitte neu öffnen.');const value=text(input.text,500);if(!value)throw Error('Neue Angabe fehlt.');const categories=['Personen','Vorlieben','Projekte & Arbeit','Ziele & Pläne','Gewohnheiten','Beziehung','Persönliches','Sonstiges'];if(!categories.includes(input.category))throw Error('Kategorie ungültig.');
 items[index]={...items[index],text:value,category:input.category,updatedAt:new Date().toISOString(),source:{kind:'manual',at:new Date().toISOString()}};state.memoryPolicies=state.memoryPolicies.map(x=>x.reference===input.reference?{...x,reference:memoryVersion(items[index])}:x);state.revision++;
 if(await command('EVAL',MEMORY_CORRECT_SCRIPT,2,dataPrefix()+'longterm',key('companion'),memoryRaw,raw,JSON.stringify(items),JSON.stringify(state))!==1)throw Error('Stand geändert. Bitte neu öffnen.');return {state};
}
