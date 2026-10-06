import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
const source=await readFile(new URL('../lib/character-image.js',import.meta.url),'utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const api=await import(url(source));
const prefix='sofia:main:portrait:';
const savedFetch=globalThis.fetch;
const keys=['KV_REST_API_URL','KV_REST_API_TOKEN','OPENAI_API_KEY','SOFIA_PASSWORD'];
const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
let db,quotas,decision,narrative,inputs;
function reset(){db=new Map();quotas=new Map();decision=true;narrative=null;inputs=[];process.env.KV_REST_API_URL='https://redis.test';process.env.KV_REST_API_TOKEN='test';process.env.OPENAI_API_KEY='test';process.env.SOFIA_PASSWORD='test-only';}
const response=data=>({ok:true,json:async()=>data});
globalThis.fetch=async(endpoint,options)=>{
 const body=JSON.parse(options.body);
 if(String(endpoint).endsWith('/api/sofia-identity'))return response({ok:true});
 if(endpoint==='https://redis.test/pipeline'){for(const [op,key,value] of body){assert.equal(op,'SET');db.set(key,value);}return response(body.map(()=>({result:'OK'})));}
 if(endpoint==='https://redis.test') {
  const [op,key,value,...args]=body;
  if(op==='GET')return response({result:db.get(key)||null});
  if(op==='SET'){db.set(key,value);return response({result:'OK'});}
  if(op==='EVAL' && key.includes('sofia-proactive-photo-limit')) {
   const queueKey=body[3],now=Number(body[4]),id=body[5];
   const queue=(quotas.get(queueKey)||[]).filter(x=>x.at>now-3600000);
   if(queue.some(x=>x.id===id))return response({result:1});
   if(queue.length>=2)return response({result:0});
   queue.push({id,at:now});quotas.set(queueKey,queue);return response({result:1});
  }
  if(op==='EVAL' && key.includes('local cached'))return response({result:['acquired','']});
  if(op==='EVAL')return response({result:1});
  throw Error('Unexpected command '+op);
 }
 if(String(endpoint).endsWith('/chat/completions')){
  inputs.push(body);
  const instruction=body.messages[0].content;
  const result=instruction.startsWith('Soll Sofia')?{offerPhoto:decision}:instruction.startsWith('Extrahiere nur Sofias')?{life:narrative}:{action:'new',scene:'Ein Selfie',outfit:''};
  return response({choices:[{message:{content:JSON.stringify(result)}}]});
 }
 if(String(endpoint).endsWith('/responses')){
  const text=String(body.instructions||'').startsWith('Beantworte nur')?'NO_WEB':JSON.stringify({reply:'Ich sitze gerade im Café und trinke einen Kaffee.',mood:'entspannt',memory_action:{action:'none'}});
  return response({output:[{content:[{type:'output_text',text}]}]});
 }
 throw Error('Unexpected endpoint '+endpoint);
};
test.after(()=>{globalThis.fetch=savedFetch;for(const k of keys)if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];});
test('Hamburg clock has sleep at 02:00, weekday university, weekend city and evening home',()=>{
 const at=text=>api.defaultSofiaLife(new Date(text));
 assert.match(at('2026-10-07T00:00Z').location,/Bett/);
 assert.match(at('2026-12-07T01:00Z').location,/Bett/);
 assert.match(at('2026-10-06T08:00Z').location,/Universität/);
 assert.doesNotMatch(at('2026-10-10T08:00Z').location,/Universität/);
 assert.match(at('2026-10-06T19:00Z').location,/Hause/);
 assert.match(at('2026-10-06T21:30Z').location,/Bett/);
});
test('life persists across requests and changes slots or dates with time-appropriate behavior',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');const first=await api.getSofiaLife(now);
 db.set(prefix+'life',JSON.stringify({...first,location:'in einem Café',activity:'Kaffee trinken'}));
 assert.equal((await api.getSofiaLife(now)).location,'in einem Café');
 assert.match((await api.getSofiaLife(new Date('2026-10-06T21:30Z'))).location,/Bett/);
 assert.notEqual((await api.getSofiaLife(new Date('2026-10-07T12:15Z'))).key,first.key);
});
test('described cafe activity and outfit persist and become the next photograph context',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');await api.getSofiaLife(now);
 narrative={location:'in einem Café in Hamburg',activity:'Kaffee trinken',outfit:'ein grüner Pullover mit Jeans',hairstyle:'ein lockerer Pferdeschwanz'};
 const learned=await api.learnSofiaLife('Was machst du gerade?','Ich trinke gerade einen Kaffee im Café.',now);
 assert.equal(learned.location,narrative.location);
 const request=await api.preparePortrait('Ein Selfie bitte',null,now);
 const stored=JSON.parse(db.get(prefix+'request:'+request.id));
 assert.equal(stored.life.activity,'Kaffee trinken');assert.equal(stored.outfit,narrative.outfit);assert.equal(stored.hairstyle,narrative.hairstyle);
});
test('nighttime learning cannot replace bedtime with current university activity',async()=>{
 reset();const now=new Date('2026-10-07T00:00Z');narrative={location:'Universität',activity:'Vorlesung'};
 const life=await api.learnSofiaLife('Wo bist du gerade?','Ich bin gerade an der Universität.',now);
 assert.match(life.location,/Bett/);
});
test('rolling hourly reservation is atomic across parallel modes, idempotent, and expires at boundary',async()=>{
 reset();const now=new Date('2026-10-06T12:00Z');
 const result=await Promise.all(['text','live','another'].map(id=>api.reserveProactivePhoto(id,now)));
 assert.equal(result.filter(Boolean).length,2);
 assert.equal(await api.reserveProactivePhoto('text',now),true);
 assert.equal(await api.reserveProactivePhoto('new',new Date('2026-10-06T12:59:59Z')),false);
 assert.equal(await api.reserveProactivePhoto('new',new Date('2026-10-06T13:00:00Z')),true);
});
test('proactive pictures use current life, limit two jobs, while explicit photos do not consume quota',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');const life=await api.getSofiaLife(now);
 const jobs=await Promise.all([1,2,3].map(()=>api.prepareProactivePortrait('Was machst du gerade?',life,'Ich bin in der Stadt.',now)));
 assert.equal(jobs.filter(Boolean).length,2);
 const explicit=await api.preparePortrait('Mach bitte ein Selfie',null,now);assert.ok(explicit.id);
 assert.equal([...quotas.values()][0].length,2);
 const job=JSON.parse(db.get(prefix+'request:'+jobs.find(Boolean).id));assert.equal(job.proactive,true);assert.equal(job.life.key,life.key);
 assert.equal(await api.prepareProactivePortrait('Erinnere mich an einen Termin',life,'',now),null);
 const night=await api.getSofiaLife(new Date('2026-10-07T00:00Z'));
 assert.equal(await api.prepareProactivePortrait('Was machst du gerade?',night,'',new Date('2026-10-07T00:00Z')),null);
});
test('photo quota fails closed when Redis reservation cannot be confirmed',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');const life=await api.getSofiaLife(now);const normal=globalThis.fetch;
 globalThis.fetch=async(e,o)=>JSON.parse(o.body)[0]==='EVAL'?{ok:false,json:async()=>({})}:normal(e,o);
 try {assert.equal(await api.prepareProactivePortrait('Was machst du gerade?',life,'',now),null);}finally{globalThis.fetch=normal;}
});
test('Text and Live return an unsolicited image with announcement and common quota',async()=>{
 reset();const root=new URL('../',import.meta.url);const fixed=code=>code.replaceAll('new Date()',"new Date('2026-10-06T12:15:00Z')");
 const helper=url(fixed(source));const dates=url(await readFile(new URL('lib/task-dates.js',root),'utf8'));
 const task=url((await readFile(new URL('api/task-action.js',root),'utf8')).replace('../lib/task-dates.js',dates));
 const engine=url((await readFile(new URL('api/action-engine.js',root),'utf8')).replace('./task-action.js',task));
 const session=crypto.createHmac('sha256','test-only').update('sofia-authorized-session-v1').digest('hex');
 let index=0;
 for(const name of ['chat','live-context','chat']) {
  const handler=(await import(url(fixed(await readFile(new URL('api/'+name+'.js',root),'utf8')).replace('../lib/character-image.js',helper).replace('./action-engine.js',engine)))).default;
  let data,status;const res={setHeader(){},status(n){status=n;return this;},json(d){data=d;return d;}};
  await handler({method:'POST',headers:{cookie:'sofia_session='+session,host:'sofia.test'},body:{message:'Was machst du gerade?'}},res);
  assert.equal(status,200);assert.equal(data.taskAction?.action,'none',JSON.stringify(data.taskAction));
  if(index<2)assert.ok(data.imageRequest,JSON.stringify({name,data}));else assert.equal(data.imageRequest,undefined);
  index++;
  if(data.imageRequest)assert.match(data.reply||data.context,/Warte kurz, ich zeig’s dir/);
  if(name==='chat' && !data.imageRequest)assert.doesNotMatch(data.reply,/Warte kurz/);
 }
 assert.equal([...quotas.values()][0].length,2);
});
test('image prompts preserve face and master hair color and request ordinary snapshots without subtitles',()=>{
 assert.match(source,/hair COLOR/);assert.match(source,/Small natural variations in facial expression/);
 assert.match(source,/Typical casual PHONE SNAPSHOT/);assert.match(source,/No studio lighting/);
});
