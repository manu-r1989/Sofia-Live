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
  if(k.includes('b.read=math.max')){const b=JSON.parse(db.get(target)||'{"sequence":0,"read":0,"items":[]}');b.read=Math.max(b.read,Math.min(b.sequence,Number(a[4])));db.set(target,JSON.stringify(b));result=b.read;}
  if(k.includes('sofia-photo-favorite')){const list=JSON.parse(db.get(target)||'[]');for(const x of list)if(x.id===a[4])x.favorite=a[5]==='1';db.set(target,JSON.stringify(list));}
  if(k.includes('sofia-contact-budget')){const s=JSON.parse(db.get(target)||'{"count":0,"last":0}'),baseLimit=s.baseLimit??s.limit??Number(a[5]),base=Math.min(baseLimit,Number(a[6])),limit=a[8]==='more'?Math.min(9,base+2):a[8]==='less'?Math.max(0,base-2):base,now=Number(a[4]);if(s.count>=limit||now-s.last<7200000||now<(s.nextAt||0))result=0;else db.set(target,JSON.stringify({count:s.count+1,last:now,nextAt:now+Number(a[9]),limit,baseLimit}));}
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
 const s=JSON.parse(db.get(prefix+'contact-day:2026-10-07'));assert.ok(successes>=3&&successes<=7);assert.ok(successes<=s.limit);assert.equal(successes,s.count);assert.equal(await photo.reserveDailyContact('tooSoon',new Date(s.last+7199999)),false);
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

test('legacy Redis empty tables do not break gallery or inbox reads',async()=>{
 reset();for(const key of ['gallery','jobs','notices'])db.set(prefix+key,'{}');assert.deepEqual(await photo.portraitGallery(base),[]);db.set(prefix+'contact-inbox',JSON.stringify({sequence:0,read:0,items:{}}));assert.equal((await api.socialState()).contacts.length,0);
});

test('temporary preference expires at Hamburg midnight, never changes permanent level',async()=>{
 reset();db.set(prefix+'contact-prefs',JSON.stringify({level:'natural',photos:true}));db.set(prefix+'contact-today',JSON.stringify({day:'2026-10-07',mode:'less'}));
 assert.equal((await photo.contactPreferences(base)).today,'less');assert.equal((await photo.contactPreferences(new Date('2026-10-07T22:00Z'))).today,'normal');assert.equal((await photo.contactPreferences(base)).level,'natural');
});
test('temporary more raises fixed budget at most two, less never resets used slots',async()=>{
 reset();db.set(prefix+'contact-day:2026-10-07',JSON.stringify({count:4,last:+base-7200000,limit:4}));db.set(prefix+'contact-today',JSON.stringify({day:'2026-10-07',mode:'more'}));assert.equal(await photo.reserveDailyContact('extra',base),true);assert.equal(JSON.parse(db.get(prefix+'contact-day:2026-10-07')).limit,6);
 db.set(prefix+'contact-today',JSON.stringify({day:'2026-10-07',mode:'less'}));assert.equal(await photo.reserveDailyContact('less',new Date(+base+7200000)),false);assert.equal(JSON.parse(db.get(prefix+'contact-day:2026-10-07')).count,5);
});
test('device overview does not disclose subscriptions or authentication keys',()=>{
 const devices=api.publicDevices([{endpoint:'https://web.push.apple.com/private',keys:{auth:'private-auth'},label:'Mac',status:'expired'}]);assert.equal(devices[0].status,'expired');assert.match(devices[0].id,/^[a-f0-9]{24}$/);assert.doesNotMatch(JSON.stringify(devices),/apple.com|private|auth|endpoint/);
});
test('proactive threads exclude closed, dismissed, expired, recently asked and unanswered contacts',()=>{
 const thread=(topic,extra={})=>({topic,text:topic,status:'open',expiresAt:new Date(+base+86400000).toISOString(),...extra});const life={dialogue:{closedTopics:['closed']},threads:[thread('closed'),thread('dismissed',{status:'dismissed'}),thread('expired',{expiresAt:new Date(+base-1).toISOString()}),thread('recent',{lastAskedAt:base.toISOString()}),thread('unanswered'),thread('eligible')]};
 assert.deepEqual(api.contactThreads(life,{items:[{threadTopic:'unanswered',createdAt:base.toISOString()}]},base),[{topic:'eligible',text:'eligible'}]);
});
test('photo invitations avoid recent repeats and use environment wording',()=>{
 const first=api.photoInvitation('environment',[],()=>0),second=api.photoInvitation('environment',[first],()=>0);assert.notEqual(first,second);assert.doesNotMatch(first,/Selfie|von mir/);
});
test('notification click refreshes already open client without opening a duplicate',async()=>{
 const handlers={},messages=[],opened=[];const self={location:{origin:'https://sofia.test'},clients:{matchAll:async()=>[{url:'https://sofia.test/',focus:async()=>{},postMessage:x=>messages.push(x)}],openWindow:u=>opened.push(u)},addEventListener:(n,f)=>handlers[n]=f};vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,URL});let work;handlers.notificationclick({notification:{close(){}},waitUntil:p=>work=p});await work;assert.equal(messages[0].type,'sofia-chat-open');assert.equal(opened.length,0);
});

