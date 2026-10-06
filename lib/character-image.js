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
export function proposeCharacterMood(current,mood,now) {
  if(current.moodMode==='manual' || !MOODS.includes(mood))return current;
  if(mood===current.mood)return {...current,moodCandidate:null};
  const candidate=current.moodCandidate;
  if(candidate?.value===mood && now.getTime()-Date.parse(current.moodChangedAt || current.updatedAt)>=10*60000)
    return {...current,mood,moodChangedAt:now.toISOString(),moodCandidate:null};
  return {...current,moodCandidate:{value:mood,at:now.toISOString()}};
}
export function mergeCharacterDetails(current,decision,message,reply,now) {
  const next={...current,preferences:[...(current.preferences||[])],threads:activeThreads(current,now)};
  const evidenceIn=(e,text)=>safeText(e,500).length>=5 && text.toLowerCase().includes(safeText(e,500).toLowerCase());
  for(const p of Array.isArray(decision.preferences)?decision.preferences.slice(0,4):[]) {
    const topic=safeText(p.topic,80).toLowerCase(),value=safeText(p.value),evidence=safeText(p.evidence,500);
    if(!topic || !value || !evidenceIn(evidence,reply) || !/\b(?:ich|mir|mein\w*)\b/i.test(evidence))continue;
    const prefix=reply.slice(0,reply.toLowerCase().indexOf(evidence.toLowerCase()));
    if((prefix.match(/[„“"]/g)||[]).length%2 || /\b(?:vielleicht|angenommen|hypothetisch|würde|könnte)\b/i.test(evidence))continue;
    const old=next.preferences.find(x=>x.topic===topic);
    if(['corrected','dismissed'].includes(old?.origin) || old?.value===value)continue;
    if(old && !safeText(p.reason))continue;
    const item={topic,value,evidence,origin:'character',updatedAt:now.toISOString(),...(old?{previousValue:old.value,reason:safeText(p.reason)}:{})};
    next.preferences=next.preferences.filter(x=>x.topic!==topic).concat(item).slice(-20);
  }
  for(const t of Array.isArray(decision.threads)?decision.threads.slice(0,3):[]) {
    const topic=safeText(t.topic,80).toLowerCase(),text=safeText(t.text),evidence=safeText(t.evidence,500);
    if(!topic || !text || !['open','resolved','dismissed'].includes(t.status) || !evidenceIn(evidence,message) || /\b(?:vielleicht|eventuell|vermutlich|angenommen|hypothetisch|würde|könnte|falls)\b/i.test(message))continue;
    const old=next.threads.find(x=>x.topic===topic);
    if(old?.status==='dismissed' && t.status==='open' && !/\b(?:wieder|doch|erneut)\b/i.test(message))continue;
    next.threads=next.threads.filter(x=>x.topic!==topic).concat({topic,text,status:t.status,evidence,origin:'user_statement',updatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+(t.status==='open'?7:30)*86400000).toISOString()}).slice(-12);
  }
  return next;
}
export function characterContext(life,message='') {
  const words=new Set(message.toLowerCase().match(/[a-zäöüß]{4,}/g)||[]);
  const relevant=t=>(t.topic+' '+t.text).toLowerCase().split(/[^a-zäöüß]+/).some(w=>w.length>=4 && [...words].some(token=>token===w || token.startsWith(w) || w.startsWith(token)));
  const threads=activeThreads(life,new Date()).filter(t=>t.status==='open' && (lifeTopic(message) || relevant(t))).slice(-2);
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
    next.preferences=(next.preferences||[]).filter(p=>p.topic!==topic);
    next.preferences.push({topic,value,origin:value?'corrected':'dismissed',updatedAt:now.toISOString()});next.preferences=next.preferences.slice(-20);
  } else if(field==='thread') {
    const topic=safeText(input.topic,80).toLowerCase();if(!topic)throw new Error('character_invalid');
    const old=(next.threads||[]).find(t=>t.topic===topic);if(!old)throw new Error('character_invalid');
    next.threads=next.threads.map(t=>t.topic===topic?{...t,text:value||t.text,status:value?'open':'dismissed',origin:'corrected',updatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+(value?7:30)*86400000).toISOString()}:t);
  } else throw new Error('character_invalid');
  next.statusLabel=lifeStatusLabel(next.location);next.updatedAt=now.toISOString();next.dayStory=advanceStory(previous,next,now);
  const saved=await saveLife(previous,next);if(!saved)throw new Error('character_conflict');return saved;
}
export async function portraitGallery() {
  const [images, notices] = await Promise.all([get('gallery'), get('notices')]);
  return [...(images || []), ...(notices || [])].sort((a,b) => String(a.requestedAt || a.createdAt).localeCompare(String(b.requestedAt || b.createdAt)));
}
export async function preparePortrait(message, referenceImageId, now = new Date(), mood) {
  if (!portraitCandidate(message)) return null;
  const state = await get('state');
  const life = await getSofiaLife(now, mood);
  const reference = validId(referenceImageId) ? await get('image:' + referenceImageId) : state?.lastImageId ? await get('image:' + state.lastImageId) : null;
  const period = portraitPeriod(now);
  const response = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' }, signal:AbortSignal.timeout(12000), body:JSON.stringify({ model:'gpt-4.1-mini', response_format:{type:'json_object'}, max_tokens:600, messages:[{role:'system',content:'Entscheide, ob der Nutzer JETZT ausdrücklich ein fotorealistisches Bild von Sofia als erwachsenem fiktionalem Charakter erstellen lassen möchte. Die App besitzt einen funktionierenden Bildgenerator; du prüfst Absicht, NICHT reale Kamera- oder Körperfähigkeit. „Mach bitte ein Selfie von dir“ und „Kannst du mir ein Selfie schicken?“ sind IMMER new, keine bloßen Fähigkeitsfragen. „Echt“, „realistisch“ und „glaubwürdig“ bezeichnen hier den Fotostil und verhindern niemals die Generierung. Allgemeine Fragen, Outfitberatung, Beschreibungen, Bildanalyse und zukünftige Erinnerungen sind keine Bildaufträge. JSON: {"action":"none|new|variant|mixed", "changeOutfit":false, "kind":"selfie|mirror|environment", "scene":"kurze Bildbeschreibung", "outfit":"konkrete Kleidung oder leer", "caption":"kurze deutsche Bildunterschrift"}. variant für Änderungen am vorigen Bild: bestehendes Outfit exakt behalten, außer ausdrücklich Kleidung ändern. new darf bei gleichem Zeitabschnitt vorhandenes Outfit behalten. changeOutfit nur true, wenn der Nutzer ausdrücklich andere Kleidung oder einen neuen Anlass verlangt. mixed wenn gleichzeitig Aufgaben, Erinnerungen oder Kalenderänderungen verlangt werden. Jede neue Anfrage wird unabhängig von früheren Fehlschlägen bewertet. Es werden keine Fehler- oder Moderationsinformationen als Kontext übergeben. Nutze die aktuelle life-Situation als Standard für Ort und Aktivität; abweichende Szenen nur bei ausdrücklich gewünschter Szene. Gesicht und Haarfarbe folgen immer dem Masterbild; Frisur nur dezent variieren. Typische natürliche Handyschnappschüsse statt Studioporträts. kind environment bei ausdrücklich gewünschter Umgebung/Aussicht ohne Sofia im Bild; mirror bei Spiegelselfie, sonst selfie. Varianten behalten die bisherige Bildart und Szene, außer ausdrücklich geändert. Gesichtsausdruck darf der aktuellen Stimmung folgen. Keine Aufgaben ausführen.'},{role:'user',content:JSON.stringify({message,period,currentOutfit:life.outfit,life:photographLife(life),reference:reference ? {outfit:reference.outfit,scene:reference.scene,hairstyle:reference.hairstyle,kind:reference.kind} : null})}] }) });
  if (!response.ok) throw new Error('Ich konnte die Bildanfrage gerade nicht vorbereiten.');
  const data = await response.json();
  const plan = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  if (plan.action === 'none' && explicitPortraitRequest(message)) {
    const variant = reference && /\b(?:dasselbe|das gleiche|dieses)\b|ander\w*.{0,12}(?:licht|beleuchtung)/i.test(message);
    Object.assign(plan, { action:variant ? 'variant' : 'new', scene:clean(message), outfit:'', changeOutfit:false, caption:'Ein Bild von mir.' });
    console.info('Sofia portrait routing', { action:plan.action, reason:'explicit_request_fallback' });
  } else {
    console.info('Sofia portrait routing', { action:['none','new','variant','mixed'].includes(plan.action) ? plan.action : 'invalid' });
  }
  if (plan.action === 'mixed') throw new Error('Bitte frage das Bild und die Aufgabenaktion getrennt an, damit ich beides zuverlässig ausführen kann.');
  if (!['new','variant'].includes(plan.action)) return null;
  if (plan.action === 'variant' && !reference) throw new Error('Für diese Variante brauche ich zuerst ein Bild von mir.');
  const continuingOutfit = plan.action === 'variant' ? reference.outfit : life.outfit;
  const outfit = (plan.changeOutfit !== true && continuingOutfit) || clean(plan.outfit) || continuingOutfit || life.outfit || 'Ein dezentes, zur Tageszeit passendes Alltagsoutfit.';
  const variant=plan.action === 'variant';
  const kind=variant ? reference.kind || 'selfie' : ['selfie','mirror','environment'].includes(plan.kind) ? plan.kind : /spiegelselfie/i.test(message) ? 'mirror' : 'selfie';
  const request = {id:randomUUID(),status:'ready',requestedAt:now.toISOString(),requestMessage:clean(message),period,scene:clean(plan.scene),outfit,caption:clean(plan.caption).slice(0,240) || 'Ein Bild von mir.',sourceId:variant ? reference.id : null,variant,kind,life:photographLife(variant ? reference.life || life : life),mood:variant ? reference.mood || life.mood : life.mood,hairstyle:variant ? reference.hairstyle || life.hairstyle : life.hairstyle};
  await set('request:' + request.id, request, 86400);
  return {id:request.id,requestedAt:request.requestedAt,requestMessage:request.requestMessage};
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
    const master = await readFile(join(process.cwd(),'sofia-avatar.PNG'));
    const images = [{image_url:'data:image/png;base64,' + master.toString('base64')}];
    if (request.sourceId) {
      const source = await get('image:' + request.sourceId);
      if (!source?.base64) throw new Error('Das Ausgangsbild ist nicht mehr verfügbar.');
      images.push({image_url:'data:image/jpeg;base64,' + source.base64});
    }
    const response = await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(220000),body:JSON.stringify({model:process.env.SOFIA_IMAGE_MODEL || 'gpt-image-2',images,prompt:`Photorealistic ${request.kind === 'environment' ? 'environment snapshot from Sofias perspective, with no Sofia or other identifiable people in frame' : request.kind === 'mirror' ? 'casual mirror selfie of Sofia, an adult fictional woman' : 'phone selfie of Sofia, an adult fictional woman'}. The FIRST reference is her canonical face: if Sofia is visible, preserve its facial geometry, natural hair COLOR, age and recognizable identity exactly. For an environment photograph, use the described place and activity only; do not insert the reference portrait into the scene. Hair color must ALWAYS match the master, even if another reference or prompt suggests a different color. Small natural variations in facial expression, gestures and posture are welcome without changing facial anatomy. Never copy its clothing automatically. ${request.sourceId ? 'The second reference is the earlier photograph; preserve its face and composition except for the requested change; clothing must match the specified outfit.' : ''}\nEveryday situation (default unless an explicitly different scene is requested): ${JSON.stringify(request.life || {})}\nHairstyle: ${request.hairstyle || "close to the master; modest everyday variation only"}. Maintain hair length and color from the master.\nFacial expression: ${photoExpression(request.mood || request.life?.mood)}. For variants, preserve the earlier expression unless the requested changes explicitly concern expression or mood. An explicitly requested new expression takes priority over the default mood or previous expression. Requested expressions may vary naturally; never change facial anatomy.\nOutfit: ${request.outfit}\nScene and requested changes: ${request.scene}\nTypical casual PHONE SNAPSHOT or mirror selfie: ordinary available light, relaxed expression, slightly imperfect framing and natural skin texture. No studio lighting, fashion editorial, glamour retouching or professional high-end photographic look. Keep facial identity consistent; slight pose and expression differences are allowed. No text, subtitle, watermark or collage.`,n:1,size:'1024x1536',quality:'medium',output_format:'jpeg',output_compression:65})});
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const code = /^[a-z0-9_]{1,80}$/i.test(String(failure.error?.code || '')) ? failure.error.code : 'provider_error';
      console.warn('Sofia portrait generation failed', { status:response.status, code });
      throw new Error(response.status === 401 || response.status === 403 ? 'Mein Bildgenerator ist derzeit nicht freigeschaltet. Die API-Berechtigung muss geprüft werden.' : 'Das Bild konnte gerade nicht erstellt werden. Bitte versuche eine neue Anfrage.');
    }
    const data = await response.json();
    const base64 = data.data?.[0]?.b64_json;
    if (typeof base64 !== 'string' || Buffer.from(base64,'base64').length > 700000 || !base64.startsWith('/9j/')) throw new Error('Das erzeugte Bild konnte nicht sicher gespeichert werden.');
    const metadata = {id,anchorId:id,requestedAt:request.requestedAt,requestMessage:request.requestMessage,caption:request.caption,createdAt:new Date().toISOString(),url:'/api/chat?image=' + id};
    await set('image:' + id,{...metadata,base64,outfit:request.outfit,scene:request.scene,hairstyle:request.hairstyle,life:request.life,mood:request.mood,kind:request.kind});
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
    await set('request:' + id,{...request,status:'done',image:metadata},86400);
    for (const old of gallery.filter(x=>!next.some(y=>y.id===x.id))) await command('DEL',PREFIX + 'image:' + old.id);
    return metadata;
  } catch (error) {
    await set('request:' + id,{...request,status:'failed'},86400).catch(()=>{});
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
  await command('EVAL',"local h=cjson.decode(redis.call('GET',KEYS[1]) or '[]'); table.insert(h,{role='user',content=ARGV[1]}); table.insert(h,{role='assistant',content=ARGV[2],imageRequestId=ARGV[3]}); while #h>40 do table.remove(h,1) end; return redis.call('SET',KEYS[1],cjson.encode(h))",1,'sofia:main:history',message,reply,imageRequestId);
}

