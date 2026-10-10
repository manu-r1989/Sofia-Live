import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile as nativeReadFile} from 'node:fs/promises';
const environmentSource=await nativeReadFile(new URL('../lib/environment.js',import.meta.url),'utf8');
const environmentUrl='data:text/javascript;base64,'+Buffer.from(environmentSource).toString('base64');
const messageContextSource=await nativeReadFile(new URL('../lib/message-context.js',import.meta.url),'utf8');
const messageContextUrl='data:text/javascript;base64,'+Buffer.from(messageContextSource).toString('base64');
async function readFile(...args){const value=await nativeReadFile(...args);return typeof value==='string'?value.replaceAll('../lib/environment.js',environmentUrl).replaceAll('../lib/message-context.js',messageContextUrl):value;}
import crypto from 'node:crypto';
const source = await readFile(new URL('../lib/character-image.js',import.meta.url),'utf8');
const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const prefix='sofia:main:portrait:';
let db, plan, calls, imageCalls, failImage, failRedis, plannerInputs, textInputs, reviewQueue, reviewInputs, weatherData, weatherCalls;
const savedFetch=globalThis.fetch;
const envKeys=['KV_REST_API_URL','KV_REST_API_TOKEN','OPENAI_API_KEY','SOFIA_PASSWORD'];
const env=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
function reset(){reviewQueue=[];reviewInputs=[];weatherData=null;weatherCalls=0;db=new Map();plan={action:'new',outfit:'Blue sweater',scene:'Selfie outdoors',caption:'Mein Selfie'};calls=[];imageCalls=[];plannerInputs=[];textInputs=[];failImage=false;failRedis=false;process.env.KV_REST_API_URL='https://redis.test';process.env.KV_REST_API_TOKEN='test';process.env.OPENAI_API_KEY='test';}
const response = (data,ok=true)=>({ok,json:async()=>data});
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://api.open-meteo.com/')){weatherCalls++;return response(weatherData,!!weatherData);}
 const body=JSON.parse(options.body);calls.push(String(url));
 if(url==='https://redis.test/pipeline') { for(const [op,key,value] of body) { assert.equal(op,'SET'); db.set(key,value); } return response(body.map(()=>({result:'OK'}))); }
 if(String(url).endsWith('/responses')) { textInputs.push(body.input); return response({output_text:JSON.stringify({action:'none'}),output:[{content:[{type:'output_text',text:JSON.stringify({reply:'Hallo Manu!',mood:'entspannt',memory_action:{action:'none'}})}]}]}); }
 if(url==='https://redis.test'){
  if(failRedis) return response({},false);
  const [op,key,value,...rest]=body;
  if(op==='GET')return response({result:db.get(key)||null});
  if(op==='SET'){if(rest.includes('NX')&&db.has(key))return response({result:null});db.set(key,value);return response({result:'OK'});}
  if(op==='DEL'){db.delete(key);return response({result:1});}
  if(op==='EVAL' && key.includes('sofia-gallery-append')) {const target=body[3],item=JSON.parse(body[4]);db.set(target,JSON.stringify([...JSON.parse(db.get(target)||'[]').filter(x=>x.id!==item.id),item]));return response({result:1});}
  if(op==='EVAL' && key.includes('sofia-portrait-jobs')) {const target=body[3],id=body[4];let jobs=JSON.parse(db.get(target)||'[]').filter(x=>x.id!==id);if(body[5])jobs.push(JSON.parse(body[5]));db.set(target,JSON.stringify(jobs.slice(-20)));return response({result:1});}
  if(op==='EVAL' && key.includes('sofia-life-cas')) {const target=body[3];if((db.get(target)||'')!==body[4])return response({result:0});db.set(target,body[5]);return response({result:1});}
  if(op==='EVAL'){const lock=body[3],id=body[4]; if(lock === 'sofia:main:history') { const history=JSON.parse(db.get(lock)||'[]'); history.push({role:'user',content:body[4],createdAt:body[7]},{role:'assistant',content:body[5],...(body[6]?{imageRequestId:body[6]}:{}),createdAt:body[7]});db.set(lock,JSON.stringify(history.slice(-40))); } else if(db.get(lock)===id)db.delete(lock);return response({result:1});}
  throw Error('Unexpected Redis '+op);
 }
 if(String(url).endsWith('/chat/completions') && Array.isArray(body.messages[1].content)){reviewInputs.push(body.messages);return response({choices:[{message:{content:JSON.stringify(reviewQueue.shift()||{ok:true,confidence:0.95,mismatches:[]})}}]});}
 if(String(url).endsWith('/chat/completions')) { plannerInputs.push(JSON.parse(body.messages[1].content)); return response({choices:[{message:{content:JSON.stringify(plan)}}]}); }
 if(String(url).endsWith('/images/edits')){imageCalls.push(body);return response({data:[{b64_json:'/9j/AA=='}]},!failImage);}
 throw Error('Unexpected URL');
};
test.after(()=>{globalThis.fetch=savedFetch;for(const k of envKeys)if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];});
test('Berlin date and time periods include summer and winter offsets',()=>{
 assert.equal(api.portraitPeriod(new Date('2026-10-06T22:30:00Z')),'2026-10-07:night');
 assert.equal(api.portraitPeriod(new Date('2026-12-06T10:30:00Z')),'2026-12-06:day');
});
test('ordinary conversation skips every network and classifier call',async()=>{reset();assert.equal(await api.preparePortrait('Wie geht es dir?'),null);assert.equal(calls.length,0);});
function previousPhotograph(now=new Date()) {
 const id='11111111-1111-4111-8111-111111111111',life=api.defaultSofiaLife(now);
 life.lastPhoto={id};life.dialogue={at:now.toISOString(),lastUser:'Schick mir ein Foto an der Uni mit dem roten Schal.',lastAssistant:'Hier ist das Foto.'};
 db.set(prefix+'life',JSON.stringify(life));db.set(prefix+'state',JSON.stringify({lastImageId:id}));
 db.set(prefix+'image:'+id,JSON.stringify({id,createdAt:now.toISOString(),sentAt:now.toISOString(),outfit:'Green sweater with red scarf',hairstyle:'loose hair',kind:'selfie',base64:'/9j/AA==',scene:'At university',life,capturedAt:now.toISOString(),bodyPose:'sitting'}));
 return id;
}
test('indirect perspective wishes force a real variant even when the planner says none or new',async()=>{
 for(const action of ['none','new'])for(const text of ['Wie würde das Foto aus einer anderen Perspektive aussehen?','Wie würde es von der Seite aussehen?','Kannst du es aus einem anderen Blickwinkel zeigen?']) {
  reset();const now=new Date(),old=previousPhotograph(now);plan.action=action;
  const job=await api.preparePortrait(text,null,now),stored=JSON.parse(db.get(prefix+'request:'+job.id));
  assert.equal(stored.variant,true,text);assert.equal(stored.sourceId,old);assert.ok(stored.dimensions.includes('camera-angle'));assert.equal(stored.outfit,'Green sweater with red scarf');assert.equal(stored.bodyPose,'sitting');assert.equal(stored.scene,text);
  await api.generatePortrait(job.id);assert.equal(imageCalls.length,1);assert.equal(imageCalls[0].images.length,2);assert.match(imageCalls[0].prompt,/camera-angle/);
 }
});
test('detail wishes create a source-bound photograph and requested crop rather than an empty promise',async()=>{
 for(const text of ['Ich würde gern ein Detail genauer sehen.','Ich würde dein Oberteil gerne genauer sehen.','Das würde ich gern näher sehen.','Zeig mir bitte eine Nahaufnahme.','Kannst du näher herangehen?']) {
  reset();const now=new Date(),old=previousPhotograph(now);plan.action='none';
  const job=await api.preparePortrait(text,null,now),stored=JSON.parse(db.get(prefix+'request:'+job.id));assert.equal(stored.variant,true,text);assert.equal(stored.sourceId,old);assert.ok(stored.dimensions.includes('framing'));assert.ok(stored.dimensions.includes('distance'));assert.equal(stored.dimensions.includes('outfit'),false);assert.equal(stored.outfit,'Green sweater with red scarf');
  await api.generatePortrait(job.id);assert.equal(imageCalls.length,1);assert.match(imageCalls[0].prompt,/framing/);
 }
});
test('correction wording starts a fresh job and keeps both feedback and previous visual instructions',async()=>{
 for(const text of ['Das wurde im Foto nicht korrekt umgesetzt.','Das entspricht nicht meiner vorherigen Beschreibung.','Nein, korrigiere das bitte.','Auf dem Foto fehlt der rote Schal.']) {
  reset();const now=new Date(),old=previousPhotograph(now);plan.action='none';
  const job=await api.preparePortrait(text,null,now);assert.equal(job.correction,true,text);const stored=JSON.parse(db.get(prefix+'request:'+job.id));assert.equal(stored.correctionOf,old);assert.equal(stored.variant,false);assert.equal(stored.sourceId,null);assert.ok(stored.scene.includes(text));assert.match(stored.scene,/roten Schal/);await api.generatePortrait(job.id);assert.equal(imageCalls.length,1);
 }
});
test('visual follow-ups respect opt-outs, explanations, task scope and missing reference',async()=>{
 reset();previousPhotograph();plan.action='none';
 for(const text of ['Bitte nur beschreiben, wie das Foto aus einer anderen Perspektive aussieht.','Ich möchte das Detail nicht genauer sehen.','Bitte kein neues Foto aus anderer Perspektive.','Erinnere mich morgen daran, das Detail genauer zu sehen.','Ich würde den Vertrag gerne genauer sehen.','Wie funktioniert eine andere Perspektive?','Warum fehlt im Foto der Schal?','Sag „Ich würde das Detail gerne genauer sehen“.']) {
  assert.equal(api.photoFollowUpIntent(text),null,text);assert.equal(await api.preparePortrait(text),null,text);
 }
 reset();plan.action='new';for(const text of ['Ich würde gern ein Detail genauer sehen.','Das entspricht nicht meiner Beschreibung.'])assert.equal(await api.preparePortrait(text),null,text);assert.equal(plannerInputs.length,0);
});
test('an unrelated stale correction does not attach to an old photograph',async()=>{
 reset();const now=new Date(),old=new Date(+now-2*3600000);previousPhotograph(old);const life=JSON.parse(db.get(prefix+'life'));life.dialogue={at:now.toISOString(),lastUser:'Wie war dein Tag?',lastAssistant:'Ganz entspannt.'};db.set(prefix+'life',JSON.stringify(life));plan.action='new';assert.equal(await api.preparePortrait('Das entspricht nicht meiner Beschreibung.',null,now),null);assert.equal(plannerInputs.length,0);
});
test('appearance question offers a photograph without starting generation; no gives description',async()=>{
 reset();const now=new Date();const offer=await api.appearanceChoice('Wie siehst du aktuell aus?',now);assert.equal(offer.reply,'Möchtest du es sehen?');assert.equal(plannerInputs.length,0);assert.equal(imageCalls.length,0);
 await api.appendPortraitAcknowledgment('Wie siehst du aktuell aus?',offer.reply);
 const answer=await api.appearanceChoice('Nein danke',now);assert.match(answer.reply,/Ich trage/);assert.match(answer.reply,/Gerade bin ich/);assert.doesNotMatch(answer.reply,/Master|Referenz|Porträt/);assert.equal(answer.imageRequest,undefined);assert.equal(plannerInputs.length,0);
});
test('yes to appearance creates a real master-based request matching the offered bed scene',async()=>{
 reset();const now=new Date(),life=api.defaultSofiaLife(now);life.location='zu Hause im Bett';life.activity='im Bett liegen';life.outfit='ein bequemes Schlafshirt';db.set(prefix+'life',JSON.stringify(life));
 const offer=await api.appearanceChoice('Wie siehst du gerade aus?',now);await api.appendPortraitAcknowledgment('Wie siehst du gerade aus?',offer.reply);
 const answer=await api.appearanceChoice('Ja bitte',now);assert.ok(answer.imageRequest?.id);const job=JSON.parse(db.get(prefix+'request:'+answer.imageRequest.id));assert.equal(job.outfit,offer.life.outfit);assert.match(job.scene,/liegend.*Bett/);assert.match(job.scene,/kein stehendes Ganzkörperfoto/);assert.equal(job.sourceId,null);
 assert.equal(await api.appearanceChoice('ja',now),null);assert.equal(plannerInputs.length,1);
});
test('appearance consent expires and unrelated yes never starts an old photo offer',async()=>{
 reset();const now=new Date();const offer=await api.appearanceChoice('Was trägst du gerade?',now);await api.appendPortraitAcknowledgment('Was trägst du gerade?',offer.reply);
 assert.equal(await api.appearanceChoice('ja',new Date(+now+600001)),null);
 await api.appendPortraitAcknowledgment('Erzähl mir einen Witz','Ein Witz.');assert.equal(await api.appearanceChoice('ja',now),null);
 for(const text of ['Was hast du heute gemacht?','Wie würdest du morgen aussehen?','Schick mir ein Selfie','Wie siehst du meine Lage?'])assert.equal(api.currentAppearanceRequest(text),false,text);
 assert.equal(plannerInputs.length,0);
});
test('seeing the just described appearance creates a real job even when planner says none',async()=>{
 reset();const now=new Date();plan.action='none';
 const life=api.defaultSofiaLife(now);life.dialogue={at:now.toISOString(),lastUser:'Wie siehst du aktuell aus?',lastAssistant:'Im gemütlichen Oberteil auf dem Sofa.'};db.set(prefix+'life',JSON.stringify(life));
 const job=await api.preparePortrait('Das würd ich gern sehen',null,now);
 assert.ok(job?.id);assert.equal(JSON.parse(db.get(prefix+'request:'+job.id)).status,'ready');
 assert.equal(await api.preparePortrait('Das würde ich gern sehen',null,new Date(now.getTime()+601000)),null);
});
test('accepting a recent explicit assistant photo offer prepares a new picture',async()=>{
 reset();const now=new Date();plan.action='none';
 const life=api.defaultSofiaLife(now);life.dialogue={at:now.toISOString(),lastUser:'Was machst du gerade?',lastAssistant:'Ich schicke dir ein Selfie vom Sofa.'};db.set(prefix+'life',JSON.stringify(life));
 const job=await api.preparePortrait('Das würde ich gern sehen',null,now);
 assert.ok(job?.id);assert.equal(JSON.parse(db.get(prefix+'request:'+job.id)).status,'ready');
 assert.equal(await api.preparePortrait('Das würde ich gern sehen',null,new Date(+now+600001)),null);
});
test('unrelated or refused photo offers do not create jobs from an ambiguous confirmation',async()=>{
 for(const lastAssistant of ['Ich kann dir kein Foto schicken.','Ich würde dir ein Selfie schicken.','Ich zeige dir die Stadt auf einer Karte.']){
  reset();const now=new Date(),life=api.defaultSofiaLife(now);life.dialogue={at:now.toISOString(),lastUser:'Hallo',lastAssistant};db.set(prefix+'life',JSON.stringify(life));
  assert.equal(await api.preparePortrait('Das würde ich gern sehen',null,now),null);assert.equal(plannerInputs.length,0);
 }
});
test('seeing confirmation accepts a stored appearance offer',async()=>{
 reset();const now=new Date();const offer=await api.appearanceChoice('Wie siehst du gerade aus?',now);await api.appendPortraitAcknowledgment('Wie siehst du gerade aus?',offer.reply);
 const answer=await api.appearanceChoice('Das würde ich gern sehen',now);assert.ok(answer.imageRequest?.id);assert.equal(JSON.parse(db.get(prefix+'request:'+answer.imageRequest.id)).outfit,offer.life.outfit);
});
test('repeat after a failed photo creates a fresh job without sharing error context',async()=>{
 reset();const now=new Date(),life=api.defaultSofiaLife(now);life.dialogue={at:now.toISOString(),lastUser:'Ich warte'};db.set(prefix+'life',JSON.stringify(life));
 const old='11111111-1111-4111-8111-111111111111';db.set(prefix+'request:'+old,JSON.stringify({id:old,status:'failed',failureCode:'portrait_moderated'}));
 db.set('sofia:main:history',JSON.stringify([{role:'user',content:'Mach bitte ein Selfie von dir'},{role:'assistant',content:'Gib mir einen kleinen Moment.',imageRequestId:old},{role:'user',content:'Ich warte'},{role:'assistant',content:'Es hat nicht geklappt.'}]));
 const job=await api.preparePortrait('Nochmal',null,now);assert.ok(job?.id);assert.notEqual(job.id,old);assert.doesNotMatch(JSON.stringify(plannerInputs.at(-1)),/failed|moderated/);
});
test('repeat after legacy unstarted appearance request repairs the missing job',async()=>{
 reset();const now=new Date(),life=api.defaultSofiaLife(now);life.dialogue={at:now.toISOString(),lastUser:'Warum?'};db.set(prefix+'life',JSON.stringify(life));
 db.set('sofia:main:history',JSON.stringify([{role:'user',content:'Wie siehst du aktuell aus?'},{role:'assistant',content:'Auf dem Sofa.'},{role:'user',content:'Das würd ich gern sehen'},{role:'assistant',content:'Gib mir einen kleinen Moment.'},{role:'user',content:'Ich warte'},{role:'assistant',content:'Leider kein Bild.'},{role:'user',content:'Warum?'},{role:'assistant',content:'Kein genauer Grund.'}]));
 assert.ok((await api.preparePortrait('noch mal',null,now))?.id);
});
test('repeat of unrelated conversation and stale photo context never starts a picture',async()=>{
 reset();const now=new Date(),life=api.defaultSofiaLife(now);life.dialogue={at:now.toISOString()};db.set(prefix+'life',JSON.stringify(life));
 db.set('sofia:main:history',JSON.stringify([{role:'user',content:'Selfie bitte'},{role:'assistant',content:'Gib mir einen kleinen Moment.'},{role:'user',content:'Erzähl mir einen Witz'},{role:'assistant',content:'Ein Witz.'}]));
 assert.equal(await api.preparePortrait('nochmal',null,now),null);assert.equal(plannerInputs.length,0);
 life.dialogue.at=new Date(now.getTime()-1801000).toISOString();db.set(prefix+'life',JSON.stringify(life));assert.equal(await api.preparePortrait('nochmal',null,now),null);
});
test('repeating a pending photo reuses its receipt rather than creating a second paid job',async()=>{
 reset();const now=new Date(),life=api.defaultSofiaLife(now);life.dialogue={at:now.toISOString()};db.set(prefix+'life',JSON.stringify(life));
 const old='11111111-1111-4111-8111-111111111111';db.set(prefix+'request:'+old,JSON.stringify({id:old,status:'ready',requestedAt:now.toISOString(),requestMessage:'Selfie bitte'}));
 db.set('sofia:main:history',JSON.stringify([{role:'user',content:'Selfie bitte'},{role:'assistant',content:'Gib mir einen kleinen Moment.',imageRequestId:old}]));
 assert.equal((await api.preparePortrait('nochmal',null,now))?.id,old);assert.equal(plannerInputs.length,0);
});
test('same period preserves outfit, new day permits variety, explicit outfit changes apply',async()=>{
 reset();db.set(prefix+'state',JSON.stringify({period:'2026-10-06:day',outfit:'Red jacket'}));
 let r=await api.preparePortrait('Ein Selfie bitte',null,new Date('2026-10-06T12:00Z'));
 assert.equal(JSON.parse(db.get(prefix+'request:'+r.id)).outfit,'Red jacket');
 r=await api.preparePortrait('Ein Selfie bitte',null,new Date('2026-10-07T12:00Z'));
 assert.notEqual(JSON.parse(db.get(prefix+'request:'+r.id)).outfit,'Red jacket');
 plan.changeOutfit=true;r=await api.preparePortrait('Selfie mit neuem Outfit',null,new Date('2026-10-06T12:00Z'));
 assert.equal(JSON.parse(db.get(prefix+'request:'+r.id)).outfit,'Blue sweater');
});
test('variant keeps selected outfit across dates and uses master first plus source second',async()=>{
 reset();const old='11111111-1111-4111-8111-111111111111';
 db.set(prefix+'image:'+old,JSON.stringify({id:old,createdAt:new Date().toISOString(),outfit:'Green dress',base64:'/9j/AA==',scene:'Mirror selfie'}));
 plan.action='variant';
 const r=await api.preparePortrait('Das Outfit in anderem Licht',old,new Date('2026-10-07T12:00Z'));
 assert.equal(JSON.parse(db.get(prefix+'request:'+r.id)).outfit,'Green dress');
 const image=await api.generatePortrait(r.id);
 assert.equal(image.url,'/api/chat?image='+r.id);
 assert.equal(imageCalls[0].images.length,2);
 const master=await readFile(new URL('../sofia-avatar.PNG',import.meta.url));
 assert.equal(imageCalls[0].images[1].image_url,'data:image/png;base64,'+master.toString('base64'));
 assert.equal(imageCalls[0].images[0].image_url,'data:image/jpeg;base64,/9j/AA==');
 assert.equal((await api.portraitGallery()).length,1);
});
test('overlapping generation and completed retry issue only one paid provider request',async()=>{
 reset();const r=await api.preparePortrait('Selfie');
 const results=await Promise.allSettled([api.generatePortrait(r.id),api.generatePortrait(r.id)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const again=await api.generatePortrait(r.id);assert.equal(again.id,r.id);assert.equal(imageCalls.length,1);
});
test('mood affects expressions and photo variants retain earlier life, hair and clothing across dates',async()=>{
 reset();const now=new Date('2026-10-06T12:00Z');
 const first=await api.preparePortrait('Selfie',null,now,'ernst');await api.generatePortrait(first.id);
 assert.match(imageCalls[0].prompt,/Facial expression: calm serious expression/);
 const original=JSON.parse(db.get(prefix+'image:'+first.id));
 plan.action='variant';plan.scene='same photograph in warmer light';
 const second=await api.preparePortrait('Dasselbe Outfit in anderem Licht',first.id,new Date('2026-10-07T12:00Z'),'amüsiert');
 const job=JSON.parse(db.get(prefix+'request:'+second.id));
 assert.deepEqual(job.life,original.life);assert.equal(job.mood,'ernst');assert.equal(job.hairstyle,original.hairstyle);
 assert.equal(job.outfit,original.outfit);await api.generatePortrait(second.id);
 assert.match(imageCalls[1].prompt,/preserve the earlier expression unless/);
});
test('environment photographs omit people, retain the master reference and preserve their kind in variants',async()=>{
 reset();plan.kind='environment';
 const first=await api.preparePortrait('Zeig mir deine Umgebung',null,new Date('2026-10-06T12:00Z'));
 assert.ok(first);await api.generatePortrait(first.id);
 assert.match(imageCalls[0].prompt,/environment snapshot from Sofias perspective, with no Sofia/);
 assert.equal(imageCalls[0].images.length,1);
 plan.action='variant';plan.kind='selfie';
 const variant=await api.preparePortrait('Dasselbe in anderem Licht',first.id,new Date('2026-10-06T12:00Z'));
 assert.equal(JSON.parse(db.get(prefix+'request:'+variant.id)).kind,'environment');
});
test('a corrected current outfit wins over legacy photograph state for a new selfie',async()=>{
 reset();const now=new Date('2026-10-06T12:00Z');db.set(prefix+'state',JSON.stringify({period:'2026-10-06:day',outfit:'Red jacket'}));
 const current=await api.getSofiaLife(now);await api.editCharacterState({revision:current.revision,field:'outfit',value:'Green sweater'},now);
 const job=await api.preparePortrait('Selfie',null,now);assert.equal(JSON.parse(db.get(prefix+'request:'+job.id)).outfit,'Green sweater');
});
test('failed or uncertain generation is not replayed and does not publish or change outfit',async()=>{
 reset();const r=await api.preparePortrait('Selfie');failImage=true;
 await assert.rejects(api.generatePortrait(r.id));
 await assert.rejects(api.generatePortrait(r.id),/bereits gestartet/);
 assert.equal(imageCalls.length,1);const notices=await api.portraitGallery();assert.equal(notices.length,1);assert.equal(notices[0].status,'failed');assert.equal(notices[0].failureCode,'portrait_provider_failed');assert.equal(notices[0].message,api.portraitFailureMessage('portrait_provider_failed'));assert.equal(db.get(prefix+'state'),undefined);
});
test('descriptive questions are no-op, missing source and mixed actions require clarification',async()=>{
 reset();plan.action='none';assert.equal(await api.preparePortrait('Wie gefällt dir das Outfit?'),null);
 plan.action='variant';await assert.rejects(api.preparePortrait('Outfit in anderem Licht'),/zuerst ein Bild/);
 plan.action='mixed';await assert.rejects(api.preparePortrait('Selfie und erinnere mich morgen'),/getrennt/);
});
test('image delivery is private JPEG with download attachment and validated IDs',async()=>{
 reset();const r=await api.preparePortrait('Selfie');await api.generatePortrait(r.id);
 const headers={};let bytes,status;
 const res={setHeader:(k,v)=>headers[k]=v,status(n){status=n;return this;},send(b){bytes=b;},json(){}};
 await api.servePortrait({query:{image:r.id,download:'1'}},res);
 assert.equal(status,200);assert.equal(headers['Cache-Control'],'private, no-store');assert.match(headers['Content-Disposition'],/^attachment/);assert.equal(headers['Content-Type'],'image/jpeg');assert.ok(Buffer.isBuffer(bytes));
 await api.servePortrait({query:{image:'../../secret'}},res);assert.equal(status,400);
});
test('UI integration loads shared renderer before app and does not alter avatar assets',async()=>{
 const root=new URL('../',import.meta.url);const index=await readFile(new URL('index.html',root),'utf8');
 assert.ok(index.indexOf('sofia-images.js?v=47410v1')<index.indexOf('app.js?v=47410v1'));
 const chat=await readFile(new URL('api/chat.js',root),'utf8');
 assert.ok(chat.indexOf('!safeEqual(')<chat.indexOf('await servePortrait'));
 const ui=await readFile(new URL('sofia-images.js',root),'utf8');assert.match(ui,/dialog.showModal/);assert.match(ui,/link.download=/);assert.doesNotMatch(ui,/spinner|generating-status/);
 const live=await readFile(new URL('live.js',root),'utf8');assert.match(live,/contextData.imageRequest[\s\S]*?SofiaImages/);
});

test('explicit selfie commands survive a classifier no-op instead of reaching a camera refusal',async()=>{
 reset();plan={action:'none'};
 for(const text of ['Sofia, mach bitte ein Selfie von dir.','Kannst du mir ein echtes Selfie schicken?','Schick mir ein Foto von dir','Ein Spiegelselfie bitte','Selfie']) {
  assert.equal(api.explicitPortraitRequest(text),true,text);
  const request=await api.preparePortrait(text);
  assert.ok(request?.id,text);
  const job=JSON.parse(db.get(prefix+'request:'+request.id));
  assert.equal(job.scene,text);assert.equal(job.status,'ready');
 }
 assert.equal(imageCalls.length,0,'routing alone never bills for image generation');
});
test('discussion, quotes, negation and scheduled requests do not become immediate paid jobs',async()=>{
 reset();plan={action:'none'};
 for(const text of ['Warum kannst du keine echten Selfies machen?','Wie machst du ein Selfie?','Mach bitte kein Selfie','Kannst du mir später ein Selfie schicken?','Erinnere mich daran, ein Selfie zu machen','Sag „Mach mir ein Selfie“','Wie gefällt dir das Outfit?']) {
  assert.equal(api.explicitPortraitRequest(text),false,text);
  assert.equal(await api.preparePortrait(text),null,text);
 }
});
test('Text and Realtime explicitly advertise character photographs and require real execution',async()=>{
 for(const path of ['../api/chat.js','../api/realtime.js']) {
  const source=await readFile(new URL(path,import.meta.url),'utf8');
  assert.match(source,/SOFIAS CHARAKTERROLLE UND BILDFUNKTION/);
  assert.match(source,/Biete dafür nicht nur einen Prompt an/);
  assert.match(source,/bevor das Bild tatsächlich geliefert wurde/);
  assert.match(source,/auf eine ausdrückliche Frage nach deiner realen Natur\nantwortest du ehrlich/);
 }
});

test('authenticated Text and Live return image jobs even if the planner says none',async()=>{
 reset();plan={action:'none',scene:'Cannot take real photographs',caption:'No camera'};
 process.env.SOFIA_PASSWORD='test-only';
 const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
 const root=new URL('../',import.meta.url);
 const dates=moduleUrl(await readFile(new URL('lib/task-dates.js',root),'utf8'));
 const tasks=moduleUrl((await readFile(new URL('api/task-action.js',root),'utf8')).replace('../lib/task-dates.js',dates));
 const engine=moduleUrl((await readFile(new URL('api/action-engine.js',root),'utf8')).replace('./task-action.js',tasks));
 for(const endpoint of ['chat','live-context']) {
  const code=(await readFile(new URL('api/'+endpoint+'.js',root),'utf8')).replace('../lib/character-image.js',moduleUrl(source)).replace('./action-engine.js',engine);
  const handler=(await import(moduleUrl(code))).default;
  const session=crypto.createHmac('sha256','test-only').update('sofia-authorized-session-v1').digest('hex');
  let status,data;
  const res={setHeader(){},status(n){status=n;return this;},json(d){data=d;return d;}};
  await handler({method:'POST',headers:{cookie:'sofia_session='+session},body:{message:'Sofia, mach bitte ein echtes Selfie von dir.',mood:'ernst'}},res);
  assert.equal(status,200);assert.ok(data.imageRequest?.id);
  assert.equal(data.taskAction.action,'none');
  assert.match(data.reply || data.context,/Gib mir einen kleinen Moment/);
  assert.doesNotMatch(data.reply || data.context,/keinen Körper|keine Kamera|Prompt entwerfen/);
  const job=JSON.parse(db.get(prefix+'request:'+data.imageRequest.id));
  assert.equal(job.mood,'ernst');assert.equal(data.life.mood,'ernst');
  assert.equal(data.life.statusLabel,api.lifeStatusLabel(data.life.location));
  assert.equal(job.scene,'Sofia, mach bitte ein echtes Selfie von dir.');
  assert.equal(job.caption,'Ein Bild von mir.');
 }
 assert.equal(imageCalls.length,0,'provider runs only from the separate generation request');
});

test('new request after failure has a fresh ID and no failure or moderation context',async()=>{
 reset();const failed=await api.preparePortrait('Ein Selfie bitte');failImage=true;
 await assert.rejects(api.generatePortrait(failed.id));
 failImage=false;
 const fresh=await api.preparePortrait('Ein Selfie bitte');assert.notEqual(fresh.id,failed.id);
 const input=plannerInputs.at(-1);assert.deepEqual(Object.keys(input).sort(),['currentOutfit','life','message','period','reference']);
 assert.doesNotMatch(JSON.stringify(input),/failed|moderation|Umgebung/);
 const image=await api.generatePortrait(fresh.id);assert.equal(image.id,fresh.id);assert.equal(imageCalls.length,2);
 assert.doesNotMatch(imageCalls[1].prompt,/failed|moderation|Umgebung/);
 assert.equal(image.anchorId,fresh.id);assert.equal(image.requestMessage,'Ein Selfie bitte');
});
test('acknowledgment persists its image anchor and failed notice stays outside conversation history',async()=>{
 reset();const r=await api.preparePortrait('Selfie');
 await api.appendPortraitAcknowledgment('Selfie','Gib mir einen kleinen Moment.',r.id);
 failImage=true;await assert.rejects(api.generatePortrait(r.id));
 const history=JSON.parse(db.get('sofia:main:history'));assert.equal(history[1].imageRequestId,r.id);
 assert.equal(history.length,2);assert.doesNotMatch(JSON.stringify(history),/Umgebung|failed|moderation/);
});
test('Live memory stores the image anchor on the acknowledgment without saving failure context',async()=>{
 reset();process.env.SOFIA_PASSWORD='test-only';
 const code=(await readFile(new URL('../api/live-memory.js',import.meta.url),'utf8')).replace('../lib/character-image.js','data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const handler=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
 const session=crypto.createHmac('sha256','test-only').update('sofia-authorized-session-v1').digest('hex');
 const id='11111111-1111-4111-8111-111111111111';let status;
 const res={setHeader(){},status(n){status=n;return this;},json(d){return d;}};
 await handler({method:'POST',headers:{cookie:'sofia_session='+session},body:{userText:'Selfie bitte',assistantText:'Gib mir einen kleinen Moment.',imageRequestId:id}},res);
 assert.equal(status,200);assert.equal(JSON.parse(db.get('sofia:main:history'))[1].imageRequestId,id);
 assert.deepEqual(JSON.parse(db.get('sofia:main:longterm')||'[]'),[]);
});

test('normal conversation after a picture keeps the anchor in Redis but sends only message fields to the model',async()=>{
 reset();process.env.SOFIA_PASSWORD='test-only';
 const marker='11111111-1111-4111-8111-111111111111';
 db.set('sofia:main:history',JSON.stringify([{role:'user',content:'Selfie bitte'},{role:'assistant',content:'Gib mir einen kleinen Moment.',imageRequestId:marker}]));
 const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');const root=new URL('../',import.meta.url);
 const dates=moduleUrl(await readFile(new URL('lib/task-dates.js',root),'utf8'));
 const tasks=moduleUrl((await readFile(new URL('api/task-action.js',root),'utf8')).replace('../lib/task-dates.js',dates));
 const engine=moduleUrl((await readFile(new URL('api/action-engine.js',root),'utf8')).replace('./task-action.js',tasks));
 const code=(await readFile(new URL('api/chat.js',root),'utf8')).replace('../lib/character-image.js',moduleUrl(source)).replace('./action-engine.js',engine);
 const handler=(await import(moduleUrl(code))).default;
 const session=crypto.createHmac('sha256','test-only').update('sofia-authorized-session-v1').digest('hex');let status;
 const res={setHeader(){},status(n){status=n;return this;},json(d){return d;}};
 await handler({method:'POST',headers:{cookie:'sofia_session='+session},body:{message:'Hallo'}},res);
 assert.equal(status,200);assert.ok(textInputs.length);
 for(const input of textInputs.filter(Array.isArray))assert.ok(input.every(x=>!Object.hasOwn(x,'imageRequestId')));
 assert.equal(JSON.parse(db.get('sofia:main:history'))[1].imageRequestId,marker);
});

test('pending job gallery survives reload and processing cannot bill again',async()=>{
 reset();const r=await api.preparePortrait('Selfie');let jobs=await api.portraitGallery();assert.equal(jobs[0].jobStatus,'ready');
 const stored=JSON.parse(db.get(prefix+'request:'+r.id));db.set(prefix+'request:'+r.id,JSON.stringify({...stored,status:'processing'}));
 db.set(prefix+'jobs',JSON.stringify([{id:r.id,status:'pending',jobStatus:'processing',requestedAt:new Date().toISOString()}]));
 await assert.rejects(()=>api.generatePortrait(r.id),/bereits gestartet/);assert.equal(imageCalls.length,0);
 assert.equal((await api.portraitGallery())[0].jobStatus,'processing');
});
test('explicit smile variant preserves selected face source even when planner says new',async()=>{
 reset();const old='11111111-1111-4111-8111-111111111111';db.set(prefix+'image:'+old,JSON.stringify({id:old,createdAt:new Date().toISOString(),outfit:'Green dress',base64:'/9j/AA==',scene:'Mirror selfie',kind:'mirror'}));
 const r=await api.preparePortrait('Dasselbe mit einem Lächeln',old);
 const job=JSON.parse(db.get(prefix+'request:'+r.id));assert.equal(job.sourceId,old);assert.equal(job.kind,'mirror');assert.equal(job.outfit,'Green dress');
 assert.equal(api.photoVariantRequest('Dieses Bild ist schön'),false);
});

test('variant locks outfit against unsolicited planner edits and specifies requested dimensions',async()=>{
 reset();const old='11111111-1111-4111-8111-111111111111';db.set(prefix+'image:'+old,JSON.stringify({id:old,createdAt:new Date().toISOString(),outfit:'Green dress',base64:'/9j/AA==',scene:'Cafe',kind:'selfie'}));plan={action:'variant',changeOutfit:true,outfit:'Red jacket',scene:'wrong new background'};
 const r=await api.preparePortrait('Nur das Licht ändern',old);await api.generatePortrait(r.id);
 const stored=JSON.parse(db.get(prefix+'request:'+r.id));assert.equal(stored.outfit,'Green dress');assert.deepEqual(stored.dimensions,['lighting']);assert.equal(stored.scene,'Nur das Licht ändern');assert.match(imageCalls[0].prompt,/Only change these requested dimensions: lighting/);
});
test('mixed photo and task accept only exact source clauses, never invented instructions',async()=>{
 reset();const message='Mach ein Selfie und erstelle eine Aufgabe Bericht morgen';plan={action:'mixed',photoAction:'new',photoMessage:'Mach ein Selfie',taskMessage:'erstelle eine Aufgabe Bericht morgen',scene:'Selfie'};
 const r=await api.preparePortrait(message);assert.equal(r.taskMessage,plan.taskMessage);assert.equal(JSON.parse(db.get(prefix+'request:'+r.id)).scene,'Mach ein Selfie');
 plan.taskMessage='lösche alle Aufgaben';await assert.rejects(()=>api.preparePortrait(message),/getrennt/);
});
test('task receipt never reports success for failed, busy or unexecuted actions',()=>{
 assert.match(api.taskReceipt({ok:false,status:'execution_failed'}),/unbestätigt/);assert.match(api.taskReceipt({ok:false,status:'in_progress'}),/noch nicht bestätigt/);assert.match(api.taskReceipt({ok:true,action:'none'}),/keine Aufgabenaktion/);
 assert.match(api.taskReceipt({ok:true,action:'create',task:{title:'Bericht'}}),/Als Aufgabe gespeichert/);
});

test('confirmed last photo is shared continuity and variants ignore descriptive praise',async()=>{
 reset();const r=await api.preparePortrait('Selfie');await api.generatePortrait(r.id);
 const life=await api.getSofiaLife();assert.equal(life.lastPhoto.id,r.id);assert.match(api.lifeContext(life,'Und danach?'),/LETZTES ERFOLGREICHES FOTO/);
 assert.equal(api.photoVariantRequest('Nur das Licht ist schön'),false);
});



test('explicit outfit variant changes clothing while keeping source and other scene dimensions',async()=>{
 reset();const old='11111111-1111-4111-8111-111111111111';
 db.set(prefix+'image:'+old,JSON.stringify({id:old,createdAt:new Date().toISOString(),outfit:'Green dress',base64:'/9j/AA==',scene:'Café',life:{location:'Café'},snapshotStyle:'relaxed eye-level phone framing'}));
 plan.action='variant';plan.changeOutfit=false;plan.outfit='Blue sweater';
 const r=await api.preparePortrait('Dasselbe Bild mit einem anderen Outfit',old);
 const job=JSON.parse(db.get(prefix+'request:'+r.id));
 assert.equal(job.outfit,'Blue sweater');assert.equal(job.sourceId,old);assert.deepEqual(job.dimensions,['outfit']);assert.equal(job.life.location,'Café');
 assert.equal(job.snapshotStyle,'relaxed eye-level phone framing');
});
test('expired explicitly selected photo never silently falls back to the latest photograph',async()=>{
 reset();const old='11111111-1111-4111-8111-111111111111';plan.action='variant';
 await assert.rejects(()=>api.preparePortrait('Dasselbe in anderem Licht',old),/Ausgangsbild.*nicht mehr verfügbar/);assert.equal(imageCalls.length,0);
});

test('photo acknowledgment becomes the current dialogue reference without storing failure context',async()=>{
 reset();await api.appendPortraitAcknowledgment('Ein Selfie bitte','Gib mir einen kleinen Moment.','11111111-1111-4111-8111-111111111111');
 const life=await api.getSofiaLife();assert.equal(life.dialogue.lastUser,'Ein Selfie bitte');assert.equal(life.dialogue.topics.length,1);assert.doesNotMatch(JSON.stringify(life.dialogue),/moderation|failed/);
});


test('new portrait poses vary head, gaze and expression without changing identity',()=>{
 const first=api.photoPose(null,false,'entspannt'),second=api.photoPose({photoPose:first},false,'entspannt'),third=api.photoPose({photoPose:second},false,'entspannt');
 assert.notEqual(first.head,second.head);assert.notEqual(second.head,third.head);assert.notEqual(first.expression,second.expression);assert.notEqual(second.gaze,third.gaze);
 assert.equal(api.photoPose({photoPose:first},true),first);assert.equal(api.photoPose({},true),null);assert.doesNotMatch(JSON.stringify(api.photoPose(null,false,'ernst')),/smile/);
});
test('new selfie prompt changes pose while master remains first and profile is persisted',async()=>{
 reset();const r=await api.preparePortrait('Ein Selfie bitte');await api.generatePortrait(r.id);assert.match(imageCalls[0].prompt,/IDENTITY reference, not a pose or expression template/);assert.match(imageCalls[0].prompt,/NEW PHOTO POSE/);
 const saved=JSON.parse(db.get(prefix+'image:'+r.id));assert.match(saved.photoPose.head,/zero sideways tilt/);assert.match(imageCalls[0].prompt,/BODY POSTURE:/);assert.match(imageCalls[0].prompt,/Head, shoulders and torso must move independently/);assert.equal(imageCalls[0].images.length,1);
});
test('lighting-only variant preserves photo pose and has no new pose instruction',async()=>{
 reset();const old='11111111-1111-4111-8111-111111111111',pose=api.photoPose(null,false,'entspannt');db.set(prefix+'image:'+old,JSON.stringify({id:old,createdAt:new Date().toISOString(),outfit:'Blue sweater',base64:'/9j/AA==',scene:'Café',photoPose:pose}));plan={action:'variant',scene:'Andere Beleuchtung'};const r=await api.preparePortrait('Dasselbe Foto in anderem Licht',old);await api.generatePortrait(r.id);
 assert.deepEqual(JSON.parse(db.get(prefix+'request:'+r.id)).photoPose,pose);assert.doesNotMatch(imageCalls[0].prompt,/NEW PHOTO POSE/);assert.match(imageCalls[0].prompt,/Preserve the earlier head orientation, gaze and expression/);assert.equal(imageCalls[0].images.length,2);
});


test('new poses visibly vary phone position and preserve resting body context',()=>{
 const poses=[];let previous=null;for(let i=0;i<4;i++){const p=api.photoPose(previous);poses.push(p);previous={photoPose:p};}
 assert.equal(new Set(poses.map(p=>p.camera)).size,4);assert.equal(new Set(poses.map(p=>p.head)).size,4);
 for(const p of poses){assert.match(api.photoBodyPose({location:'zu Hause im Bett',activity:'im Bett liegen'},p),/bed.*never standing/);assert.match(api.photoBodyPose({location:'im Café'},p),/seated/);assert.match(api.photoBodyPose({location:'auf dem Sofa'},p),/sofa/);}
});
test('bed selfie generation sends a reclining body pose and keeps the canonical reference',async()=>{
 reset();const now=new Date();const life=api.defaultSofiaLife(now);life.location='zu Hause im Bett';life.activity='im Bett liegen';db.set(prefix+'life',JSON.stringify(life));
 const r=await api.preparePortrait('Ein Selfie bitte',null,now);await api.generatePortrait(r.id);
 assert.match(imageCalls[0].prompt,/BODY POSTURE: lying.*bed/);assert.match(imageCalls[0].prompt,/never standing/);assert.match(imageCalls[0].prompt,/master only to identify the same woman/);assert.equal(imageCalls[0].images.length,1);
});


test('a finished delayed photo records its frozen request scene and cannot overwrite a newer correction',async()=>{
 reset();const now=new Date('2026-10-08T10:00Z');const job=await api.preparePortrait('Selfie',null,now);
 const request=JSON.parse(db.get(prefix+'request:'+job.id));const life=await api.getSofiaLife(now);
 const corrected=await api.editCharacterState({revision:life.revision,field:'location',value:'auf dem Sofa zu Hause'},now);
 const image=await api.generatePortrait(job.id),saved=JSON.parse(db.get(prefix+'image:'+job.id)),current=JSON.parse(db.get(prefix+'life'));
 assert.equal(image.capturedAt,request.requestedAt);assert.equal(saved.situation.location,request.life.location);
 assert.equal(current.location,corrected.location);assert.equal(current.situation.location,corrected.location);assert.equal(current.lastPhoto.situation.location,request.life.location);
});
test('lighting or cropping variant keeps the original capture time and body posture',async()=>{
 reset();const now=new Date('2026-10-08T10:00Z'),first=await api.preparePortrait('Selfie',null,now);await api.generatePortrait(first.id);
 const original=JSON.parse(db.get(prefix+'image:'+first.id));plan.action='variant';
 const next=await api.preparePortrait('Dasselbe Bild, nur mit anderem Ausschnitt',first.id,new Date(+now+3600000));
 const job=JSON.parse(db.get(prefix+'request:'+next.id));assert.equal(job.sourceId,first.id);assert.equal(job.capturedAt,original.capturedAt);assert.equal(job.bodyPose,original.bodyPose);assert.deepEqual(job.dimensions,['framing']);
});

test('natural snapshot edits allow only requested pose expression framing or distance dimensions',()=>{
 assert.deepEqual(api.variantDimensions('Weniger gestellt bitte'),['expression','framing','pose']);
 assert.deepEqual(api.variantDimensions('Mehr Umgebung bitte'),['distance','framing']);
 assert.deepEqual(api.variantDimensions('Nur anderes Licht'),['lighting']);
 const poses=[];let previous=null;for(let i=0;i<6;i++){const pose=api.photoPose(previous,false,'entspannt',poses.map(photoPose=>({photoPose})));poses.push(pose);previous={photoPose:pose};}
 assert.equal(new Set(poses.map(p=>p.index)).size,6);assert.ok(poses.every(p=>p.head&&p.gaze&&p.camera&&p.expression));
 assert.ok(poses.every(p=>/never standing/.test(api.photoBodyPose({location:'im Bett'},p))));
});

test('conflicting photo geometry asks a specific question without classifier, job or image billing',async()=>{
 reset();const now=new Date(),sourceId=previousPhotograph(now);
 const message='Dieses Foto bitte von hinten aufnehmen, das Gesicht frontal sichtbar lassen.';
 await assert.rejects(api.preparePortrait(message,sourceId,now),error=>error.code==='portrait_clarification'&&/Rückansicht/.test(api.portraitPreparationReply(error)));
 assert.equal(plannerInputs.length,0);assert.equal(imageCalls.length,0);assert.equal(db.has(prefix+'jobs'),false);
 assert.equal(api.photoVariantClarification('Bitte nur beschreiben, wie das Foto von hinten mit Gesicht frontal aussehen würde.'),null);
 assert.match(api.photoVariantClarification('Dieses Foto: nur den Kamerastandpunkt ändern, lass Sofia bitte aufstehen.'),/Körperhaltung/);
 assert.equal(api.photoVariantClarification('Dieses Foto von hinten; Kopf zur Kamera drehen.'),null);
});
test('head gesture and camera requests are independent from full body pose',()=>{
 assert.deepEqual(api.variantDimensions('Dieses Foto anpassen: Kopf gerade halten.'),['head-pose']);
 assert.deepEqual(api.variantDimensions('Dieses Foto anpassen: Kopfhaltung anders.'),['head-pose']);
 assert.deepEqual(api.variantDimensions('Dieses Foto: Hand heben.'),['gesture']);
 assert.deepEqual(api.variantDimensions('Kamerastandpunkt: 90° nach links. Weichere Beleuchtung. Körperhaltung: entspannt stehen.'),['lighting','camera-angle','pose']);
});
test('deleted or unpublished explicit sources never fall back to the last visible photo',async()=>{
 for(const flag of ['deleted','published']){reset();const now=new Date(),sourceId=previousPhotograph(now),source=JSON.parse(db.get(prefix+'image:'+sourceId));source[flag]=flag==='deleted';db.set(prefix+'image:'+sourceId,JSON.stringify(source));
 await assert.rejects(api.preparePortrait('Dieses Foto aus anderer Perspektive zeigen.',sourceId,now),/ausgewählte Ausgangsbild/);assert.equal(plannerInputs.length,0);assert.equal(imageCalls.length,0);}
});
test('combined photo changes create one immutable source-bound job with the original capture time',async()=>{
 reset();const now=new Date(),sourceId=previousPhotograph(now),source=JSON.parse(db.get(prefix+'image:'+sourceId));source.capturedAt=new Date(+now-3600000).toISOString();db.set(prefix+'image:'+sourceId,JSON.stringify(source));plan.action='new';
 const job=await api.preparePortrait('Dieses Foto bitte entsprechend anpassen: Kamerastandpunkt: 90° nach links um das Motiv. Weichere Beleuchtung. Kopf gerade halten. Alle nicht genannten Merkmale beibehalten.',sourceId,now);
 const request=JSON.parse(db.get(prefix+'request:'+job.id));assert.equal(request.sourceId,sourceId);assert.equal(request.sourceSnapshot.id,sourceId);assert.equal(request.capturedAt,source.capturedAt);assert.equal(request.bodyPose,'sitting');assert.equal(request.outfit,source.outfit);assert.deepEqual(request.dimensions,['lighting','camera-angle','head-pose']);assert.equal(JSON.parse(db.get(prefix+'jobs')).length,1);
 source.deleted=true;db.set(prefix+'image:'+sourceId,JSON.stringify(source));await assert.rejects(api.generatePortrait(job.id),/Ausgangsbild/);assert.equal(imageCalls.length,0);
});
test('past photo discussion cannot overwrite current role location or outfit through learning',async()=>{
 reset();const now=new Date('2026-10-07T19:00Z'),life=await api.getSofiaLife(now);plan={life:{location:'an der Universität',outfit:'rotes Shirt'}};
 const next=await api.learnSofiaLife('Auf diesem Foto bist du an der Universität.','Ich bin an der Universität und trage ein rotes Shirt.',now);
 assert.equal(next.location,life.location);assert.equal(next.outfit,life.outfit);assert.equal(api.selectedPhotoConversation('Wo bist du gerade?'),false);assert.match(api.roleMomentContext(next),/eine aktuelle Station/);
});
test('explicit distance suppresses voluntary questions and photo initiative but not normal answers',async()=>{
 reset();const now=new Date(),life=api.defaultSofiaLife(now);
 assert.equal(api.conversationMove(life,'Lass mir bitte etwas Zeit.',now).kind,'respond');assert.equal(api.conversationContinuity(life,'Möchte gerade nicht reden.',now).questionAllowed,false);
 assert.equal(await api.prepareProactivePortrait('Lass mir bitte etwas Zeit.',life,'Okay.',now),null);assert.equal(plannerInputs.length,0);
});
test('a clarification reply resolves the frozen source once and keeps unrequested posture',async()=>{
 reset();const now=new Date(),sourceId=previousPhotograph(now);
 await assert.rejects(api.preparePortrait('Dieses Foto von hinten, das Gesicht frontal sichtbar lassen.',sourceId,now),/Rückansicht/);
 const job=await api.preparePortrait('Rückansicht',null,new Date(+now+30000));assert.equal(job.sourceId,sourceId);const request=JSON.parse(db.get(prefix+'request:'+job.id));assert.deepEqual(request.dimensions,['camera-angle']);assert.match(api.photoCameraPositionPrompt(request),/actual rear view/);assert.equal(request.bodyPose,'sitting');assert.match(request.scene,/von hinten/);assert.doesNotMatch(request.scene,/frontal sichtbar/);assert.equal(db.has(prefix+'photo-clarification'),false);
});
test('head-only changes do not accidentally select body pose from preservation wording',()=>{
 assert.deepEqual(api.variantDimensions('Kopf gerade halten. Körperhaltung und Mimik beibehalten.'),['head-pose']);
 assert.deepEqual(api.variantDimensions('Kamerastandpunkt: 90° nach links. Kopf und Körperhaltung beibehalten.'),['camera-angle']);
});

test('a clear photo context mismatch retries once before storing only the checked result',async()=>{
 reset();reviewQueue=[{ok:false,confidence:.97,mismatches:['location','daylight']},{ok:true,confidence:.94,mismatches:[]}];const job=await api.preparePortrait('Selfie');const image=await api.generatePortrait(job.id);assert.equal(imageCalls.length,2);assert.equal(image.review.status,'passed');assert.match(imageCalls[1].prompt,/CORRECTION.*location, daylight/);assert.equal(JSON.parse(db.get(prefix+'gallery')).length,1);assert.equal(image.sentAt,image.createdAt);assert.equal(image.availabilityAt,image.createdAt);
});
test('a second clear mismatch fails honestly without publishing or continuing to bill',async()=>{
 reset();reviewQueue=[{ok:false,confidence:.95,mismatches:['weather']},{ok:false,confidence:.92,mismatches:['weather']}];const job=await api.preparePortrait('Selfie');await assert.rejects(api.generatePortrait(job.id),/portrait_context_mismatch/);assert.equal(imageCalls.length,2);assert.equal(db.has(prefix+'image:'+job.id),false);assert.equal(JSON.parse(db.get(prefix+'request:'+job.id)).status,'failed');assert.equal(JSON.parse(db.get(prefix+'notices'))[0].status,'failed');
});
test('invalid review output never silently publishes an unchecked photograph',async()=>{
 reset();reviewQueue=[{ok:'yes',confidence:.9,mismatches:[]}];const job=await api.preparePortrait('Selfie');await assert.rejects(api.generatePortrait(job.id),/portrait_review_unavailable/);assert.equal(imageCalls.length,1);assert.equal(db.has(prefix+'image:'+job.id),false);
});
test('current selfies ignore a stale variant decision and invented planner home scene',async()=>{
 reset();const now=new Date(),life=api.defaultSofiaLife(now);life.location='an der Universität in Hamburg';life.activity='lernen';db.set(prefix+'life',JSON.stringify(life));plan.action='variant';plan.scene='Home bedroom at night';const job=await api.preparePortrait('Schick mir ein aktuelles Selfie von dir.',null,now);const request=JSON.parse(db.get(prefix+'request:'+job.id));assert.equal(request.variant,false);assert.equal(request.sourceId,null);assert.doesNotMatch(request.scene,/Home bedroom/);assert.match(api.photoSceneContext(request),/Universität/);assert.match(api.photoSceneContext(request),/hamburgTime/);
});
test('situation mismatch feedback triggers a fresh selfie without explicit repeat request',async()=>{
 reset();const now=new Date(),life=api.defaultSofiaLife(now);life.location='an der Universität in Hamburg';life.activity='lernen';life.lastPhoto={id:'11111111-1111-4111-8111-111111111111'};db.set(prefix+'life',JSON.stringify(life));plan.action='none';const job=await api.preparePortrait('Das Foto passt nicht zur Situation. Du bist doch an der Uni.',null,now);assert.equal(job.correction,true);const request=JSON.parse(db.get(prefix+'request:'+job.id));assert.equal(request.correctionOf,life.lastPhoto.id);assert.equal(request.variant,false);assert.equal(request.sourceId,null);assert.equal(request.life.location,life.location);for(const text of ['Bitte kein neues Foto machen, es war falsch.','Das Foto gefällt mir.','Erinnere mich daran, dass das Foto falsch war.'])assert.equal(api.photoCorrectionRequest(text),false,text);
});
test('Hamburg weather validates numeric fresh conditions, caches them and shares rain/daylight',async()=>{
 reset();const now=new Date();weatherData={current:{time:Math.floor(+now/1000),is_day:1,weather_code:61,precipitation:.8,cloud_cover:98,temperature_2m:12}};const weather=await api.hamburgWeather(now);assert.equal(weather.condition,'rain');assert.equal(weather.isDay,true);assert.equal((await api.hamburgWeather(new Date(+now+60000))).condition,'rain');assert.equal(weatherCalls,1);assert.match(api.weatherContext(weather,now),/kein strahlender Sonnenschein/);assert.equal(api.normalizeHamburgWeather({current:{...weatherData.current,time:Math.floor(+now/1000)-1801}},now),null);assert.equal(api.normalizeHamburgWeather({current:{...weatherData.current,precipitation:'rain'}},now),null);assert.match(api.weatherContext(weather,new Date(+now+1800001)),/nicht verlässlich verfügbar/);
});
test('uncertain visual location does not cause needless retries or assert precise identification',()=>{
 assert.equal(api.photoReviewResult({ok:false,confidence:.4,mismatches:['location']}).status,'uncertain');assert.throws(()=>api.photoReviewResult({ok:false,confidence:2,mismatches:['location']}),/review_unavailable/);
});

test('an idempotent completed image response refreshes server time without restarting retention',async()=>{
 reset();const id='11111111-1111-4111-8111-111111111111',createdAt=new Date(Date.now()-16*3600000).toISOString(),started=Date.now();db.set(prefix+'request:'+id,JSON.stringify({id,status:'done',image:{id,createdAt,availabilityAt:createdAt}}));const result=await api.generatePortrait(id);assert.equal(result.createdAt,createdAt);assert.equal(result.archived,true);assert.ok(Date.parse(result.availabilityAt)>=started);assert.equal(imageCalls.length,0);
});

test('UI light, framing and custom variants retain source, clothing and capture context regardless of planner',async()=>{
 for(const action of ['none','new'])for(const text of ['Dieses Foto bitte nur bei etwas anderer Beleuchtung zeigen. Alles andere beibehalten.','Zeig dieses Foto bitte mit einem weiteren Ausschnitt und mehr Umgebung. Alles andere beibehalten.','Dieses Foto bitte entsprechend anpassen: etwas seitlicher. Alle nicht genannten Merkmale beibehalten.']){
  reset();const now=new Date(),old=previousPhotograph(now);plan.action=action;const prepared=await api.preparePortrait(text,old,now),job=JSON.parse(db.get(prefix+'request:'+prepared.id));assert.equal(job.variant,true,text);assert.equal(job.sourceId,old);assert.equal(job.outfit,'Green sweater with red scarf');assert.equal(job.bodyPose,'sitting');await api.generatePortrait(prepared.id);const stored=JSON.parse(db.get(prefix+'image:'+prepared.id));assert.equal(stored.sourceId,old);assert.match(imageCalls[0].prompt,/VARIANT EDIT BOUNDARY/);
 }
});
test('compass camera selections generate referenced variants with only the camera angle editable',async()=>{
 for(const [angle,side] of [[45,'nach links'],[90,'nach rechts'],[135,'nach links'],[180,'auf die gegenüberliegende Seite']]){
  reset();const now=new Date(),old=previousPhotograph(now);plan.action='none';
  const message='Zeig dieses Foto bitte aus einer anderen Perspektive. Kamerastandpunkt: '+angle+'° '+side+' um das Motiv, relativ zur ursprünglichen Kamera. Nur den Kamerastandpunkt ändern. Die ursprüngliche Situation bleibt erhalten.';
  const prepared=await api.preparePortrait(message,old,now),job=JSON.parse(db.get(prefix+'request:'+prepared.id));assert.equal(job.variant,true);assert.equal(job.sourceId,old);assert.deepEqual(job.dimensions,['camera-angle']);assert.equal(job.outfit,'Green sweater with red scarf');assert.equal(job.bodyPose,'sitting');
  await api.generatePortrait(prepared.id);const prompt=imageCalls[0].prompt;assert.match(prompt,/CAMERA POSITION OVERRIDE/);assert.ok(prompt.includes(angle+' degrees'));assert.match(prompt,/Move the camera, NOT the subject/);assert.match(prompt,/NOT a horizontal flip/);if(angle===180){assert.match(prompt,/actual rear view/);assert.match(prompt,/Do not force her face/);}assert.equal(imageCalls[0].images.length,2);
 }
});
test('a chained compass variant edits the selected variant rather than an ancestor or unrelated latest image',async()=>{
 reset();const now=new Date(),old=previousPhotograph(now);plan.action='none';
 const message='Zeig dieses Foto bitte aus einer anderen Perspektive. Kamerastandpunkt: 90° nach links um das Motiv, relativ zur ursprünglichen Kamera. Nur den Kamerastandpunkt ändern.';
 const first=await api.preparePortrait(message,old,now);assert.equal(first.sourceId,old);await api.generatePortrait(first.id);
 const variant=JSON.parse(db.get(prefix+'image:'+first.id));variant.base64='/9j/BB==';db.set(prefix+'image:'+first.id,JSON.stringify(variant));
 const latest='33333333-3333-4333-8333-333333333333';db.set(prefix+'image:'+latest,JSON.stringify({...variant,id:latest,base64:'/9j/CC==',outfit:'Other outfit'}));db.set(prefix+'state',JSON.stringify({lastImageId:latest}));
 const second=await api.preparePortrait(message,first.id,now);assert.equal(second.sourceId,first.id);const job=JSON.parse(db.get(prefix+'request:'+second.id));assert.equal(job.sourceId,first.id);assert.equal(job.seriesId,old);assert.equal(job.outfit,variant.outfit);
 await api.generatePortrait(second.id);assert.equal(imageCalls[1].images[0].image_url,'data:image/jpeg;base64,/9j/BB==');assert.match(imageCalls[1].images[1].image_url,/^data:image\/png/);assert.match(imageCalls[1].prompt,/FIRST reference is the explicitly selected source photograph/);assert.match(imageCalls[1].prompt,/SECOND reference is her canonical face/);assert.equal(JSON.parse(db.get(prefix+'image:'+second.id)).sourceId,first.id);
});
test('camera variants give visible source posture priority over stale sitting metadata and review both images',async()=>{
 reset();const now=new Date(),old=previousPhotograph(now);plan.action='none';
 const job=await api.preparePortrait('Zeig dieses Foto bitte aus einer anderen Perspektive. Kamerastandpunkt: 90° nach links um das Motiv.',old,now);
 const request=JSON.parse(db.get(prefix+'request:'+job.id));assert.equal(request.bodyPose,'sitting');const context=api.photoSceneContext(request);assert.match(context,/VISIBLE posture/);assert.doesNotMatch(context,/"posture":"sitting"/);
 reviewQueue=[{ok:false,confidence:.97,mismatches:['posture','camera-angle']},{ok:true,confidence:.95,mismatches:[]}];await api.generatePortrait(job.id);assert.equal(imageCalls.length,2);assert.match(imageCalls[1].prompt,/CORRECTION.*posture, camera-angle/);assert.match(imageCalls[0].prompt,/90-degree request.*visibly perpendicular/);assert.doesNotMatch(imageCalls[0].prompt,/"activity":"sit/);
 const content=reviewInputs[0][1].content,pictures=content.filter(x=>x.type==='image_url');assert.equal(pictures.length,2);assert.equal(pictures[0].image_url.url,'data:image/jpeg;base64,/9j/AA==');assert.match(reviewInputs[0][0].content,/SOURCE and RESULT directly/);assert.match(reviewInputs[0][0].content,/standing-to-sitting/);assert.match(reviewInputs[0][0].content,/requested 90-degree orbit remains a frontal selfie/);assert.match(reviewInputs[0][0].content,/uncertain camera geometry must not cause a retry/);
});
test('repeated clear perspective or posture failure stays unpublished',async()=>{
 reset();const now=new Date(),old=previousPhotograph(now);plan.action='none';const job=await api.preparePortrait('Zeig dieses Foto bitte aus einer anderen Perspektive. Kamerastandpunkt: 90° nach links um das Motiv.',old,now);reviewQueue=[{ok:false,confidence:.95,mismatches:['camera-angle']},{ok:false,confidence:.97,mismatches:['posture']}];await assert.rejects(api.generatePortrait(job.id),/portrait_context_mismatch/);assert.equal(imageCalls.length,2);assert.equal(db.has(prefix+'image:'+job.id),false);
});
test('uncertain camera geometry and an explicitly changed pose do not cause unnecessary regeneration',async()=>{
 reset();reviewQueue=[{ok:false,confidence:.4,mismatches:['camera-angle']}];let result=await api.reviewPortrait('/9j/BB==',{variant:true,dimensions:['camera-angle'],scene:'Kamerastandpunkt: 90° nach links'},12000,'/9j/AA==');assert.equal(result.status,'uncertain');
 reviewQueue=[{ok:false,confidence:.95,mismatches:['posture']}];result=await api.reviewPortrait('/9j/BB==',{variant:true,dimensions:['pose'],scene:'Setz dich bitte'},12000,'/9j/AA==');assert.equal(result.status,'uncertain');assert.deepEqual(result.mismatches,[]);
 reviewQueue=[{ok:false,confidence:.95,mismatches:['camera-angle']}];result=await api.reviewPortrait('/9j/BB==',{variant:false,dimensions:[],scene:'Selfie'},12000);assert.equal(result.status,'uncertain');assert.equal(reviewInputs.at(-1)[1].content.filter(x=>x.type==='image_url').length,1);
});
test('camera position overrides are limited to explicit compass variants',()=>{
 assert.equal(api.photoCameraPositionPrompt({variant:false,dimensions:['camera-angle'],scene:'Kamerastandpunkt: 180° auf die gegenüberliegende Seite'}),'');
 assert.equal(api.photoCameraPositionPrompt({variant:true,dimensions:['lighting'],scene:'Kamerastandpunkt: 180° auf die gegenüberliegende Seite'}),'');
 assert.equal(api.photoCameraPositionPrompt({variant:true,dimensions:['camera-angle'],scene:'Eine andere Perspektive'}),'');
});
test('preserving outfit and background in a custom request does not add them to editable dimensions',()=>{
 assert.deepEqual(api.variantDimensions('Etwas seitlicher, Outfit und Umgebung beibehalten.'),['camera-angle']);assert.deepEqual(api.variantDimensions('Anderes Licht, Outfit beibehalten.'),['lighting']);assert.deepEqual(api.variantDimensions('Andere Kleidung und anderer Hintergrund'),['background','outfit']);
});

test('new portraits offer straight heads and both tilt directions without repeating recent poses',()=>{
 const poses=[];let previous=null;for(let i=0;i<10;i++){const pose=api.photoPose(previous,false,'entspannt',poses.slice(-3).map(photoPose=>({photoPose})));poses.push(pose);previous={photoPose:pose};}
 assert.equal(new Set(poses.map(p=>p.index)).size,10);assert.ok(poses.some(p=>/zero sideways tilt/.test(p.head)));assert.ok(poses.some(p=>/tilted toward her left/.test(p.head)));assert.ok(poses.some(p=>/tilted toward her right/.test(p.head)));assert.ok(new Set(poses.map(p=>p.expression)).size>=5);
 for(const mood of ['ernst','genervt','skeptisch'])for(const pose of poses)assert.doesNotMatch(api.photoPose({photoPose:{index:pose.index}},false,mood).expression,/smile|laugh|grin/);
});
test('gestures and body variations respect bed and seated contexts without inventing props',()=>{
 const bed=[],seated=[];for(let index=0;index<5;index++){bed.push(api.photoBodyPose({location:'im Bett'},{index}));seated.push(api.photoBodyPose({location:'im Café'},{index}));assert.match(api.photoGesture({location:'im Bett'},{index}),/blanket|pillow|hair|arm/);assert.match(api.photoGesture({location:'im Café'},{index}),/do not invent a prop.*never cover the face/);}
 assert.equal(new Set(bed).size,5);assert.ok(bed.every(x=>/never standing/.test(x)));assert.equal(new Set(seated).size,5);assert.ok(seated.every(x=>/seated/.test(x)));
});
test('new pose instruction adds gestures while canonical face and hair identity remain binding',async()=>{
 reset();const job=await api.preparePortrait('Ein Selfie bitte');await api.generatePortrait(job.id);const prompt=imageCalls[0].prompt;assert.match(prompt,/GESTURE:/);assert.match(prompt,/straight head and level shoulders/);assert.match(prompt,/preserve its facial geometry, natural hair COLOR/);assert.match(prompt,/never cover the face/);const photo=JSON.parse(db.get(prefix+'image:'+job.id));assert.ok(photo.gesture);
});


test('everyday detail generation keeps canonical reference and current scene without imposing portrait pose',async()=>{
 reset();plan={action:'none'};const now=new Date('2026-10-08T12:00Z');const job=await api.preparePortrait('Zeig mir deinen Kaffee',null,now);
 await api.generatePortrait(job.id);assert.equal(imageCalls.length,1);assert.equal(imageCalls[0].images.length,1);
 assert.match(imageCalls[0].prompt,/close-up everyday detail snapshot/);assert.match(imageCalls[0].prompt,/no Sofia or identifiable people/);assert.doesNotMatch(imageCalls[0].prompt,/NEW PHOTO POSE:/);
 const image=await api.portraitGallery(now).then(rows=>rows.find(x=>x.id===job.id));assert.equal(image.kind,'detail');const gallery=await api.portraitGallery(now);assert.ok(gallery.some(x=>x.id===job.id));
});

test('explicit new photo kinds work independently of initiative preferences and preserve bed posture',async()=>{
 for(const [message,kind]of [['Schick mir ein Ganzkörperselfie','full_selfie'],['Schick mir ein Porträtfoto von dir','portrait'],['Schick mir ein Ganzkörperfoto von dir','full_portrait']]){
  reset();plan={action:'none'};const now=new Date('2026-10-08T22:30Z'),life=await api.getSofiaLife(now);db.set(prefix+'life',JSON.stringify({...life,settings:{initiative:'balanced',photos:false,photoKinds:[]}}));
  const job=await api.preparePortrait(message,null,now);assert.ok(job?.id);const request=JSON.parse(db.get(prefix+'request:'+job.id));assert.equal(request.kind,kind);assert.match(request.life.location,/Bett/);
  await api.generatePortrait(job.id);assert.match(imageCalls[0].prompt,/lying in bed stays lying/);assert.match(imageCalls[0].prompt,/FIRST reference/);
  if(kind!=='full_selfie'){assert.match(imageCalls[0].prompt,/Sofia is NOT holding the camera/);assert.doesNotMatch(imageCalls[0].prompt,/"camera":"phone held at/);}
 }
});

test('new photo fallback does not turn explanations, negations or reminders into images',()=>{
 for(const text of ['Warum möchtest du ein Porträtfoto?','Bitte kein Ganzkörperfoto','Erinnere mich morgen, ein Ganzkörperfoto zu machen','Sag „Schick mir ein Porträtfoto“'])assert.equal(api.explicitNewPhotoRequest(text),false,text);
 assert.equal(api.explicitNewPhotoRequest('Schick mir ein Porträtfoto'),true);
});

test('photo failures expose only bounded diagnostic codes and suitable user feedback',()=>{
 assert.deepEqual(api.safeDiagnostic({code:'portrait_timeout',status:504,message:'private provider text'}),{code:'portrait_timeout',status:504});
 assert.deepEqual(api.safeDiagnostic({code:'private_provider_code',status:200,message:'secret'}),{code:'request_failed'});
 assert.match(api.portraitFailureMessage('portrait_context_mismatch'),/Situation/);assert.match(api.portraitFailureMessage('portrait_timeout'),/lange/);
 assert.equal(api.portraitFailureMessage('portrait_moderated'),api.PORTRAIT_FAILURE_REPLY);
});
test('variants keep a stable series root with original scene and outfit',async()=>{
 reset();const first=await api.preparePortrait('Schick ein Selfie',null,new Date('2026-10-08T12:00:00Z'));const original=await api.generatePortrait(first.id);
 plan={action:'variant',scene:'Other light',outfit:'wrong outfit',changeOutfit:true};
 const job=await api.preparePortrait('Dieses Foto bitte nur bei anderer Beleuchtung zeigen. Alles andere beibehalten.',original.id,new Date('2026-10-08T12:02:00Z'));
 const request=JSON.parse(db.get(prefix+'request:'+job.id)),saved=JSON.parse(db.get(prefix+'image:'+original.id));
 assert.equal(request.seriesId,original.id);assert.equal(request.sourceId,original.id);assert.equal(request.outfit,saved.outfit);assert.equal(request.life.location,saved.life.location);assert.equal(request.capturedAt,saved.capturedAt||saved.requestedAt);
});

test('conversation about selected photographs distinguishes capture context from current life',()=>{
 const now=new Date('2026-10-08T20:00Z'),image={id:'11111111-1111-4111-8111-111111111111',sentAt:'2026-10-08T10:00Z',location:'an der Uni',outfit:'blauer Pullover',scene:'Universität'};
 const context=api.photoConversationContext(image,'Auf dem Foto bist du an der Uni?',now);assert.match(context,/an der Uni/);assert.match(context,/vergangene Aufnahme/);assert.match(context,/Aktueller Ort.*ausschließlich/);assert.match(context,/einmalige Fotoänderung.*keine dauerhafte Vorliebe/);
 assert.equal(api.photoConversationContext({...image,deleted:true},'Auf dem Bild?',now),'');assert.equal(api.photoConversationContext({...image,sentAt:'2026-09-01T10:00Z'},'Auf dem Bild?',now),'');
});
test('ambiguous deictic questions do not revive an unrelated old photo',()=>{
 const now=new Date('2026-10-08T20:00Z'),image={sentAt:now.toISOString(),location:'an der Uni'};
 assert.equal(api.photoConversationContext(image,'Regnet es dort?',now),'');assert.equal(api.photoConversationContext(image,'Dein Outfit gefällt mir',now),'');
 const life={dialogue:{at:'2026-10-08T19:58Z',lastUser:'Schick mir ein Selfie',lastAssistant:'Hier ist das Foto'}};assert.match(api.photoConversationContext(image,'Wie ist es dort?',now,life),/an der Uni/);
 assert.equal(api.photoConversationContext(image,'Wie ist es dort?',new Date('2026-10-08T20:20Z'),life),'');
});
test('ordinary conversation and invalid photo IDs add no Redis query, selected source never falls back',async()=>{
 reset();await api.selectedPhotoContext('11111111-1111-4111-8111-111111111111','Wie geht es dir?');assert.equal(calls.length,0);await api.selectedPhotoContext('invalid','Auf dem Foto?');assert.equal(calls.length,0);
 db.set(prefix+'state',JSON.stringify({lastImageId:'22222222-2222-4222-8222-222222222222'}));const result=await api.selectedPhotoContext('11111111-1111-4111-8111-111111111111','Auf dem Foto?');assert.equal(result,'');assert.equal(calls.length,1);
});


test('brief acknowledgements leave conversational room and opinion questions receive a position without a follow-up',()=>{
 const now=new Date(),life=api.defaultSofiaLife(now);for(const message of ['ja genau','alles klar','mhm','verstehe']){assert.equal(api.conversationContinuity(life,message,now).questionAllowed,false);assert.equal(api.conversationMove(life,message,now).kind,'respond');}
 assert.equal(api.conversationMove(life,'Was hältst du davon?',now).kind,'opinion');assert.equal(api.conversationMove(life,'Was hältst du davon?',now).question,false);
});
test('photo clarification freezes the current photo even when no explicit source is supplied',async()=>{
 reset();const now=new Date(),source=previousPhotograph(now);db.set(prefix+'state',JSON.stringify({lastImageId:source}));await assert.rejects(api.preparePortrait('Dieses Foto von hinten, Gesicht frontal sichtbar lassen.',null,now),/Rückansicht/);assert.equal(JSON.parse(db.get(prefix+'photo-clarification')).sourceId,source);
 db.set(prefix+'state',JSON.stringify({lastImageId:'11111111-1111-4111-8111-111111111111'}));const job=await api.preparePortrait('Rückansicht',null,new Date(+now+1000));assert.equal(job.sourceId,source);
});

test('current station survives pause while stale transitions and yesterday dialogue expire',()=>{const now=new Date('2026-10-10T12:00:00Z'),life={location:'Café',activity:'Kaffee trinken',outfit:'graues Oberteil',activityState:{location:'Café',activity:'Kaffee trinken'},dialogue:{at:'2026-10-10T08:00:00Z'},transition:{from:'Universität',to:'Café',at:'2026-10-10T07:00:00Z',expiresAt:'2026-10-10T07:30:00Z'}};const state=api.roleContinuity(life,now);assert.equal(state.sameStation,true);assert.equal(state.resume,'pause');assert.equal(state.transition,null);assert.equal(state.current.location,'Café');assert.equal(api.roleContinuity({...life,dialogue:{at:'2026-10-09T21:00:00Z'}},now).resume,'new-day');assert.equal(api.roleContinuity({},now).sameStation,false);});
test('observed transition requires its current destination and validity window',()=>{const now=new Date('2026-10-10T12:00:00Z'),transition={from:'Universität',to:'Café',at:'2026-10-10T11:55:00Z',expiresAt:'2026-10-10T12:15:00Z'};assert.equal(api.roleContinuity({location:'Café',transition},now).transition.from,'Universität');assert.equal(api.roleContinuity({location:'zu Hause',transition},now).transition,null);assert.match(api.roleContinuityContext({location:'Café',transition},now),/Keine Tätigkeit, Reise oder Leistung/);});
test('variant description never imports the current scene from a planner caption',async()=>{reset();const old='11111111-1111-4111-8111-111111111111';db.set(prefix+'image:'+old,JSON.stringify({id:old,createdAt:new Date().toISOString(),outfit:'Gray shirt',base64:'/9j/AA==',scene:'Sofa at night'}));plan.action='variant';plan.caption='Stadtbummel in der Schanze';const request=await api.preparePortrait('Dieses Foto in anderem Licht',old);assert.equal(request.sourceId,old);assert.equal(JSON.parse(db.get(prefix+'request:'+request.id)).caption,'Variante des ausgewählten Fotos.');});
