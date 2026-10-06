import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const PREFIX = 'sofia:main:portrait:';
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const clean = value => String(value || '').trim().slice(0, 1800);
export function portraitPeriod(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23' }).formatToParts(now).map(p => [p.type,p.value]));
  const hour = Number(parts.hour);
  return `${parts.year}-${parts.month}-${parts.day}:${hour < 6 ? 'night' : hour < 11 ? 'morning' : hour < 18 ? 'day' : 'evening'}`;
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
export async function portraitGallery() { return (await get('gallery')) || []; }
export async function preparePortrait(message, referenceImageId, now = new Date()) {
  if (!portraitCandidate(message)) return null;
  const state = await get('state');
  const reference = validId(referenceImageId) ? await get('image:' + referenceImageId) : state?.lastImageId ? await get('image:' + state.lastImageId) : null;
  const period = portraitPeriod(now);
  const response = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' }, signal:AbortSignal.timeout(12000), body:JSON.stringify({ model:'gpt-4.1-mini', response_format:{type:'json_object'}, max_tokens:600, messages:[{role:'system',content:'Entscheide, ob der Nutzer JETZT ausdrücklich ein fotorealistisches Bild von Sofia als erwachsenem fiktionalem Charakter erstellen lassen möchte. Die App besitzt einen funktionierenden Bildgenerator; du prüfst Absicht, NICHT reale Kamera- oder Körperfähigkeit. „Mach bitte ein Selfie von dir“ und „Kannst du mir ein Selfie schicken?“ sind IMMER new, keine bloßen Fähigkeitsfragen. „Echt“, „realistisch“ und „glaubwürdig“ bezeichnen hier den Fotostil und verhindern niemals die Generierung. Allgemeine Fragen, Outfitberatung, Beschreibungen, Bildanalyse und zukünftige Erinnerungen sind keine Bildaufträge. JSON: {"action":"none|new|variant|mixed", "changeOutfit":false, "scene":"kurze Bildbeschreibung", "outfit":"konkrete Kleidung oder leer", "caption":"kurze deutsche Bildunterschrift"}. variant für Änderungen am vorigen Bild: bestehendes Outfit exakt behalten, außer ausdrücklich Kleidung ändern. new darf bei gleichem Zeitabschnitt vorhandenes Outfit behalten. changeOutfit nur true, wenn der Nutzer ausdrücklich andere Kleidung oder einen neuen Anlass verlangt. mixed wenn gleichzeitig Aufgaben, Erinnerungen oder Kalenderänderungen verlangt werden. Keine Aufgaben ausführen.'},{role:'user',content:JSON.stringify({message,period,currentOutfit:state?.period === period ? state.outfit : null,reference:reference ? {outfit:reference.outfit,scene:reference.scene} : null})}] }) });
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
  const outfit = (plan.changeOutfit !== true && continuingOutfit) || clean(plan.outfit) || continuingOutfit || 'Ein dezentes, zur Tageszeit passendes Alltagsoutfit.';
  const request = {id:randomUUID(),status:'ready',period,scene:clean(plan.scene),outfit,caption:clean(plan.caption).slice(0,240) || 'Ein Bild von mir.',sourceId:plan.action === 'variant' ? reference.id : null,variant:plan.action === 'variant'};
  await set('request:' + request.id, request, 86400);
  return {id:request.id};
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
    const response = await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(220000),body:JSON.stringify({model:process.env.SOFIA_IMAGE_MODEL || 'gpt-image-2',images,prompt:`Photorealistic photograph of Sofia, an adult fictional woman. The FIRST reference is always her canonical face: preserve its facial geometry, hair and recognizable identity. Never copy its clothing automatically. ${request.sourceId ? 'The second reference is the earlier photograph; preserve its face and composition except for the requested change; clothing must match the specified outfit.' : ''}\nOutfit: ${request.outfit}\nScene and requested changes: ${request.scene}\nNatural candid selfie or mirror selfie when requested. No text, watermark or collage.`,n:1,size:'1024x1536',quality:'medium',output_format:'jpeg',output_compression:65})});
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const code = /^[a-z0-9_]{1,80}$/i.test(String(failure.error?.code || '')) ? failure.error.code : 'provider_error';
      console.warn('Sofia portrait generation failed', { status:response.status, code });
      throw new Error(response.status === 401 || response.status === 403 ? 'Mein Bildgenerator ist derzeit nicht freigeschaltet. Die API-Berechtigung muss geprüft werden.' : 'Das Bild konnte gerade nicht erstellt werden. Bitte versuche eine neue Anfrage.');
    }
    const data = await response.json();
    const base64 = data.data?.[0]?.b64_json;
    if (typeof base64 !== 'string' || Buffer.from(base64,'base64').length > 700000 || !base64.startsWith('/9j/')) throw new Error('Das erzeugte Bild konnte nicht sicher gespeichert werden.');
    const metadata = {id,caption:request.caption,createdAt:new Date().toISOString(),url:'/api/chat?image=' + id};
    await set('image:' + id,{...metadata,base64,outfit:request.outfit,scene:request.scene});
    const gallery = await portraitGallery();
    const next = [...gallery.filter(x=>x.id !== id),metadata].slice(-20);
    await set('gallery',next);
    await set('state',{lastImageId:id,period:request.variant ? (await get('state'))?.period : request.period,outfit:request.variant ? (await get('state'))?.outfit : request.outfit});
    await set('request:' + id,{...request,status:'done',image:metadata},86400);
    for (const old of gallery.filter(x=>!next.some(y=>y.id===x.id))) await command('DEL',PREFIX + 'image:' + old.id);
    return metadata;
  } catch (error) {
    await set('request:' + id,{...request,status:'failed'},86400).catch(()=>{});
    throw error;
  } finally {
    await command('EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lock,id).catch(()=>{});
  }
}
export async function appendPortraitAcknowledgment(message, reply) {
  await command('EVAL',"local h=cjson.decode(redis.call('GET',KEYS[1]) or '[]'); table.insert(h,{role='user',content=ARGV[1]}); table.insert(h,{role='assistant',content=ARGV[2]}); while #h>40 do table.remove(h,1) end; return redis.call('SET',KEYS[1],cjson.encode(h))",1,'sofia:main:history',message,reply);
}
