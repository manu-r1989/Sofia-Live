import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
const source = await readFile(new URL('../lib/character-image.js',import.meta.url),'utf8');
const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const prefix='sofia:main:portrait:';
let db, plan, calls, imageCalls, failImage, failRedis, plannerInputs, textInputs;
const savedFetch=globalThis.fetch;
const envKeys=['KV_REST_API_URL','KV_REST_API_TOKEN','OPENAI_API_KEY','SOFIA_PASSWORD'];
const env=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
function reset(){db=new Map();plan={action:'new',outfit:'Blue sweater',scene:'Selfie outdoors',caption:'Mein Selfie'};calls=[];imageCalls=[];plannerInputs=[];textInputs=[];failImage=false;failRedis=false;process.env.KV_REST_API_URL='https://redis.test';process.env.KV_REST_API_TOKEN='test';process.env.OPENAI_API_KEY='test';}
const response = (data,ok=true)=>({ok,json:async()=>data});
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);calls.push(String(url));
 if(url==='https://redis.test/pipeline') { for(const [op,key,value] of body) { assert.equal(op,'SET'); db.set(key,value); } return response(body.map(()=>({result:'OK'}))); }
 if(String(url).endsWith('/responses')) { textInputs.push(body.input); return response({output_text:JSON.stringify({action:'none'}),output:[{content:[{type:'output_text',text:JSON.stringify({reply:'Hallo Manu!',mood:'entspannt',memory_action:{action:'none'}})}]}]}); }
 if(url==='https://redis.test'){
  if(failRedis) return response({},false);
  const [op,key,value,...rest]=body;
  if(op==='GET')return response({result:db.get(key)||null});
  if(op==='SET'){if(rest.includes('NX')&&db.has(key))return response({result:null});db.set(key,value);return response({result:'OK'});}
  if(op==='DEL'){db.delete(key);return response({result:1});}
  if(op==='EVAL' && key.includes('sofia-portrait-jobs')) {const target=body[3],id=body[4];let jobs=JSON.parse(db.get(target)||'[]').filter(x=>x.id!==id);if(body[5])jobs.push(JSON.parse(body[5]));db.set(target,JSON.stringify(jobs.slice(-20)));return response({result:1});}
  if(op==='EVAL' && key.includes('sofia-life-cas')) {const target=body[3];if((db.get(target)||'')!==body[4])return response({result:0});db.set(target,body[5]);return response({result:1});}
  if(op==='EVAL'){const lock=body[3],id=body[4]; if(lock === 'sofia:main:history') { const history=JSON.parse(db.get(lock)||'[]'); history.push({role:'user',content:body[4]},{role:'assistant',content:body[5],imageRequestId:body[6]});db.set(lock,JSON.stringify(history.slice(-40))); } else if(db.get(lock)===id)db.delete(lock);return response({result:1});}
  throw Error('Unexpected Redis '+op);
 }
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
 db.set(prefix+'image:'+old,JSON.stringify({id:old,outfit:'Green dress',base64:'/9j/AA==',scene:'Mirror selfie'}));
 plan.action='variant';
 const r=await api.preparePortrait('Das Outfit in anderem Licht',old,new Date('2026-10-07T12:00Z'));
 assert.equal(JSON.parse(db.get(prefix+'request:'+r.id)).outfit,'Green dress');
 const image=await api.generatePortrait(r.id);
 assert.equal(image.url,'/api/chat?image='+r.id);
 assert.equal(imageCalls[0].images.length,2);
 const master=await readFile(new URL('../sofia-avatar.PNG',import.meta.url));
 assert.equal(imageCalls[0].images[0].image_url,'data:image/png;base64,'+master.toString('base64'));
 assert.equal(imageCalls[0].images[1].image_url,'data:image/jpeg;base64,/9j/AA==');
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
 assert.match(imageCalls[0].prompt,/Facial expression: calm serious expression, no forced smile/);
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
 assert.equal(imageCalls.length,1);const notices=await api.portraitGallery();assert.equal(notices.length,1);assert.equal(notices[0].status,'failed');assert.equal(notices[0].message,api.PORTRAIT_FAILURE_REPLY);assert.equal(db.get(prefix+'state'),undefined);
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
 assert.ok(index.indexOf('sofia-images.js?v=4279')<index.indexOf('app.js?v=4279'));
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
 assert.deepEqual(JSON.parse(db.get('sofia:main:longterm')),[]);
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
 reset();const old='11111111-1111-4111-8111-111111111111';db.set(prefix+'image:'+old,JSON.stringify({id:old,outfit:'Green dress',base64:'/9j/AA==',scene:'Mirror selfie',kind:'mirror'}));
 const r=await api.preparePortrait('Dasselbe mit einem Lächeln',old);
 const job=JSON.parse(db.get(prefix+'request:'+r.id));assert.equal(job.sourceId,old);assert.equal(job.kind,'mirror');assert.equal(job.outfit,'Green dress');
 assert.equal(api.photoVariantRequest('Dieses Bild ist schön'),false);
});

test('variant locks outfit against unsolicited planner edits and specifies requested dimensions',async()=>{
 reset();const old='11111111-1111-4111-8111-111111111111';db.set(prefix+'image:'+old,JSON.stringify({id:old,outfit:'Green dress',base64:'/9j/AA==',scene:'Cafe',kind:'selfie'}));plan={action:'variant',changeOutfit:true,outfit:'Red jacket',scene:'wrong new background'};
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
