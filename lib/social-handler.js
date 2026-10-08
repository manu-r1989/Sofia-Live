import crypto from 'node:crypto';
import {testModeRequested,publicTestMode,guardTestRequest,dataPrefix} from './environment.js';
import {socialCommand,socialState,socialTick,socialSet,validSubscription,deviceId,socialContact} from './social.js';
import {deletePortrait,CONTACT_LEVELS,portraitGallery,contactClock,validQuietTime,contactPolicy} from './character-image.js';
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function authorized(req){
 if(testModeRequested())return publicTestMode();
 if(!process.env.SOFIA_PASSWORD)return false;
 const value=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sofia_session='))?.slice(14);
 const expected=crypto.createHmac('sha256',process.env.SOFIA_PASSWORD).update('sofia-authorized-session-v1').digest('hex');return equal(value,expected);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 const cron=req.method==='GET'&&req.query?.cron==='1';
 if(cron){if(!process.env.CRON_SECRET||!equal(req.headers?.authorization,'Bearer '+process.env.CRON_SECRET))return res.status(401).json({error:'Unauthorized'});}
 else {
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(req.method==='POST'&&req.headers?.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}catch{return res.status(403).json({error:'Origin not allowed'});}}
 }
 try{
  const operation=cron?'tick':req.body?.operation;
  if(operation==='tick'){
   const result=await socialTick(new Date(),()=>guardTestRequest({...req,method:'POST'},res,'chat'));
   if(result===null)return;return res.status(200).json(result);
  }
  if(!await guardTestRequest({...req,method:'GET'},res))return;
  if(req.method==='GET'){
   if(req.query?.contact){const contact=await socialContact(req.query.contact);return res.status(contact?200:404).json(contact?{contact}:{error:'Die Nachricht ist nicht mehr verfügbar.'});}
   return res.status(200).json(await socialState());
  }
  if(operation==='delete_image'){await deletePortrait(req.body.imageId);return res.status(200).json({ok:true});}
  if(operation==='today'){
   if(!['normal','less','more'].includes(req.body.mode))return res.status(400).json({error:'Ungültige Tagesauswahl.'});
   await socialSet('today',{day:contactClock().day,mode:req.body.mode});return res.status(200).json(await socialState());
  }
  if(operation==='favorite'){
   const id=req.body.imageId;if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||typeof req.body.favorite!=='boolean')return res.status(400).json({error:'Ungültiges Bild.'});
   const images=await portraitGallery();if(!images.some(x=>x.id===id&&x.status==='done'))return res.status(410).json({error:'Dieses Bild ist nicht mehr verfügbar.'});
   await socialCommand('EVAL',`-- sofia-photo-favorite
local list=cjson.decode(redis.call('GET',KEYS[1]) or '[]');for _,x in ipairs(list) do if x.id==ARGV[1] then x.favorite=ARGV[2]=='1' end end;redis.call('SET',KEYS[1],#list==0 and '[]' or cjson.encode(list));return 1`,1,dataPrefix()+'portrait:gallery',id,req.body.favorite?'1':'0');return res.status(200).json({ok:true});
  }
  if(operation==='remove_device'){
   if(typeof req.body.deviceId!=='string'||!/^[0-9a-f]{24}$/.test(req.body.deviceId))return res.status(400).json({error:'Ungültiges Gerät.'});
   const state=await socialState();if(!state.devices.some(x=>x.id===req.body.deviceId))return res.status(404).json({error:'Gerät nicht gefunden.'});
   const raw=await socialCommand('GET',dataPrefix()+'portrait:contact-subscriptions');const endpoint=(JSON.parse(raw||'[]')).find(x=>deviceId(x.endpoint)===req.body.deviceId)?.endpoint;
   await socialCommand('EVAL',`local s=cjson.decode(redis.call('GET',KEYS[1]) or '[]');local next={};for _,x in ipairs(s) do if x.endpoint~=ARGV[1] then table.insert(next,x) end end;redis.call('SET',KEYS[1],#next==0 and '[]' or cjson.encode(next));return 1`,1,dataPrefix()+'portrait:contact-subscriptions',endpoint||'');return res.status(200).json(await socialState());
  }
  if(operation==='preferences'){
   const p=req.body.preferences;if(!p||!Object.hasOwn(CONTACT_LEVELS,p.level)||typeof p.photos!=='boolean')return res.status(400).json({error:'Ungültige Einstellung.'});
   if((p.quietStart!==undefined&&!validQuietTime(p.quietStart))||(p.quietEnd!==undefined&&!validQuietTime(p.quietEnd))||(p.quietStart!==undefined&&p.quietStart===p.quietEnd))return res.status(400).json({error:'Bitte zwei unterschiedliche gültige Uhrzeiten wählen.'});
   const current=(await socialState()).preferences;
   await socialSet('prefs',{level:p.level,photos:p.photos,...contactPolicy({...current,quietStart:p.quietStart??current.quietStart,quietEnd:p.quietEnd??current.quietEnd})});return res.status(200).json(await socialState());
  }
  if(operation==='pause'){
   if(!['hour','today','resume'].includes(req.body.duration))return res.status(400).json({error:'Ungültige Pause.'});
   const now=new Date(),preferences=(await socialState()).preferences;
   // A pause is temporary and leaves the selected contact level untouched.
   const until=req.body.duration==='resume'?null:new Date(+now+(req.body.duration==='hour'?3600000:24*3600000)).toISOString();
   await socialSet('prefs',{level:preferences.level,photos:preferences.photos,...contactPolicy(preferences),pausedUntil:until});return res.status(200).json(await socialState());
  }
  if(operation==='read'){
   const seq=req.body.sequence;if(!Number.isSafeInteger(seq)||seq<0)return res.status(400).json({error:'Ungültiger Lesestand.'});
   await socialCommand('EVAL',`local b=cjson.decode(redis.call('GET',KEYS[1]) or '{"sequence":0,"read":0,"items":[]}');b.read=math.max(b.read,math.min(b.sequence,tonumber(ARGV[1])));local encoded=cjson.encode(b);encoded=string.gsub(encoded,'"items":{}','"items":[]');redis.call('SET',KEYS[1],encoded);return b.read`,1,dataPrefix()+'portrait:contact-inbox',seq);return res.status(200).json(await socialState());
  }
  if(operation==='subscribe'||operation==='unsubscribe'){
   const sub=req.body.subscription;if(!validSubscription(sub))return res.status(400).json({error:'Ungültiges Push-Abonnement.'});
   const stored=await socialCommand('EVAL',`local s=cjson.decode(redis.call('GET',KEYS[1]) or '[]');local sub=cjson.decode(ARGV[1]);local next={};for _,x in ipairs(s) do if x.endpoint~=sub.endpoint then table.insert(next,x) end end;if ARGV[2]=='subscribe' then if #next>=10 then return 0 end;table.insert(next,sub) end;redis.call('SET',KEYS[1],#next==0 and '[]' or cjson.encode(next));return 1`,1,dataPrefix()+'portrait:contact-subscriptions',JSON.stringify({label:['iPhone / iPad','Mac','Android','Web-App'].includes(req.body.label)?req.body.label:'Web-App',status:'registered',createdAt:new Date().toISOString(),endpoint:sub.endpoint,keys:{auth:sub.keys.auth,p256dh:sub.keys.p256dh}}),operation);
   if(!stored)return res.status(409).json({error:'Maximal zehn Geräte. Entferne zuerst ein altes Gerät.'});
   return res.status(200).json({ok:true});
  }
  return res.status(400).json({error:'Unbekannte Aktion.'});
 }catch{console.warn('Sofia social',{code:'social_unavailable'});return res.status(503).json({error:'Galerie und Nachrichten-Einstellungen sind gerade nicht erreichbar.'});}
}


