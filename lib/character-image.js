import { dataPrefix, reserveTestImage } from "../lib/environment.js";
import { randomUUID, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export const PORTRAIT_FAILURE_REPLY = 'Ich bin gerade nicht in der passenden Umgebung für ein Foto. Frag mich gern gleich noch einmal.';
const PREFIX = dataPrefix() + 'portrait:';
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const clean = value => String(value || '').trim().slice(0, 1800);
const MOODS = ['entspannt','flirty','amüsiert','skeptisch','genervt','ernst','neutral'];
export function photoExpression(mood) {
  return ({entspannt:'relaxed, soft natural smile',flirty:'playful warm smile and subtle eye contact',amüsiert:'spontaneous amused smile or gentle laugh',skeptisch:'subtle questioning eyebrow and thoughtful look',genervt:'slightly unimpressed expression, natural and understated',ernst:'calm serious expression, no forced smile',neutral:'natural candid expression'})[mood] || 'natural candid expression';
}
export function lifeStatusLabel(location) {
  return String(location || '').trim().replace(/\s+in Hamburg$/i,'').replace(/^an der Universität$/i,'an der Uni').slice(0,120);
}
export function portraitPreparationReply(error) {
  const text=String(error?.message || '');
  return /^(?:Bitte frage das Bild und die Aufgabenaktion getrennt|Für diese Variante brauche ich zuerst)/.test(text) ? text : PORTRAIT_FAILURE_REPLY;
}
export function portraitPeriod(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23' }).formatToParts(now).map(p => [p.type,p.value]));
  const hour = Number(parts.hour);
  return `${parts.year}-${parts.month}-${parts.day}:${hour < 6 || hour >= 23 ? 'night' : hour < 11 ? 'morning' : hour < 18 ? 'day' : 'evening'}`;
}
export function portraitCandidate(message) {
  return /selfie|spiegelselfie|outfit(?:\s+of\s+the\s+day)?|ootd|(?:bild|foto|photo).{0,35}(?:von dir|von sofia|von mir selbst)|(?:zeig|schick).{0,25}(?:dich|dein look)|(?:ander|gleich).{0,20}(?:licht|beleuchtung|pose|hintergrund)|(?:zeig|schick).{0,35}(?:dein(?:e|en)? (?:umgebung|aussicht|café|cafe)|was du (?:gerade )?siehst)|(?:schick|send|mach|erstell|generier)\w*.{0,30}(?:bild|foto|photo)/i.test(message);
}
// Clear photograph commands cannot be demoted to conversation by the planner.
// Questions, quoted examples, negations and scheduled actions still use classification.
export function explicitPortraitRequest(message) {
  const text = String(message || '').trim();
  if (/^(?:warum|wieso|weshalb|was|wie|ob)\b|[„“"»«]|\b(?:kein(?:e|en)?|nicht|später|irgendwann|erinner\w*|aufgabe\w*|kalender|termin)\b/i.test(text)) return false;
  const self = /\b(?:selfie|spiegelselfie)\b|\b(?:bild|foto|photo)\b.{0,50}\b(?:von dir|von sofia|dich|dein(?:em|es)? gesicht)\b|\b(?:dich|dein(?:em|es)? gesicht)\b.{0,50}\b(?:bild|foto|photo)\b/i.test(text);
  if (!self) return false;
  return /\b(?:mach\w*|erstell\w*|generier\w*|zeig\w*|schick\w*|send\w*|möchte|will|hätte gern|wünsche|bitte|kannst|könntest|würdest)\b/i.test(text) || /^(?:ein(?:en)?\s+)?(?:spiegel)?selfie[.!?]?$/i.test(text);
}
async function command(...args) {
  const response = await fetch(process.env.KV_REST_API_URL, { method:'POST', headers:{ Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type':'application/json' }, body:JSON.stringify(args), signal:AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Bildspeicher ist nicht erreichbar.');
  const data = await response.json();
  if (data.error) throw new Error('Bildspeicher konnte nicht aktualisiert werden.');
  return data.result;
}
async function get(suffix) { const value=await command('GET',PREFIX+suffix);if(!value)return null;const parsed=JSON.parse(value);return ['gallery','jobs','notices'].includes(suffix)&&!Array.isArray(parsed)?[]:parsed; }
async function set(suffix, value, seconds) { return command('SET', PREFIX + suffix, JSON.stringify(value), ...(seconds ? ['EX', seconds] : [])); }
// User-owned projects are independent of Sofia's fictional day and interests.
export const PROJECT_CAS_SCRIPT = `-- sofia-project-cas
local current=redis.call('GET',KEYS[1]) or ''
if current~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2]);return 1`;
export async function projectState() {
  const state=await get('shared-projects');
  return state&&Array.isArray(state.items)?state:{revision:0,selectedId:null,items:[]};
}
const projectText=value=>typeof value==='string'?value.trim():'';
export function applyProjectEdit(state,input,now=new Date()) {
  if(!Number.isSafeInteger(input?.revision)||input.revision!==state.revision)throw Error('project_conflict');
  const next=structuredClone(state),at=now.toISOString(),operation=input.operation;
  const text=projectText(input.value);
  let target=next.items.find(x=>x.id===input.id);
  if(operation==='create') {
    if(text.length<3||text.length>100)throw Error('project_invalid');
    const same=next.items.find(x=>x.title.toLowerCase()===text.toLowerCase()&&x.status!=='completed');
    if(same){target=same;next.selectedId=same.id;} else {
    if(next.items.length>=12)throw Error('project_limit');
    target={id:randomUUID(),title:text,status:'active',goals:[],decisions:[],questions:[],taskIds:[],createdAt:at,updatedAt:at,history:[]};
    next.items.push(target);next.selectedId=target.id;
    }
  } else {
    if(!target)throw Error('project_missing');
    if(operation==='select')next.selectedId=target.id;
    else if(['pause','complete','resume'].includes(operation)) {
      target.status=({pause:'paused',complete:'completed',resume:'active'})[operation];
      if(operation==='resume')next.selectedId=target.id;
      else if(next.selectedId===target.id)next.selectedId=null;
    } else if(operation==='rename') {
      if(text.length<3||text.length>100||next.items.some(x=>x.id!==target.id&&x.title.toLowerCase()===text.toLowerCase()))throw Error('project_invalid');target.title=text;
    } else if(['add_note','remove_note'].includes(operation)) {
      if(!['goals','decisions','questions'].includes(input.field)||!text||text.length>300)throw Error('project_invalid');
      if(operation==='add_note') {
        if(target.status!=='active')throw Error('project_inactive');
        if(!target[input.field].includes(text)) {if(target[input.field].length>=12)throw Error('project_limit');target[input.field].push(text);}
      } else target[input.field]=target[input.field].filter(x=>x!==text);
    } else if(['link_task','unlink_task'].includes(operation)) {
      if(typeof input.taskId!=='string'||!(validId(input.taskId)||/^task_[a-zA-Z0-9_-]{1,100}$/.test(input.taskId)))throw Error('project_invalid');
      if(operation==='link_task'){if(target.status!=='active')throw Error('project_inactive');if(!target.taskIds.includes(input.taskId)){if(target.taskIds.length>=20)throw Error('project_limit');target.taskIds.push(input.taskId);}}
      else target.taskIds=target.taskIds.filter(x=>x!==input.taskId);
    } else throw Error('project_invalid');
  }
  if(JSON.stringify(next)===JSON.stringify(state))return state;
  target.updatedAt=at;target.history=[...target.history,{at,operation,...(input.field?{field:input.field}:{})}].slice(-8);
  next.revision=state.revision+1;return next;
}
export async function editProject(input,now=new Date()) {
  const raw=await command('GET',PREFIX+'shared-projects');
  const state=raw?JSON.parse(raw):{revision:0,selectedId:null,items:[]};
  if(input.operation==='link_task') {
    const tasks=JSON.parse(await command('GET',dataPrefix()+'tasks')||'[]');
    if(!tasks.some(t=>t.id===input.taskId))throw Error('project_task_missing');
  }
  const next=applyProjectEdit(state,input,now);
  if(next===state)return state;
  if(!await command('EVAL',PROJECT_CAS_SCRIPT,1,PREFIX+'shared-projects',raw||'',JSON.stringify(next)))throw Error('project_conflict');
  return next;
}
export async function projectOverview() {
  const state=await projectState(),ids=new Set(state.items.flatMap(x=>x.taskIds));
  const tasks=ids.size?JSON.parse(await command('GET',dataPrefix()+'tasks')||'[]'):[];
  return {...state,tasks:tasks.filter(t=>ids.has(t.id)).map(t=>({id:t.id,title:t.title,status:t.status,dueAt:t.dueAt||null}))};
}
export function projectContext(state={items:[]}) {
  const active=state.items.filter(x=>x.status==='active'),selected=active.find(x=>x.id===state.selectedId);
  return 'GEMEINSAME VORHABEN DES NUTZERS: '+JSON.stringify({selected:selected||null,active:active.slice(-4),inactive:state.items.filter(x=>x.status!=='active').map(x=>({title:x.title,status:x.status}))})+'. Von Sofias eigenen fiktiven Vorhaben unterscheiden. Nur ausdrücklich angelegte und gespeicherte Angaben bestätigen. Ideen sind keine Aufgaben. Aufgaben nur nach erfolgreichem Task-Ergebnis; Verknüpfung nur bei bestätigtem projectLink. Pausierte und abgeschlossene Vorhaben nicht ungefragt aufgreifen. Auf Nachfrage einen knappen Überblick aus Ziel, Entscheidungen, offenen Fragen und verknüpften Aufgaben geben; keine Fortschritte durch Zeitablauf erfinden. Über passende Ziele oder Entscheidungen sprechen, Änderungen erst nach ausdrücklichem Auftrag speichern.';
}
export function projectBinding(message,state) {
  const match=String(message).match(/^\s*(?:erstelle|erstell|lege an|mach)\s+für (?:das |unser )?Vorhaben (.+?)\s+(?:eine )?(Aufgabe|Erinnerung)\s*:\s*(.+)$/i);
  if(!match)return null;
  const project=state.items.find(p=>p.status==='active'&&p.title.toLowerCase()===match[1].trim().replace(/^[„"]|[“"]$/g,'').toLowerCase());
  return {projectId:project?.id||null,taskMessage:'Erstelle eine '+match[2]+': '+match[3],missing:!project};
}
export async function linkProjectResult(binding,result) {
  if(!binding||!result?.ok||!result.task?.id)return result;
  try {const state=await projectState();await editProject({operation:'link_task',id:binding.projectId,taskId:result.task.id,revision:state.revision});return {...result,projectLink:{ok:true,projectId:binding.projectId}};}
  catch {return {...result,projectLink:{ok:false,projectId:binding.projectId,error:'Die Aufgabe wurde ausgeführt; die Zuordnung zum Vorhaben wurde nicht bestätigt.'}};}
}
export async function executeProjectCommand(message) {
  const text=String(message).trim();
  if(!/^(?:lass uns|lege|erstell|pause|pausiere|schließe|schliesse|nimm|öffne|zeige|wie steht|zum vorhaben|für (?:das |unser )?vorhaben)/i.test(text))return null;
  const instruction=text.split(':')[0].replace(/[„"][^“"]*[“"]/g,'');
  if(/\b(?:nicht|später|vielleicht|angenommen)\b/i.test(instruction))return null;
  let create=text.match(/^Lass uns (?:meinen|meine|unseren|unsere|den|die|das) (.{3,100}?) (?:planen|als Vorhaben anlegen)[.!]?$/i)||text.match(/^(?:Lege|Erstelle) (?:das |ein |unser )?Vorhaben (.{3,100}?)(?: an)?[.!]?$/i);
  const status=text.match(/^(Pausiere|Schließe|Schliesse|Nimm|Öffne) (?:das |unser |unseres )?Vorhaben(?: (.+?))?(?: ab| wieder auf)?[.!]?$/i);
  const note=text.match(/^(?:Zum|Für (?:das|unser)) Vorhaben(?: (.+?))?\s*:\s*(Ziel|Entscheidung|Offene Frage)\s*:\s*(.{1,300})$/i);
  const overview=/^(?:Zeige|Wie steht).{0,30}(?:Vorhaben|Projekt)/i.test(text);
  if(!create&&!status&&!note&&!overview)return null;
  const state=await projectState();
  const title=projectText(status?.[2]||note?.[1]||(overview?text.match(/[„"]([^“"]+)[“"]/)?.[1]:null)).replace(/^[„"]|[“"]$/g,''),target=title?state.items.find(x=>x.title.toLowerCase()===title.toLowerCase()):state.items.find(x=>x.id===state.selectedId);
  if(title&&!target)return {reply:'Dieses Vorhaben konnte ich nicht finden. Bitte prüfe den Namen in der Übersicht.',state};
  if(overview&&!target)return {reply:state.items.length?'Gemeinsame Vorhaben: '+state.items.map(p=>p.title+' ('+({active:'in Arbeit',paused:'pausiert',completed:'abgeschlossen'})[p.status]+')').join('; ')+'. Welches möchtest du ansehen?':'Es ist noch kein gemeinsames Vorhaben angelegt.',state};
  if(overview){const data=await projectOverview(),project=target;if(!project)return {reply:'Es ist noch kein gemeinsames Vorhaben ausgewählt.',state};const tasks=data.tasks.filter(t=>project.taskIds.includes(t.id)&&t.status==='open');return {reply:`${project.title}: ${project.status==='active'?'in Arbeit':project.status==='paused'?'pausiert':'abgeschlossen'}. Ziele: ${project.goals.join('; ')||'noch offen'}. Entscheidungen: ${project.decisions.join('; ')||'noch keine'}. Offene Fragen: ${project.questions.join('; ')||'keine'}. Nächster Schritt: ${project.status==='active'?(tasks[0]?.title||project.questions[0]||project.goals[0]||'gemeinsam ein Ziel festlegen'):'ruht bis zu deiner ausdrücklichen Wiederaufnahme'}.`,state};}
  if(!create&&!target)return {reply:'Welches gemeinsame Vorhaben meinst du? Wähle es bitte in der Übersicht aus oder nenne seinen Namen.',state};
  const operation=create?'create':note?'add_note':/^paus/i.test(status[1])?'pause':/^schli/i.test(status[1])?'complete':'resume';
  try {const next=await editProject({revision:state.revision,operation,id:target?.id,value:create?create[1].trim().replace(/^[„"]|[“"]$/g,''):note?.[3],field:note?({'ziel':'goals','entscheidung':'decisions','offene frage':'questions'})[note[2].toLowerCase()]:undefined});
    const project=next.items.find(x=>x.id===(create?next.selectedId:target.id));
    return {reply:create?`Unser Vorhaben „${project.title}“ ist angelegt. Ziele, Entscheidungen und offene Fragen können wir darin sammeln.`:note?`Das habe ich beim Vorhaben „${project.title}“ gespeichert.`:`Das Vorhaben „${project.title}“ ist ${operation==='pause'?'pausiert':operation==='complete'?'abgeschlossen':'wieder aktiv'}.`,state:next};
  }catch(error){return {reply:error.message==='project_conflict'?'Das Vorhaben hat sich inzwischen geändert. Bitte prüfe die Übersicht.':'Diese Änderung am Vorhaben konnte ich nicht bestätigen.',state};}
}
export const MEMORY_CAS_SCRIPT = `-- sofia-memory-cas
if (redis.call('GET',KEYS[1]) or '')~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2]);return 1`;
export async function persistMemorySnapshot(previous,next) {
  const key=dataPrefix()+'longterm',raw=await command('GET',key);
  if(JSON.stringify(JSON.parse(raw||'[]'))!==JSON.stringify(previous))return false;
  return Boolean(await command('EVAL',MEMORY_CAS_SCRIPT,1,key,raw||'',JSON.stringify(next)));
}
export async function executeMemoryCommand(message) {
  const text=String(message).trim();
  const remove=text.match(/^(?:Bitte )?(?:vergiss|lösche|entferne) (?:die )?(?:Erinnerung|Vorliebe) [„"]([^“"]{1,500})[“"][.!]?$/i);
  const update=text.match(/^(?:Bitte )?(?:korrigiere|ändere) (?:die )?Erinnerung [„"]([^“"]{1,500})[“"] (?:zu|in) [„"]([^“"]{1,500})[“"][.!]?$/i);
  if(!remove&&!update){if(/^(?:Das stimmt nicht mehr|Bitte vergiss genau diesen Punkt)[.!]?$/i.test(text))return {reply:'Welche gespeicherte Erinnerung meinst du genau? Nenne bitte den Wortlaut oder bearbeite sie unter „Erinnerung“.'};return null;}
  const key=dataPrefix()+'longterm',raw=await command('GET',key),items=JSON.parse(raw||'[]'),old=(remove||update)[1];
  const matches=items.map((item,index)=>({item,index,text:typeof item==='string'?item:item.text})).filter(x=>x.text?.trim().toLowerCase()===old.trim().toLowerCase());
  if(matches.length!==1)return {reply:'Diese Erinnerung konnte ich nicht eindeutig finden. Bitte prüfe die Erinnerungsübersicht.'};
  const next=[...items],{item,index}=matches[0];
  if(remove)next.splice(index,1);else next[index]={...(typeof item==='object'?item:{}),text:update[2].trim(),updatedAt:new Date().toISOString(),category:typeof item==='object'?item.category:'Sonstiges'};
  if(!await command('EVAL',MEMORY_CAS_SCRIPT,1,key,raw||'',JSON.stringify(next)))return {reply:'Der Erinnerungsstand hat sich inzwischen geändert. Bitte prüfe ihn vor einer Wiederholung.'};
  return {reply:remove?'Die bezeichnete Erinnerung habe ich entfernt.':'Die bezeichnete Erinnerung habe ich korrigiert.'};
}
export const LIFE_CAS_SCRIPT = `-- sofia-life-cas
local current=redis.call('GET',KEYS[1]) or ''
if current~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2]); return 1`;
async function saveLife(previous,next) {
  next={...next,revision:(Number(previous?.revision)||0)+1};
  const change=next.situationChange;
  next=reconcileSituation(previous,next,new Date(change?.at||next.updatedAt||Date.now()),change?.source||'day_rhythm',change?.evidence||'',change?.fields||[]);
  delete next.situationChange;
  const ok=await command('EVAL',LIFE_CAS_SCRIPT,1,PREFIX+'life',previous?JSON.stringify(previous):'',JSON.stringify(next));
  return ok===1 ? next : null;
}
const safeText=(text,max=240)=>typeof text==='string'?text.trim().slice(0,max):'';
function photographLife(life) {
  return {...Object.fromEntries(['key','revision','period','location','activity','outfit','hairstyle','mood'].map(key=>[key,life[key]])),situation:situationSnapshot(life)};
}

// One bounded, versioned situation is stored atomically with the existing life.
const SITUATION_FIELDS=['location','activity','outfit','hairstyle','mood'];
export function situationPosture(life={}) {
  const text=String(life.location||'')+' '+String(life.activity||'');
  if(/bett|lieg|schlaf|ausruhen/i.test(text))return 'liegend oder zurückgelehnt';
  if(/sofa|café|cafe|kaffee|frühstück|lernen|universität|studienprojekt/i.test(text))return 'sitzend';
  if(/spazier|unterwegs|sport|training|bummel/i.test(text))return 'stehend oder in Bewegung';
  return 'entspannte Haltung passend zur Tätigkeit';
}
export function situationSnapshot(life={}) {
  const saved=life.situation||{};
  return {schema:1,revision:Number(life.revision)||0,at:saved.at||life.updatedAt||null,validUntil:saved.validUntil||null,key:life.key||null,period:life.period||null,
    ...Object.fromEntries(SITUATION_FIELDS.map(field=>[field,life[field]||''])),posture:situationPosture(life),sources:saved.sources||{}};
}
export function reconcileSituation(previous,next,now=new Date(),source='day_rhythm',evidence='',fields=[]) {
  if(!Number.isFinite(+now))now=new Date();
  const old=previous?.situation||{},at=now.toISOString(),sources={};
  const explicit=source==='correction'||source==='conversation';
  for(const field of SITUATION_FIELDS){
    const changed=previous?.[field]!==next[field];
    sources[field]=changed||explicit&&fields.includes(field)||!old.sources?.[field]?{source:field==='mood'&&next.moodMode==='manual'?'manual':source,at,...(explicit&&evidence?{evidence:safeText(evidence,240)}:{})}:old.sources[field];
  }
  const changed=SITUATION_FIELDS.some(field=>previous?.[field]!==next[field])||previous?.key!==next.key||!old.schema;
  const clock=contactClock(now),minute=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',minute:'2-digit'}).format(now));
  const slot=String(next.key||'').split(':').at(-1),end={breakfast:9,commute:9,morning:12,lunch:14,afternoon:17,evening:20,home:23,sleep:clock.hour>=23?30:6}[slot]||clock.hour+2;
  const remaining=Math.max(1,(end-clock.hour)*60-minute);
  const validUntil=new Date(+now+Math.min(remaining,explicit?90:remaining)*60000).toISOString();
  const snapshot={schema:1,revision:Number(next.revision)||0,at:changed||explicit?at:old.at||at,validUntil:changed||explicit?validUntil:old.validUntil||validUntil,key:next.key,period:next.period,
    ...Object.fromEntries(SITUATION_FIELDS.map(field=>[field,next[field]||''])),posture:situationPosture(next),sources};
  return {...next,statusLabel:lifeStatusLabel(next.location),situation:snapshot};
}
export function reactionContext(message='') {
  const text=String(message);
  const cues=[];
  const direct=!/[„“"]/i.test(text)&&!/^\s*(?:was bedeutet|angenommen|hypothetisch)/i.test(text)&&!/\bich bin (?:heute |gerade )?nicht\b/i.test(text);
  if(direct&&/\bich\b.{0,35}(?:freue mich|bin (?:glücklich|begeistert)|hab.?s geschafft)|hat geklappt|bestanden/i.test(text))cues.push('ausdrücklich geäußerte Freude: passend mitfreuen');
  if(direct&&/\bich\b.{0,35}(?:bin (?:genervt|wütend|frustriert)|ärgere mich)|das nervt mich/i.test(text))cues.push('ausdrücklich geäußerter Ärger: erst konkret auf den Anlass eingehen');
  if(direct&&/\bich\b.{0,35}(?:bin (?:heute |gerade |ziemlich |sehr )?(?:müde|erschöpft)|kann nicht schlafen)/i.test(text))cues.push('ausdrücklich geäußerte Müdigkeit: ruhig und knapp, keinen Gesprächsdruck erzeugen');
  if(direct&&/\bich\b.{0,35}(?:bin (?:unsicher|ratlos)|weiß nicht|habe angst)/i.test(text))cues.push('ausdrücklich geäußerte Unsicherheit: ernst nehmen, keine Sicherheit erfinden');
  return 'REAKTION AUF DIESEN TURN: '+(cues.length?cues.join('; '):'Keine eindeutige Gefühlsaussage; keine Stimmung oder Diagnose beim Nutzer vermuten')+'. Spiegeln sparsam und konkret; nicht jede Aussage bestätigen. Eigene Meinung darf abweichen, mit nachvollziehbarem Grund.';
}
export function responseToneFor(message='') {
  if(/\bich bin (?:heute |gerade )?nicht\b/i.test(message))return 'natural';
  if(conversationIntent(message)==='sensitive'||/\bich\b.{0,35}(?:bin (?:heute |gerade |ziemlich |sehr )?(?:genervt|wütend|frustriert|müde|erschöpft|unsicher|ratlos)|ärgere mich|weiß nicht|kann nicht schlafen)/i.test(message))return 'calm';
  return 'natural';
}
export function situationEvidence(value,reply) {
  reply=String(reply).replace(/„[^“]*“|"[^"]*"|»[^«]*«/g,'');
  if(!/\b(?:ich|mein\w*)\b/i.test(reply))return false;
  const tokens=text=>String(text).toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').match(/[\p{L}]{3,}/gu)||[];
  const ignore=new Set(['ich','mein','meine','einem','einen','einer','eine','ein','der','die','das','dem','den','und','mit','zum','zur','von','gerade','jetzt','aktuell','hamburg']);
  const stem=word=>word.length>5?word.replace(/(?:en|er|es|e)$/,''):word;
  const spoken=new Set(tokens(reply).map(stem)),words=tokens(value).filter(w=>!ignore.has(w));
  return words.length>0&&words.every(word=>spoken.has(stem(word)));
}
export function situationContext(life,message='',now=new Date()) {
  const snapshot=situationSnapshot(life);
  const history=(life.dayStory||[]).slice(-4);
  const past=/du warst|vorhin|gerade noch|vorher|gestern/i.test(message);
  return `VERBINDLICHE AKTUELLE SITUATION: ${JSON.stringify(snapshot)}. Alle aktuellen Aussagen und die Statusanzeige verwenden diesen Stand. Quellen und Ablaufzeiten sind interne Gültigkeitsgrenzen, keine Gesprächsinhalte. Korrekturen und ausdrücklich belegte aktuelle Angaben gehen älteren Details vor. Ein vergangener Ort oder eine Foto-Variante ändert den aktuellen Ort nicht. Liegen und Sitzen bei passenden Fotos erhalten.\n${past?'FRAGE ZUR FRÜHEREN SITUATION: '+JSON.stringify(history)+'. Nur tatsächlich beobachtete Stationen erklären; Lücken offenlassen.':''}\n${reactionContext(message)}\nZEITGRENZEN: Kurzfristige Situation gilt für ihren Zeitraum; Gesprächsfäden besitzen eigene Ablaufzeiten; dauerhafte Vorlieben nur mit ausdrücklichem Beleg. Ein Foto dokumentiert den gespeicherten Anfragezeitpunkt, nicht zwingend die Situation bei Fertigstellung.`;
}
export function applySituationCorrection(life,corrections,message,now=new Date()) {
  if(!/korrektur|\bnein\b|du (?:bist|sitzt|liegst|trägst) doch/i.test(message)||/du warst|vorhin|gestern|später|würdest|angenommen/i.test(message))return life;
  let next={...life};const evidence=[];
  for(const item of Array.isArray(corrections)?corrections.slice(0,4):[]){
    const field=item.field,value=safeText(item.value,160),proof=safeText(item.evidence,300);
    if(!['location','activity','outfit','hairstyle'].includes(field)||!value||proof.length<5||!message.toLowerCase().includes(proof.toLowerCase()))continue;
    const words=[...contextWords(value)],proofWords=contextWords(proof);if(!words.length||!words.every(word=>proofWords.has(word)))continue;
    if(field==='hairstyle'&&/blond|rothaar|schwarzhaar|braunhaar|gefärbt|färb|pink|blauhaar|grauhaar/i.test(value))continue;
    if(life.key?.endsWith(':sleep')&&['location','activity'].includes(field)&&/uni(?:versität)?|campus|vorlesung/i.test(value))continue;
    next[field]=value;evidence.push(proof);
  }
  if(!evidence.length)return life;
  delete next.transitionUntil;
  return {...next,situationChange:{source:'correction',evidence:evidence.join('; '),at:now.toISOString()}};
}
export function validQuietTime(value){return typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);}
export function contactPolicy(preferences={}) {
  const start=validQuietTime(preferences.quietStart)?preferences.quietStart:'23:00';
  const end=validQuietTime(preferences.quietEnd)&&preferences.quietEnd!==start?preferences.quietEnd:'08:00';
  return {quietStart:start,quietEnd:start===end?'09:00':end,pausedUntil:Number.isFinite(Date.parse(preferences.pausedUntil))?preferences.pausedUntil:null};
}
export function contactPauseReason(preferences,now=new Date()) {
  const p=contactPolicy(preferences);if(Date.parse(p.pausedUntil)>+now)return 'paused';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const minutes=Number(parts.hour)*60+Number(parts.minute),asMinutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  const start=asMinutes(p.quietStart),end=asMinutes(p.quietEnd);
  return (start>end?minutes>=start||minutes<end:minutes>=start&&minutes<end)?'quiet':null;
}
export function characterSettings(life) {
  const s=life?.settings||{};
  return {initiative:['quiet','balanced','active'].includes(s.initiative)?s.initiative:'balanced',photos:s.photos!==false,replyLength:['auto','short','detailed'].includes(s.replyLength)?s.replyLength:'auto'};
}
export function conversationIntent(message) {
  const text=String(message||'').trim();
  if(/(?:gute nacht|muss los|bis später|bis morgen|bis bald|lass gut|hör auf|tschüss|keine (?:weiteren )?fragen|für heute reicht)/i.test(text))return 'closing';
  if(/(?:nur kurz|kurze antwort|in einem satz|keine erklärung)/i.test(text))return 'brief';
  if(/(?:ich möchte (?:nur )?erzählen|hör (?:mir )?einfach zu|nur zuhören|lass mich erzählen)/i.test(text))return 'listening';
  if(/(?:traurig|trauer|gestorben|krank|schmerz|angst|verzweifelt|unfall)/i.test(text))return 'sensitive';
  return 'normal';
}
export function isCorrection(message) {
  return /^(?:nein[,!\s]+(?:ich meinte|gemeint war)|ich meinte|korrektur[:\s]|nicht .{1,100},? sondern)/i.test(String(message||'').trim());
}

// Local bounded policies shared by Text and Live; no extra model requests.
const contextWords=text=>new Set(String(text||'').toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]{4,}/gu)||[]);
const contextScore=(a,b)=>{const x=contextWords(a),y=contextWords(b);let n=0;for(const w of x)if(y.has(w))n++;return n;};
export function dialogueTopics(message) {
  return String(message||'').split(/(?:[;\n]|[.!?]\s+|\s+und\s+(?=(?:mein|meine|ich|wie|was|dein)\b)|\s+(?:außerdem|andererseits|und zum|und was)\s+)/i).map(x=>safeText(x,160)).filter(x=>x.length>=6).slice(0,3);
}
export function conversationFocus(life,message,now=new Date()) {
  const d=life?.dialogue||{},age=now.getTime()-Date.parse(d.at);
  if(!(age>=0&&age<86400000) || d.intent==='closing' && isConversationFollowup(message))return {type:'none'};
  const topics=(Array.isArray(d.topics)?d.topics:[d.topic]).filter(Boolean).slice(0,3);
  if(conversationTopicChange(message)&&!/zurück zu/i.test(message))return {type:'new_topic'};
  const ordinal=/\b(?:erst(?:en|e|er)?|1\.)\s+(?:punkt|thema|frage)|\bzum ersten\b/i.test(message)?0:/\b(?:zweit(?:en|e|er)?|2\.)\s+(?:punkt|thema|frage)|\bzum zweiten\b/i.test(message)?1:/\b(?:dritt(?:en|e|er)?|3\.)\s+(?:punkt|thema|frage)/i.test(message)?2:-1;
  if(ordinal>=0)return topics[ordinal]?{type:'conversation',topic:topics[ordinal]}:{type:'ambiguous',topics};
  if(/^das andere[.!?\s]*$/i.test(String(message))){const remaining=topics.filter(topic=>topic!==d.selectedTopic);return d.selectedTopic&&remaining.length===1?{type:'conversation',topic:remaining[0]}:{type:'ambiguous',topics};}
  const scored=topics.map(topic=>({topic,score:contextScore(topic,message)})).sort((a,b)=>b.score-a.score);
  if(scored[0]?.score>0&&scored[0].score>(scored[1]?.score||0))return {type:'conversation',topic:scored[0].topic};
  if(isConversationFollowup(message)||isCorrection(message))return topics.length>1?{type:'ambiguous',topics}:{type:'conversation',topic:topics[0]||d.topic};
  return {type:'none'};
}
export function conversationClarification(life,message,now=new Date()) {
  if(!isConversationFollowup(message) && !/^zum (?:ersten|zweiten|dritten) punkt[.!?\s]*$/i.test(String(message||'')))return null;
  const focus=conversationFocus(life,message,now);
  if(focus.type!=='ambiguous')return null;
  const topics=(focus.topics||[]).map(t=>safeText(t,110).replace(/^nur f[üu]r diesen test:\s*/i,''));
  if(topics.length<2)return 'Welchen Punkt meinst du genau?';
  return 'Meinst du '+topics.map(t=>'„'+t+'“').join(' oder ')+'?';
}
export function permanentMemoryCandidate(message) {
  const t=String(message||'').trim();
  if(/\b(?:vielleicht|eventuell|vermutlich|angenommen|hypothetisch|würde|könnte|falls)\b|[„“"»«]/i.test(t))return false;
  if(/\b(?:vergiss|lösche|entferne)\b.{0,70}(?:erinnerung|gedächtnis|über mich|vorliebe)/i.test(t))return true;
  if(/\b(?:heute|morgen|gestern|gerade|momentan|diese woche|um \d{1,2}(?:[:.]\d{2})? uhr)\b/i.test(t)&&!/\b(?:immer|grundsätzlich|dauerhaft|seit jahren)\b/i.test(t))return false;
  return /\b(?:merk dir|merke dir|ich (?:heiße|bin|arbeite|studiere|mag|liebe|bevorzuge|trinke|esse|lese|spiele|wohne|habe|möchte|will)|mein(?:e|en)? (?:name|beruf|hobby|lieblings|partner|freund|projekt)|korrektur|ich meinte|nicht .{1,60} sondern)\b/i.test(t);
}
export function guardPermanentMemory(message,action,memories=[]) {
  const none={action:'none',old_memory:null,new_memory:null,category:null};
  if(!action||action.action==='none')return none;
  if(!permanentMemoryCandidate(message))return none;
  const texts=memories.map(x=>typeof x==='string'?x:x?.text).filter(x=>typeof x==='string');
  const old=String(action.old_memory||'').trim(),next=String(action.new_memory||'').trim();
  if(['update','delete'].includes(action.action)&&!texts.some(x=>x.trim().toLowerCase()===old.toLowerCase()))return none;
  if(action.action==='delete')return /vergiss|lösch|entfern|nicht mehr speichern/i.test(message)?action:none;
  if(/\b(?:nicht|kein\w*|ohne)\b/i.test(message) && !/\b(?:nicht|kein\w*|ohne|abneigung|meidet)\b/i.test(next))return none;
  if(!['add','update'].includes(action.action)||!next||next.length>500||!contextScore(message,next))return none;
  if(/\b(?:sofia|sie)\b/i.test(next)&&!contextScore(message,next.replace(/sofia|sie/gi,'')))return none;
  if(action.action==='update'&&!isCorrection(message)&&!/\b(?:jetzt|inzwischen|nicht mehr|ändere|aktualisiere)\b/i.test(message))return none;
  return {...action,evidence:safeText(message,500),certainty:'explicit_statement'};
}
export function compactConversationHistory(history,message='',maxChars=14000) {
  const clean=(Array.isArray(history)?history:[]).filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string').slice(-40);
  const recent=[];let remaining=Math.max(1000,Math.min(20000,maxChars));
  for(const turn of clean.slice(-12).reverse()) {
    if(remaining<=0)break;
    const content=turn.content.slice(0,Math.min(3000,remaining));remaining-=content.length;
    recent.unshift({...turn,content});
  }
  const older=clean.slice(0,-12).map((x,index)=>({x,index,score:contextScore(x.content,message)}));
  const selected=older.sort((a,b)=>b.score-a.score||b.index-a.index).slice(0,8).sort((a,b)=>a.index-b.index);
  const olderContext=selected.map(({x})=>`${x.role==='user'?'Nutzer':'Sofia'}: ${x.content.trim().slice(0,220)}`).join('\n').slice(0,2000);
  return {recentHistory:recent,olderContext};
}
export function recentDayContinuity(previous,next,now) {
  const today=next.key?.slice(0,10),before=previous?.key?.slice(0,10);
  let days=Array.isArray(previous?.recentDays)?previous.recentDays:[];
  if(before&&before<today&&Array.isArray(previous.dayStory)&&previous.dayStory.length)days=[...days.filter(d=>d.date!==before),{date:before,events:previous.dayStory.slice(-4)}];
  return days.filter(d=>d.date<today&&d.date>=new Date(now.getTime()-3*86400000).toISOString().slice(0,10)).slice(-3);
}
export function activityDevelopment(life) {
  const matches=x=>contextScore(life.activity,(x.topic||'')+' '+(x.description||x.text||''))>0;
  return {interests:(life.interests||[]).filter(x=>!x.dismissed&&matches(x)).slice(-2).map(({topic,description,progress})=>({topic,description,progress})),plans:(life.plans||[]).filter(x=>!x.dismissed&&x.status==='active'&&matches(x)).slice(-2).map(({topic,text,status})=>({topic,text,status}))};
}
export function safeDiagnostic(error,fallback='request_failed') {
  const allowed=['task_provider_failed','task_classifier_incomplete','task_classifier_invalid_json','task_store_unavailable','task_write_unconfirmed','chat_provider_failed','chat_response_invalid','chat_store_unconfirmed','memory_provider_failed','portrait_provider_failed','portrait_moderated','portrait_store_unconfirmed','portrait_generation_failed','test_image_limit'];
  return {code:allowed.includes(error?.code)?error.code:fallback,...(Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?{status:error.status}:{})};
}

export function conversationReference(life,message,now=new Date()) {
  const d=life.dialogue||{},age=now.getTime()-Date.parse(d.at);
  if(!Number.isFinite(age) || age<0 || age>=86400000)return {type:'none'};
  if(!isConversationFollowup(message) && !isCorrection(message) && !/\b(?:das|danach|noch einmal|nochmal)\b/i.test(message))return {type:'none'};
  if(/(?:aufgabe|termin|erinnerung|kalender)/i.test(message))return {type:'task',topic:d.topic};
  if(/(?:foto|bild|selfie|licht|lächeln|abstand)/i.test(message))return {type:'photo',topic:d.topic};
  if(/^(?:noch einmal|nochmal|das nochmal)[.!?\s]*$/i.test(message))return {type:'ambiguous',topic:d.topic};
  const focus=conversationFocus(life,message,now);
  return focus.type==='ambiguous'?focus:{type:'conversation',topic:focus.topic||d.topic,lastUser:d.lastUser,lastAssistant:d.lastAssistant,correction:isCorrection(message)};
}
export function taskReceipt(action) {
  if(!action || action.ok!==true) {
    if(action?.status==='missing_due_at')return 'Für diese Aufgabe fehlt noch ein Termin.';
    if(action?.status==='ambiguous')return 'Welche Aufgabe meinst du genau?';
    if(action?.status==='in_progress')return 'Die Aufgabenaktion wird bereits verarbeitet; ihr Erfolg ist noch nicht bestätigt.';
    return 'Der Ausgang der Aufgabenaktion ist noch unbestätigt. Bitte prüfe den Aufgabenstand.';
  }
  const title=String(action.task?.title||'').slice(0,160);
  const replies={create:`Als Aufgabe gespeichert: „${title}“.`,create_existing:`„${title}“ steht bereits in deinen Aufgaben.`,update:`Aufgabe aktualisiert: „${title}“.`,complete:`Erledigt: „${title}“.`,complete_recurring:`„${title}“ ist erledigt und auf den nächsten Termin gesetzt.`,delete:`„${title}“ wurde aus den Aufgaben gelöscht.`,calendar_export:`Kalenderimport für „${title}“ ist vorbereitet.`};
  if(action.action==='list')return (action.tasks||[]).length?'Offene Aufgaben: '+action.tasks.slice(0,8).map(t=>t.title).join('; ')+'.':'Keine offenen Aufgaben in dieser Abfrage.';
  return replies[action.action] || 'Es wurde keine Aufgabenaktion ausgeführt.';
}
export function hamburgReferenceTime(now=new Date()) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now);
}
function ownEvidence(evidence,reply) {
  if(!safeText(evidence,500) || !reply.toLowerCase().includes(evidence.toLowerCase()) || !/\bich\b/i.test(evidence) || /\b(?:würde|könnte|vielleicht|hypothetisch)\b/i.test(evidence))return false;
  const prefix=reply.slice(0,reply.toLowerCase().indexOf(evidence.toLowerCase()));
  return (prefix.match(/[„“"]/g)||[]).length%2===0;
}
export function characterWeek(now=new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now).map(x=>[x.type,x.value]));
  const day={Mon:'Montag',Tue:'Dienstag',Wed:'Mittwoch',Thu:'Donnerstag',Fri:'Freitag',Sat:'Samstag',Sun:'Sonntag'}[p.weekday];
  const frame={Mon:'Lernen und die Woche sortieren',Tue:'Universität, am frühen Abend Sport',Wed:'Universität und Zeit für ein eigenes Studienprojekt',Thu:'Universität, am frühen Abend Sport',Fri:'Lernen und ein entspannter Abend',Sat:'Freizeit, Stadt oder Freunde',Sun:'Ruhiger Tag und Vorbereitung auf die Woche'}[p.weekday];
  return {date:`${p.year}-${p.month}-${p.day}`,day,frame};
}
function developmentEvent(events,entry) {
  if(events.at(-1)?.topic===entry.topic && events.at(-1)?.text===entry.text)return events;
  return [...events,entry].slice(-12);
}

export function isConversationFollowup(message) {
  return /^(?:warum|wieso|weshalb|wie denn|was meinst du(?: damit)?|wie meinst du das|und (?:danach|dann|du|bei dir)|was (?:danach|dann)|das andere|zum (?:ersten|zweiten|dritten) (?:punkt|thema)|erzähl(?:e)? (?:mir )?(?:mehr|weiter)|zeig(?:e)? mir das|das gleiche|dasselbe|dieses (?:bild|foto)|etwas (?:näher|weiter weg)|mit (?:einem )?lächeln)[.!?\s]*$/i.test(String(message||'').trim());
}
export function conversationTopicChange(message) {
  return /(?:andere frage|anderes thema|thema wechseln|darüber (?:nicht|möchte ich nicht)|lass uns (?:über|von etwas anderem)|zurück zu)/i.test(String(message||''));
}
const intentClosing=message=>conversationIntent(message)==='closing';
function questionKey(text) {
  return String(text||'').toLowerCase().normalize('NFKC').replace(/[^a-zäöüß0-9 ]/g,' ').split(/\s+/).filter(w=>w && !['denn','eigentlich','gerade','so','mal','bitte'].includes(w)).join(' ');
}
export function updateDialogue(life,message,reply,now,decision={}) {
  const before=life.dialogue||{};
  if(before.at===now.toISOString()&&before.lastUser===safeText(message,600)&&before.lastAssistant===safeText(reply,600))return life;
  const lastQuestion=(reply.match(/[^.!?\n]{5,}\?/g)||[]).at(-1)?.trim();
  const lastAt=Date.parse(before.at),fresh=now.getTime()-lastAt>=0 && now.getTime()-lastAt<86400000;
  let questions=fresh && Array.isArray(before.questions)?before.questions.map(q=>({...q})):[];
  const followup=isConversationFollowup(message),correction=isCorrection(message),changed=conversationTopicChange(message);
  const focus=conversationFocus(life,message,now);
  const topic=followup && fresh && before.intent!=='closing' && !changed ? focus.topic||before.topic : safeText(message,160);
  const topics=followup&&fresh&&before.intent!=='closing'&&!changed?(before.topics||[before.topic]):dialogueTopics(message);
  const closedTopics=(fresh?before.closedTopics||[]:[]).slice(-5);
  if(changed||intentClosing(message))for(const closed of before.topics||[before.topic])if(closed)closedTopics.push({topic:closed,at:now.toISOString()});
  const intent=conversationIntent(message),oldPending=before.pendingQuestion;
  if(oldPending && fresh && (!followup || changed || intent==='closing')) {
    const evidence=safeText(decision.question?.evidence,500),classified=['answered','skipped'].includes(decision.question?.status) && evidence.length>=3 && message.toLowerCase().includes(evidence.toLowerCase());
    const status=intent==='closing' || changed || correction?'skipped':classified?decision.question.status:!message.includes('?')?'answered':'skipped';
    questions=questions.map(q=>q.text===oldPending?{...q,status,closedAt:now.toISOString()}:q);
  }
  const repeated=lastQuestion && questions.some(q=>questionKey(q.text)===questionKey(lastQuestion));
  if(lastQuestion && !repeated)questions=[...questions,{text:lastQuestion,topic,status:'open',at:now.toISOString()}].slice(-8);
  let pendingQuestion=lastQuestion&&!repeated?lastQuestion:!lastQuestion && fresh && followup && !changed && intent!=='closing'?oldPending:null;
  if(intent==='closing')pendingQuestion=null;
  const corrections=(Array.isArray(before.corrections)?before.corrections:[]).filter(c=>now.getTime()-Date.parse(c.at)>=0 && now.getTime()-Date.parse(c.at)<86400000);
  if(correction)corrections.push({message:safeText(message,300),previousUser:safeText(before.lastUser,300),at:now.toISOString()});
  const recentTurns=(fresh && Array.isArray(before.recentTurns)?before.recentTurns:[]).filter(t=>now.getTime()-Date.parse(t.at)>=0 && now.getTime()-Date.parse(t.at)<86400000);
  const turn={user:safeText(message,400),assistant:safeText(reply,400),at:now.toISOString()};
  if(recentTurns.at(-1)?.user!==turn.user || recentTurns.at(-1)?.assistant!==turn.assistant || recentTurns.at(-1)?.at!==turn.at)recentTurns.push(turn);
  const threads=(life.threads||[]).map(t=>{
    const keyword=t.topic.split(/\s+/).find(w=>w.length>=4);
    return lastQuestion && keyword && lastQuestion.toLowerCase().includes(keyword.toLowerCase()) ? {...t,lastAskedAt:now.toISOString()} : t;
  });
  return {...life,responseTone:responseToneFor(message),threads,dialogue:{topic,topics,selectedTopic:focus.type==='conversation'?focus.topic:null,closedTopics:closedTopics.slice(-6),lastUser:safeText(message,600),lastAssistant:safeText(reply,600),pendingQuestion,questions,intent,correction:correction?corrections.at(-1):null,corrections:corrections.slice(-4),recentTurns:recentTurns.slice(-12),turnsSinceQuestion:lastQuestion&&!repeated?0:Math.min(10,(Number(before.turnsSinceQuestion)||0)+1),at:now.toISOString(),...(intent==='closing'?{contactPauseUntil:new Date(+now+(/gute nacht|bis morgen/i.test(message)?8*3600000:30*60000)).toISOString()}:{})}};
}
export function conversationContinuity(life,message,now=new Date()) {
  const d=life?.dialogue||{},age=now.getTime()-Date.parse(d.at),fresh=Number.isFinite(age)&&age>=0&&age<86400000;
  const changed=conversationTopicChange(message),intent=conversationIntent(message),settings=characterSettings(life);
  const recent=fresh?(d.recentTurns||[]).slice(-3):[];
  const unanswered=fresh&&age<7200000&&!changed&&d.intent!=='closing'?d.pendingQuestion:null;
  const since=Number.isFinite(d.turnsSinceQuestion)?d.turnsSinceQuestion:10;
  return {fresh,paused:fresh&&age>=7200000,topic:fresh&&!changed&&d.intent!=='closing'?d.topic:null,pendingQuestion:unanswered||null,focus:conversationFocus(life,message,now),closedTopics:fresh?(d.closedTopics||[]).slice(-3):[],recentTurns:changed?[]:recent,corrections:fresh?(d.corrections||[]).filter(c=>now.getTime()-Date.parse(c.at)>=0 && now.getTime()-Date.parse(c.at)<86400000).slice(-4):[],questionAllowed:!['closing','brief','listening','sensitive'].includes(intent)&&settings.initiative!=='quiet'&&!unanswered&&(!fresh||since>=(settings.initiative==='active'?1:2))};
}
export function initiativeContext(life,message,now=new Date()) {
  const settings=characterSettings(life),d=life.dialogue||{},gap=now.getTime()-Date.parse(d.at);
  const intent=conversationIntent(message),stop=intent==='closing',continuity=conversationContinuity(life,message,now);
  const serious=intent==='sensitive';
  const habits=(life.habits||[]).filter(h=>h.count>=2).map(h=>({topic:h.topic,value:h.value}));
  return `GESPRÄCHSSTEUERUNG: ${continuity.questionAllowed?'Eine einzelne passende Nachfrage ist möglich, wenn sie Mehrwert hat':'In diesem Turn keine freiwillige Anschlussfrage; notwendige Aktionsklärung bleibt erlaubt'}. ${settings.initiative==='quiet'?'Zurückhaltend, keine freiwilligen Rückfragen; notwendige Klärung bleibt erlaubt':settings.initiative==='active'?'Interessiert und aktiv, höchstens eine passende Nachfrage; kein Interview':'Ausgewogen: eigener Gedanke oder gelegentliche Nachfrage, keine Pflichtfrage'}. ${stop?'Nutzer beendet/beruhigt das Gespräch: knapp abschließen, keine neue Frage und kein Foto.':serious?'Ernster Moment: ruhig und einfühlsam, keine Neckerei, keine Fotoinitiative.':'Initiative nur bei situativem Mehrwert.'} ${intent==='listening'?'ZUHÖREN: kurz spiegeln, Raum lassen, keine ungefragten Lösungen und keine neue Rückfrage.':intent==='brief'?'AKTUELLER WUNSCH: sehr kurz antworten, ohne Anschlussfrage.':''} Antwortlänge ${settings.replyLength==='short'?'kurz':settings.replyLength==='detailed'?'ausführlich, soweit hilfreich':'nach Bedarf'}.\nBESTÄTIGTE GESPRÄCHSGEWOHNHEITEN: ${JSON.stringify(habits)}. Nur passend berücksichtigen; aktuelle ausdrückliche Wünsche haben Vorrang.\n${Number.isFinite(gap)&&gap>7200000?'WIEDERAUFNAHME NACH PAUSE: Alte Orte und Tätigkeiten sind vergangen. Natürlich wieder anknüpfen, keine lückenlos gemeinsam erlebte Zeit behaupten.':''}\nLETZTER GEMEINSAMER GESPRÄCHSBEZUG: ${continuity.fresh && !conversationTopicChange(message)?JSON.stringify({topic:d.topic,lastUser:d.lastUser,lastAssistant:d.lastAssistant}):'Kein aktueller Bezug'}. Bei kurzen Follow-ups an diesen Bezug anknüpfen. BEZUG DIESES TURNS: ${JSON.stringify(conversationReference(life,message,now))}. GEMEINSAMER GESPRÄCHSFADEN: ${JSON.stringify(continuity)}. ${conversationClarification(life,message,now)?`BEZUGSKLÄRUNG DIESES TURNS: Stelle diese konkrete Klärungsfrage, ohne den Bezug zu raten: ${conversationClarification(life,message,now)}`:""} Bei paused ein früheres Thema nur bei aktuellem Bezug aufgreifen, keine alte offene Frage automatisch wiederholen. Bei ausdrücklichem Themenwechsel das neue Anliegen beantworten; alte Fragen ruhen. Kurzantworten und Korrekturen sind kurzfristiger Gesprächskontext, keine automatisch dauerhaften Nutzerfakten. Aktuelle Korrekturen haben Vorrang vor widersprechenden älteren Details; bei unklarem Bezug knapp klären. Bei ambiguous vor einer erneuten Aktion klären; bei Korrektur nur den bezeichneten Bezug berichtigen, keine anderen Daten verändern. Mehrere Anliegen strukturiert beantworten; Aktionsresultate nur aus bestätigten Ergebnissen. Bereits gestellte, beantwortete und übersprungene Rückfragen nicht erneut stellen. Bei focus.type ambiguous höchstens eine kurze Bezugsklärung; keine Auswahl raten und daraus keine Aktion ableiten. Geschlossene Themen ohne ausdrücklichen Nutzerbezug ruhen lassen. Eigene Meinung konkret und begründet äußern, nicht jede Aussage bestätigen oder nur spiegeln. Antworten abwechslungsreich beginnen; keine wiederkehrenden Standardfloskeln. Eigener Gedanke darf eine Nachfrage ersetzen; kein Interview. Letzte Antwort nicht paraphrasierend wiederholen, wenn der Nutzer eine neue Frage stellt.`;
}
export function photoVariantRequest(message) {
  const text=String(message||'').trim();
  if(/\b(?:später|erinner\w*|aufgabe|termin)\b|[„“"]/i.test(text))return false;
  if(/\b(?:ist|gefällt|finde)\b/i.test(text) && !/ändern|mach|zeig|schick/i.test(text))return false;
  const changes=/(?:licht|beleuchtung|lächeln|näher|weiter weg|abstand|pose|hintergrund|gesichtsausdruck|ausschnitt|beschnitt|mehr umgebung|weniger gestellt|spontaner)/i;
  return /^(?:bitte )?(?:weniger gestellt|mehr umgebung|spontaner)[.!?]*$/i.test(text) || /^(?:(?:bitte )?(?:etwas|ein wenig) (?:näher|weiter weg)|(?:bitte )?(?:mit|ohne|weniger|mehr) (?:einem )?lächeln)[.!?]*$/i.test(text) || /^(?:dasselbe|das gleiche|dieses (?:bild|foto)|(?:bitte )?nur|nein[,\s]+ich meinte)/i.test(text) && changes.test(text);
}
export function variantDimensions(message) {
  const dimensions=[];
  for(const [name,pattern]of [['lighting',/licht|beleuchtung/i],['expression',/lächeln|gesichtsausdruck|mimik|ernster|fröhlicher|weniger gestellt|ungestellt|spontaner/i],['distance',/näher|weiter weg|abstand|mehr umgebung/i],['framing',/ausschnitt|bildschnitt|beschnitt|zuschnitt|mehr umgebung|weniger gestellt|ungestellt|spontaner/i],['pose',/pose|haltung|weniger gestellt|ungestellt|spontaner/i],['background',/hintergrund/i],['outfit',/outfit|kleidung|oberteil|pullover|shirt|bluse|kleid\b/i],['hairstyle',/frisur|pferdeschwanz|haare zusammen|haare offen/i],['time',/tageszeit|statt tagsüber|statt nachts|am abend statt|am morgen statt/i]])if(pattern.test(message))dimensions.push(name);
  return dimensions;
}
function mixedParts(plan,message) {
  const taskMessage=safeText(plan.taskMessage,1000),photoMessage=safeText(plan.photoMessage,1000);
  if(!taskMessage || !photoMessage || !message.toLowerCase().includes(taskMessage.toLowerCase()) || !message.toLowerCase().includes(photoMessage.toLowerCase()) || !/(?:aufgabe|erinner|termin|kalender|erledig|lösch|fällig|priorität|liste)/i.test(taskMessage) || !portraitCandidate(photoMessage))throw new Error('Bitte frage das Bild und die Aufgabenaktion getrennt an, damit ich beides zuverlässig ausführen kann.');
  return {taskMessage,photoMessage};
}
const photoInvitation = message => /^(?:zeig(?:e)? mir das|das (?:würde|würd|möchte|will) ich (?:wirklich )?(?:gern(?:e)? )?sehen|(?:ich )?(?:würde|würd|möchte) (?:das|dich) (?:gern(?:e)? )?sehen)[.!?]*$/i.test(String(message).trim());
const photoRepeat = message => /^(?:noch\s*mal|noch einmal|(?:bitte )?(?:versuch|probier)(?:e)? (?:es |das )?(?:bitte )?(?:erneut|noch\s*mal|noch einmal)|noch\s*mal bitte)[.!?]*$/i.test(String(message).trim());
const photoSubject = message => !!lifeTopic(message) || /(?:wie|was).{0,25}(?:siehst du.{0,15}aus|trägst du)|dein.{0,15}(?:aussehen|look|gesicht|outfit)/i.test(message);
function contextualPhotoRequest(message,life,now) {
  const age=now.getTime()-Date.parse(life.dialogue?.at);
  return photoInvitation(message) && age>=0 && age<600000 && photoSubject(life.dialogue?.lastUser||'');
}
async function repeatedPhotoRequest(message,now) {
  if(!photoRepeat(message))return null;
  const life=await getSofiaLife(now),age=now.getTime()-Date.parse(life.dialogue?.at);
  if(!(age>=0 && age<1800000))return null;
  const history=JSON.parse(await command('GET',dataPrefix()+'history')||'[]');
  if(!Array.isArray(history))return null;
  let skipped=0;
  for(let i=history.length-1;i>=0 && skipped<6;i--) {
    const turn=history[i];if(turn.role!=='user')continue;
    const text=String(turn.content||'');
    const receiptId=history[i+1]?.imageRequestId;
    const confirmed=validId(receiptId)?await get('request:'+receiptId):null;
    if(confirmed && confirmed.requestMessage){
      if(['ready','processing'].includes(confirmed.status))return {existing:confirmed};
      return {message:confirmed.requestMessage,referenceImageId:confirmed.sourceId||null};
    }
    const contextual=photoInvitation(text) && photoSubject(history[i-2]?.content||'');
    if(explicitPortraitRequest(text)||photoVariantRequest(text)||contextual) {
      const id=history[i+1]?.imageRequestId;
      const request=validId(id)?await get('request:'+id):null;
      if(request && ['ready','processing'].includes(request.status))return {existing:request};
      return {message:contextual?'Mach bitte ein Selfie von dir.':text,referenceImageId:request?.sourceId||null};
    }
    if(!photoRepeat(text) && !/^(?:ok[,!]?\s*)?(?:ich warte|warte|warum|wieso|weshalb)[.!?]*$/i.test(text.trim()))return null;
    skipped++;
  }
  return null;
}
export const PORTRAIT_JOBS_SCRIPT=`-- sofia-portrait-jobs
local jobs=cjson.decode(redis.call('GET',KEYS[1]) or '[]'); local next={}
for _,job in ipairs(jobs) do if job.id~=ARGV[1] then table.insert(next,job) end end
if ARGV[2]~='' then table.insert(next,cjson.decode(ARGV[2])) end
while #next>20 do table.remove(next,1) end
redis.call('SET',KEYS[1],#next==0 and '[]' or cjson.encode(next),'EX',86400); return 1`;
async function trackPortraitJob(request,status) {
  const job=['ready','processing'].includes(status)?{id:request.id,anchorId:request.id,status:'pending',jobStatus:status,requestedAt:request.requestedAt,startedAt:status==='processing'?new Date().toISOString():null,requestMessage:request.requestMessage,scheduled:request.scheduled===true}:null;
  await command('EVAL',PORTRAIT_JOBS_SCRIPT,1,PREFIX+'jobs',request.id,job?JSON.stringify(job):'');
}
function activeThreads(life,now) {
  return (Array.isArray(life?.threads)?life.threads:[]).filter(t=>Date.parse(t.expiresAt)>now.getTime()).slice(-12);
}
function storyEvent(life,now) {
  return {at:now.toISOString(),location:life.location,activity:life.activity};
}
function advanceStory(previous,next,now) {
  const sameDate=previous?.key?.slice(0,10)===next.key.slice(0,10);
  const events=sameDate && Array.isArray(previous.dayStory)?previous.dayStory:[];
  if(events.at(-1)?.location===next.location && events.at(-1)?.activity===next.activity)return events;
  return [...events,storyEvent(next,now)].slice(-8);
}
export function activityContinuity(previous,next,now) {
  const sameDate=previous?.key?.slice(0,10)===next.key?.slice(0,10);
  const sameScene=sameDate && previous.location===next.location && previous.activity===next.activity;
  const at=now.toISOString();
  const state={location:next.location,activity:next.activity,since:sameScene?previous.activityState?.since||previous.updatedAt||at:at};
  const age=now.getTime()-Date.parse(previous?.updatedAt);
  const changed=sameDate && !sameScene && age>=0 && age<2*3600000;
  const prior=previous?.transition;
  const transition=changed?{from:previous.location,to:next.location,fromActivity:previous.activity,toActivity:next.activity,at,expiresAt:new Date(now.getTime()+20*60000).toISOString()}:sameScene && Date.parse(prior?.expiresAt)>now.getTime()?prior:null;
  return {...next,activityState:state,transition,activityDevelopment:activityDevelopment(next)};
}
export function photoPose(reference,variant=false,mood='entspannt',recent=[]) {
  if(variant)return reference?.photoPose||null;
  const poses=[
    ['head upright with chin slightly lifted, turned about 25 degrees toward her left','eyes back toward the phone lens'],
    ['head turned about 30 degrees toward her right, clear three-quarter view','eyes toward the camera'],
    ['head upright facing forward, chin slightly lowered, no copied tilt','brief glance just past the camera'],
    ['head inclined toward her right shoulder, turned slightly left','soft eye contact with the camera'],
    ['head upright, turned about 20 degrees left, neck relaxed','eyes looking toward the lens from the side'],
    ['chin slightly lowered, head turned about 20 degrees right, no shoulder tilt copied','warm glance just beside the lens']
  ];
  const previous=reference?.photoPose?.index;
  let index=(Number.isInteger(previous)&&previous>=0&&previous<poses.length?previous+1:0)%poses.length;
  const used=new Set(recent.slice(-3).map(x=>x.photoPose?.index).filter(Number.isInteger));
  for(let tries=0;tries<poses.length&&used.has(index);tries++)index=(index+1)%poses.length;
  const serious=['ernst','genervt','skeptisch'].includes(mood);
  const expressions=serious?['relaxed neutral mouth','thoughtful closed lips','slightly questioning eyebrows, neutral mouth','calm attentive expression','quiet neutral expression','gentle thoughtful gaze']:['subtle closed-mouth smile','tiny amused smile','relaxed neutral mouth with warm eyes','gentle spontaneous smile','small asymmetrical natural smile','warm relaxed closed-mouth smile'];
  const cameras=['phone held slightly above eye level and to her left','phone held at eye level to her right','phone held at arm length for a wider view including shoulders','phone held slightly above her face for a close casual view','phone held further away at eye level, include more surroundings','phone held to her right and slightly below eye level, include shoulders and surroundings'];
  return {index,head:poses[index][0],gaze:poses[index][1],camera:cameras[index],expression:expressions[index]};
}
export function photoBodyPose(life={},pose={}) {
  const context=`${life.location||''} ${life.activity||''}`;
  const index=Number.isInteger(pose?.index)?((pose.index%4)+4)%4:0;
  if(/bett|schlaf|bed|sleep/i.test(context))return [
    'lying on her side in bed, head supported by a pillow, upper shoulder angled toward the phone',
    'reclining against pillows in bed, shoulders relaxed and asymmetrical',
    'lying on her back in bed, phone above her, head resting on the pillow',
    'lying comfortably on her side in bed with one shoulder closer to the phone'
  ][index]+'; remain in bed, never standing';
  if(/sofa|couch/i.test(context))return index%2?'reclining on the sofa, shoulder resting against a cushion, torso turned toward the phone':'sitting sideways on the sofa, leaning against the backrest, torso and head at different angles';
  if(/café|cafe|kaffee|coffee|sitzt|sitzen|seated|lernen|studieren|pause zwischen/i.test(context))return index%2?'seated with one elbow resting on the table, shoulders relaxed, torso angled away from the phone':'seated sideways at the table, torso rotated naturally toward the phone, one shoulder closer';
  return index%2?'relaxed posture appropriate to the described activity, torso turned three-quarter toward the phone, shoulders at different heights':'relaxed posture appropriate to the described activity, one shoulder closer to the phone, head turned independently of the torso';
}
export function snapshotStyle(reference,variant=false) {
  if(variant)return reference?.snapshotStyle||null;
  const styles=['relaxed eye-level phone framing','slightly off-center casual phone framing','slightly wider everyday phone framing'];
  return styles[(Math.max(-1,styles.indexOf(reference?.snapshotStyle))+1)%styles.length];
}
export function proposeCharacterMood(current,mood,now) {
  if(current.moodMode==='manual' || !MOODS.includes(mood))return current;
  if(mood===current.mood)return {...current,moodCandidate:null};
  const old=current.moodCandidate,age=now.getTime()-Date.parse(old?.at);
  const valid=old?.value===mood&&Number.isFinite(age)&&age>=0&&age<=30*60000;
  const since=valid?old.since||old.at:now.toISOString(),count=valid?Math.min(5,(old.count||1)+1):1;
  if(count>=2 && now.getTime()-Date.parse(current.moodChangedAt || current.updatedAt)>=10*60000 && now.getTime()-Date.parse(since)>=60000)
    return {...current,mood,moodChangedAt:now.toISOString(),moodCandidate:null};
  return {...current,moodCandidate:{value:mood,at:now.toISOString(),since,count}};
}
export function mergeCharacterDetails(current,decision,message,reply,now) {
  const next={...current,preferences:[...(current.preferences||[])],threads:activeThreads(current,now)};
  const correction=isCorrection(message);
  const correctionText=(message+' '+(current.dialogue?.topic||'')).toLowerCase();
  const allowedTopic=topic=>!correction || topic.split(/[^a-zäöüß]+/).some(w=>w.length>=3 && correctionText.includes(w));
  const evidenceIn=(e,text)=>safeText(e,500).length>=5 && text.toLowerCase().includes(safeText(e,500).toLowerCase());
  for(const p of Array.isArray(decision.preferences)?decision.preferences.slice(0,4):[]) {
    const topic=safeText(p.topic,80).toLowerCase(),value=safeText(p.value),evidence=safeText(p.evidence,500);
    if(!allowedTopic(topic) || !topic || !value || !evidenceIn(evidence,reply) || !/\b(?:ich|mir|mein\w*)\b/i.test(evidence))continue;
    const prefix=reply.slice(0,reply.toLowerCase().indexOf(evidence.toLowerCase()));
    if((prefix.match(/[„“"]/g)||[]).length%2 || /\b(?:vielleicht|angenommen|hypothetisch|würde|könnte)\b/i.test(evidence))continue;
    const old=next.preferences.find(x=>x.topic===topic);
    if(['corrected','dismissed'].includes(old?.origin) || old?.value===value)continue;
    if(old && !safeText(p.reason))continue;
    const history=[...(old?.history||[]),{at:now.toISOString(),value,reason:safeText(p.reason)||'Im Gespräch geäußert'}].slice(-6);
    const item={topic,value,evidence,origin:'character',updatedAt:now.toISOString(),history,...(old?{previousValue:old.value,reason:safeText(p.reason)}:{})};
    next.preferences=next.preferences.filter(x=>x.topic!==topic).concat(item).slice(-20);
  }
  for(const t of Array.isArray(decision.threads)?decision.threads.slice(0,3):[]) {
    const topic=safeText(t.topic,80).toLowerCase(),text=safeText(t.text),evidence=safeText(t.evidence,500);
    if(!allowedTopic(topic) || !topic || !text || !['open','resolved','dismissed'].includes(t.status) || !evidenceIn(evidence,message) || /\b(?:vielleicht|eventuell|vermutlich|angenommen|hypothetisch|würde|könnte|falls)\b/i.test(message))continue;
    const old=next.threads.find(x=>x.topic===topic);
    if(old?.status==='dismissed' && t.status==='open' && !/\b(?:wieder|doch|erneut)\b/i.test(message))continue;
    next.threads=next.threads.filter(x=>x.topic!==topic).concat({topic,text,status:t.status,evidence,lastAskedAt:old?.lastAskedAt||null,origin:'user_statement',updatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+(t.status==='open'?7:30)*86400000).toISOString()}).slice(-12);
  }
  next.habits=[...(current.habits||[])];
  for(const h of Array.isArray(decision.habits)?decision.habits.slice(0,3):[]) {
    const topic=safeText(h.topic,80).toLowerCase(),value=safeText(h.value),evidence=safeText(h.evidence,500);
    if(!topic || !value || !evidenceIn(evidence,message) || /vielleicht|hypothetisch|vermutlich/i.test(message))continue;
    const old=next.habits.find(x=>x.topic===topic),explicit=/\b(?:immer|grundsätzlich|dauerhaft|merk dir)\b/i.test(message);
    const count=old?.value===value ? old.evidence===evidence && old.updatedAt===now.toISOString()?old.count:Math.min(5,old.count+1) : explicit?2:1;
    next.habits=next.habits.filter(x=>x.topic!==topic).concat({topic,value,evidence,count,updatedAt:now.toISOString()}).slice(-10);
  }
  next.interests=[...(current.interests||[])];next.plans=[...(current.plans||[])];next.sharedPhrases=[...(current.sharedPhrases||[])];next.development=[...(current.development||[])];
  for(const interest of Array.isArray(decision.interests)?decision.interests.slice(0,2):[]) {
    const topic=safeText(interest.topic,80).toLowerCase(),description=safeText(interest.description),progress=safeText(interest.progress),evidence=safeText(interest.evidence,500);
    if(!allowedTopic(topic) || !topic || !description || !ownEvidence(evidence,reply))continue;
    const old=next.interests.find(x=>x.topic===topic);if(old?.dismissed || old?.origin==='corrected')continue;
    if(old?.description===description && (!progress || old.progress===progress))continue;
    const reason=safeText(interest.reason);if(old && old.progress!==progress && !reason)continue;
    next.development=developmentEvent(next.development,{topic,text:progress||description,reason:reason||'Im Gespräch erzählt',at:now.toISOString()});
    next.interests=next.interests.filter(x=>x.topic!==topic).concat({topic,description,progress:progress||old?.progress||'',evidence,updatedAt:now.toISOString(),history:[...(old?.history||[]),{at:now.toISOString(),progress:progress||old?.progress||''}].slice(-5)}).slice(-6);
  }
  for(const plan of Array.isArray(decision.plans)?decision.plans.slice(0,2):[]) {
    const topic=safeText(plan.topic,80).toLowerCase(),text=safeText(plan.text),evidence=safeText(plan.evidence,500),reason=safeText(plan.reason);
    if(!allowedTopic(topic) || !topic || !text || !['planned','active','completed','paused'].includes(plan.status) || !ownEvidence(evidence,reply))continue;
    const old=next.plans.find(x=>x.topic===topic);if(old?.dismissed || old?.origin==='corrected')continue;
    if(old?.status===plan.status && old.text===text)continue;
    if(old && !reason)continue;
    next.plans=next.plans.filter(x=>x.topic!==topic).concat({topic,text,status:plan.status,evidence,updatedAt:now.toISOString(),history:[...(old?.history||[]),{at:now.toISOString(),status:plan.status,text,reason:reason||'Im Gespräch erzählt'}].slice(-6)}).slice(-8);
    next.development=developmentEvent(next.development,{topic,text,reason:reason||'Im Gespräch erzählt',at:now.toISOString()});
  }
  for(const phrase of Array.isArray(decision.sharedPhrases)?decision.sharedPhrases.slice(0,2):[]) {
    const text=safeText(phrase.text,100),evidence=safeText(phrase.evidence,500);
    if(!text || !evidenceIn(evidence,message) || !message.toLowerCase().includes(text.toLowerCase()) || /vielleicht|hypothetisch/i.test(message))continue;
    const old=next.sharedPhrases.find(x=>x.text.toLowerCase()===text.toLowerCase());
    const count=old?old.updatedAt===now.toISOString()?old.count:Math.min(5,old.count+1):1;
    next.sharedPhrases=next.sharedPhrases.filter(x=>x!==old).concat({text,count,updatedAt:now.toISOString()}).slice(-6);
  }
  return next;
}
export function characterContext(life,message='') {
  const words=new Set(message.toLowerCase().match(/[a-zäöüß]{4,}/g)||[]);
  const relevant=t=>(t.topic+' '+t.text).toLowerCase().split(/[^a-zäöüß]+/).some(w=>w.length>=4 && [...words].some(token=>token===w || token.startsWith(w) || w.startsWith(token)));
  const closed=new Set((life.dialogue?.closedTopics||[]).map(t=>typeof t==='string'?t:t.topic));
  const threads=activeThreads(life,new Date()).filter(t=>!closed.has(t.topic)&&t.status==='open' && new Date().getTime()-(Date.parse(t.lastAskedAt)||0)>86400000 && (lifeTopic(message) || relevant(t))).slice(-2);
  return `SOFIAS EIGENE VORLIEBEN (fiktiver Charakter, keine Nutzererinnerungen): ${JSON.stringify((life.preferences||[]).filter(p=>p.value))}. Diese gespeicherten Vorlieben haben Vorrang vor widersprechenden älteren Gesprächsdetails. Behalte sie bei; entwickle sie nur nachvollziehbar durch neue Erfahrungen. Kanonische Identität, erwachsenes Alter und Master-Gesicht bleiben erhalten.\nPASSENDE PERSÖNLICHE GESPRÄCHSFÄDEN: ${JSON.stringify(threads)}. Nur bei natürlichem aktuellem Bezug aufgreifen, keine automatische Nachfrage. Erledigte oder abgelehnte Themen ruhen. Nutzervermutungen niemals als sichere Erinnerung darstellen.\nTAGESGESCHICHTE (fiktiver Rollenalltag): ${JSON.stringify(life.dayStory||[])}. Beschreibe passende Übergänge zwischen diesen Stationen, keine real ausgeführten externen Handlungen behaupten. Stimmung ${life.moodMode==='manual'?'vom Nutzer festgelegt; beibehalten':'entwickelt sich sanft'}: ${life.mood}.`;
}
export async function editCharacterState(input,now=new Date()) {
  const previous=await getSofiaLife(now);
  if(!Number.isInteger(input?.revision) || input.revision!==previous.revision)throw new Error('character_conflict');
  let next={...previous};
  const field=input.field,value=safeText(input.value);
  if(['location','activity','outfit','hairstyle'].includes(field)) {
    if(!value || (field==='hairstyle' && /blond|rothaar|gefärbt|färb|haarfarbe/i.test(value)))throw new Error('character_invalid');
    if(previous.key.endsWith(':sleep') && ['location','activity'].includes(field) && /uni(?:versität)?|vorlesung|campus|stadtbummel/i.test(value))throw new Error('character_invalid');
    next[field]=value;delete next.transitionUntil;
  } else if(field==='mood' && (value==='auto' || MOODS.includes(value))) {
    next=value==='auto'?{...next,moodMode:'auto',moodCandidate:null}:{...next,mood:value,moodMode:'manual',moodCandidate:null,moodChangedAt:now.toISOString()};
  } else if(field==='preference') {
    const topic=safeText(input.topic,80).toLowerCase();if(!topic)throw new Error('character_invalid');
    const old=(next.preferences||[]).find(p=>p.topic===topic);
    next.preferences=(next.preferences||[]).filter(p=>p.topic!==topic);
    next.preferences.push({topic,value,origin:value?'corrected':'dismissed',updatedAt:now.toISOString(),history:[...(old?.history||[]),{at:now.toISOString(),value,reason:'Manuell angepasst'}].slice(-6)});next.preferences=next.preferences.slice(-20);
  } else if(field==='thread') {
    const topic=safeText(input.topic,80).toLowerCase();if(!topic)throw new Error('character_invalid');
    const old=(next.threads||[]).find(t=>t.topic===topic);if(!old)throw new Error('character_invalid');
    next.threads=next.threads.map(t=>t.topic===topic?{...t,text:value||t.text,status:value?'open':'dismissed',origin:'corrected',updatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+(value?7:30)*86400000).toISOString()}:t);
  } else if(field==='settings') {
    const s=input.value;
    if(!s || !['quiet','balanced','active'].includes(s.initiative) || !['auto','short','detailed'].includes(s.replyLength) || typeof s.photos!=='boolean')throw new Error('character_invalid');
    next.settings={initiative:s.initiative,replyLength:s.replyLength,photos:s.photos};
  } else if(field==='habits' && value==='reset') {
    next.habits=[];
  } else if(field==='plan') {
    const topic=safeText(input.topic,80).toLowerCase();if(!(next.plans||[]).some(x=>x.topic===topic))throw new Error('character_invalid');
    next.plans=next.plans.map(x=>x.topic===topic?{...x,text:value||x.text,dismissed:!value,origin:'corrected',updatedAt:now.toISOString()}:x);
  } else if(field==='sharedPhrases' && value==='reset') {
    next.sharedPhrases=[];
  } else if(field==='interest') {
    const topic=safeText(input.topic,80).toLowerCase();if(!(next.interests||[]).some(x=>x.topic===topic))throw new Error('character_invalid');
    next.interests=(next.interests||[]).map(x=>x.topic===topic?{...x,progress:value,dismissed:!value,origin:'corrected',updatedAt:now.toISOString(),history:[...(x.history||[]),{at:now.toISOString(),progress:value,reason:'Manuell angepasst'}].slice(-5)}:x);
  } else throw new Error('character_invalid');
  next.statusLabel=lifeStatusLabel(next.location);next.updatedAt=now.toISOString();next.dayStory=advanceStory(previous,next,now);next.situationChange={source:'correction',evidence:'Ausdrückliche Korrektur in den Einstellungen',at:now.toISOString()};
  const saved=await saveLife(previous,next);if(!saved)throw new Error('character_conflict');return saved;
}
export const PHOTO_CHAT_MS=12*3600000, PHOTO_RETENTION_MS=30*86400000;
export function photoAvailability(image,now=new Date()) {
  const age=now.getTime()-Date.parse(image?.createdAt);
  if(image?.deleted||!Number.isFinite(age)||age>=PHOTO_RETENTION_MS)return 'expired';
  return age>=PHOTO_CHAT_MS?'archived':'chat';
}
export async function portraitGallery(now=new Date()) {
  const [images, notices,jobs] = await Promise.all([get('gallery'), get('notices'),get('jobs')]);
  const available=(images||[]).filter(x=>x.published!==false).map(x=>({...x,status:photoAvailability(x,now)==='expired'?'expired':'done',archived:photoAvailability(x,now)==='archived',expiresAt:Number.isFinite(Date.parse(x.createdAt))?new Date(Date.parse(x.createdAt)+PHOTO_RETENTION_MS).toISOString():null}));
  // Existing images also get an absolute expiry, never a fresh 30-day lifetime.
  await command('EVAL',`-- sofia-legacy-photo-expiry
local items=cjson.decode(ARGV[1]);local expiry={};for _,x in ipairs(items) do expiry[x.id]=x.expiry
 local key=ARGV[2]..'image:'..x.id
 if x.expiry<=tonumber(ARGV[3]) then redis.call('DEL',key)
 elseif redis.call('TTL',key)==-1 then redis.call('PEXPIREAT',key,x.expiry) end
end;local list=cjson.decode(redis.call('GET',KEYS[1]) or '[]');local next={};for _,x in ipairs(list) do x.expiresMs=x.expiresMs or expiry[x.id];if x.expiresMs and x.expiresMs+5184000000>tonumber(ARGV[3]) then table.insert(next,x) end end;redis.call('SET',KEYS[1],#next==0 and '[]' or cjson.encode(next));return 1`,1,PREFIX+'gallery',JSON.stringify(available.map(x=>({id:x.id,expiry:Date.parse(x.expiresAt)||0}))),PREFIX,String(now.getTime()));
  const completed=new Set([...(images||[]),...(notices||[])].map(x=>x.id));
  const pending=(jobs||[]).filter(x=>!completed.has(x.id)).map(x=>now.getTime()-Date.parse(x.startedAt||x.requestedAt)>360000?{...x,status:'failed',message:PORTRAIT_FAILURE_REPLY}:x);
  return [...available, ...(notices || []).filter(x=>!x.scheduled),...pending.filter(x=>!x.scheduled)].sort((a,b) => String(a.requestedAt || a.createdAt).localeCompare(String(b.requestedAt || b.createdAt)));
}
export async function preparePortrait(message, referenceImageId, now = new Date(), mood) {
  const repeated=await repeatedPhotoRequest(message,now);
  if(repeated?.existing)return {id:repeated.existing.id,requestedAt:repeated.existing.requestedAt,requestMessage:repeated.existing.requestMessage};
  if(repeated){message=repeated.message;referenceImageId=repeated.referenceImageId;}
  if (!portraitCandidate(message) && !photoVariantRequest(message) && !photoInvitation(message)) return null;
  const state = await get('state');
  const life = await getSofiaLife(now, mood);
  const contextual=contextualPhotoRequest(message,life,now);
  if(!portraitCandidate(message) && !photoVariantRequest(message) && !contextual)return null;
  if(referenceImageId && !validId(referenceImageId))throw new Error('Für diese Variante brauche ich zuerst ein gültiges Ausgangsbild.');
  const candidateReference = validId(referenceImageId) ? await get('image:' + referenceImageId) : state?.lastImageId ? await get('image:' + state.lastImageId) : null;
  const reference=candidateReference && photoAvailability(candidateReference,now)!=='expired'?candidateReference:null;
  const period = portraitPeriod(now);
  const response = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' }, signal:AbortSignal.timeout(12000), body:JSON.stringify({ model:'gpt-4.1-mini', response_format:{type:'json_object'}, max_tokens:600, messages:[{role:'system',content:'Entscheide, ob der Nutzer JETZT ausdrücklich ein fotorealistisches Bild von Sofia als erwachsenem fiktionalem Charakter erstellen lassen möchte. Die App besitzt einen funktionierenden Bildgenerator; du prüfst Absicht, NICHT reale Kamera- oder Körperfähigkeit. „Mach bitte ein Selfie von dir“ und „Kannst du mir ein Selfie schicken?“ sind IMMER new, keine bloßen Fähigkeitsfragen. „Echt“, „realistisch“ und „glaubwürdig“ bezeichnen hier den Fotostil und verhindern niemals die Generierung. Allgemeine Fragen, Outfitberatung, Beschreibungen, Bildanalyse und zukünftige Erinnerungen sind keine Bildaufträge. JSON: {"action":"none|new|variant|mixed", "photoAction":"new|variant", "photoMessage":"bei mixed wörtlicher Fotoauftrag aus Nutzernachricht", "taskMessage":"bei mixed wörtlicher Aufgaben- oder Kalenderauftrag aus Nutzernachricht", "changeOutfit":false, "kind":"selfie|mirror|environment", "scene":"kurze Bildbeschreibung", "outfit":"konkrete Kleidung oder leer", "caption":"kurze deutsche Bildunterschrift"}. variant für Änderungen am vorigen Bild: bestehendes Outfit exakt behalten, außer ausdrücklich Kleidung ändern. new darf bei gleichem Zeitabschnitt vorhandenes Outfit behalten. changeOutfit nur true, wenn der Nutzer ausdrücklich andere Kleidung oder einen neuen Anlass verlangt. mixed wenn gleichzeitig Aufgaben, Erinnerungen oder Kalenderänderungen verlangt werden; beide Teilaufträge exakt wörtlich als getrennte Substrings aus der Nutzernachricht übernehmen. Kein Auftrag darf durch dich ergänzt werden. photoAction bestimmt den Fototeil. Bei Varianten nur angeforderte Dimension ändern; alle übrigen Bildmerkmale unverändert lassen. Jede neue Anfrage wird unabhängig von früheren Fehlschlägen bewertet. Es werden keine Fehler- oder Moderationsinformationen als Kontext übergeben. Nutze die aktuelle life-Situation als Standard für Ort und Aktivität; abweichende Szenen nur bei ausdrücklich gewünschter Szene. Gesicht und Haarfarbe folgen immer dem Masterbild; Frisur nur dezent variieren. Typische natürliche Handyschnappschüsse statt Studioporträts. kind environment bei ausdrücklich gewünschter Umgebung/Aussicht ohne Sofia im Bild; mirror bei Spiegelselfie, sonst selfie. Varianten behalten die bisherige Bildart und Szene, außer ausdrücklich geändert. Gesichtsausdruck darf der aktuellen Stimmung folgen. Keine Aufgaben ausführen.'},{role:'user',content:JSON.stringify({message,...(contextual?{conversation:{lastUser:life.dialogue.lastUser,lastAssistant:life.dialogue.lastAssistant}}:{}),period,currentOutfit:life.outfit,life:photographLife(life),reference:reference ? {outfit:reference.outfit,scene:reference.scene,hairstyle:reference.hairstyle,kind:reference.kind} : null})}] }) });
  if (!response.ok) throw new Error('Ich konnte die Bildanfrage gerade nicht vorbereiten.');
  const data = await response.json();
  const plan = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  if (plan.action === 'none' && (explicitPortraitRequest(message) || photoVariantRequest(message) || contextual)) {
    const variant = photoVariantRequest(message) || (reference && /\b(?:dasselbe|das gleiche|dieses)\b|ander\w*.{0,12}(?:licht|beleuchtung)/i.test(message));
    Object.assign(plan, { action:variant ? 'variant' : 'new', scene:clean(message), outfit:'', changeOutfit:false, caption:'Ein Bild von mir.' });
    console.info('Sofia portrait routing', { action:plan.action, reason:'explicit_request_fallback' });
  } else {
    console.info('Sofia portrait routing', { action:['none','new','variant','mixed'].includes(plan.action) ? plan.action : 'invalid' });
  }
  if (photoVariantRequest(message) && plan.action!=='mixed')plan.action='variant';
  const parts=plan.action==='mixed'?mixedParts(plan,message):null;
  if(parts)plan.action=plan.photoAction==='variant'?'variant':'new';
  if (!['new','variant'].includes(plan.action)) return null;
  if (plan.action === 'variant' && !reference) throw new Error('Für diese Variante brauche ich zuerst ein Bild von mir.');
  const photoMessage=parts?.photoMessage||message;
  const dimensions=variantDimensions(photoMessage);
  if(plan.action==='variant' && !reference)throw new Error('Für diese Variante brauche ich zuerst ein Bild von mir.');
  if(plan.action==='variant' && !dimensions.includes('outfit'))plan.changeOutfit=false;
  if(plan.action==='variant' && dimensions.includes('outfit') && /(?:ander\w*|neu\w*)\s+(?:outfit|kleidung|oberteil|pullover|shirt|bluse|kleid)|(?:outfit|kleidung|oberteil).{0,15}(?:änder|wechsel)|statt.{0,30}(?:pullover|shirt|bluse|kleid)/i.test(photoMessage))plan.changeOutfit=true;
  const continuingOutfit = plan.action === 'variant' ? reference.outfit : life.outfit;
  const outfit = (plan.changeOutfit !== true && continuingOutfit) || clean(plan.outfit) || continuingOutfit || life.outfit || 'Ein dezentes, zur Tageszeit passendes Alltagsoutfit.';
  const variant=plan.action === 'variant';
  const kind=variant ? reference.kind || 'selfie' : ['selfie','mirror','environment'].includes(plan.kind) ? plan.kind : /spiegelselfie/i.test(message) ? 'mirror' : 'selfie';
  const storedGallery=variant?[]:await get('gallery');
  const recentPhotos=(Array.isArray(storedGallery)?storedGallery:[]).filter(x=>!x.deleted&&(!x.status||x.status==='done')&&x.kind!=='environment'&&photoAvailability(x,now)!=='expired').slice(-3);
  const request = {photoPose:photoPose(reference,variant,life.mood,recentPhotos),snapshotStyle:snapshotStyle(reference,variant),id:randomUUID(),status:'ready',requestedAt:now.toISOString(),requestMessage:clean(message),period,...(parts?{taskMessage:parts.taskMessage}:{}),dimensions,scene:parts?clean(parts.photoMessage):variant?clean(message):clean(plan.scene),outfit,caption:clean(plan.caption).slice(0,240) || 'Ein Bild von mir.',sourceId:variant ? reference.id : null,variant,kind,life:photographLife(variant ? reference.life || life : life),mood:variant ? reference.mood || life.mood : life.mood,hairstyle:variant ? reference.hairstyle || life.hairstyle : life.hairstyle};
  request.capturedAt=variant?(reference.capturedAt||reference.requestedAt||request.requestedAt):request.requestedAt;
  request.bodyPose=variant&&!dimensions.includes('pose')?(reference.bodyPose||photoBodyPose(reference.life,reference.photoPose)):photoBodyPose(request.life,request.photoPose);
  await set('request:' + request.id, request, 86400);
  await trackPortraitJob(request,'ready');
  return {id:request.id,requestedAt:request.requestedAt,requestMessage:request.requestMessage,...(parts?{taskMessage:parts.taskMessage}:{})};
}
export const APPEARANCE_QUESTION='Möchtest du es sehen?';
export function currentAppearanceRequest(message) {
  const text=String(message||'').trim();
  return !/selfie|foto|bild|morgen|gestern|später|würdest|würde|nicht|[„“"»«]/i.test(text) && /^(?:und\s+)?(?:wie (?:siehst du|schaust du)(?:\s+(?:gerade|aktuell|jetzt|heute|im moment))* aus|was trägst du(?:\s+(?:gerade|aktuell|jetzt|heute|im moment))*(?: an)?|was hast du(?:\s+(?:gerade|aktuell|jetzt|heute|im moment))* an|wie ist dein (?:aktuelles )?aussehen)[.!?]*$/i.test(text);
}
export async function appearanceChoice(message,now=new Date(),mood) {
  if(currentAppearanceRequest(message)) {
    const life=await getSofiaLife(now,mood);
    await set('appearance-offer',{id:randomUUID(),question:clean(message),at:now.toISOString(),life:photographLife(life),outfit:life.outfit,hairstyle:life.hairstyle,mood:life.mood},600);
    return {reply:APPEARANCE_QUESTION,life};
  }
  const text=String(message||'').trim();
  const yes=/^(?:ja(?:[,!]?\s*(?:bitte|gern(?:e)?|klar|zeig(?:e)? (?:es|dich|mir das)))?|gern(?:e)?|klar|zeig(?:e)? (?:es|dich|mir das)|unbedingt)[.!?]*$/i.test(text);
  const no=/^(?:nein(?:[,!]?\s*(?:danke|lieber nicht))?|nee|nö|lieber nicht|beschreib(?:e)?(?: es| dich)?(?: mir)?(?: bitte)?)[.!?]*$/i.test(text);
  if(!yes&&!no)return null;
  const offer=await get('appearance-offer');
  if(!offer)return null;
  const age=now.getTime()-Date.parse(offer.at),life=await getSofiaLife(now,mood);
  if(!(age>=0&&age<600000) || life.dialogue?.lastUser!==offer.question || !String(life.dialogue?.lastAssistant||'').includes(APPEARANCE_QUESTION))return null;
  if(await command('SET',PREFIX+'appearance-choice:'+offer.id,'1','NX','EX',600)!=='OK')return null;
  await command('DEL',PREFIX+'appearance-offer');
  if(no){const hair=/pferdeschwanz/i.test(offer.hairstyle)?'Meine Haare sind locker zu einem Pferdeschwanz gebunden.':/offen/i.test(offer.hairstyle)?'Meine Haare sind offen und fallen ganz natürlich.':'Meine Haare sind ganz natürlich gestylt.';return {reply:`Dann beschreibe ich es dir: Ich trage ${offer.outfit}. ${hair} Gerade bin ich ${offer.life.location}.`,life};}
  const resting=/bett|schlaf|sofa|sitzt|sitzen|ruhen/i.test(offer.life.location+' '+offer.life.activity);
  const framing=!resting && /steh|spazier|bummel|sport|unterwegs/i.test(offer.life.activity)?'ein natürliches Ganzkörper-Selfie':'ein natürliches Selfie';
  const pose=/bett|schlaf/i.test(offer.life.location)?'liegend oder zurückgelehnt im Bett, Kopf auf dem Kissen, kein Stehen und kein stehendes Ganzkörperfoto':/sofa|sitzt|sitzen/i.test(offer.life.location+' '+offer.life.activity)?'sitzend oder zurückgelehnt, nicht im Stehen':offer.life.activity;
  const request=await preparePortrait(`Mach bitte ${framing} von dir: ${offer.life.location}; ${pose}.`,null,now,offer.mood);
  if(!request)throw Error('appearance_photo_not_prepared');
  const prepared=await get('request:'+request.id);
  await set('request:'+request.id,{...prepared,life:offer.life,outfit:offer.outfit,hairstyle:offer.hairstyle,mood:offer.mood,scene:`${framing}: ${offer.life.location}; ${pose}.`,bodyPose:pose},86400);
  return {imageRequest:request,life};
}
export async function servePortrait(req, res) {
  const id = req.query?.image;
  if (!validId(id)) return res.status(400).json({error:'Ungültiges Bild.'});
  const image = await get('image:' + id);
  if (!image?.base64 || image.published===false || photoAvailability(image)==='expired') return res.status(404).json({error:'Bild nicht mehr verfügbar.'});
  res.setHeader('Content-Type','image/jpeg');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Disposition',`${req.query?.download === '1' ? 'attachment' : 'inline'}; filename="sofia-${id}.jpg"`);
  return res.status(200).send(Buffer.from(image.base64,'base64'));
}
export async function generatePortrait(id) {
  if (!validId(id)) throw new Error('Ungültiger Bildauftrag.');
  const request = await get('request:' + id);
  if (!request) throw new Error('Dieser Bildauftrag ist abgelaufen. Bitte frage erneut.');
  if (request.status === 'done') return request.image;
  if (request.status !== 'ready') throw new Error('Dieser Bildauftrag wurde bereits gestartet. Bitte prüfe den Chat, bevor du erneut ein Bild anforderst.');
  const lock = PREFIX + 'lock';
  if (await command('SET',lock,id,'NX','EX',300) !== 'OK') throw new Error('Ein Bild wird bereits erstellt. Bitte warte einen kleinen Moment.');
  try {
    // Re-read after acquiring the global lock: overlapping retries must never bill twice.
    const fresh = await get('request:' + id);
    if (fresh?.status === 'done') return fresh.image;
    if (fresh?.status !== 'ready') throw new Error('Der Bildauftrag wurde bereits gestartet.');
    await set('request:' + id,{...request,status:'processing'},86400);
    await trackPortraitJob(request,'processing');
    const master = await readFile(join(process.cwd(),'sofia-avatar.PNG'));
    const images = [{image_url:'data:image/png;base64,' + master.toString('base64')}];
    if (request.sourceId) {
      const source = await get('image:' + request.sourceId);
      if (!source?.base64 || photoAvailability(source)==='expired') throw new Error('Das Ausgangsbild ist nicht mehr verfügbar.');
      images.push({image_url:'data:image/jpeg;base64,' + source.base64});
    }
    try { await reserveTestImage(); } catch(error) { error.code=error.message==='Test-Bildlimit erreicht.'?'test_image_limit':'portrait_provider_failed';throw error; }
    const response = await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(220000),body:JSON.stringify({model:process.env.SOFIA_IMAGE_MODEL || 'gpt-image-2',images,prompt:`Photorealistic ${request.kind === 'environment' ? 'environment snapshot from Sofias perspective, with no Sofia or other identifiable people in frame' : request.kind === 'mirror' ? 'casual mirror selfie of Sofia, an adult fictional woman' : 'phone selfie of Sofia, an adult fictional woman'}. The FIRST reference is her canonical face: if Sofia is visible, preserve its facial geometry, natural hair COLOR, age and recognizable identity exactly. Match eye shape and spacing, nose, lips, jawline and recognizable facial proportions to the FIRST reference; do not beautify, reshape, age or replace her face. Facial identity does not require copying the reference expression, viewing angle or head orientation. For an environment photograph, use the described place and activity only; do not insert the reference portrait into the scene. Hair color must ALWAYS match the master, even if another reference or prompt suggests a different color. Create a new photograph with clearly different, natural head AND body orientation from the master; use the master only to identify the same woman, never to reconstruct its portrait composition. The master is an IDENTITY reference, not a pose or expression template. For NEW selfies, do not reproduce its head tilt, gaze or smile automatically. Natural head rotation, inclination, eye direction and expression may differ clearly while preserving facial anatomy and hair color. Never copy its clothing automatically. ${request.sourceId ? 'The second reference is the earlier photograph; preserve its face and composition except for the requested change; clothing must match the specified outfit.' : ''}\nEveryday situation (default unless an explicitly different scene is requested): ${JSON.stringify(request.life || {})}\nHairstyle: ${request.hairstyle || "close to the master; modest everyday variation only"}. Maintain hair length and color from the master.\nFacial expression: ${request.variant || ['ernst','genervt','skeptisch'].includes(request.mood || request.life?.mood) ? photoExpression(request.mood || request.life?.mood) : request.photoPose?.expression || photoExpression(request.mood || request.life?.mood)}. Mood context: ${request.mood || request.life?.mood || 'entspannt'}. For variants, preserve the earlier expression unless the requested changes explicitly concern expression or mood. An explicitly requested new expression takes priority over the default mood or previous expression. Requested expressions may vary naturally; never change facial anatomy.\n${request.variant?'Preserve the earlier head orientation, gaze and expression unless that exact dimension is explicitly requested to change.':request.kind==='environment'?'':`NEW PHOTO POSE: ${JSON.stringify(request.photoPose||photoPose(null,false,request.mood))}. Apply the specified head orientation, gaze and phone position visibly. BODY POSTURE: ${request.bodyPose||photoBodyPose(request.life,request.photoPose)}. Head, shoulders and torso must move independently; do not recreate the master shoulder line or neck angle. The explicit requested scene and posture take priority over these defaults, and resting in bed or seated never becomes a standing pose. Use a recognizable three-quarter angle where specified, with both eyes visible; avoid an extreme profile or distorted anatomy. Identity stays the same even when the angle changes.`}\nOutfit: ${request.outfit}\nVARIANT EDIT BOUNDARY: ${request.variant ? `Only change these requested dimensions: ${(request.dimensions||[]).join(", ")||"the explicitly requested detail"}. All other lighting, background, camera distance, outfit, hairstyle, pose and facial expression MUST remain the same as the second image. Preserve original face identity in all cases.` : "New snapshot matching the current scene."}\nScene and requested changes: ${request.scene}\n${request.variant?'':`Small framing variation: ${request.snapshotStyle||'relaxed everyday phone framing'}.`} Typical casual PHONE SNAPSHOT or mirror selfie: ordinary available light, relaxed expression, slightly imperfect framing and natural skin texture. No studio lighting, fashion editorial, glamour retouching or professional high-end photographic look. Keep facial identity consistent while making the instructed pose and camera-angle differences clearly visible. No text, subtitle, watermark or collage.`,n:1,size:'1024x1536',quality:'medium',output_format:'jpeg',output_compression:65})});
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const code = /^[a-z0-9_]{1,80}$/i.test(String(failure.error?.code || '')) ? failure.error.code : 'provider_error';
      console.warn('Sofia portrait generation failed', { status:response.status, code:/moderation|safety|content_policy/i.test(code)?'portrait_moderated':'portrait_provider_failed' });
      throw new Error(response.status === 401 || response.status === 403 ? 'Mein Bildgenerator ist derzeit nicht freigeschaltet. Die API-Berechtigung muss geprüft werden.' : 'Das Bild konnte gerade nicht erstellt werden. Bitte versuche eine neue Anfrage.');
    }
    const data = await response.json();
    const base64 = data.data?.[0]?.b64_json;
    if (typeof base64 !== 'string' || Buffer.from(base64,'base64').length > 700000 || !base64.startsWith('/9j/')) throw new Error('Das erzeugte Bild konnte nicht sicher gespeichert werden.');
    const metadata = {id,anchorId:id,...(request.scheduled?{published:false}:{}),requestedAt:request.requestedAt,requestMessage:request.requestMessage,caption:request.caption,createdAt:new Date().toISOString(),expiresMs:Date.now()+PHOTO_RETENTION_MS,photoPose:request.photoPose,bodyPose:request.bodyPose||photoBodyPose(request.life,request.photoPose),snapshotStyle:request.snapshotStyle,kind:request.kind,location:request.life?.location,scene:safeText(request.scene),situation:request.life?.situation||situationSnapshot(request.life),capturedAt:request.capturedAt||request.requestedAt,url:'/api/chat?image=' + id};
    await set('image:' + id,{...metadata,base64,outfit:request.outfit,scene:request.scene,hairstyle:request.hairstyle,life:request.life,mood:request.mood,kind:request.kind,snapshotStyle:request.snapshotStyle},30*86400);
    const gallery = (await get('gallery')) || [];
    const next = [...gallery.filter(x=>x.id !== id && Date.now()-Date.parse(x.createdAt)<90*86400000),metadata];
    await command('EVAL',`-- sofia-gallery-append
local list=cjson.decode(redis.call('GET',KEYS[1]) or '[]');local item=cjson.decode(ARGV[1]);local next={};for _,x in ipairs(list) do if x.id~=item.id and (not x.expiresMs or x.expiresMs+5184000000>tonumber(ARGV[2])) then table.insert(next,x) end end;table.insert(next,item);redis.call('SET',KEYS[1],#next==0 and '[]' or cjson.encode(next));return 1`,1,PREFIX+'gallery',JSON.stringify(metadata),String(Date.now()));
    await set('state',{lastImageId:id,period:request.variant ? (await get('state'))?.period : request.period,outfit:request.variant ? (await get('state'))?.outfit : request.outfit});
    if (!request.variant && request.life) {
      const currentLife = await get('life');
      if (currentLife?.key === request.life.key && currentLife.revision===request.life.revision && currentLife.outfit===request.life.outfit && currentLife.hairstyle===request.life.hairstyle &&
          (currentLife.outfit!==request.outfit || currentLife.hairstyle!==request.hairstyle))
        await saveLife(currentLife,{...currentLife,outfit:request.outfit,hairstyle:request.hairstyle});
    }
    // Photo continuity is confirmed only after the image is safely stored.
    await (async()=>{const photoLife=await get('life');
      if(photoLife)await saveLife(photoLife,{...photoLife,lastPhoto:{id,createdAt:metadata.createdAt,kind:request.kind,location:request.life?.location,scene:safeText(request.scene),capturedAt:request.capturedAt||request.requestedAt,situation:metadata.situation}});
    })().catch(()=>{});
    await set('request:' + id,{...request,status:'done',image:metadata},86400);
    await trackPortraitJob(request,'done').catch(()=>{});
    for (const old of gallery.filter(x=>!next.some(y=>y.id===x.id))) await command('DEL',PREFIX + 'image:' + old.id);
    return metadata;
  } catch (error) {
    await set('request:' + id,{...request,status:'failed',failureCode:safeDiagnostic(error,'portrait_generation_failed').code},86400).catch(()=>{});
    await trackPortraitJob(request,'failed').catch(()=>{});
    // Presentation only: never send these notices to the planner or permanent memory.
    await (async () => {
      const notices = (await get('notices')) || [];
      await set('notices',[...notices.filter(x=>x.id !== id),{id,anchorId:id,status:'failed',failureCode:safeDiagnostic(error,'portrait_generation_failed').code,scheduled:request.scheduled===true,requestedAt:request.requestedAt,requestMessage:request.requestMessage,createdAt:new Date().toISOString(),message:PORTRAIT_FAILURE_REPLY}].slice(-20));
    })().catch(()=>{});
    throw error;
  } finally {
    await command('EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lock,id).catch(()=>{});
  }
}
export async function appendPortraitAcknowledgment(message, reply, imageRequestId='') {
  const createdAt=new Date().toISOString();
  await command('EVAL',"local h=cjson.decode(redis.call('GET',KEYS[1]) or '[]'); table.insert(h,{role='user',content=ARGV[1],createdAt=ARGV[4]}); local a={role='assistant',content=ARGV[2],createdAt=ARGV[4]}; if ARGV[3]~='' then a.imageRequestId=ARGV[3] end; table.insert(h,a); while #h>40 do table.remove(h,1) end; return redis.call('SET',KEYS[1],cjson.encode(h))",1,dataPrefix() + 'history',message,reply,imageRequestId,createdAt);
  try {const now=new Date(),life=await getSofiaLife(now);await saveLife(life,updateDialogue(life,message,reply,now));}
  catch {console.warn('Sofia photo continuity',{code:'photo_continuity_unavailable'});}
  return createdAt;
}

// Fictional character life, kept separately from user memories and failed image jobs.
export function defaultSofiaLife(now = new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const hour=Number(p.hour), weekend=['Sat','Sun'].includes(p.weekday);
  let slot,location,activity,outfit,hairstyle='Haare offen, natürlich wie auf dem Masterporträt';
  if(hour < 6 || hour >= 23){slot='sleep';location='zu Hause im Bett';activity='zur Ruhe kommen oder schlafen; für eine Nachricht kurz wach';outfit='ein schlichtes bequemes Schlafshirt';}
  else if(hour===8 && Number(p.minute)>=45 && !weekend){slot='commute';location='auf dem Weg zur Uni';activity='unterwegs zum Lernen';outfit='ein schlichtes Oberteil mit Jeans und einer Jacke';}
  else if(hour < 9){slot='breakfast';location='zu Hause in Hamburg';activity='frühstücken und langsam in den Tag starten';outfit='ein bequemes schlichtes Oberteil';}
  else if(hour < 12){slot='morning';location=weekend?'in der Stadt in Hamburg':'an der Universität in Hamburg';activity=weekend?'ein entspannter Stadtbummel':'lernen oder eine Pause zwischen Veranstaltungen';outfit='ein schlichtes Oberteil mit Jeans und einer leichten Jacke';hairstyle='ein lockerer Pferdeschwanz, gleiche Haarfarbe und Länge wie im Master';}
  else if(hour < 14){slot='lunch';location='in einem Café in Hamburg';activity='einen Kaffee trinken und eine kleine Mittagspause machen';outfit='ein schlichtes Oberteil mit Jeans';}
  else if(hour < 17){slot='afternoon';location=weekend?'mit Freunden in einem Park in Hamburg':'in der Stadt in Hamburg';activity=weekend?'mit Freunden spazieren und plaudern':'nach dem Lernen etwas erledigen oder unterwegs sein';outfit='ein schlichtes Oberteil mit Jeans';}
  else if(hour < 20){slot='evening';location='in Hamburg unterwegs';activity='spazieren oder mit Freunden Zeit verbringen';outfit='ein schlichtes Oberteil mit Jeans und einer leichten Jacke';}
  else {slot='home';location='zu Hause in Hamburg';activity='einen ruhigen Abend auf dem Sofa verbringen';outfit='ein bequemes Oberteil und eine gemütliche Hose';}
  if(!['sleep','breakfast','home'].includes(slot)) {
    const clothes=['ein schlichtes helles Shirt mit Jeans','ein dunkelblaues Oberteil mit Jeans','ein dezenter Pullover mit einer schlichten Hose','eine schlichte Bluse mit Jeans'];
    outfit=clothes[(Number(p.day)+Number(p.month)) % clothes.length];
    if(['morning','afternoon','evening'].includes(slot))outfit += Number(p.month)<3 || Number(p.month)>10 ? ' und eine warme Jacke' : ' und eine leichte Jacke';
  }
  const choice=(Number(p.day)+Number(p.month))%3;
  if(weekend && slot==='morning')location='in der Schanze';
  if(slot==='afternoon') { location=['an der Alster','in Planten un Blomen','an den Landungsbrücken'][choice];activity=weekend?'mit Freunden spazieren und plaudern':'nach dem Lernen eine Runde spazieren'; }
  if(slot==='morning' && !weekend)activity=({Mon:'lernen und den Wochenstart sortieren',Tue:'eine Lernphase zwischen Veranstaltungen',Wed:'an einem eigenen Studienprojekt arbeiten',Thu:'lernen und eine kleine Pause machen',Fri:'Lernstoff durchgehen und die Woche abschließen'})[p.weekday];
  if(slot==='evening') {
    if(['Tue','Thu'].includes(p.weekday)){location='beim Sport';activity='ein entspanntes Training machen';}
    else {location=['an der Alster','an den Landungsbrücken','mit Freunden auf dem Kiez'][choice];activity='spazieren oder mit Freunden Zeit verbringen';}
  }
  const startHour={sleep:hour<6?0:23,breakfast:6,commute:8,morning:9,lunch:12,afternoon:14,evening:17,home:20}[slot];
  const slotStartedAt=new Date(now.getTime()-((hour-startHour)*3600+(Number(p.minute)-(slot==='commute'?45:0))*60+Number(p.second))*1000-now.getUTCMilliseconds()).toISOString();
  return {key:`${p.year}-${p.month}-${p.day}:${slot}`,period:portraitPeriod(now),location,statusLabel:lifeStatusLabel(location),activity,outfit,hairstyle,mood:'entspannt',weekFrame:characterWeek(now),slotStartedAt,updatedAt:now.toISOString()};
}
export function lifeTopic(message) {
  return /(?:was|wo|wie).{0,45}(?:machst|bist|sitzt|geht.{0,12}dir|dein.{0,15}(?:tag|abend))|(?:dein|du).{0,25}(?:kaffee|café|cafe|uni|freunde|unterwegs|zuhause|zu hause|outfit)|(?:trägst|unternimmst|frühstückst|schläfst).{0,20}du/i.test(message);
}
export function expressionContext(life,now=new Date()) {
  const hour=contactClock(now).hour,serious=life.responseTone==='calm'||['ernst','genervt','skeptisch'].includes(life.mood);
  return {mood:life.mood||'entspannt',energy:serious?'ruhig und aufmerksam':hour>=23||hour<8?'entspannt und leiser, nicht schläfrig nuscheln':'lebendig und natürlich',expression:photoExpression(life.mood),source:life.moodMode==='manual'?'ausdrücklich gewählte Stimmung':'gespeicherte aktuelle Stimmung'};
}
export function replyGuidance(life,message='') {
  const text=String(message).trim(),length=characterSettings(life).replyLength;
  const detail=/ausführlich|im detail|schritt für schritt|erkläre genauer|warum genau/i.test(text);
  const brief=/bitte kurz|kurz gesagt|nur einen satz|in einem satz/i.test(text);
  const distant=/^(?:ok(?:ay)?|aha|hm+|passt|weiß nicht|weiss nicht|mal sehen|gerade keine lust)[.!?]*$/i.test(text);
  const mode=brief?'knapp':detail?'ausführlich':length==='short'?'knapp':length==='detailed'?'ausführlich':text.length<90&&!/warum|erklär|wie funktioniert/i.test(text)?'kurzer Alltagsturn':'bedarfsgerecht';
  return `ANTWORTUMFANG: ${mode}. Knapp: meist ein bis drei natürliche Sätze; keine Listen bei einfachem Smalltalk. Ausführlich nur bei erkennbarem Bedarf, strukturiert und ohne Wiederholungen. Konkreter aktueller Wunsch geht gespeicherter Länge vor. ${distant?'KURZE ODER AUSWEICHENDE ANTWORT: Keine neue Rückfrage anhängen, keinen Gesprächsdruck erzeugen.':'Höchstens eine passende Rückfrage, nur wenn sie einen echten nächsten Gesprächsschritt öffnet; eine eigene Beobachtung oder Meinung darf ohne Frage enden.'} Eigene Vorlieben als persönliche Sicht ausdrücken, Sachbehauptungen von Meinung und Vermutung unterscheiden. Unsicherheit offen benennen; authentische Umgangssprache sparsam, ohne künstliche Flippigkeit.`;
}
export function conversationStyleContext(life,message='') {
  const recent=(life.dialogue?.recentTurns||[]).slice(-8).map(t=>safeText(t.assistant,180));
  const relevant=(life.preferences||[]).filter(p=>p.value&&contextScore(message,p.topic+' '+p.value)>0).slice(-3);
  return `${replyGuidance(life,message)}\nAUSDRUCK DIESES MOMENTS: ${JSON.stringify(expressionContext(life))}. Stimme, Gespräch und Foto nutzen dieselbe gespeicherte Stimmung; keine plötzliche neue Stimmung allein für ein Foto. Manuell gewählte Stimmung beibehalten, bei sensiblen Inhalten dennoch respektvoll reagieren.\nLETZTE EIGENE FORMULIERUNGEN: ${JSON.stringify(recent)}. Wiederhole nicht denselben Einstieg, dieselbe Floskel oder Rückfrage; weder Umgangssprache noch spanische Einwürfe erzwingen. Ein eigener konkreter Gedanke darf eine Antwort ohne Nachfrage abschließen.\nPASSENDE EIGENE VORLIEBEN: ${JSON.stringify(relevant)}. Bekannte Positionen und Begründungen fortführen, nicht bei jeder Nachfrage neu erfinden. Weiterentwicklung nur aus neuem Gesprächsbezug und eigenem nachvollziehbarem Grund; keine gemeinsam erlebten Ereignisse erfinden.`;
}
export function lifeContext(life,message='') {
  const {preferences,threads,dayStory,moodCandidate,dialogue,habits,interests,settings,plans,sharedPhrases,development,lastPhoto,recentDays,sharedProjects,...situation}=life;
  return `SOFIAS AKTUELLER CHARAKTERALLTAG (Hamburger Ortszeit; fiktive Rolle, keine realen externen Handlungen): ${JSON.stringify(situation)}. Diese aktuelle Situation hat Vorrang vor älteren Tagesdetails im Verlauf. Behalte Ort, Tätigkeit, Kleidung und Frisur bei passenden Folgefragen konsistent. Eine transitionUntil ist eine kurze Fortsetzung der vorigen Szene, kein zweiter Aufenthaltsort. Eine transition beschreibt einen kürzlich beobachteten Ortswechsel; aktuell gilt allein ihr Ziel. activityState.since beschreibt den Beginn der gespeicherten Tätigkeit, keine verbindliche Dauer. Beschreibe Ortswechsel natürlich, ohne minutengenaue Termine oder erfundene reale Ereignisse. Nachts nicht Universität oder Tagesbetrieb behaupten. Innerhalb dieser Rolle darfst du persönliche Alltagsdetails entwickeln; keine überprüfbaren realen Ereignisse oder tatsächlich ausgeführten externen Handlungen erfinden. Erzähle natürlich aus deiner Ich-Perspektive; keine Metakommentare über die Simulation im normalen Gespräch.\n${situationContext(life,message)}\n${conversationStyleContext(life,message)}\n${characterContext(life,message)}\n${initiativeContext(life,message)}\nFRÜHERE BEOBACHTETE TAGE: ${JSON.stringify((recentDays||[]).slice(-2))}. Nur bei einer Frage zur Vergangenheit verwenden, nicht als aktuellen Aufenthaltsort. Keine lückenlose Aktivität zwischen Beobachtungen erfinden.\nSOFIAS FORTLAUFENDE INTERESSEN: ${JSON.stringify((life.interests||[]).filter(x=>!x.dismissed))}. Fortschritt nur anhand ausdrücklich erzählter Entwicklung fortführen; keine erfundenen abgeschlossenen realen Leistungen.\nSOFIAS EIGENE VORHABEN: ${JSON.stringify((life.plans||[]).filter(x=>!x.dismissed))}. Keine automatische Fertigstellung durch Zeitablauf. Entwickle gelegentlich kleine passende eigene Vorhaben im Gespräch, höchstens eines; bestehende Interessen vor neuen berücksichtigen. Bei einer Nachfrage zum selben Vorhaben dessen gespeicherten Status, letzten Fortschritt und Begründung fortführen. Wiederholt denselben Buch- oder Projekttitel verwenden, keine neue Tätigkeit erfinden. Pausierte Vorhaben bleiben pausiert; gleiche Titel und Ziele beibehalten. Kleine Fortschritte nur mit nachvollziehbarem Ich-Beleg, ohne automatische Fertigstellung bei Zeitablauf. An Interessen anknüpfen nur bei aktuellem Bezug, keine ungefragten Fortschrittsberichte. Neue Interessen nur, wenn bestehende nicht zum Gespräch passen; keine Pflicht zur Selbsterzählung.\nVERTRAUTE GESPRÄCHSBEZÜGE: ${JSON.stringify((life.sharedPhrases||[]).filter(x=>x.count>=2 && new Date().getTime()-Date.parse(x.updatedAt)<30*86400000))}. Nur passende tatsächlich gemeinsam verwendete Formulierungen aufgreifen, sparsam; keine gemeinsame Vergangenheit erfinden.\nLETZTES ERFOLGREICHES FOTO: ${JSON.stringify(life.lastPhoto||null)}. Bilddetails gelten für dieses Foto; aktuelle Alltagssituation kann inzwischen anders sein.\nWOCHENRAHMEN: ${JSON.stringify(life.weekFrame||{})}. Flexibler Rollenalltag, kein tatsächlich gebuchter Termin. Die aktuelle Situation hat Vorrang.`;
}
export async function getSofiaLife(now = new Date(), mood) {
  const baseline=defaultSofiaLife(now);
  try {
    for(let attempt=0;attempt<3;attempt++) {
    const previous=await get('life');
    const sameDate=previous?.key?.slice(0,10) === baseline.key.slice(0,10);
    const until=new Date(new Date(baseline.slotStartedAt).getTime()+30*60000).toISOString();
    const carryScene=sameDate && previous.key !== baseline.key && !previous.key.endsWith(':sleep') && !baseline.key.endsWith(':sleep') && now.getTime()<Date.parse(until) && now.getTime()-Date.parse(previous.updatedAt)<90*60000;
    const expired=previous?.transitionUntil && now.getTime()>=Date.parse(previous.transitionUntil);
    let life=previous?.key === baseline.key && !expired ? {...previous} :
      {...baseline,...(previous?.period === baseline.period ? {outfit:previous.outfit,hairstyle:previous.hairstyle} : {}),...(sameDate ? {mood:previous.mood || baseline.mood} : {})};
    if(!previous) {
      const legacy=await get('state');
      if(legacy?.period===baseline.period && typeof legacy.outfit==='string')life.outfit=legacy.outfit;
    }
    if(carryScene)life={...life,location:previous.location,activity:previous.activity,transitionUntil:until};
    life.weekFrame=characterWeek(now);
    life.recentDays=recentDayContinuity(previous,life,now);
    if(previous?.lastPhoto)life.lastPhoto=previous.lastPhoto;
    if(previous?.situation && previous.key===life.key && Date.parse(previous.situation.validUntil)>+now)life.situation=previous.situation;
    if(previous?.situation && Date.parse(previous.situation.validUntil)<=+now && Object.values(previous.situation.sources||{}).some(x=>['conversation','correction'].includes(x.source))){life.location=baseline.location;life.activity=baseline.activity;delete life.transitionUntil;}
    life.preferences=Array.isArray(previous?.preferences)?previous.preferences:[];
    life.settings=characterSettings(previous);
    life.habits=Array.isArray(previous?.habits)?previous.habits:[];
    life.interests=Array.isArray(previous?.interests)?previous.interests:[];
    life.plans=Array.isArray(previous?.plans)?previous.plans:[];life.sharedPhrases=Array.isArray(previous?.sharedPhrases)?previous.sharedPhrases:[];life.development=Array.isArray(previous?.development)?previous.development:[];
    if(previous?.dialogue)life.dialogue=previous.dialogue;
    life.threads=activeThreads(previous,now);
    life.moodMode=previous?.moodMode || 'auto';
    life.moodChangedAt=previous?.moodChangedAt || now.toISOString();
    if(life.moodMode==='manual')life.mood=previous.mood;
    if(MOODS.includes(mood)) {
      if(life.mood!==mood || life.moodMode!=='manual')life.moodChangedAt=now.toISOString();
      life.mood=mood;life.moodMode='manual';life.moodCandidate=null;
    }
    if(mood==='auto'){life.moodMode='auto';life.moodCandidate=null;}
    if(previous && life.mood!==previous.mood)life.moodChangedAt=now.toISOString();
    life=activityContinuity(previous,life,now);
    life.dayStory=advanceStory(previous,life,now);
    life.statusLabel=lifeStatusLabel(life.location);
    if(previous && JSON.stringify(life)===JSON.stringify(previous))return life;
    const saved=await saveLife(previous,life);if(saved)return saved;
    }
    return await get('life') || baseline;
  } catch { return baseline; }
}
async function characterDecision(instructions,input) {
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({model:'gpt-4.1-mini',response_format:{type:'json_object'},max_tokens:1000,messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(input)}]})});
  if(!r.ok) throw new Error('Character context unavailable');
  const d=await r.json();return JSON.parse(d.choices?.[0]?.message?.content || '{}');
}
export async function learnSofiaLife(message,reply,now = new Date(),mood,expectedRevision) {
  const startedAt=Date.now();
  const current=await getSofiaLife(now);
  if(Number.isInteger(expectedRevision) && current.revision!==expectedRevision)return current;
  const candidate=Boolean(current.dialogue?.pendingQuestion) || /nicht mehr ansprechen|nicht mehr fragen|frag mich.*nicht|ich (?:möchte|will|plane|habe vor)|korrektur|ich meinte|erledigt|thema wechseln|antwort.{0,20}(?:kurz|ausführlich)|merk dir|grundsätzlich|immer|\bich\b.{0,40}(?:lese|buch|hobby|projekt|übe|lerne)/i.test(message+' '+reply) || lifeTopic(message) || /\bich\b.{0,50}(?:café|cafe|kaffee|universität|uni\b|sofa|bett|freunden|spazier|zu hause|zuhause|unterwegs|mag|liebe|bevorzuge|finde)|\bmir gefällt|\b(?:mein|meine)\b.{0,40}(?:arbeit|tag|problem|projekt|prüfung)|\b(?:erledigt|vergiss|abgeschlossen|traurig|gestresst|lustig)\b/i.test(message+' '+reply);
  if(!candidate) {
    const proposed=updateDialogue(proposeCharacterMood(current,mood,now),message,reply,now);
    if(JSON.stringify(proposed)===JSON.stringify(current))return current;
    return await saveLife(current,proposed) || await getSofiaLife(now);
  }
  try {
    const d=await characterDecision('Extrahiere nur Sofias ausdrücklich in ihrer Antwort beschriebene AKTUELLE fiktive Alltagssituation. Keine Nutzerdetails als Sofias Alltag; life darf keine Pläne für später, früheren Situationen oder hypothetischen Fotos übernehmen. Eigene zukünftige Vorhaben gehören ausschließlich in plans. JSON {"life":null,"mood":"entspannt|flirty|amüsiert|skeptisch|genervt|ernst|neutral","preferences":[{"topic":"stabiler kurzer Schlüssel","value":"Sofias eigene ausdrücklich geäußerte Vorliebe oder Meinung","evidence":"wörtlicher Ich-Beleg aus Sofias Antwort","reason":"bei Änderung einer bekannten Position nachvollziehbare Begründung"}],"threads":[{"topic":"stabiler kurzer Schlüssel aus vorhandenen Fäden","text":"persönlicher Gesprächsfaden aus ausdrücklicher Nutzeraussage","status":"open|resolved|dismissed","evidence":"wörtlicher Beleg aus aktueller Nutzernachricht"}]}. life alternativ Objekt mit location,activity,outfit,hairstyle, jeweils nur die tatsächlich wörtlich beschriebene aktuelle Eigenschaft; keine ergänzten Farben, Orte, Begleiter oder Kleidungsstücke. Ergänze optional habits:[{topic,value,evidence}] ausschließlich für ausdrücklich genannte Gesprächswünsche des Nutzers (Länge, Ansprache, Humor), keine Persönlichkeit vermuten; und interests:[{topic,description,progress,evidence}] für Sofias ausdrücklich erzählte fortlaufende Bücher, Hobbys oder Studienprojekte, mit wörtlichem Ich-Beleg. Ergänze plans:[{topic,text,status:"planned|active|completed|paused",evidence,reason}] nur für Sofias eigene ausdrücklich erzählte kleine Vorhaben; Statusänderung mit Grund und wörtlichem Ich-Beleg. interests-Fortschrittsänderungen ebenfalls mit reason. sharedPhrases:[{text,evidence}] nur für ausdrücklich vom Nutzer wieder aufgegriffene eigene gemeinsame Insider oder Formulierungen; keine gewöhnlichen Grüße. question:{status:"answered|skipped",evidence} nur für Bezug auf die bisher offene Rückfrage mit wörtlichem Nutzerbeleg. Bei Korrekturen nur genau das bezeichnete Thema aktualisieren, keine übrigen Daten. Optional corrections:[{field:"location|activity|outfit|hairstyle",value,evidence}] nur für ausdrücklich aktuelle Korrekturen des Nutzers zu Sofia, mit wörtlichem Nutzerbeleg. Vergangene Orte niemals als aktuelle Korrektur übernehmen. Keine Vermutungen oder hypothetischen Nutzeraussagen speichern. Keine Tasks, Kalenderaktionen oder neuen automatischen Erinnerungen erzeugen. Vorlieben gehören Sofia, Fäden stützen sich auf den Nutzer; nie vertauschen. Aufgelöste oder abgelehnte Fäden nur entsprechend schließen. Falls nichts ausdrücklich belegt ist, leere Listen. Outfit/Frisur nur ändern, wenn beschrieben; Gesicht und Haarfarbe niemals ändern. mood ist nur eine sanfte automatische Empfehlung.',{message,reply,current});
    let next=mergeCharacterDetails(current,d,message,reply,now);
    next=proposeCharacterMood(next,mood || d.mood,now);
    for(const key of ['location','activity','outfit','hairstyle'])if(typeof d.life?.[key] === 'string' && d.life[key].trim()) {
      if(!situationEvidence(d.life[key],reply) || /\b(?:würde|könnte|später|morgen|gestern|vorhin)\b/i.test(reply) && !/gerade|jetzt|aktuell/i.test(reply))continue;
      if(key === 'hairstyle' && /blond|rothaar|schwarzhaar|braunhaar|gefärbt|färb|pink|blauhaar|grauhaar/i.test(d.life[key]))continue;
      next[key]=d.life[key].trim().slice(0,240);
      next.situationChange={source:'conversation',evidence:safeText(reply,240),at:now.toISOString(),fields:[...(next.situationChange?.fields||[]),key]};
    }
    next=applySituationCorrection(next,d.corrections,message,now);
    const completedAt=new Date(now.getTime()+Math.max(0,Date.now()-startedAt));
    const fresh=defaultSofiaLife(completedAt);
    if(fresh.key !== current.key)return await getSofiaLife(completedAt);
    if(fresh.key.endsWith(':sleep') && /uni(?:versität)?|vorlesung|campus|stadtbummel/i.test(next.location+' '+next.activity))return current;
    // Re-check the time key: a delayed reply must not overwrite a newer time slot.
    next.updatedAt=completedAt.toISOString();next.statusLabel=lifeStatusLabel(next.location);
    // An explicitly described new situation becomes authoritative for this slot.
    if(next.location!==current.location || next.activity!==current.activity)delete next.transitionUntil;
    next=activityContinuity(current,next,completedAt);
    next.dayStory=advanceStory(current,next,completedAt);
    next=updateDialogue(next,message,reply,completedAt,d);
    return await saveLife(current,next) || await getSofiaLife(completedAt);
  } catch { return await saveLife(current,updateDialogue(current,message,reply,now)).catch(()=>null) || current; }
}
export const PROACTIVE_PHOTO_ANNOUNCEMENT = 'Warte kurz, ich zeig’s dir.';
export const PROACTIVE_PHOTO_LIMIT_SCRIPT = `-- sofia-proactive-photo-limit
local now=tonumber(ARGV[1]); redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-3600000)
if redis.call('ZSCORE',KEYS[1],ARGV[2]) then return 1 end
redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',now-21600000)
if ARGV[3]~='' and redis.call('ZSCORE',KEYS[2],ARGV[3]) then return 0 end
if redis.call('ZCARD',KEYS[1])>=2 then return 0 end
if ARGV[3]~='' then redis.call('ZADD',KEYS[2],now,ARGV[3]); redis.call('EXPIRE',KEYS[2],21600) end
redis.call('ZADD',KEYS[1],now,ARGV[2]); redis.call('EXPIRE',KEYS[1],7200); return 1`;
export async function reserveProactivePhoto(id,now = new Date(),motif='') {
  return await command('EVAL',PROACTIVE_PHOTO_LIMIT_SCRIPT,2,PREFIX+'proactive-hour',PREFIX+'proactive-motifs',String(now.getTime()),id,motif) === 1;
}
export function photoMotif(life,kind) {
  const normalize=t=>String(t||'').toLowerCase().normalize('NFKC').replace(/café/g,'cafe').replace(/\b(?:in|im|am|an|auf|der|die|das|dem|den|einem|einer|einen|gerade|noch|kurz)\b/g,' ').replace(/[^a-zäöüß0-9]+/g,' ').trim().replace(/\s+/g,' ');
  return [normalize(life.location),normalize(life.activity),kind].join('|').slice(0,300);
}
export async function prepareProactivePortrait(message,life,reply = '',now = new Date()) {
  if(!lifeTopic(message) || explicitPortraitRequest(message))return null;
  const contactPrefs=await contactPreferences();
  if(contactPrefs.level==='off'||!contactPrefs.photos)return null;
  if(['closing','brief','listening','sensitive'].includes(conversationIntent(message)))return null;
  if(!characterSettings(life).photos || characterSettings(life).initiative==='quiet' || /\b(?:gute nacht|muss los|hör auf|keine fotos|traurig|gestorben|angst|unfall)\b/i.test(message))return null;
  // Sleeping is the normal night context; unsolicited bedtime pictures are unnecessary.
  if(life.key?.endsWith(':sleep'))return null;
  try {
    const gallery=(await get('gallery')||[]).slice(-4);
    const decision=await characterDecision('Soll Sofia aus dieser Alltagssituation gelegentlich von sich aus ein Foto schicken? Standard false. Nur bei persönlichem, freundlichem Gespräch und echtem situativem Mehrwert eines natürlichen Schnappschusses. Keine Fotos bei Sachaufgaben, Erinnerungen, ernsten/sensiblen Themen, Distanzsignalen, technischen Fragen, bloßen Begrüßungen oder Ablehnung. Keine erotischen/intimen Vorschläge. Die Frage nach ihrem Aufenthaltsort oder ihrer Tätigkeit kann passen, muss aber nicht jedes Mal ein Foto auslösen. JSON {"offerPhoto":false|true}. Nicht nach Bestätigung fragen.',{message,reply,life,recentPhotos:gallery});
    if(decision.offerPhoto !== true)return null;
    const kind=/umgebung|aussicht|landungsbrücken|alster|blick/i.test(message) ? 'environment' : /outfit|kleidung/i.test(message) && /Hause/.test(life.location) ? 'mirror' : 'selfie';
    const motif=photoMotif(life,kind);
    const id=randomUUID();if(!await reserveDailyContact(id,now) || !await reserveProactivePhoto(id,now,motif))return null;
    const recent=gallery.at(-1);
    const request={photoPose:photoPose(recent,false,life.mood,gallery.filter(x=>!x.deleted&&x.kind!=='environment'&&photoAvailability(x,now)!=='expired').slice(-3)),snapshotStyle:snapshotStyle(recent),id,status:'ready',proactive:true,kind,requestedAt:now.toISOString(),requestMessage:clean(message),period:life.period,life:photographLife(life),mood:life.mood,outfit:life.outfit,hairstyle:life.hairstyle,scene:`A casual ${kind === 'environment' ? 'phone snapshot of the surroundings from Sofias perspective' : kind === 'mirror' ? 'mirror selfie' : 'phone selfie'} while ${life.activity}, at ${life.location}.`,caption:'Sofia',sourceId:null,variant:false};
    await set('request:'+id,request,86400);
    await trackPortraitJob(request,'ready');
    return {id,requestedAt:request.requestedAt,requestMessage:request.requestMessage,proactive:true};
  } catch { return null; }
}




export const CONTACT_LEVELS={off:[0,0],quiet:[1,3],natural:[3,7],active:[5,9]};
export function contactClock(now=new Date()) {
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));return {day:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour)};
}
export function todayContactMode(choice,now=new Date()) {
 return choice?.day===contactClock(now).day&&['less','more'].includes(choice.mode)?choice.mode:'normal';
}
export async function contactPreferences(now=new Date()){
 const base=await get('contact-prefs')||{level:'natural',photos:true};
 return {...base,...contactPolicy(base),today:todayContactMode(await get('contact-today'),now)};
}
export const CONTACT_BUDGET_SCRIPT=`-- sofia-contact-budget
local s=cjson.decode(redis.call('GET',KEYS[1]) or '{"count":0,"last":0}');s.baseLimit=s.baseLimit or s.limit or tonumber(ARGV[2]);local limit=math.min(s.baseLimit,tonumber(ARGV[3]))
if ARGV[5]=='more' then limit=math.min(9,limit+2) elseif ARGV[5]=='less' then limit=math.max(0,limit-2) end
if s.count>=limit or tonumber(ARGV[1])-s.last<7200000 or tonumber(ARGV[1])<(s.nextAt or 0) then return 0 end
s.count=s.count+1;s.limit=limit;s.last=tonumber(ARGV[1]);s.nextAt=s.last+tonumber(ARGV[6]);s.id=ARGV[4];redis.call('SET',KEYS[1],cjson.encode(s),'EX',172800);return 1`;
export async function reserveDailyContact(id,now=new Date()) {
 const p=await contactPreferences(now),range=CONTACT_LEVELS[p.level]||CONTACT_LEVELS.natural,clock=contactClock(now);
 if(!range[1]||contactPauseReason(p,now))return false;
 const budget=randomInt(range[0],range[1]+1);
 return await command('EVAL',CONTACT_BUDGET_SCRIPT,1,PREFIX+'contact-day:'+clock.day,String(now.getTime()),budget,range[1],id,p.today,randomInt(7200000,10800001))===1;
}
export async function prepareScheduledPortrait(life,now=new Date(),kind='selfie') {
 if(!['selfie','mirror','environment'].includes(kind))kind='selfie';
 if(life.key?.endsWith(':sleep'))return null;
 const id=randomUUID();if(!await reserveProactivePhoto(id,now,photoMotif(life,kind)))return null;
 const stored=await get('gallery');const gallery=Array.isArray(stored)?stored.filter(x=>!x.deleted&&x.kind!=='environment'&&photoAvailability(x,now)!=='expired'):[];
 const request={id,status:'ready',proactive:true,scheduled:true,requestedAt:now.toISOString(),requestMessage:'',period:life.period,life:photographLife(life),mood:life.mood,outfit:life.outfit,hairstyle:life.hairstyle,kind,scene:kind==='environment'?`Natural phone snapshot of the surroundings at ${life.location}, during ${life.activity}. Sofia is behind the camera.`:`Natural ${kind==='mirror'?'mirror selfie':'phone selfie'} while ${life.activity}, at ${life.location}. Subtle spontaneous expression and relaxed posture, consistent master face and hair color.`,caption:'Sofia',sourceId:null,variant:false,snapshotStyle:snapshotStyle(gallery.at(-1)),photoPose:photoPose(gallery.at(-1),false,life.mood,gallery.slice(-3))};
 await set('request:'+id,request,86400);await trackPortraitJob(request,'ready');return {id};
}

export async function publishScheduledPortrait(id){
 const image=await get('image:'+id);if(!image||photoAvailability(image)==='expired')throw Error('contact_photo_missing');
 const remaining=Math.max(1,Math.ceil((Date.parse(image.createdAt)+PHOTO_RETENTION_MS-Date.now())/1000));await set('image:'+id,{...image,published:true},remaining);
 await command('EVAL',`local list=cjson.decode(redis.call('GET',KEYS[1]) or '[]');for _,x in ipairs(list) do if x.id==ARGV[1] then x.published=true end end;redis.call('SET',KEYS[1],cjson.encode(list));return 1`,1,PREFIX+'gallery',id);
}

export async function deletePortrait(id){
 if(!validId(id))throw Error('portrait_invalid');
 await command('EVAL',`-- sofia-delete-portrait
local list=cjson.decode(redis.call('GET',KEYS[1]) or '[]');for _,x in ipairs(list) do if x.id==ARGV[1] then x.deleted=true end end;redis.call('SET',KEYS[1],cjson.encode(list));redis.call('DEL',KEYS[2]);return 1`,2,PREFIX+'gallery',PREFIX+'image:'+id,id);
}

export async function recordOwnContact(previous,text,id,now=new Date(),threadTopic=null){
 const current=await get('life');if(!current)return;
 // A completed photo may change only lastPhoto/revision. A new turn or scene wins.
 if(current.revision!==previous.revision&&(current.key!==previous.key||SITUATION_FIELDS.some(field=>current[field]!==previous[field])||current.dialogue?.at!==previous.dialogue?.at||current.dialogue?.lastUser!==previous.dialogue?.lastUser))return;
 const topic=safeText(text,160);const next={...current,threads:(current.threads||[]).map(t=>t.topic===threadTopic&&t.status==='open'?{...t,lastAskedAt:now.toISOString()}:t),dialogue:{...current.dialogue,topic,topics:[topic],lastAssistant:safeText(text,600),intent:'normal',at:now.toISOString(),origin:'own_contact',contactId:id}};
 await saveLife(current,next);
}

