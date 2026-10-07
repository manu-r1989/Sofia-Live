import crypto from 'node:crypto';
import {testModeRequested,publicTestMode,guardTestRequest,dataPrefix} from '../lib/environment.js';
import {socialCommand,socialState,socialTick,socialSet,validSubscription} from '../lib/social.js';
import {deletePortrait,CONTACT_LEVELS} from '../lib/character-image.js';
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
  if(req.method==='GET')return res.status(200).json(await socialState());
  if(operation==='delete_image'){await deletePortrait(req.body.imageId);return res.status(200).json({ok:true});}
  if(operation==='preferences'){
   const p=req.body.preferences;if(!p||!Object.hasOwn(CONTACT_LEVELS,p.level)||typeof p.photos!=='boolean')return res.status(400).json({error:'Ungültige Einstellung.'});
   await socialSet('prefs',{level:p.level,photos:p.photos});return res.status(200).json(await socialState());
  }
  if(operation==='read'){
   const seq=req.body.sequence;if(!Number.isSafeInteger(seq)||seq<0)return res.status(400).json({error:'Ungültiger Lesestand.'});
   await socialCommand('EVAL',`local b=cjson.decode(redis.call('GET',KEYS[1]) or '{"sequence":0,"read":0,"items":[]}');b.read=math.max(b.read,math.min(b.sequence,tonumber(ARGV[1])));redis.call('SET',KEYS[1],cjson.encode(b));return b.read`,1,dataPrefix()+'portrait:contact-inbox',seq);return res.status(200).json(await socialState());
  }
  if(operation==='subscribe'||operation==='unsubscribe'){
   const sub=req.body.subscription;if(!validSubscription(sub))return res.status(400).json({error:'Ungültiges Push-Abonnement.'});
   await socialCommand('EVAL',`local s=cjson.decode(redis.call('GET',KEYS[1]) or '[]');local sub=cjson.decode(ARGV[1]);local next={};for _,x in ipairs(s) do if x.endpoint~=sub.endpoint then table.insert(next,x) end end;if ARGV[2]=='subscribe' then if #next>=10 then return 0 end;table.insert(next,sub) end;redis.call('SET',KEYS[1],cjson.encode(next));return 1`,1,dataPrefix()+'portrait:contact-subscriptions',JSON.stringify({endpoint:sub.endpoint,keys:{auth:sub.keys.auth,p256dh:sub.keys.p256dh}}),operation);
   return res.status(200).json({ok:true});
  }
  return res.status(400).json({error:'Unbekannte Aktion.'});
 }catch{console.warn('Sofia social',{code:'social_unavailable'});return res.status(503).json({error:'Galerie und Nachrichten-Einstellungen sind gerade nicht erreichbar.'});}
}