// Fictional character life, kept separately from user memories and failed image jobs.
export function defaultSofiaLife(now = new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const hour=Number(p.hour), weekend=['Sat','Sun'].includes(p.weekday);
  let slot,location,activity,outfit,hairstyle='Haare offen, natürlich wie auf dem Masterporträt';
  if(hour < 6 || hour >= 23){slot='sleep';location='zu Hause im Bett';activity='zur Ruhe kommen oder schlafen; für eine Nachricht kurz wach';outfit='ein schlichtes bequemes Schlafshirt';}
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
  if(slot==='evening') {
    if(['Tue','Thu'].includes(p.weekday)){location='beim Sport';activity='ein entspanntes Training machen';}
    else {location=['an der Alster','an den Landungsbrücken','mit Freunden auf dem Kiez'][choice];activity='spazieren oder mit Freunden Zeit verbringen';}
  }
  const startHour={sleep:hour<6?0:23,breakfast:6,morning:9,lunch:12,afternoon:14,evening:17,home:20}[slot];
  const slotStartedAt=new Date(now.getTime()-((hour-startHour)*3600+Number(p.minute)*60+Number(p.second))*1000-now.getUTCMilliseconds()).toISOString();
  return {key:`${p.year}-${p.month}-${p.day}:${slot}`,period:portraitPeriod(now),location,statusLabel:lifeStatusLabel(location),activity,outfit,hairstyle,mood:'entspannt',slotStartedAt,updatedAt:now.toISOString()};
}
export function lifeTopic(message) {
  return /(?:was|wo|wie).{0,45}(?:machst|bist|sitzt|geht.{0,12}dir|dein.{0,15}(?:tag|abend))|(?:dein|du).{0,25}(?:kaffee|café|cafe|uni|freunde|unterwegs|zuhause|zu hause|outfit)|(?:trägst|unternimmst|frühstückst|schläfst).{0,20}du/i.test(message);
}
export function lifeContext(life,message='') {
  const {preferences,threads,dayStory,moodCandidate,...situation}=life;
  return `SOFIAS AKTUELLER CHARAKTERALLTAG (Hamburger Ortszeit; fiktive Rolle, keine realen externen Handlungen): ${JSON.stringify(situation)}. Diese aktuelle Situation hat Vorrang vor älteren Tagesdetails im Verlauf. Behalte Ort, Tätigkeit, Kleidung und Frisur bei passenden Folgefragen konsistent. Eine transitionUntil ist eine kurze Fortsetzung der vorigen Szene, kein zweiter Aufenthaltsort. Beschreibe Ortswechsel natürlich, ohne minutengenaue Termine oder erfundene reale Ereignisse. Nachts nicht Universität oder Tagesbetrieb behaupten. Innerhalb dieser Rolle darfst du persönliche Alltagsdetails entwickeln; keine überprüfbaren realen Ereignisse oder tatsächlich ausgeführten externen Handlungen erfinden. Erzähle natürlich aus deiner Ich-Perspektive; keine Metakommentare über die Simulation im normalen Gespräch.\n${characterContext(life,message)}`;
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
    life.preferences=Array.isArray(previous?.preferences)?previous.preferences:[];
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
  const candidate=lifeTopic(message) || /\bich\b.{0,50}(?:café|cafe|kaffee|universität|uni\b|sofa|bett|freunden|spazier|zu hause|zuhause|unterwegs|mag|liebe|bevorzuge|finde)|\bmir gefällt|\b(?:mein|meine)\b.{0,40}(?:arbeit|tag|problem|projekt|prüfung)|\b(?:erledigt|vergiss|abgeschlossen|traurig|gestresst|lustig)\b/i.test(message+' '+reply);
  if(!candidate) {
    const proposed=proposeCharacterMood(current,mood,now);
    if(JSON.stringify(proposed)===JSON.stringify(current))return current;
    return await saveLife(current,proposed) || await getSofiaLife(now);
  }
  try {
    const d=await characterDecision('Extrahiere nur Sofias ausdrücklich in ihrer Antwort beschriebene AKTUELLE fiktive Alltagssituation. Keine Nutzerdetails als Sofias Alltag, keine Pläne für später, keine früheren Situationen, keine hypothetischen Fotos. JSON {"life":null,"mood":"entspannt|flirty|amüsiert|skeptisch|genervt|ernst|neutral","preferences":[{"topic":"stabiler kurzer Schlüssel","value":"Sofias eigene ausdrücklich geäußerte Vorliebe oder Meinung","evidence":"wörtlicher Ich-Beleg aus Sofias Antwort","reason":"bei Änderung einer bekannten Position nachvollziehbare Begründung"}],"threads":[{"topic":"stabiler kurzer Schlüssel aus vorhandenen Fäden","text":"persönlicher Gesprächsfaden aus ausdrücklicher Nutzeraussage","status":"open|resolved|dismissed","evidence":"wörtlicher Beleg aus aktueller Nutzernachricht"}]}. life alternativ Objekt mit location,activity,outfit,hairstyle. Keine Vermutungen oder hypothetischen Nutzeraussagen speichern. Keine Tasks, Kalenderaktionen oder neuen automatischen Erinnerungen erzeugen. Vorlieben gehören Sofia, Fäden stützen sich auf den Nutzer; nie vertauschen. Aufgelöste oder abgelehnte Fäden nur entsprechend schließen. Falls nichts ausdrücklich belegt ist, leere Listen. Outfit/Frisur nur ändern, wenn beschrieben; Gesicht und Haarfarbe niemals ändern. mood ist nur eine sanfte automatische Empfehlung.',{message,reply,current});
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
    next.dayStory=advanceStory(current,next,completedAt);
    return await saveLife(current,next) || await getSofiaLife(completedAt);
  } catch { return current; }
}
export const PROACTIVE_PHOTO_ANNOUNCEMENT = 'Warte kurz, ich zeig’s dir.';
export const PROACTIVE_PHOTO_LIMIT_SCRIPT = `-- sofia-proactive-photo-limit
local now=tonumber(ARGV[1]); redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-3600000)
if redis.call('ZSCORE',KEYS[1],ARGV[2]) then return 1 end
if redis.call('ZCARD',KEYS[1])>=2 then return 0 end
redis.call('ZADD',KEYS[1],now,ARGV[2]); redis.call('EXPIRE',KEYS[1],7200); return 1`;
export async function reserveProactivePhoto(id,now = new Date()) {
  return await command('EVAL',PROACTIVE_PHOTO_LIMIT_SCRIPT,1,PREFIX+'proactive-hour',String(now.getTime()),id) === 1;
}
export async function prepareProactivePortrait(message,life,reply = '',now = new Date()) {
  if(!lifeTopic(message) || explicitPortraitRequest(message))return null;
  // Sleeping is the normal night context; unsolicited bedtime pictures are unnecessary.
  if(life.key?.endsWith(':sleep'))return null;
  try {
    const decision=await characterDecision('Soll Sofia aus dieser Alltagssituation gelegentlich von sich aus ein Foto schicken? Standard false. Nur bei persönlichem, freundlichem Gespräch und echtem situativem Mehrwert eines natürlichen Schnappschusses. Keine Fotos bei Sachaufgaben, Erinnerungen, ernsten/sensiblen Themen, Distanzsignalen, technischen Fragen, bloßen Begrüßungen oder Ablehnung. Keine erotischen/intimen Vorschläge. Die Frage nach ihrem Aufenthaltsort oder ihrer Tätigkeit kann passen, muss aber nicht jedes Mal ein Foto auslösen. JSON {"offerPhoto":false|true}. Nicht nach Bestätigung fragen.',{message,reply,life});
    if(decision.offerPhoto !== true)return null;
    const id=randomUUID();if(!await reserveProactivePhoto(id,now))return null;
    const kind=/umgebung|aussicht|landungsbrücken|alster|blick/i.test(message) ? 'environment' : /outfit|kleidung/i.test(message) && /Hause/.test(life.location) ? 'mirror' : 'selfie';
    const request={id,status:'ready',proactive:true,kind,requestedAt:now.toISOString(),requestMessage:clean(message),period:life.period,life:photographLife(life),mood:life.mood,outfit:life.outfit,hairstyle:life.hairstyle,scene:`A casual ${kind === 'environment' ? 'phone snapshot of the surroundings from Sofias perspective' : kind === 'mirror' ? 'mirror selfie' : 'phone selfie'} while ${life.activity}, at ${life.location}.`,caption:'Sofia',sourceId:null,variant:false};
    await set('request:'+id,request,86400);
    return {id,requestedAt:request.requestedAt,requestMessage:request.requestMessage,proactive:true};
  } catch { return null; }
}
