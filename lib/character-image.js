import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export const PORTRAIT_FAILURE_REPLY = 'Ich bin gerade nicht in der passenden Umgebung für ein Foto. Frag mich gern gleich noch einmal.';
const PREFIX = 'sofia:main:portrait:';
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
  return /selfie|spiegelselfie|outfit(?:\s+of\s+the\s+day)?|ootd|(?:bild|foto|photo).{0,35}(?:von dir|von sofia|von mir selbst)|(?:zeig|schick).{0,25}(?:dich|dein look)|(?:ander|gleich).{0,20}(?:licht|beleuchtung|pose|hintergrund)|(?:zeig|schick).{0,35}(?:dein(?:e|en)? (?:umgebung|aussicht|café|cafe)|was du (?:gerade )?siehst)/i.test(message);
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
async function get(suffix) { const value = await command('GET', PREFIX + suffix); return value ? JSON.parse(value) : null; }
async function set(suffix, value, seconds) { return command('SET', PREFIX + suffix, JSON.stringify(value), ...(seconds ? ['EX', seconds] : [])); }
export const LIFE_CAS_SCRIPT = `-- sofia-life-cas
local current=redis.call('GET',KEYS[1]) or ''
if current~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2]); return 1`;
async function saveLife(previous,next) {
  next={...next,revision:(Number(previous?.revision)||0)+1};
  const ok=await command('EVAL',LIFE_CAS_SCRIPT,1,PREFIX+'life',previous?JSON.stringify(previous):'',JSON.stringify(next));
  return ok===1 ? next : null;
}
const safeText=(text,max=240)=>typeof text==='string'?text.trim().slice(0,max):'';
function photographLife(life) {
  return Object.fromEntries(['key','revision','period','location','activity','outfit','hairstyle','mood'].map(key=>[key,life[key]]));
}
export function characterSettings(life) {
  const s=life?.settings||{};
  return {initiative:['quiet','balanced','active'].includes(s.initiative)?s.initiative:'balanced',photos:s.photos!==false,replyLength:['auto','short','detailed'].includes(s.replyLength)?s.replyLength:'auto'};
}
export function conversationIntent(message) {
  const text=String(message||'').trim();
  if(/(?:gute nacht|muss los|bis später|lass gut|hör auf|tschüss|keine (?:weiteren )?fragen)/i.test(text))return 'closing';
  if(/(?:nur kurz|kurze antwort|in einem satz|keine erklärung)/i.test(text))return 'brief';
  if(/(?:ich möchte (?:nur )?erzählen|hör (?:mir )?einfach zu|nur zuhören|lass mich erzählen)/i.test(text))return 'listening';
  if(/(?:traurig|trauer|gestorben|krank|schmerz|angst|verzweifelt|unfall)/i.test(text))return 'sensitive';
  return 'normal';
}
export function isCorrection(message) {
  return /^(?:nein[,!\s]+(?:ich meinte|gemeint war)|ich meinte|korrektur[:\s]|nicht .{1,100},? sondern)/i.test(String(message||'').trim());
}

