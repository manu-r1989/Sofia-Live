import {createHash,randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
const PRIVATE_PROJECT='prj_OM40eTT531hrPCMVMfvRL3rfuBU4';
export function testModeRequested(){return process.env.SOFIA_TEST_MODE==='true';}
export function publicTestMode(){
 return testModeRequested() && /^test-[a-z0-9-]{1,40}$/.test(process.env.SOFIA_DATA_NAMESPACE||'') && /^prj_[a-zA-Z0-9]+$/.test(process.env.SOFIA_TEST_PROJECT_ID||'') && process.env.VERCEL_PROJECT_ID===process.env.SOFIA_TEST_PROJECT_ID && process.env.VERCEL_PROJECT_ID!==PRIVATE_PROJECT && process.env.SOFIA_TEST_STORAGE==='isolated';
}
export function dataPrefix(){return testModeRequested()?'sofia:'+(/^test-[a-z0-9-]{1,40}$/.test(process.env.SOFIA_DATA_NAMESPACE||'')?process.env.SOFIA_DATA_NAMESPACE:'disabled-test')+':':'sofia:main:';}
async function redis(...args){const r=await fetch(process.env.KV_REST_API_URL,{method:'POST',headers:{Authorization:'Bearer '+process.env.KV_REST_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('test_store_unavailable');const d=await r.json();if(d.error)throw Error('test_store_unavailable');return d.result;}
export function sessionCookie(req){return String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sofia_session='))?.slice(14)||'';}
const sessionHash=value=>createHash('sha256').update(value).digest('hex');
const passwordVersion=()=>createHmac('sha256',process.env.SOFIA_PASSWORD||'').update('sofia-device-session-v2').digest('hex');
const legacySession=()=>createHmac('sha256',process.env.SOFIA_PASSWORD||'').update('sofia-authorized-session-v1').digest('hex');
const sessionEqual=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
export async function authorizeSession(req){
 if(testModeRequested())return publicTestMode();if(!process.env.SOFIA_PASSWORD)return false;const value=sessionCookie(req);if(!value)return false;
 try{if(/^v2\.[0-9a-f]{64}$/.test(value)){const r=JSON.parse(await redis('GET',dataPrefix()+'session:'+sessionHash(value))||'null');return !!r&&r.expiresMs>Date.now()&&sessionEqual(r.passwordVersion,passwordVersion());}
 if(!sessionEqual(value,legacySession()))return false;return await redis('GET',dataPrefix()+'legacy-sessions-disabled')!=='1';}catch{return false;}
}
export function setSessionCookie(res,value,maxAge=2592000){res.setHeader('Set-Cookie',`sofia_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);}
export const SESSION_CREATE_SCRIPT=`-- sofia-session-create
local current=cjson.decode(redis.call('GET',KEYS[1]) or '[]');local next={}
for _,s in ipairs(current) do if s.expiresMs>tonumber(ARGV[2]) and s.passwordVersion==ARGV[3] then table.insert(next,s) end end
if #next>=20 then return 0 end;table.insert(next,cjson.decode(ARGV[1]));redis.call('SET',KEYS[1],cjson.encode(next));redis.call('SET',KEYS[2],ARGV[1],'EX',2592000);return 1`;
export async function issueDeviceSession(req,res){
 if(testModeRequested())throw Error('Gerätesitzungen sind in der öffentlichen Testversion nicht aktiv.');const token='v2.'+randomBytes(32).toString('hex'),hash=sessionHash(token),now=Date.now(),agent=String(req.headers?.['user-agent']||''),label=/iPhone|iPad/i.test(agent)?'iPhone / iPad':/Android/i.test(agent)?'Android':/Macintosh/i.test(agent)?'Mac':'Webbrowser';
 const record={id:randomUUID(),hash,label,createdAt:new Date(now).toISOString(),expiresMs:now+2592000000,passwordVersion:passwordVersion()};
 if(await redis('EVAL',SESSION_CREATE_SCRIPT,2,dataPrefix()+'device-sessions',dataPrefix()+'session:'+hash,JSON.stringify(record),now,passwordVersion())!==1)throw Error('Höchstens 20 aktive Anmeldungen. Bitte zuerst eine ältere Anmeldung beenden.');setSessionCookie(res,token);return {id:record.id};
}
export async function deviceSessions(req){
 if(testModeRequested())return {testMode:true,registered:false,sessions:[],legacyEnabled:false};const list=JSON.parse(await redis('GET',dataPrefix()+'device-sessions')||'[]'),currentHash=sessionHash(sessionCookie(req));return {registered:sessionCookie(req).startsWith('v2.'),legacyEnabled:await redis('GET',dataPrefix()+'legacy-sessions-disabled')!=='1',sessions:(Array.isArray(list)?list:[]).filter(x=>x.expiresMs>Date.now()&&sessionEqual(x.passwordVersion,passwordVersion())).map(({id,label,createdAt,expiresMs,hash})=>({id,label,createdAt,expiresAt:new Date(expiresMs).toISOString(),current:hash===currentHash}))};
}
export const SESSION_REVOKE_SCRIPT=`-- sofia-session-revoke
local current=cjson.decode(redis.call('GET',KEYS[1]) or '[]');local next={};local found=false
for _,s in ipairs(current) do if s.id==ARGV[1] then redis.call('DEL',ARGV[2]..s.hash);found=true else table.insert(next,s) end end
redis.call('SET',KEYS[1],#next==0 and '[]' or cjson.encode(next));return found and 1 or 0`;
export async function handleDeviceSessions(req,res){
 res.setHeader('Cache-Control','private, no-store');if(!await authorizeSession(req))return res.status(401).json({error:'Nicht autorisiert.'});
 if(req.method==='GET')return res.status(200).json(await deviceSessions(req));if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(req.headers?.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}catch{return res.status(403).json({error:'Origin not allowed'});}}
 if(testModeRequested())return res.status(409).json({error:'Geräte-Anmeldungen werden nur in der privaten Version verwaltet.'});
 try{const op=req.body?.operation;if(op==='register'){if(sessionCookie(req).startsWith('v2.'))return res.status(200).json(await deviceSessions(req));await issueDeviceSession(req,res);return res.status(200).json({registered:true});}
 if(!sessionCookie(req).startsWith('v2.'))throw Error('Bitte zuerst dieses Gerät registrieren.');
 if(op==='revoke'&&req.body.confirm===true){const list=await deviceSessions(req),target=list.sessions.find(x=>x.id===req.body.id);if(!target)throw Error('Anmeldung nicht mehr vorhanden.');await redis('EVAL',SESSION_REVOKE_SCRIPT,1,dataPrefix()+'device-sessions',target.id,dataPrefix()+'session:');if(target.current)setSessionCookie(res,'',0);return res.status(200).json({ok:true,current:target.current});}
 if(op==='block_legacy'&&req.body.confirm===true){await redis('SET',dataPrefix()+'legacy-sessions-disabled','1');return res.status(200).json({ok:true});}
 throw Error('Aktion oder Bestätigung fehlt.');}catch(e){return res.status(409).json({error:e.message||'Anmeldung nicht geändert.'});}
}
export const TEST_BUDGET_SCRIPT=`-- sofia-test-budget
if redis.call('EXISTS',KEYS[4])==1 then return -2 end
local total=tonumber(redis.call('GET',KEYS[1]) or '0');local count=tonumber(redis.call('GET',KEYS[2]) or '0');local ip=tonumber(redis.call('GET',KEYS[3]) or '0')
if total+tonumber(ARGV[1])>100 or count>=tonumber(ARGV[2]) then return -4 end
if ip>=10 then return -3 end
redis.call('INCRBY',KEYS[1],ARGV[1]);redis.call('EXPIRE',KEYS[1],172800)
redis.call('INCR',KEYS[2]);redis.call('EXPIRE',KEYS[2],172800)
redis.call('INCR',KEYS[3]);redis.call('EXPIRE',KEYS[3],120)
redis.call('SET',KEYS[4],ARGV[3],'EX',300);return 1`;
const kinds={chat:[1,50],context:[1,50],memory:[1,50],identity:[1,50],tts:[1,20],image:[10,2],realtime:[5,2],reset:[0,4]};
export async function guardTestRequest(req,res,kind='chat'){
 if(!testModeRequested())return true;
 if(!publicTestMode()){res.status(503).json({error:'Testkonfiguration unvollständig. Testzugang bleibt gesperrt.'});return false;}
 if(req.method==='GET'){
  const minute=Math.floor(Date.now()/60000),hash=createHash('sha256').update(dataPrefix()+String(req.headers?.['x-forwarded-for']||'unknown').split(',')[0]).digest('hex').slice(0,24);
  try{const count=await redis('EVAL',"local n=redis.call('INCR',KEYS[1]);redis.call('EXPIRE',KEYS[1],120);return n",1,dataPrefix()+'_budget:read:'+minute+':'+hash);if(count>60){res.status(429).json({error:'Zu viele Testabfragen.',code:'test_rate_limit',retryAfterSeconds:60,retryAt:new Date(Date.now()+60000).toISOString()});return false;}return true;}catch{res.status(503).json({error:'Testdatenspeicher nicht erreichbar.'});return false;}
 }
 const host=String(req.headers?.host||'');
 if(req.headers?.origin){try{if(new URL(req.headers.origin).host!==host)throw Error();}catch{res.status(403).json({error:'Anfrage von fremder Website nicht erlaubt.'});return false;}}
 if(kind!=='reset' && process.env.SOFIA_TEST_ALLOW_PAID!=='true'){res.status(503).json({error:'KI-Aufrufe sind in dieser Testversion noch deaktiviert.'});return false;}
 const [units,limit]=kinds[kind]||kinds.chat,now=new Date(),day=now.toISOString().slice(0,10),minute=Math.floor(now.getTime()/60000),prefix=dataPrefix()+'_budget:';
 const ip=String(req.headers?.['x-forwarded-for']||'unknown').split(',')[0].trim();const hash=createHash('sha256').update(dataPrefix()+ip).digest('hex').slice(0,24),token=randomUUID();
 const lock=prefix+'activity';
 try{
  const result=await redis('EVAL',TEST_BUDGET_SCRIPT,4,prefix+'units:'+day,prefix+kind+':'+day,prefix+'ip:'+minute+':'+hash,lock,units,limit,token);
  if(result!==1){const seconds=result===-2?5:result===-3?60:result===-4?Math.ceil((Date.parse(day+'T00:00:00Z')+86400000-+now)/1000):null;const code=result===-2?'test_busy':result===-3?'test_rate_limit':result===-4?'test_daily_limit':'test_limit_unknown';if(seconds!==null)res.setHeader('Retry-After',String(seconds));res.status(429).json({error:result===-2?'Ein Testaufruf läuft bereits. Bitte kurz warten.':'Test-Nutzungsgrenze erreicht. Keine weitere KI-Anfrage ausgeführt.',code,...(seconds!==null?{retryAfterSeconds:seconds,retryAt:new Date(+now+seconds*1000).toISOString()}:{})});return false;}
  let released=false;const release=async()=>{if(released)return;released=true;await redis('EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lock,token).catch(()=>{});};
  // Release before sending, so reset cannot race an unfinished mutation.
  for(const method of ['json','send','end'])if(typeof res[method]==='function'){const original=res[method].bind(res);res[method]=async(...args)=>{await release();return original(...args);};}
  return true;
 }catch{res.status(503).json({error:'Test-Nutzungsgrenzen konnten nicht geprüft werden. Anfrage wurde nicht ausgeführt.'});return false;}
}
export const RESET_TEST_SCRIPT=`-- sofia-reset-test-data
if redis.call('GET',KEYS[1])~=ARGV[2] then return -1 end
local prefix=ARGV[1];local keys=redis.call('KEYS',prefix..'*');if #keys>500 then return -2 end
local deleted=0;for _,key in ipairs(keys) do if string.sub(key,1,#prefix+8)~=prefix..'_budget:' then deleted=deleted+redis.call('DEL',key) end end;return deleted`;
export async function resetTestData(){
 if(!publicTestMode())throw Error('test_disabled');
 // guardTestRequest owns the activity lock; no other mutating test request can run.
 const prefix=dataPrefix(),lock=prefix+'_budget:activity',token=await redis('GET',lock);
 if(!token)throw Error('test_busy');
 const deleted=await redis('EVAL',RESET_TEST_SCRIPT,1,lock,prefix,token);
 if(deleted<0)throw Error('test_reset_failed');return deleted;
}

export const TEST_IMAGE_SCRIPT=`-- sofia-test-image-budget
local count=tonumber(redis.call('GET',KEYS[1]) or '0');local units=tonumber(redis.call('GET',KEYS[2]) or '0')
if count>=2 or units+10>100 then return 0 end
redis.call('INCR',KEYS[1]);redis.call('EXPIRE',KEYS[1],172800);redis.call('INCRBY',KEYS[2],10);redis.call('EXPIRE',KEYS[2],172800);return 1`;
export async function reserveTestImage(){
 if(!testModeRequested())return;
 if(!publicTestMode() || process.env.SOFIA_TEST_ALLOW_PAID!=='true')throw Error('Test-Bildgenerator ist deaktiviert.');
 const prefix=dataPrefix()+'_budget:',day=new Date().toISOString().slice(0,10);
 if(await redis('EVAL',TEST_IMAGE_SCRIPT,2,prefix+'image:'+day,prefix+'units:'+day)!==1)throw Error('Test-Bildlimit erreicht.');
}


export function retryAfterSeconds(value,now=new Date()) {
 if(typeof value!=='string'||!value.trim())return null;
 const raw=value.trim(),seconds=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):(Date.parse(raw)-now.getTime())/1000;
 return Number.isFinite(seconds)&&seconds>=0&&seconds<=86400?Math.ceil(seconds):null;
}
export function providerFailure(status,data={},retryAfter=null,now=new Date()) {
 const value=data?.error?.code||data?.error?.type,known={credit_balance_exhausted:'api_credit_exhausted',organization_spend_limit_exceeded:'api_spend_limit',project_spend_limit_exceeded:'api_spend_limit',organization_usage_limit_exceeded:'api_usage_limit',insufficient_quota:'api_billing_limit',rate_limit_exceeded:'api_rate_limit',slow_down:'api_rate_limit',server_is_overloaded:'api_overloaded'};
 const code=known[value]||({context_length_exceeded:'api_context_limit',invalid_image:'api_invalid_image',invalid_image_url:'api_invalid_image',image_too_large:'api_invalid_image',model_not_found:'api_model_unavailable'}[value])||(status===400?'api_request_rejected':'chat_provider_failed'),seconds=['api_rate_limit','api_overloaded'].includes(code)?retryAfterSeconds(retryAfter,now):null;
 return {code,...(seconds!==null?{retryAfterSeconds:seconds,retryAt:new Date(+now+seconds*1000).toISOString()}:{})};
}

// Only fixed protocol metadata; never include provider messages or input data.
export function providerDiagnostic(data={}) {
 const e=data?.error||{};
 const protocolCode=typeof e.code==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(e.code)?e.code:'unknown';
 const message=typeof e.message==='string'?e.message:'';
 const reason=/safety|content.policy|moderation/i.test(message)?'safety_rejection':/context.length|context window|too many tokens|maximum context/i.test(message)?'context_limit':/model.*(?:not exist|not found|access)/i.test(message)?'model_access':/invalid.*image|image.*invalid/i.test(message)?'image_invalid':/empty|non-empty/i.test(message)?'empty_content':'unclassified';
 const types=['invalid_request_error','server_error','rate_limit_error'];
 const param=typeof e.param==='string'&&/^(?:model|instructions|input|tools|tool_choice|max_output_tokens)(?:\[\d{1,5}\]|\.(?:content|text|image_url|role|type|name|url))*$/.test(e.param)?e.param:'unknown';
 return {providerCode:protocolCode,providerType:types.includes(e.type)?e.type:'unknown',providerParam:param,providerReason:reason};
}

// JSON parsers used by providers reject isolated UTF-16 surrogate escapes.
// Normalize request strings only; persisted source data is not rewritten.
export function providerRequestJSON(value) {
 return JSON.stringify(value,(_key,item)=>typeof item==='string'?item.toWellFormed():item);
}
