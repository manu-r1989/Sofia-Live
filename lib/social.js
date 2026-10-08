import crypto from 'node:crypto';
import {dataPrefix} from './environment.js';
import {rankConversationThreads,chooseEverydayPhotoKind,projectState,projectContext,recordOwnContact,portraitGallery,getSofiaLife,defaultSofiaLife,lifeContext,prepareScheduledPortrait,publishScheduledPortrait,generatePortrait,reserveDailyContact,contactPreferences,contactClock,contactPauseReason} from './character-image.js';

export async function socialCommand(...args){
 const r=await fetch(process.env.KV_REST_API_URL,{method:'POST',headers:{Authorization:'Bearer '+process.env.KV_REST_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('social_store_unavailable');const d=await r.json();if(d.error)throw Error('social_store_unavailable');return d.result;
}
const key=s=>dataPrefix()+'portrait:contact-'+s;
export async function socialGet(s,fallback){const r=await socialCommand('GET',key(s));if(!r)return fallback;const value=JSON.parse(r);if(Array.isArray(fallback)&&!Array.isArray(value))return fallback;if(value&&'items' in value&&!Array.isArray(value.items))value.items=[];return value;}
export async function socialSet(s,value){return socialCommand('SET',key(s),JSON.stringify(value));}
export async function pushKeys(){
 let keys=await socialGet('vapid',null);if(keys)return keys;
 const ec=crypto.createECDH('prime256v1');ec.generateKeys();keys={publicKey:ec.getPublicKey().toString('base64url'),privateKey:ec.getPrivateKey().toString('base64url')};
 await socialCommand('SET',key('vapid'),JSON.stringify(keys),'NX');return socialGet('vapid',null);
}
export function validSubscription(s){
 try{const u=new URL(s.endpoint);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(/(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)push\.services\.mozilla\.com$/.test(u.hostname))&&typeof s.keys?.auth==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(s.keys.auth)&&/^[A-Za-z0-9_-]{80,100}$/.test(s.keys.p256dh);}catch{return false;}
}
export const SOCIAL_DELIVER_SCRIPT=`-- sofia-social-deliver
if (redis.call('GET',KEYS[1]) or '[]')~=ARGV[1] then return 0 end
local box=cjson.decode(redis.call('GET',KEYS[2]) or '{"sequence":0,"read":0,"items":[]}');box.sequence=box.sequence+1
local item=cjson.decode(ARGV[2]);item.sequence=box.sequence;table.insert(box.items,item)
while #box.items>100 do table.remove(box.items,1) end
local h=cjson.decode(ARGV[1]);table.insert(h,{role='assistant',content=item.text,imageRequestId=item.imageId,contactId=item.id,createdAt=item.createdAt})
while #h>40 do table.remove(h,1) end
redis.call('SET',KEYS[1],cjson.encode(h));redis.call('SET',KEYS[2],cjson.encode(box));return box.sequence`;
export function deviceId(endpoint){return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0,24);}
export function publicDevices(subscriptions){return subscriptions.map(s=>({id:deviceId(s.endpoint),label:String(s.label||'Web-App').slice(0,40),status:s.status||'registered',createdAt:s.createdAt||null,lastDeliveryAt:s.lastDeliveryAt||null}));}
export function contactThreads(life,box,now=new Date()) {
 const closed=new Set((life.dialogue?.closedTopics||[]).map(x=>typeof x==='string'?x:x?.topic)),recent=new Set((box.items||[]).filter(x=>Date.parse(x.createdAt)>+now-86400000).map(x=>x.threadTopic));
 return rankConversationThreads((life.threads||[]).filter(t=>t.status==='open'&&Date.parse(t.expiresAt)>+now&&!closed.has(t.topic)&&!recent.has(t.topic)&&(!t.lastAskedAt||+now-Date.parse(t.lastAskedAt)>=86400000)),'',now).slice(0,2).map(({topic,text})=>({topic,text}));
}
export function photoInvitation(kind,recent=[],pick=crypto.randomInt,life={}){
 const context=life.location+' '+life.activity;
 const scene=/sport|training/i.test(context)?'Ein kleiner Gruß vom Sport.':/café|cafe|kaffee/i.test(context)?'Schau mal, wo ich gerade meinen Kaffee genieße.':/sofa|zu hause/i.test(context)?'Ein kleiner Gruß von meinem gemütlichen Abend.':null;
 const choices=['environment','detail'].includes(kind)?['Schau mal, was mir gerade aufgefallen ist.','Rate mal, wo ich gerade bin.','Das wollte ich dir gerade zeigen.']:['Schau mal, was ich gerade mache.','Ein kleiner Gruß von mir.',scene||'So sieht meine kleine Pause gerade aus.'];
 const fresh=choices.filter(t=>!recent.includes(t));return (fresh.length?fresh:choices)[pick((fresh.length?fresh:choices).length)];
}
export function contactStatus(prefs,life,box,budget={},now=new Date()) {
 const pause=contactPauseReason(prefs,now);
 const reason=prefs.level==='off'?'off':pause||contactReadiness(life,box,now)||contactOpportunity(life,now)||
  (Number.isFinite(budget.limit)&&budget.count>=budget.limit?'daily_budget':Number(budget.nextAt)>+now?'spacing':'ready');
 const labels={off:'Eigeninitiative ist ausgeschaltet.',paused:'Eigeninitiative ist vorübergehend pausiert.',quiet:'Gerade ist Ruhezeit in Hamburg.',unread:'Sofia wartet, bis du ihre neuen Nachrichten gelesen hast.',unanswered_pause:'Sofia lässt dir Zeit zum Antworten.',conversation_pause:'Sofia lässt das Gespräch gerade ruhen.',active_conversation:'Ihr seid gerade im Gespräch.',distance:'Sofia lässt dir gerade etwas Raum.',occupied:'Sofia ist gerade beschäftigt.',transition:'Sofia ist gerade unterwegs zu ihrer nächsten Station.',daily_budget:'Für heute sind keine weiteren Kontakte geplant.',spacing:'Sofia lässt etwas Abstand zum letzten Kontakt.',ready:'Sofia kann sich bei einer passenden Gelegenheit melden.'};
 return {reason,text:labels[reason]||labels.ready};
}
export async function socialState(now=new Date()){
 const [prefs,box,keys,subscriptions,lifeRaw,budgetRaw]=await Promise.all([contactPreferences(now),socialGet('inbox',{sequence:0,read:0,items:[]}),pushKeys(),socialGet('subscriptions',[]),socialCommand('GET',dataPrefix()+'portrait:life'),socialCommand('GET',dataPrefix()+'portrait:contact-day:'+contactClock(now).day)]);
 const saved=lifeRaw?JSON.parse(lifeRaw):null,baseline=defaultSofiaLife(now);
 const life=saved?.key===baseline.key&&Date.parse(saved.situation?.validUntil)>+now?saved:{...baseline,dialogue:saved?.dialogue};
 const budget=budgetRaw?JSON.parse(budgetRaw):{};
 return {devices:publicDevices(subscriptions),contacts:box.items.map(x=>({id:x.id,sequence:x.sequence,text:String(x.text||'').slice(0,180),createdAt:x.createdAt||null,...(x.imageId?{imageId:x.imageId}:{})})),contactStatus:contactStatus(prefs,life,box,budget,now),read:box.read,preferences:prefs,unread:Math.max(0,box.sequence-box.read),sequence:box.sequence,publicKey:keys.publicKey,backgroundConfigured:!!process.env.CRON_SECRET};
}
export async function socialContact(id){
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return null;
 const box=await socialGet('inbox',{sequence:0,read:0,items:[]}),item=box.items.find(x=>x.id===id);
 return item?{id:item.id,text:String(item.text||'').slice(0,700),sequence:item.sequence,createdAt:item.createdAt,...(item.imageId?{imageId:item.imageId}:{})}:null;
}
export async function sendPush(unread,contactId){
 if(unread<=0)return;
 const subscriptions=await socialGet('subscriptions',[]);if(!subscriptions.length)return;
 const [{default:webpush},keys]=await Promise.all([import('web-push'),pushKeys()]);
 webpush.setVapidDetails('https://sofia-live-xi.vercel.app',keys.publicKey,keys.privateKey);
 const dead=[];
 for(const s of subscriptions.filter(s=>s.status!=='expired')){try{await webpush.sendNotification(s,JSON.stringify({title:'Sofia',body:'Du hast eine neue Nachricht von Sofia.',unread,...(/^[0-9a-f-]{36}$/i.test(contactId||'')?{contactId}:{})}),{TTL:7200,timeout:10000,topic:'sofia-chat'});await updateDevice(s.endpoint,'delivered');}catch(e){if(e.statusCode===404||e.statusCode===410)dead.push(s.endpoint);else{await updateDevice(s.endpoint,'delivery_failed');console.warn('Sofia push',{code:'push_delivery_failed'});}}}
 for(const endpoint of dead)await updateDevice(endpoint,'expired');
}
async function updateDevice(endpoint,status){
 await socialCommand('EVAL',`-- sofia-device-status
local s=cjson.decode(redis.call('GET',KEYS[1]) or '[]');for _,x in ipairs(s) do if x.endpoint==ARGV[1] then x.status=ARGV[2];if ARGV[2]=='delivered' then x.lastDeliveryAt=ARGV[3] end end end;redis.call('SET',KEYS[1],#s==0 and '[]' or cjson.encode(s));return 1`,1,key('subscriptions'),endpoint,status,new Date().toISOString());
}
export function contactReadiness(life,box,now=new Date()) {
 const unread=Math.max(0,box.sequence-box.read),last=box.items?.at(-1);
 const age=+now-Date.parse(life.dialogue?.at);
 if(unread>=2)return 'unread';
 if(unread && +now-Date.parse(last?.createdAt)<4*3600000)return 'unanswered_pause';
 if(Date.parse(life.dialogue?.contactPauseUntil)>+now)return 'conversation_pause';
 if(Number.isFinite(age)&&age>=0&&age<600000)return 'active_conversation';
 if((!Number.isFinite(age)||age<8*3600000)&&/hör auf|keine nachrichten|lass mich|gute nacht|traurig|gestorben|angst|unfall/i.test(life.dialogue?.lastUser||''))return 'distance';
 return null;
}
export function contactOpportunity(life,now=new Date()) {
 const text=String(life.location||'')+' '+String(life.activity||'');
 if(/auf dem weg|pendeln|training|beim sport/i.test(text))return 'occupied';
 if(/lernen|studienprojekt|vorlesung|universität/i.test(text)&&!/pause|kaffee|nach dem lernen/i.test(text))return 'occupied';
 if(life.transition&&+now-Date.parse(life.transition.at)>=0&&+now-Date.parse(life.transition.at)<10*60000)return 'transition';
 return null;
}
export function contactKind(life,box,threads,prefs,pick=crypto.randomInt) {
 const unanswered=box.sequence>box.read;
 const choices=['observation','opinion',...(!unanswered&&life.sharedProjects?.items?.some(p=>p.status==='active')?['project']:[]),...(threads.length&&!unanswered?['thread']:[]),...(prefs.photos&&!unanswered&&life.settings?.photos!==false&&!life.key?.endsWith(':sleep')?['photo']:[])];
 const recent=new Set(box.items.slice(-2).map(x=>x.contactKind));
 const fresh=choices.filter(x=>!recent.has(x));const pool=fresh.length?fresh:choices;return pool[pick(pool.length)];
}
export function repeatedContact(text,items=[]) {
 const normalize=x=>String(x||'').toLowerCase().normalize('NFKC').replace(/[^a-zäöüß0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 const value=normalize(text),words=value.split(' ');return items.slice(-4).some(x=>{const old=normalize(x.text);return old===value||(words.length>=10&&old.split(' ').length>=10&&words.slice(0,8).join(' ')===old.split(' ').slice(0,8).join(' '));});
}
export async function socialTick(now=new Date(),beforeWork=async()=>true){
 const startedAt=Date.now();
 await portraitGallery(now);
 const clock=contactClock(now),prefs=await contactPreferences(now);
 const pause=contactPauseReason(prefs,now);if(prefs.level==='off'||pause)return {sent:false,reason:pause||'quiet'};
 const historyKey=dataPrefix()+'history',snapshot=await socialCommand('GET',historyKey)||'[]';
 const life=await getSofiaLife(now),box=await socialGet('inbox',{sequence:0,read:0,items:[]});
 const readiness=contactReadiness(life,box,now);if(readiness)return {sent:false,reason:readiness};
 const opportunity=contactOpportunity(life,now);if(opportunity)return {sent:false,reason:opportunity};
 const id=crypto.randomUUID();if(!await reserveDailyContact(id,now))return {sent:false,reason:'budget_or_spacing'};
 if(!await beforeWork())return null;
 const unanswered=box.sequence>box.read;
 let threads=unanswered?[]:contactThreads(life,box,now);
 const sharedProjects=await projectState();life.sharedProjects=sharedProjects;
 threads=threads.filter(t=>!sharedProjects.items.some(p=>p.status!=='active'&&(t.topic+' '+t.text).toLowerCase().includes(p.title.toLowerCase())));
 const kind=contactKind(life,box,threads,prefs);
 const history=JSON.parse(snapshot).slice(-6).map(({role,content})=>({role,content}));
 const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({model:'gpt-4.1-mini',max_tokens:220,response_format:{type:'json_object'},messages:[{role:'system',content:lifeContext(life,'')+'\n'+projectContext(sharedProjects)+'\nNACHRICHTEN NACH PAUSEN: an tatsächliche passende Bezüge anknüpfen, keine verlorene Zeit kommentieren oder Schuldgefühl auslösen. Tagesabschnitte und eigene nächste Schritte nur bei aktuellem Anlass erwähnen. Nicht denselben Einstieg wie die letzten Kontakte verwenden. ART DIESES KONTAKTS: '+kind+'. observation: konkrete kleine Beobachtung; opinion: eigener begründeter Gedanke; thread: genau ein zulässiger offener Bezug; project: ein aktives gemeinsames Vorhaben, keine Fortschritte oder Aufgaben erfinden, keine Statusabfrage nach unbeantwortetem Kontakt; photo: situativ sinnvolles Foto möglich. Keine Pflichtfrage. Unbeantworteter Kontakt: '+String(unanswered)+'.\nSchreibe eine kurze eigenständige deutsche Nachricht in Sofias Rolle, höchstens zwei Sätze. Aus aktuellem Alltag oder tatsächlich vorhandenem Gesprächsthema, abwechslungsreich und mit eigener Meinung. Höchstens eine natürliche Einladung zum Antworten, keine Pflichtfrage. Keine Antwort vom Nutzer erfinden, kein wiederholtes Nachhaken zu unbeantworteten Nachrichten, keine realen externen Handlungen behaupten. Keine Aufgaben oder Erinnerungen ausführen. JSON {text:string,photo:boolean,threadTopic:string|null}. Vorhandene offene gemeinsame Themen nur aus dieser Liste aufgreifen: '+JSON.stringify(threads)+'. threadTopic muss dann exakt der zugehörige Schlüssel sein, sonst null. Erledigte, abgelehnte und nicht gelistete frühere Themen nicht erneut aufrollen. Keine Nachfrage zu einem unbeantworteten Kontakt. Variiere Einstieg, eigene Meinung und Alltag; keine wiederkehrenden Standardfragen. photo sparsam, nur ein natürliches Alltagsfoto, nie intime Situationen; ohne Foto keine Bildankündigung. Letzte eigenen Kontakte: '+JSON.stringify(box.items.slice(-4).map(x=>x.text))},...history]})});
 if(!r.ok)throw Error('social_provider_failed');const d=await r.json();let result;try{result=JSON.parse(d.choices?.[0]?.message?.content||'{}');}catch{throw Error('social_response_invalid');}
 let text=String(result.text||'').trim().slice(0,700);if(!text)return {sent:false,reason:'empty'};
 if(repeatedContact(text,box.items))return {sent:false,reason:'repeated'};
 if(unanswered&&text.includes('?'))return {sent:false,reason:'unanswered_question'};
 const threadTopic=typeof result.threadTopic==='string'?result.threadTopic:null;
 if(threadTopic&&!threads.some(t=>t.topic===threadTopic))return {sent:false,reason:'closed_topic'};
 let image=null,photoKind=null;
 if(kind==='photo'&&!unanswered&&result.photo===true&&prefs.photos&&life.settings?.photos!==false){
  try{const lastKind=box.items.filter(x=>x.photoKind).at(-1)?.photoKind;photoKind=chooseEverydayPhotoKind(life,lastKind,undefined,undefined,box.items.filter(x=>x.photoKind));const request=await prepareScheduledPortrait(life,now,photoKind);if(request)image=await generatePortrait(request.id);}catch{console.warn('Sofia contact photo',{code:'contact_photo_failed'});}
 }
 if(image)text=photoInvitation(photoKind,box.items.slice(-4).map(x=>x.text),crypto.randomInt,life);
 else if(/foto|selfie|bild|zeig.s dir|rate mal, wo/i.test(text))text=`Ich bin gerade ${life.location}. ${life.activity.charAt(0).toUpperCase()+life.activity.slice(1)} – tut gerade gut.`;
 if(repeatedContact(text,box.items))return {sent:false,reason:'repeated'};
 const deliveryTime=new Date(+now+Math.max(0,Date.now()-startedAt));
 const latestPrefs=await contactPreferences(deliveryTime),latestPause=contactPauseReason(latestPrefs,deliveryTime);
 if(latestPrefs.level==='off'||latestPause)return {sent:false,reason:latestPause||'quiet'};
 if(image&&latestPrefs.photos===false)return {sent:false,reason:'photos_disabled'};
 const deliveryLife=await getSofiaLife(deliveryTime);
 if(kind==='project'&&(await projectState()).revision!==sharedProjects.revision)return {sent:false,reason:'project_changed'};
 if(deliveryLife.key!==life.key||['location','activity','outfit','hairstyle','mood'].some(field=>deliveryLife[field]!==life[field]))return {sent:false,reason:'scene_changed'};
 const item={id,text,contactKind:image?'photo':kind,...(threadTopic?{threadTopic}:{}),...(image?{photoKind}:{}),createdAt:deliveryTime.toISOString(),...(image?{imageId:image.id}:{})};
 const sequence=await socialCommand('EVAL',SOCIAL_DELIVER_SCRIPT,2,historyKey,key('inbox'),snapshot,JSON.stringify(item));
 if(!sequence)return {sent:false,reason:'conversation_changed'};
 if(image)await publishScheduledPortrait(image.id);
 await recordOwnContact(deliveryLife,text,id,deliveryTime,threadTopic).catch(()=>console.warn('Sofia contact continuity',{code:'contact_continuity_unavailable'}));
 const latestBox=await socialGet('inbox',{sequence,read:box.read,items:[]});
 await sendPush(Math.max(0,latestBox.sequence-latestBox.read),id).catch(()=>console.warn('Sofia push',{code:'push_unavailable'}));
 return {sent:true};
}