async function settingsCall(body){let status,data;await handler({method:'POST',query:{},body,headers:{host:'sofia.test',origin:'https://sofia.test',cookie:'sofia_session='+crypto.createHmac('sha256','test').update('sofia-authorized-session-v1').digest('hex')}},{setHeader(){},status(n){status=n;return this;},json(d){data=d;return this;}});return {status,data};}
test('two devices share a monotonic bounded read cursor, stale device cannot unread a contact',async()=>{
 reset();db.set(prefix+'contact-inbox',JSON.stringify({sequence:4,read:0,items:[]}));assert.equal((await settingsCall({operation:'read',sequence:3})).data.read,3);assert.equal((await settingsCall({operation:'read',sequence:1})).data.read,3);assert.equal((await settingsCall({operation:'read',sequence:999})).data.read,4);assert.equal((await api.socialState()).unread,0);
});
test('favorite changes preserve original creation and expiry; expired picture returns 410',async()=>{
 reset();const id='11111111-1111-4111-8111-111111111111',createdAt=new Date().toISOString(),expiresMs=Date.now()+30*86400000;db.set(prefix+'gallery',JSON.stringify([{id,createdAt,expiresMs}]));assert.equal((await settingsCall({operation:'favorite',imageId:id,favorite:true})).status,200);const saved=JSON.parse(db.get(prefix+'gallery'))[0];assert.equal(saved.favorite,true);assert.equal(saved.createdAt,createdAt);assert.equal(saved.expiresMs,expiresMs);
 db.set(prefix+'gallery',JSON.stringify([{...saved,createdAt:'2020-01-01T00:00Z'}]));assert.equal((await settingsCall({operation:'favorite',imageId:id,favorite:true})).status,410);
});
test('temporary feedback is isolated from permanent preferences and rejects unknown values',async()=>{
 reset();db.set(prefix+'contact-prefs',JSON.stringify({level:'natural',photos:true}));assert.equal((await settingsCall({operation:'today',mode:'more'})).status,200);assert.equal(JSON.parse(db.get(prefix+'contact-prefs')).level,'natural');assert.equal(JSON.parse(db.get(prefix+'contact-today')).mode,'more');assert.equal((await settingsCall({operation:'today',mode:'always'})).status,400);
});

