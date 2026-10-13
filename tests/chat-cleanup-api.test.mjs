import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler from '../api/chat.js';
import {messageIdentity} from '../lib/message-context.js';
const prefix='sofia:main:',portrait=prefix+'portrait:';
test('cleanup preview, confirmation, idempotency and undo preserve memory tasks and gallery fixtures',async()=>{
 const originalFetch=globalThis.fetch,env={...process.env};const at=new Date().toISOString();
 const t={role:'user',content:'Cleanup fixture',createdAt:at};const p={id:'11111111-1111-4111-8111-111111111111',createdAt:at};
 const db=new Map([[prefix+'history',JSON.stringify([t])],[prefix+'longterm','[{"memory":"Keep me"}]'],[prefix+'tasks','[{"title":"Keep task"}]'],[portrait+'life','{"outfit":"Keep outfit"}'],[portrait+'gallery',JSON.stringify([p])]]);
 Object.assign(process.env,{SOFIA_TEST_MODE:'false',SOFIA_PASSWORD:'fixture',KV_REST_API_URL:'https://cleanup.test',KV_REST_API_TOKEN:'fixture',OPENAI_API_KEY:'fixture'});
 const response=result=>({ok:true,json:async()=>({result})});const read=k=>JSON.parse(db.get(k)||'[]');
 globalThis.fetch=async(url,options)=>{
  const args=JSON.parse(options.body);
  if(String(url).endsWith('/pipeline'))return {ok:true,json:async()=>args.map(c=>{
   if(c[0]==='SET'){db.set(c[1],c[2]);return {result:'OK'};}
   assert.equal(c[0],'EVAL');assert.match(c[1],/sofia-chat-cleanup/);assert.equal(c[2],4);
   const [historyKey,hiddenKey,photosKey,jobKey,operation]=c.slice(3);const job=db.has(jobKey)?JSON.parse(db.get(jobKey)):null;if(!job)return {result:0};
   let history=read(historyKey),hidden=read(hiddenKey),photos=read(photosKey);const has=(list,t)=>list.some(x=>messageIdentity(x)===messageIdentity(t));
   if(operation==='apply'){
    if(job.status==='applied')return {result:1};if(job.status!=='ready')return {result:0};
    job.hiddenAdded=job.turns.filter(t=>!has(hidden,t));job.photoAdded=job.photoIds.filter(id=>!photos.includes(id));hidden.push(...job.hiddenAdded);photos.push(...job.photoAdded);history=history.filter(t=>!has(hidden,t));job.status='applied';
   }else{
    if(job.status==='undone')return {result:1};if(job.status!=='applied')return {result:0};hidden=hidden.filter(t=>!has(job.hiddenAdded,t));photos=photos.filter(id=>!job.photoAdded.includes(id));for(const t of job.hiddenAdded)if(!has(history,t))history.push(t);job.status='undone';
   }
   db.set(historyKey,JSON.stringify(history));db.set(hiddenKey,JSON.stringify(hidden));db.set(photosKey,JSON.stringify(photos));db.set(jobKey,JSON.stringify(job));return {result:1};
  })};
  if(args[0]==='GET')return response(db.get(args[1])||null);
  if(args[0]==='EVAL')return response(1);throw Error('Unexpected operation');
 };
 const session=crypto.createHmac('sha256','fixture').update('sofia-authorized-session-v1').digest('hex');
 async function call(body){let status,data;const res={setHeader(){},status(n){status=n;return this;},json(v){data=v;return v;}};await handler({method:'POST',headers:{cookie:'sofia_session='+session},body},res);return {status,data};}
 try{
  const preview=await call({operation:'preview_chat_cleanup',scope:'all',turns:[t]});assert.equal(preview.status,200);assert.equal(preview.data.messageCount,1);assert.equal(preview.data.photoCount,1);assert.deepEqual(read(prefix+'history'),[t]);
  const id=preview.data.id;assert.equal((await call({operation:'apply_chat_cleanup',id})).status,400);
  const applied=await call({operation:'apply_chat_cleanup',id,confirm:true});assert.equal(applied.status,200);assert.deepEqual(read(prefix+'history'),[]);assert.equal(applied.data.images[0].chatHidden,true);
  assert.equal((await call({operation:'apply_chat_cleanup',id,confirm:true})).status,200);assert.equal(read(prefix+'chat-hidden-messages').length,1);
  const later={role:'assistant',content:'New message after preview',createdAt:at};db.set(prefix+'history',JSON.stringify([later]));
  const restored=await call({operation:'undo_chat_cleanup',id});assert.equal(restored.status,200);assert.equal(read(prefix+'history').length,2);assert.notEqual(restored.data.images[0].chatHidden,true);
  assert.equal(db.get(prefix+'longterm'),'[{"memory":"Keep me"}]');assert.equal(db.get(prefix+'tasks'),'[{"title":"Keep task"}]');assert.equal(db.get(portrait+'life'),'{"outfit":"Keep outfit"}');assert.deepEqual(read(portrait+'gallery'),[p]);
  assert.equal((await call({operation:'apply_chat_cleanup',id:'22222222-2222-4222-8222-222222222222',confirm:true})).status,409);
 }finally{globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
});