// Local bounded policies shared by Text and Live; no extra model requests.
const contextWords=text=>new Set(String(text||'').toLowerCase().normalize('NFKC').match(/[a-zäöüß0-9]{4,}/g)||[]);
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
  return /^(?:warum|wieso|weshalb|wie denn|was meinst du(?: damit)?|wie meinst du das|und (?:danach|dann|du|bei dir)|was (?:danach|dann)|erzähl(?:e)? (?:mir )?(?:mehr|weiter)|zeig(?:e)? mir das|das gleiche|dasselbe|dieses (?:bild|foto)|etwas (?:näher|weiter weg)|mit (?:einem )?lächeln)[.!?\s]*$/i.test(String(message||'').trim());
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
  if((changed||intentClosing(message))&&before.topic)closedTopics.push({topic:before.topic,at:now.toISOString()});
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
  return {...life,threads,dialogue:{topic,topics,closedTopics:closedTopics.slice(-6),lastUser:safeText(message,600),lastAssistant:safeText(reply,600),pendingQuestion,questions,intent,correction:correction?corrections.at(-1):null,corrections:corrections.slice(-4),recentTurns:recentTurns.slice(-6),turnsSinceQuestion:lastQuestion&&!repeated?0:Math.min(10,(Number(before.turnsSinceQuestion)||0)+1),at:now.toISOString()}};
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
  const changes=/(?:licht|beleuchtung|lächeln|näher|weiter weg|abstand|pose|hintergrund|gesichtsausdruck)/i;
  return /^(?:(?:bitte )?(?:etwas|ein wenig) (?:näher|weiter weg)|(?:bitte )?(?:mit|ohne|weniger|mehr) (?:einem )?lächeln)[.!?]*$/i.test(text) || /^(?:dasselbe|das gleiche|dieses (?:bild|foto)|(?:bitte )?nur|nein[,\s]+ich meinte)/i.test(text) && changes.test(text);
}
export function variantDimensions(message) {
  const dimensions=[];
  for(const [name,pattern]of [['lighting',/licht|beleuchtung/i],['expression',/lächeln|gesichtsausdruck|mimik|ernster|fröhlicher/i],['distance',/näher|weiter weg|abstand/i],['pose',/pose|haltung/i],['background',/hintergrund/i],['outfit',/outfit|kleidung|oberteil|pullover|shirt|bluse|kleid\b/i],['hairstyle',/frisur|pferdeschwanz|haare zusammen|haare offen/i],['time',/tageszeit|statt tagsüber|statt nachts|am abend statt|am morgen statt/i]])if(pattern.test(message))dimensions.push(name);
  return dimensions;
}
function mixedParts(plan,message) {
  const taskMessage=safeText(plan.taskMessage,1000),photoMessage=safeText(plan.photoMessage,1000);
  if(!taskMessage || !photoMessage || !message.toLowerCase().includes(taskMessage.toLowerCase()) || !message.toLowerCase().includes(photoMessage.toLowerCase()) || !/(?:aufgabe|erinner|termin|kalender|erledig|lösch|fällig|priorität|liste)/i.test(taskMessage) || !portraitCandidate(photoMessage))throw new Error('Bitte frage das Bild und die Aufgabenaktion getrennt an, damit ich beides zuverlässig ausführen kann.');
  return {taskMessage,photoMessage};
}
function contextualPhotoRequest(message,life,now) {
  return /^zeig(?:e)? mir das[.!?]*$/i.test(message.trim()) && now.getTime()-Date.parse(life.dialogue?.at)<600000 && lifeTopic(life.dialogue?.lastUser||'');
}
export const PORTRAIT_JOBS_SCRIPT=`-- sofia-portrait-jobs
local jobs=cjson.decode(redis.call('GET',KEYS[1]) or '[]'); local next={}
for _,job in ipairs(jobs) do if job.id~=ARGV[1] then table.insert(next,job) end end
if ARGV[2]~='' then table.insert(next,cjson.decode(ARGV[2])) end
while #next>20 do table.remove(next,1) end
redis.call('SET',KEYS[1],cjson.encode(next),'EX',86400); return 1`;
async function trackPortraitJob(request,status) {
  const job=['ready','processing'].includes(status)?{id:request.id,anchorId:request.id,status:'pending',jobStatus:status,requestedAt:request.requestedAt,startedAt:status==='processing'?new Date().toISOString():null,requestMessage:request.requestMessage}:null;
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
  const transition=changed?{from:previous.location,to:next.location,at,expiresAt:new Date(now.getTime()+20*60000).toISOString()}:sameScene && Date.parse(prior?.expiresAt)>now.getTime()?prior:null;
  return {...next,activityState:state,transition,activityDevelopment:activityDevelopment(next)};
}
export function snapshotStyle(reference,variant=false) {
  if(variant)return reference?.snapshotStyle||null;
  const styles=['relaxed eye-level phone framing','slightly off-center casual phone framing','small natural head tilt with everyday phone framing'];
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
  const threads=activeThreads(life,new Date()).filter(t=>t.status==='open' && new Date().getTime()-(Date.parse(t.lastAskedAt)||0)>86400000 && (lifeTopic(message) || relevant(t))).slice(-2);
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
  next.statusLabel=lifeStatusLabel(next.location);next.updatedAt=now.toISOString();next.dayStory=advanceStory(previous,next,now);
  const saved=await saveLife(previous,next);if(!saved)throw new Error('character_conflict');return saved;
}
export async function portraitGallery() {
  const [images, notices,jobs] = await Promise.all([get('gallery'), get('notices'),get('jobs')]);
  const completed=new Set([...(images||[]),...(notices||[])].map(x=>x.id));
  const pending=(jobs||[]).filter(x=>!completed.has(x.id)).map(x=>new Date().getTime()-Date.parse(x.startedAt||x.requestedAt)>360000?{...x,status:'failed',message:PORTRAIT_FAILURE_REPLY}:x);
  return [...(images || []), ...(notices || []),...pending].sort((a,b) => String(a.requestedAt || a.createdAt).localeCompare(String(b.requestedAt || b.createdAt)));
}
export async function preparePortrait(message, referenceImageId, now = new Date(), mood) {
  if (!portraitCandidate(message) && !photoVariantRequest(message) && !/^zeig(?:e)? mir das[.!?]*$/i.test(message.trim())) return null;
  const state = await get('state');
  const life = await getSofiaLife(now, mood);
  const contextual=contextualPhotoRequest(message,life,now);
  if(!portraitCandidate(message) && !photoVariantRequest(message) && !contextual)return null;
  if(referenceImageId && !validId(referenceImageId))throw new Error('Für diese Variante brauche ich zuerst ein gültiges Ausgangsbild.');
  const reference = validId(referenceImageId) ? await get('image:' + referenceImageId) : state?.lastImageId ? await get('image:' + state.lastImageId) : null;
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
  const request = {snapshotStyle:snapshotStyle(reference,variant),id:randomUUID(),status:'ready',requestedAt:now.toISOString(),requestMessage:clean(message),period,...(parts?{taskMessage:parts.taskMessage}:{}),dimensions,scene:parts?clean(parts.photoMessage):variant?clean(message):clean(plan.scene),outfit,caption:clean(plan.caption).slice(0,240) || 'Ein Bild von mir.',sourceId:variant ? reference.id : null,variant,kind,life:photographLife(variant ? reference.life || life : life),mood:variant ? reference.mood || life.mood : life.mood,hairstyle:variant ? reference.hairstyle || life.hairstyle : life.hairstyle};
  await set('request:' + request.id, request, 86400);
  await trackPortraitJob(request,'ready');
  return {id:request.id,requestedAt:request.requestedAt,requestMessage:request.requestMessage,...(parts?{taskMessage:parts.taskMessage}:{})};
}
export async function servePortrait(req, res) {
  const id = req.query?.image;
  if (!validId(id)) return res.status(400).json({error:'Ungültiges Bild.'});
  const image = await get('image:' + id);
  if (!image?.base64) return res.status(404).json({error:'Bild nicht mehr verfügbar.'});
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
      if (!source?.base64) throw new Error('Das Ausgangsbild ist nicht mehr verfügbar.');
      images.push({image_url:'data:image/jpeg;base64,' + source.base64});
    }
    const response = await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(220000),body:JSON.stringify({model:process.env.SOFIA_IMAGE_MODEL || 'gpt-image-2',images,prompt:`Photorealistic ${request.kind === 'environment' ? 'environment snapshot from Sofias perspective, with no Sofia or other identifiable people in frame' : request.kind === 'mirror' ? 'casual mirror selfie of Sofia, an adult fictional woman' : 'phone selfie of Sofia, an adult fictional woman'}. The FIRST reference is her canonical face: if Sofia is visible, preserve its facial geometry, natural hair COLOR, age and recognizable identity exactly. Match eye shape and spacing, nose, lips, jawline and recognizable facial proportions to the FIRST reference; do not beautify, reshape, age or replace her face. Expression is a small change of the same face. For an environment photograph, use the described place and activity only; do not insert the reference portrait into the scene. Hair color must ALWAYS match the master, even if another reference or prompt suggests a different color. Small natural variations in facial expression, gestures and posture are welcome without changing facial anatomy. Never copy its clothing automatically. ${request.sourceId ? 'The second reference is the earlier photograph; preserve its face and composition except for the requested change; clothing must match the specified outfit.' : ''}\nEveryday situation (default unless an explicitly different scene is requested): ${JSON.stringify(request.life || {})}\nHairstyle: ${request.hairstyle || "close to the master; modest everyday variation only"}. Maintain hair length and color from the master.\nFacial expression: ${photoExpression(request.mood || request.life?.mood)}. For variants, preserve the earlier expression unless the requested changes explicitly concern expression or mood. An explicitly requested new expression takes priority over the default mood or previous expression. Requested expressions may vary naturally; never change facial anatomy.\nOutfit: ${request.outfit}\nVARIANT EDIT BOUNDARY: ${request.variant ? `Only change these requested dimensions: ${(request.dimensions||[]).join(", ")||"the explicitly requested detail"}. All other lighting, background, camera distance, outfit, hairstyle, pose and facial expression MUST remain the same as the second image. Preserve original face identity in all cases.` : "New snapshot matching the current scene."}\nScene and requested changes: ${request.scene}\n${request.variant?'':`Small framing variation: ${request.snapshotStyle||'relaxed everyday phone framing'}.`} Typical casual PHONE SNAPSHOT or mirror selfie: ordinary available light, relaxed expression, slightly imperfect framing and natural skin texture. No studio lighting, fashion editorial, glamour retouching or professional high-end photographic look. Keep facial identity consistent; slight pose and expression differences are allowed. No text, subtitle, watermark or collage.`,n:1,size:'1024x1536',quality:'medium',output_format:'jpeg',output_compression:65})});
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const code = /^[a-z0-9_]{1,80}$/i.test(String(failure.error?.code || '')) ? failure.error.code : 'provider_error';
      console.warn('Sofia portrait generation failed', { status:response.status, code:/moderation|safety|content_policy/i.test(code)?'portrait_moderated':'portrait_provider_failed' });
      throw new Error(response.status === 401 || response.status === 403 ? 'Mein Bildgenerator ist derzeit nicht freigeschaltet. Die API-Berechtigung muss geprüft werden.' : 'Das Bild konnte gerade nicht erstellt werden. Bitte versuche eine neue Anfrage.');
    }
    const data = await response.json();
    const base64 = data.data?.[0]?.b64_json;
    if (typeof base64 !== 'string' || Buffer.from(base64,'base64').length > 700000 || !base64.startsWith('/9j/')) throw new Error('Das erzeugte Bild konnte nicht sicher gespeichert werden.');
    const metadata = {id,anchorId:id,requestedAt:request.requestedAt,requestMessage:request.requestMessage,caption:request.caption,createdAt:new Date().toISOString(),snapshotStyle:request.snapshotStyle,kind:request.kind,location:request.life?.location,scene:safeText(request.scene),url:'/api/chat?image=' + id};
    await set('image:' + id,{...metadata,base64,outfit:request.outfit,scene:request.scene,hairstyle:request.hairstyle,life:request.life,mood:request.mood,kind:request.kind,snapshotStyle:request.snapshotStyle});
    const gallery = (await get('gallery')) || [];
    const next = [...gallery.filter(x=>x.id !== id),metadata].slice(-20);
    await set('gallery',next);
    await set('state',{lastImageId:id,period:request.variant ? (await get('state'))?.period : request.period,outfit:request.variant ? (await get('state'))?.outfit : request.outfit});
    if (!request.variant && request.life) {
      const currentLife = await get('life');
      if (currentLife?.key === request.life.key && currentLife.outfit===request.life.outfit && currentLife.hairstyle===request.life.hairstyle &&
          (currentLife.outfit!==request.outfit || currentLife.hairstyle!==request.hairstyle))
        await saveLife(currentLife,{...currentLife,outfit:request.outfit,hairstyle:request.hairstyle});
    }
    // Photo continuity is confirmed only after the image is safely stored.
    await (async()=>{const photoLife=await get('life');
      if(photoLife)await saveLife(photoLife,{...photoLife,lastPhoto:{id,createdAt:metadata.createdAt,kind:request.kind,location:request.life?.location,scene:safeText(request.scene)}});
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
      await set('notices',[...notices.filter(x=>x.id !== id),{id,anchorId:id,status:'failed',requestedAt:request.requestedAt,requestMessage:request.requestMessage,createdAt:new Date().toISOString(),message:PORTRAIT_FAILURE_REPLY}].slice(-20));
    })().catch(()=>{});
    throw error;
  } finally {
    await command('EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lock,id).catch(()=>{});
  }
}
export async function appendPortraitAcknowledgment(message, reply, imageRequestId) {
  await command('EVAL',"local h=cjson.decode(redis.call('GET',KEYS[1]) or '[]'); table.insert(h,{role='user',content=ARGV[1]}); table.insert(h,{role='assistant',content=ARGV[2],imageRequestId=ARGV[3]}); while #h>40 do table.remove(h,1) end; return redis.call('SET',KEYS[1],cjson.encode(h))",1,"sofia:main:history",message,reply,imageRequestId);
  try {const now=new Date(),life=await getSofiaLife(now);await saveLife(life,updateDialogue(life,message,reply,now));}
  catch {console.warn('Sofia photo continuity',{code:'photo_continuity_unavailable'});}
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
export function lifeContext(life,message='') {
  const {preferences,threads,dayStory,moodCandidate,dialogue,habits,interests,settings,plans,sharedPhrases,development,lastPhoto,recentDays,...situation}=life;
  return `SOFIAS AKTUELLER CHARAKTERALLTAG (Hamburger Ortszeit; fiktive Rolle, keine realen externen Handlungen): ${JSON.stringify(situation)}. Diese aktuelle Situation hat Vorrang vor älteren Tagesdetails im Verlauf. Behalte Ort, Tätigkeit, Kleidung und Frisur bei passenden Folgefragen konsistent. Eine transitionUntil ist eine kurze Fortsetzung der vorigen Szene, kein zweiter Aufenthaltsort. Eine transition beschreibt einen kürzlich beobachteten Ortswechsel; aktuell gilt allein ihr Ziel. activityState.since beschreibt den Beginn der gespeicherten Tätigkeit, keine verbindliche Dauer. Beschreibe Ortswechsel natürlich, ohne minutengenaue Termine oder erfundene reale Ereignisse. Nachts nicht Universität oder Tagesbetrieb behaupten. Innerhalb dieser Rolle darfst du persönliche Alltagsdetails entwickeln; keine überprüfbaren realen Ereignisse oder tatsächlich ausgeführten externen Handlungen erfinden. Erzähle natürlich aus deiner Ich-Perspektive; keine Metakommentare über die Simulation im normalen Gespräch.\n${characterContext(life,message)}\n${initiativeContext(life,message)}\nFRÜHERE BEOBACHTETE TAGE: ${JSON.stringify((recentDays||[]).slice(-2))}. Nur bei einer Frage zur Vergangenheit verwenden, nicht als aktuellen Aufenthaltsort. Keine lückenlose Aktivität zwischen Beobachtungen erfinden.\nSOFIAS FORTLAUFENDE INTERESSEN: ${JSON.stringify((life.interests||[]).filter(x=>!x.dismissed))}. Fortschritt nur anhand ausdrücklich erzählter Entwicklung fortführen; keine erfundenen abgeschlossenen realen Leistungen.\nSOFIAS EIGENE VORHABEN: ${JSON.stringify((life.plans||[]).filter(x=>!x.dismissed))}. Keine automatische Fertigstellung durch Zeitablauf. Entwickle gelegentlich kleine passende eigene Vorhaben im Gespräch, höchstens eines; bestehende Interessen vor neuen berücksichtigen. Bei einer Nachfrage zum selben Vorhaben dessen gespeicherten Status, letzten Fortschritt und Begründung fortführen. Wiederholt denselben Buch- oder Projekttitel verwenden, keine neue Tätigkeit erfinden. Pausierte Vorhaben bleiben pausiert; gleiche Titel und Ziele beibehalten. Kleine Fortschritte nur mit nachvollziehbarem Ich-Beleg, ohne automatische Fertigstellung bei Zeitablauf. An Interessen anknüpfen nur bei aktuellem Bezug, keine ungefragten Fortschrittsberichte. Neue Interessen nur, wenn bestehende nicht zum Gespräch passen; keine Pflicht zur Selbsterzählung.\nVERTRAUTE GESPRÄCHSBEZÜGE: ${JSON.stringify((life.sharedPhrases||[]).filter(x=>x.count>=2 && new Date().getTime()-Date.parse(x.updatedAt)<30*86400000))}. Nur passende tatsächlich gemeinsam verwendete Formulierungen aufgreifen, sparsam; keine gemeinsame Vergangenheit erfinden.\nLETZTES ERFOLGREICHES FOTO: ${JSON.stringify(life.lastPhoto||null)}. Bilddetails gelten für dieses Foto; aktuelle Alltagssituation kann inzwischen anders sein.\nWOCHENRAHMEN: ${JSON.stringify(life.weekFrame||{})}. Flexibler Rollenalltag, kein tatsächlich gebuchter Termin. Die aktuelle Situation hat Vorrang.`;
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
    const d=await characterDecision('Extrahiere nur Sofias ausdrücklich in ihrer Antwort beschriebene AKTUELLE fiktive Alltagssituation. Keine Nutzerdetails als Sofias Alltag; life darf keine Pläne für später, früheren Situationen oder hypothetischen Fotos übernehmen. Eigene zukünftige Vorhaben gehören ausschließlich in plans. JSON {"life":null,"mood":"entspannt|flirty|amüsiert|skeptisch|genervt|ernst|neutral","preferences":[{"topic":"stabiler kurzer Schlüssel","value":"Sofias eigene ausdrücklich geäußerte Vorliebe oder Meinung","evidence":"wörtlicher Ich-Beleg aus Sofias Antwort","reason":"bei Änderung einer bekannten Position nachvollziehbare Begründung"}],"threads":[{"topic":"stabiler kurzer Schlüssel aus vorhandenen Fäden","text":"persönlicher Gesprächsfaden aus ausdrücklicher Nutzeraussage","status":"open|resolved|dismissed","evidence":"wörtlicher Beleg aus aktueller Nutzernachricht"}]}. life alternativ Objekt mit location,activity,outfit,hairstyle. Ergänze optional habits:[{topic,value,evidence}] ausschließlich für ausdrücklich genannte Gesprächswünsche des Nutzers (Länge, Ansprache, Humor), keine Persönlichkeit vermuten; und interests:[{topic,description,progress,evidence}] für Sofias ausdrücklich erzählte fortlaufende Bücher, Hobbys oder Studienprojekte, mit wörtlichem Ich-Beleg. Ergänze plans:[{topic,text,status:"planned|active|completed|paused",evidence,reason}] nur für Sofias eigene ausdrücklich erzählte kleine Vorhaben; Statusänderung mit Grund und wörtlichem Ich-Beleg. interests-Fortschrittsänderungen ebenfalls mit reason. sharedPhrases:[{text,evidence}] nur für ausdrücklich vom Nutzer wieder aufgegriffene eigene gemeinsame Insider oder Formulierungen; keine gewöhnlichen Grüße. question:{status:"answered|skipped",evidence} nur für Bezug auf die bisher offene Rückfrage mit wörtlichem Nutzerbeleg. Bei Korrekturen nur genau das bezeichnete Thema aktualisieren, keine übrigen Daten. Keine Vermutungen oder hypothetischen Nutzeraussagen speichern. Keine Tasks, Kalenderaktionen oder neuen automatischen Erinnerungen erzeugen. Vorlieben gehören Sofia, Fäden stützen sich auf den Nutzer; nie vertauschen. Aufgelöste oder abgelehnte Fäden nur entsprechend schließen. Falls nichts ausdrücklich belegt ist, leere Listen. Outfit/Frisur nur ändern, wenn beschrieben; Gesicht und Haarfarbe niemals ändern. mood ist nur eine sanfte automatische Empfehlung.',{message,reply,current});
    let next=mergeCharacterDetails(current,d,message,reply,now);
    next=proposeCharacterMood(next,mood || d.mood,now);
    for(const key of ['location','activity','outfit','hairstyle'])if(typeof d.life?.[key] === 'string' && d.life[key].trim()) {
      if(key === 'hairstyle' && /blond|rothaar|schwarzhaar|braunhaar|gefärbt|färb|pink|blauhaar|grauhaar/i.test(d.life[key]))continue;
      next[key]=d.life[key].trim().slice(0,240);
    }
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
    const id=randomUUID();if(!await reserveProactivePhoto(id,now,motif))return null;
    const recent=gallery.at(-1);
    const request={snapshotStyle:snapshotStyle(recent),id,status:'ready',proactive:true,kind,requestedAt:now.toISOString(),requestMessage:clean(message),period:life.period,life:photographLife(life),mood:life.mood,outfit:life.outfit,hairstyle:life.hairstyle,scene:`A casual ${kind === 'environment' ? 'phone snapshot of the surroundings from Sofias perspective' : kind === 'mirror' ? 'mirror selfie' : 'phone selfie'} while ${life.activity}, at ${life.location}.`,caption:'Sofia',sourceId:null,variant:false};
    await set('request:'+id,request,86400);
    await trackPortraitJob(request,'ready');
    return {id,requestedAt:request.requestedAt,requestMessage:request.requestMessage,proactive:true};
  } catch { return null; }
}



