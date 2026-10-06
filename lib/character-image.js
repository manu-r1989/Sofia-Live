import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export const PORTRAIT_FAILURE_REPLY = 'Ich bin gerade nicht in der passenden Umgebung für ein Foto. Frag mich gern gleich noch einmal.';
const PREFIX = 'sofia:main:portrait:';
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const clean = value => String(value || '').trim().slice(0, 1800);
export function portraitPeriod(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23' }).formatToParts(now).map(p => [p.type,p.value]));
  const hour = Number(parts.hour);
  return `${parts.year}-${parts.month}-${parts.day}:${hour < 6 || hour >= 23 ? 'night' : hour < 11 ? 'morning' : hour < 18 ? 'day' : 'evening'}`;
}
export function portraitCandidate(message) {
  return /selfie|spiegelselfie|outfit(?:\s+of\s+the\s+day)?|ootd|(?:bild|foto|photo).{0,35}(?:von dir|von sofia|von mir selbst)|(?:zeig|schick).{0,25}(?:dich|dein look)|(?:ander|gleich).{0,20}(?:licht|beleuchtung|pose|hintergrund)/i.test(message);
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
export async function portraitGallery() {
  const [images, notices] = await Promise.all([get('gallery'), get('notices')]);
  return [...(images || []), ...(notices || [])].sort((a,b) => String(a.requestedAt || a.createdAt).localeCompare(String(b.requestedAt || b.createdAt)));
}
export async function preparePortrait(message, referenceImageId, now = new Date()) {
  if (!portraitCandidate(message)) return null;
  const state = await get('state');
  const life = await getSofiaLife(now);
  const reference = validId(referenceImageId) ? await get('image:' + referenceImageId) : state?.lastImageId ? await get('image:' + state.lastImageId) : null;
  const period = portraitPeriod(now);
  const response = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' }, signal:AbortSignal.timeout(12000), body:JSON.stringify({ model:'gpt-4.1-mini', response_format:{type:'json_object'}, max_tokens:600, messages:[{role:'system',content:'Entscheide, ob der Nutzer JETZT ausdrücklich ein fotorealistisches Bild von Sofia als erwachsenem fiktionalem Charakter erstellen lassen möchte. Die App besitzt einen funktionierenden Bildgenerator; du prüfst Absicht, NICHT reale Kamera- oder Körperfähigkeit. „Mach bitte ein Selfie von dir“ und „Kannst du mir ein Selfie schicken?“ sind IMMER new, keine bloßen Fähigkeitsfragen. „Echt“, „realistisch“ und „glaubwürdig“ bezeichnen hier den Fotostil und verhindern niemals die Generierung. Allgemeine Fragen, Outfitberatung, Beschreibungen, Bildanalyse und zukünftige Erinnerungen sind keine Bildaufträge. JSON: {"action":"none|new|variant|mixed", "changeOutfit":false, "scene":"kurze Bildbeschreibung", "outfit":"konkrete Kleidung oder leer", "caption":"kurze deutsche Bildunterschrift"}. variant für Änderungen am vorigen Bild: bestehendes Outfit exakt behalten, außer ausdrücklich Kleidung ändern. new darf bei gleichem Zeitabschnitt vorhandenes Outfit behalten. changeOutfit nur true, wenn der Nutzer ausdrücklich andere Kleidung oder einen neuen Anlass verlangt. mixed wenn gleichzeitig Aufgaben, Erinnerungen oder Kalenderänderungen verlangt werden. Jede neue Anfrage wird unabhängig von früheren Fehlschlägen bewertet. Es werden keine Fehler- oder Moderationsinformationen als Kontext übergeben. Nutze die aktuelle life-Situation als Standard für Ort und Aktivität; abweichende Szenen nur bei ausdrücklich gewünschter Szene. Gesicht und Haarfarbe folgen immer dem Masterbild; Frisur nur dezent variieren. Typische natürliche Handyschnappschüsse statt Studioporträts. Keine Aufgaben ausführen.'},{role:'user',content:JSON.stringify({message,period,currentOutfit:state?.period === period ? state.outfit : null,life,reference:reference ? {outfit:reference.outfit,scene:reference.scene,hairstyle:reference.hairstyle} : null})}] }) });
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
  const continuingOutfit = plan.action === 'variant' ? reference.outfit : state?.period === period ? state.outfit : null;
  const outfit = (plan.changeOutfit !== true && continuingOutfit) || clean(plan.outfit) || continuingOutfit || life.outfit || 'Ein dezentes, zur Tageszeit passendes Alltagsoutfit.';
  const request = {id:randomUUID(),status:'ready',requestedAt:now.toISOString(),requestMessage:clean(message),period,scene:clean(plan.scene),outfit,caption:clean(plan.caption).slice(0,240) || 'Ein Bild von mir.',sourceId:plan.action === 'variant' ? reference.id : null,variant:plan.action === 'variant',life,hairstyle:plan.action === 'variant' ? reference.hairstyle || life.hairstyle : life.hairstyle};
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
    const response = await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(220000),body:JSON.stringify({model:process.env.SOFIA_IMAGE_MODEL || 'gpt-image-2',images,prompt:`Photorealistic photograph of Sofia, an adult fictional woman. The FIRST reference is always her canonical face: preserve its facial geometry, natural hair COLOR, age and recognizable identity exactly. Hair color must ALWAYS match the master, even if another reference or prompt suggests a different color. Small natural variations in facial expression, gestures and posture are welcome without changing facial anatomy. Never copy its clothing automatically. ${request.sourceId ? 'The second reference is the earlier photograph; preserve its face and composition except for the requested change; clothing must match the specified outfit.' : ''}\nEveryday situation (default unless an explicitly different scene is requested): ${JSON.stringify(request.life || {})}\nHairstyle: ${request.hairstyle || "close to the master; modest everyday variation only"}. Maintain hair length and color from the master.\nOutfit: ${request.outfit}\nScene and requested changes: ${request.scene}\nTypical casual PHONE SNAPSHOT or mirror selfie: ordinary available light, relaxed expression, slightly imperfect framing and natural skin texture. No studio lighting, fashion editorial, glamour retouching or professional high-end photographic look. Keep facial identity consistent; slight pose and expression differences are allowed. No text, subtitle, watermark or collage.`,n:1,size:'1024x1536',quality:'medium',output_format:'jpeg',output_compression:65})});
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
    await set('image:' + id,{...metadata,base64,outfit:request.outfit,scene:request.scene,hairstyle:request.hairstyle});
    const gallery = (await get('gallery')) || [];
    const next = [...gallery.filter(x=>x.id !== id),metadata].slice(-20);
    await set('gallery',next);
    await set('state',{lastImageId:id,period:request.variant ? (await get('state'))?.period : request.period,outfit:request.variant ? (await get('state'))?.outfit : request.outfit});
    if (!request.variant && request.life) {
      const currentLife = await get('life');
      if (currentLife?.key === request.life.key) await set('life',{...currentLife,outfit:request.outfit,hairstyle:request.hairstyle});
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
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
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
  return {key:`${p.year}-${p.month}-${p.day}:${slot}`,period:portraitPeriod(now),location,activity,outfit,hairstyle,updatedAt:now.toISOString()};
}
export function lifeTopic(message) {
  return /(?:was|wo|wie).{0,45}(?:machst|bist|sitzt|geht.{0,12}dir|dein.{0,15}(?:tag|abend))|(?:dein|du).{0,25}(?:kaffee|café|cafe|uni|freunde|unterwegs|zuhause|zu hause|outfit)|(?:trägst|unternimmst|frühstückst|schläfst).{0,20}du/i.test(message);
}
export function lifeContext(life) {
  return `SOFIAS AKTUELLER CHARAKTERALLTAG (Hamburger Ortszeit; fiktive Rolle, keine realen externen Handlungen): ${JSON.stringify(life)}. Diese aktuelle Situation hat Vorrang vor älteren Tagesdetails im Verlauf. Behalte Ort, Tätigkeit, Kleidung und Frisur bei passenden Folgefragen konsistent. Nachts nicht Universität oder Tagesbetrieb behaupten. Innerhalb dieser Rolle darfst du persönliche Alltagsdetails entwickeln; keine überprüfbaren realen Ereignisse oder tatsächlich ausgeführten externen Handlungen erfinden. Erzähle natürlich aus deiner Ich-Perspektive; keine Metakommentare über die Simulation im normalen Gespräch.`;
}
export async function getSofiaLife(now = new Date()) {
  const baseline=defaultSofiaLife(now);
  try {
    const previous=await get('life');
    if(previous?.key === baseline.key) return previous;
    const life=previous?.period === baseline.period ? {...baseline,outfit:previous.outfit,hairstyle:previous.hairstyle} : baseline;
    await set('life',life);
    return life;
  } catch { return baseline; }
}
async function characterDecision(instructions,input) {
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({model:'gpt-4.1-mini',response_format:{type:'json_object'},max_tokens:450,messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(input)}]})});
  if(!r.ok) throw new Error('Character context unavailable');
  const d=await r.json();return JSON.parse(d.choices?.[0]?.message?.content || '{}');
}
export async function learnSofiaLife(message,reply,now = new Date()) {
  const current=await getSofiaLife(now);
  if(!lifeTopic(message) && !/\bich\b.{0,50}(?:café|cafe|kaffee|universität|uni\b|sofa|bett|freunden|spazier|zu hause|zuhause|unterwegs)/i.test(reply)) return current;
  try {
    const d=await characterDecision('Extrahiere nur Sofias ausdrücklich in ihrer Antwort beschriebene AKTUELLE fiktive Alltagssituation. Keine Nutzerdetails, keine Pläne für später, keine früheren Situationen, keine hypothetischen Fotos. JSON {"life":null} oder {"life":{"location":"...","activity":"...","outfit":"...","hairstyle":"..."}}. Fehlende Felder leer; unveränderte aktuelle Felder erhalten. Outfit und Frisur nur ändern, wenn ausdrücklich beschrieben. Gesicht und Haarfarbe niemals ändern. Keine realen bestätigten Ereignisse behaupten.',{message,reply,current});
    if(!d.life || typeof d.life !== 'object')return current;
    const next={...current};for(const key of ['location','activity','outfit','hairstyle'])if(typeof d.life[key] === 'string' && d.life[key].trim()) {
      if(key === 'hairstyle' && /blond|rothaar|schwarzhaar|braunhaar|gefärbt|färb|pink|blauhaar|grauhaar/i.test(d.life[key]))continue;
      next[key]=d.life[key].trim().slice(0,240);
    }
    const fresh=defaultSofiaLife(now);
    if(fresh.key.endsWith(':sleep') && /uni(?:versität)?|vorlesung|campus|stadtbummel/i.test(next.location+' '+next.activity))return current;
    // Re-check the time key: a delayed reply must not overwrite a newer time slot.
    const stored=await get('life');if(stored?.key !== current.key)return await getSofiaLife(now);
    next.updatedAt=now.toISOString();await set('life',next);
    if(next.outfit !== current.outfit) {
      const state=await get('state');
      if(state?.period === next.period) await set('state',{...state,outfit:next.outfit});
    }
    return next;
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
    const request={id,status:'ready',proactive:true,requestedAt:now.toISOString(),requestMessage:clean(message),period:life.period,life,outfit:life.outfit,hairstyle:life.hairstyle,scene:`A casual phone selfie while ${life.activity}, at ${life.location}.`,caption:'Sofia',sourceId:null,variant:false};
    await set('request:'+id,request,86400);
    return {id,requestedAt:request.requestedAt,requestMessage:request.requestMessage,proactive:true};
  } catch { return null; }
}
