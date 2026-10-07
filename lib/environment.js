import {createHash,randomUUID} from 'node:crypto';
const PRIVATE_PROJECT='prj_OM40eTT531hrPCMVMfvRL3rfuBU4';
export function testModeRequested(){return process.env.SOFIA_TEST_MODE==='true';}
export function publicTestMode(){
 return testModeRequested() && /^test-[a-z0-9-]{1,40}$/.test(process.env.SOFIA_DATA_NAMESPACE||'') && /^prj_[a-zA-Z0-9]+$/.test(process.env.SOFIA_TEST_PROJECT_ID||'') && process.env.VERCEL_PROJECT_ID===process.env.SOFIA_TEST_PROJECT_ID && process.env.VERCEL_PROJECT_ID!==PRIVATE_PROJECT && process.env.SOFIA_TEST_STORAGE==='isolated';
}
export function dataPrefix(){return testModeRequested()?'sofia:'+(/^test-[a-z0-9-]{1,40}$/.test(process.env.SOFIA_DATA_NAMESPACE||'')?process.env.SOFIA_DATA_NAMESPACE:'disabled-test')+':':'sofia:main:';}
async function redis(...args){const r=await fetch(process.env.KV_REST_API_URL,{method:'POST',headers:{Authorization:'Bearer '+process.env.KV_REST_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('test_store_unavailable');const d=await r.json();if(d.error)throw Error('test_store_unavailable');return d.result;}
export const TEST_BUDGET_SCRIPT=`-- sofia-test-budget
if redis.call('EXISTS',KEYS[4])==1 then return -2 end
local total=tonumber(redis.call('GET',KEYS[1]) or '0');local count=tonumber(redis.call('GET',KEYS[2]) or '0');local ip=tonumber(redis.call('GET',KEYS[3]) or '0')
if total+tonumber(ARGV[1])>100 or count>=tonumber(ARGV[2]) or ip>=10 then return 0 end
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
  try{const count=await redis('EVAL',"local n=redis.call('INCR',KEYS[1]);redis.call('EXPIRE',KEYS[1],120);return n",1,dataPrefix()+'_budget:read:'+minute+':'+hash);if(count>60){res.status(429).json({error:'Zu viele Testabfragen.'});return false;}return true;}catch{res.status(503).json({error:'Testdatenspeicher nicht erreichbar.'});return false;}
 }
 const host=String(req.headers?.host||'');
 if(req.headers?.origin){try{if(new URL(req.headers.origin).host!==host)throw Error();}catch{res.status(403).json({error:'Anfrage von fremder Website nicht erlaubt.'});return false;}}
 if(kind!=='reset' && process.env.SOFIA_TEST_ALLOW_PAID!=='true'){res.status(503).json({error:'KI-Aufrufe sind in dieser Testversion noch deaktiviert.'});return false;}
 const [units,limit]=kinds[kind]||kinds.chat,now=new Date(),day=now.toISOString().slice(0,10),minute=Math.floor(now.getTime()/60000),prefix=dataPrefix()+'_budget:';
 const ip=String(req.headers?.['x-forwarded-for']||'unknown').split(',')[0].trim();const hash=createHash('sha256').update(dataPrefix()+ip).digest('hex').slice(0,24),token=randomUUID();
 const lock=prefix+'activity';
 try{
  const result=await redis('EVAL',TEST_BUDGET_SCRIPT,4,prefix+'units:'+day,prefix+kind+':'+day,prefix+'ip:'+minute+':'+hash,lock,units,limit,token);
  if(result!==1){res.setHeader('Retry-After',result===-2?'5':'60');res.status(429).json({error:result===-2?'Ein Testaufruf läuft bereits. Bitte kurz warten.':'Test-Nutzungsgrenze erreicht. Keine weitere KI-Anfrage ausgeführt.'});return false;}
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
