import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const env=url(await readFile(new URL('../lib/environment.js',import.meta.url),'utf8'));
const portrait=url((await readFile(new URL('../lib/character-image.js',import.meta.url),'utf8')).replace('../lib/environment.js',env));
const social=url((await readFile(new URL('../lib/social.js',import.meta.url),'utf8')).replace('./environment.js',env).replace('./character-image.js',portrait));
const photo=await import(portrait),api=await import(social);
const handler=(await import(url((await readFile(new URL('../lib/social-handler.js',import.meta.url),'utf8')).replace('./environment.js',env).replace('./social.js',social).replace('./character-image.js',portrait)))).default;
const base=new Date('2026-10-07T08:00:00Z'),image={createdAt:base.toISOString()};
for(const [hours,expected]of [[0,'chat'],[11.999,'chat'],[12,'archived'],[719.999,'archived'],[720,'expired'],[721,'expired']])test('photo retention at '+hours+' hours',()=>assert.equal(photo.photoAvailability(image,new Date(+base+hours*3600000)),expected));
test('invalid creation date cannot retain a photograph indefinitely',()=>assert.equal(photo.photoAvailability({createdAt:'bad'},base),'expired'));
test('Hamburg date, daylight saving and winter clock drive quiet hours',()=>{
 assert.deepEqual(photo.contactClock(new Date('2026-10-06T22:30Z')),{day:'2026-10-07',hour:0});
 assert.equal(photo.contactClock(new Date('2026-12-07T07:00Z')).hour,8);
 assert.equal(photo.contactClock(new Date('2026-07-07T06:00Z')).hour,8);
});
test('push endpoint validation rejects SSRF destinations and malformed keys',()=>{
 const ec=crypto.createECDH('prime256v1');ec.generateKeys();const sub={endpoint:'https://web.push.apple.com/QABC',keys:{auth:crypto.randomBytes(16).toString('base64url'),p256dh:ec.getPublicKey().toString('base64url')}};
 assert.equal(api.validSubscription(sub),true);
 for(const endpoint of ['http://web.push.apple.com/Q','https://127.0.0.1','https://web.push.apple.com.evil.test/Q','https://web.push.apple.com:8080/Q','https://x:secret@web.push.apple.com/Q'])assert.equal(api.validSubscription({...sub,endpoint}),false);
 assert.equal(api.validSubscription({...sub,keys:{auth:'bad',p256dh:'bad'}}),false);
});
const oldFetch=globalThis.fetch,oldEnv={...process.env};let db,modelCalls,changeDuringGeneration=false;
const prefix='sofia:main:portrait:';
function reset(){db=new Map();modelCalls=0;changeDuringGeneration=false;process.env.SOFIA_TEST_MODE='false';process.env.KV_REST_API_URL='https://redis.test';process.env.KV_REST_API_TOKEN='test';process.env.OPENAI_API_KEY='test';process.env.SOFIA_PASSWORD='test';delete process.env.CRON_SECRET;}
globalThis.fetch=async(u,o)=>{
 const a=JSON.parse(o.body);
 if(String(u).includes('openai.com')){modelCalls++;if(changeDuringGeneration)db.set('sofia:main:history',JSON.stringify([{role:'user',content:'A newer turn'}]));return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({text:'Ich genieße gerade meine Pause. Kaffee tut gut.',photo:false})}}]})};}
 const [op,k,v,...rest]=a;let result=null;
 if(op==='GET')result=db.get(k)||null;
 else if(op==='SET'){if(!rest.includes('NX')||!db.has(k)){db.set(k,v);result='OK';}}
 else if(op==='EVAL'){
  const target=a[3];result=1;
  if(k.includes('sofia-life-cas')){if((db.get(target)||'')===a[4])db.set(target,a[5]);else result=0;}
  if(k.includes('sofia-contact-budget')){const s=JSON.parse(db.get(target)||'{"count":0,"last":0}'),limit=Math.min(s.limit??Number(a[5]),Number(a[6])),now=Number(a[4]);if(s.count>=limit||now-s.last<7200000)result=0;else db.set(target,JSON.stringify({count:s.count+1,last:now,limit}));}
  if(k.includes('sofia-social-deliver')){const expected=a[5];if((db.get(target)||'[]')!==expected)result=0;else{const inboxKey=a[4],b=JSON.parse(db.get(inboxKey)||'{"sequence":0,"read":0,"items":[]}'),item=JSON.parse(a[6]);b.sequence++;item.sequence=b.sequence;b.items.push(item);const h=JSON.parse(expected);h.push({role:'assistant',content:item.text,contactId:item.id});db.set(target,JSON.stringify(h));db.set(inboxKey,JSON.stringify(b));result=b.sequence;}}
 }
 return {ok:true,json:async()=>({result})};
};
test.after(()=>{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);});
test('off preference and Hamburg quiet hours cause no paid model call',async()=>{
 reset();db.set(prefix+'contact-prefs',JSON.stringify({level:'off',photos:true}));assert.equal((await api.socialTick(base)).sent,false);assert.equal(modelCalls,0);
 reset();assert.equal((await api.socialTick(new Date('2026-10-07T21:30Z'))).reason,'quiet');assert.equal(modelCalls,0);
});
test('successful delivery is persisted once; repeated/concurrent tick respects spacing',async()=>{
 reset();const results=await Promise.all([api.socialTick(base),api.socialTick(base)]);assert.equal(results.filter(x=>x.sent).length,1);assert.equal(modelCalls,1);assert.equal(JSON.parse(db.get('sofia:main:history')).length,1);
 assert.match(JSON.parse(db.get(prefix+'life')).dialogue.lastAssistant,/Kaffee/);
 const state=await api.socialState();assert.equal(state.unread,1);assert.equal(state.contacts.length,1);assert.equal(state.backgroundConfigured,false);assert.equal(state.privateKey,undefined);assert.equal((await api.socialTick(new Date(+base+3600000))).sent,false);
});
test('a user turn arriving during generation is preserved and prevents stale delivery',async()=>{
 reset();changeDuringGeneration=true;const result=await api.socialTick(base);assert.equal(result.reason,'conversation_changed');assert.equal(JSON.parse(db.get('sofia:main:history'))[0].content,'A newer turn');assert.equal(db.has(prefix+'contact-inbox'),false);
});
test('unread contacts suppress further unanswered questions',async()=>{
 reset();db.set(prefix+'contact-inbox',JSON.stringify({sequence:3,read:0,items:[]}));assert.equal((await api.socialTick(base)).reason,'unread');assert.equal(modelCalls,0);
});
test('daily random budget remains fixed and never exceeds selected range',async()=>{
 reset();let successes=0;for(let i=0;i<7;i++)if(await photo.reserveDailyContact(String(i),new Date(+base+i*7200000)))successes++;
 const s=JSON.parse(db.get(prefix+'contact-day:2026-10-07'));assert.ok(successes>=3&&successes<=7);assert.equal(successes,s.limit);assert.equal(await photo.reserveDailyContact('later',new Date(+base+13*3600000)),false);
});
test('cron rejects missing secret and production endpoint rejects missing session',async()=>{
 reset();const call=async(req)=>{let status,data;await handler({...req,headers:req.headers||{}},{setHeader(){},status(n){status=n;return this;},json(d){data=d;return this;}});return {status,data};};
 assert.equal((await call({method:'GET',query:{cron:'1'}})).status,401);assert.equal((await call({method:'GET',query:{}})).status,401);
 assert.equal(modelCalls,0);
});
test('push always displays a generic notification, and notification click never opens supplied foreign URLs',async()=>{
 const handlers={},notifications=[],badges=[],opened=[];const self={navigator:{setAppBadge:n=>badges.push(n)},location:{origin:'https://sofia.test'},registration:{showNotification:(...x)=>notifications.push(x)},clients:{matchAll:async()=>[],openWindow:u=>opened.push(u)},addEventListener:(type,fn)=>handlers[type]=fn};
 vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,URL});let work;
 handlers.push({data:{json:()=>({unread:2,body:'private chat text',url:'https://evil.test'})},waitUntil:p=>work=p});await work;assert.deepEqual(badges,[2]);assert.equal(notifications.length,1);assert.doesNotMatch(JSON.stringify(notifications),/private chat text|evil/);
 handlers.notificationclick({notification:{close(){},data:{url:'https://evil.test'}},waitUntil:p=>work=p});await work;assert.deepEqual(opened,['/']);
});