test('unanswered contact pauses four hours, two unread contacts stop further initiative',()=>{
 const now=new Date('2026-10-08T12:00Z'),box={sequence:1,read:0,items:[{createdAt:new Date(+now-3*3600000).toISOString()}]};
 assert.equal(api.contactReadiness({},box,now),'unanswered_pause');
 box.items[0].createdAt=new Date(+now-4*3600000).toISOString();assert.equal(api.contactReadiness({},box,now),null);
 box.sequence=2;assert.equal(api.contactReadiness({},box,now),'unread');
});
test('active conversation and fresh requests for distance suppress own messages without permanent blocking',()=>{
 const box={sequence:0,read:0,items:[]},now=new Date('2026-10-08T12:00Z');
 assert.equal(api.contactReadiness({dialogue:{at:new Date(+now-60000).toISOString(),lastUser:'Hallo'}},box,now),'active_conversation');
 assert.equal(api.contactReadiness({dialogue:{at:new Date(+now-3600000).toISOString(),lastUser:'Lass mich bitte in Ruhe'}},box,now),'distance');
 assert.equal(api.contactReadiness({dialogue:{at:new Date(+now-9*3600000).toISOString(),lastUser:'Lass mich bitte in Ruhe'}},box,now),null);
});
test('object-form closed topics cannot be reopened by proactive delivery',()=>{
 const life={dialogue:{closedTopics:[{topic:'prüfung',at:base.toISOString()}]},threads:[{topic:'prüfung',text:'Prüfung?',status:'open',expiresAt:new Date(+base+86400000).toISOString()}]};
 assert.deepEqual(api.contactThreads(life,{items:[]},base),[]);
 assert.equal(api.repeatedContact('Kaffee tut gut!',[{text:'Kaffee tut gut.'}]),true);
 assert.equal(api.repeatedContact('Sport tut gut.',[{text:'Kaffee tut gut.'}]),false);
});
test('reserved spacing is atomic, varies within two to three hours and survives later calls',async()=>{
 reset();assert.equal(await photo.reserveDailyContact('one',base),true);
 const state=JSON.parse(db.get(prefix+'contact-day:2026-10-07'));
 assert.ok(state.nextAt>=+base+7200000&&state.nextAt<=+base+10800000);
 assert.equal(await photo.reserveDailyContact('early',new Date(state.nextAt-1)),false);
 assert.equal(JSON.parse(db.get(prefix+'contact-day:2026-10-07')).nextAt,state.nextAt);
 assert.equal(await photo.reserveDailyContact('next',new Date(state.nextAt)),true);
});
test('three simulated days keep independent daily budgets and suppress every quiet-hour tick',async()=>{
 reset();for(let day=7;day<=9;day++){
  const morning=new Date(`2026-10-${String(day).padStart(2,'0')}T06:00Z`);
  assert.equal(await photo.reserveDailyContact('morning',morning),true);
  const state=JSON.parse(db.get(prefix+'contact-day:2026-10-'+String(day).padStart(2,'0')));
  assert.equal(state.count,1);assert.ok(state.limit>=3&&state.limit<=7);
  const before=modelCalls;assert.equal((await api.socialTick(new Date(`2026-10-${String(day).padStart(2,'0')}T22:00Z`))).reason,'quiet');assert.equal(modelCalls,before);
 }
});
test('notification deep link opens exactly the local contact and forwards it to an existing client',async()=>{
 const id='11111111-1111-4111-8111-111111111111',handlers={},opened=[],messages=[];let clients=[];
 const self={location:{origin:'https://sofia.test'},clients:{matchAll:async()=>clients,openWindow:u=>opened.push(u)},addEventListener:(n,f)=>handlers[n]=f};
 vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,URL});
 let work;const click=()=>handlers.notificationclick({notification:{data:{contactId:id,url:'https://evil.test'},close(){}},waitUntil:p=>work=p});
 click();await work;assert.deepEqual(opened,['/?contact='+id]);
 clients=[{url:'https://sofia.test/',focus:async()=>{},postMessage:x=>messages.push(x)}];click();await work;
 assert.equal(opened.length,1);assert.equal(messages[0].contactId,id);
});
