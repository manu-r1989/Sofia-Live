import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile as nativeReadFile} from 'node:fs/promises';
const environmentSource=await nativeReadFile(new URL('../lib/environment.js',import.meta.url),'utf8');
const environmentUrl='data:text/javascript;base64,'+Buffer.from(environmentSource).toString('base64');
const messageContextSource=await nativeReadFile(new URL('../lib/message-context.js',import.meta.url),'utf8');
const messageContextUrl='data:text/javascript;base64,'+Buffer.from(messageContextSource).toString('base64');
async function readFile(...args){const value=await nativeReadFile(...args);return typeof value==='string'?value.replaceAll('../lib/environment.js',environmentUrl).replaceAll('../lib/message-context.js',messageContextUrl):value;}
import crypto from 'node:crypto';
const source=await readFile(new URL('../lib/character-image.js',import.meta.url),'utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const api=await import(url(source));
const prefix='sofia:main:portrait:';
const savedFetch=globalThis.fetch;
const keys=['KV_REST_API_URL','KV_REST_API_TOKEN','OPENAI_API_KEY','SOFIA_PASSWORD'];
const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
let db,quotas,decision,narrative,inputs,details;
function reset(){db=new Map();quotas=new Map();decision=true;narrative=null;details={};inputs=[];process.env.KV_REST_API_URL='https://redis.test';process.env.KV_REST_API_TOKEN='test';process.env.OPENAI_API_KEY='test';process.env.SOFIA_PASSWORD='test-only';}
const response=data=>({ok:true,json:async()=>data});
globalThis.fetch=async(endpoint,options)=>{
 const body=JSON.parse(options.body);
 if(String(endpoint).endsWith('/api/sofia-identity'))return response({ok:true});
 if(endpoint==='https://redis.test/pipeline'){for(const command of body){const [op,key,value]=command;if(op==='EVAL'&&key.includes('sofia-save-visible-history')){const hidden=JSON.parse(db.get(command[4])||'[]'),h=JSON.parse(command[5]);db.set(command[3],JSON.stringify(h.filter(t=>!hidden.some(x=>x.role===t.role&&x.content===t.content&&x.createdAt===t.createdAt))));}else{assert.equal(op,'SET');db.set(key,value);}}return response(body.map(()=>({result:'OK'})));}
 if(endpoint==='https://redis.test') {
  const [op,key,value,...args]=body;
  if(op==='GET')return response({result:db.get(key)||null});
  if(op==='SET'){db.set(key,value);return response({result:'OK'});}
  if(op==='EVAL' && key.includes('sofia-portrait-jobs')) {const target=body[3],id=body[4];let jobs=JSON.parse(db.get(target)||'[]').filter(x=>x.id!==id);if(body[5])jobs.push(JSON.parse(body[5]));db.set(target,JSON.stringify(jobs.slice(-20)));return response({result:1});}
  if(op==='EVAL' && ['sofia-life-cas','sofia-project-cas','sofia-memory-cas'].some(x=>key.includes(x))) {
   const target=body[3];if((db.get(target)||'')!==body[4])return response({result:0});
   db.set(target,body[5]);return response({result:1});
  }
  if(op==='EVAL' && key.includes('sofia-proactive-photo-limit')) {
   const queueKey=body[3],now=Number(body[5]),id=body[6],motif=body[7];
   const motifs=(quotas.get(body[4])||[]).filter(x=>x.at>now-21600000);
   const queue=(quotas.get(queueKey)||[]).filter(x=>x.at>now-3600000);
   if(queue.some(x=>x.id===id))return response({result:1});
   if(motif && motifs.some(x=>x.id===motif))return response({result:0});
   if(queue.length>=2)return response({result:0});
   if(motif){motifs.push({id:motif,at:now});quotas.set(body[4],motifs);}
   queue.push({id,at:now});quotas.set(queueKey,queue);return response({result:1});
  }
  if(op==='EVAL' && key.includes('local cached'))return response({result:['acquired','']});
  if(op==='EVAL')return response({result:1});
  throw Error('Unexpected command '+op);
 }
 if(String(endpoint).endsWith('/chat/completions')){
  inputs.push(body);
  const instruction=body.messages[0].content;
  const result=instruction.startsWith('Soll Sofia')?{offerPhoto:decision}:instruction.startsWith('Extrahiere nur Sofias')?{life:narrative,...details}:{action:'new',scene:'Ein Selfie',outfit:''};
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
 const learned=await api.learnSofiaLife('Was machst du gerade?','Ich trinke gerade einen Kaffee im Café. Ich trage einen grünen Pullover mit Jeans, meine Haare sind in einem lockeren Pferdeschwanz.',now);
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
 assert.equal(jobs.filter(Boolean).length,1);
 const explicit=await api.preparePortrait('Mach bitte ein Selfie',null,now);assert.ok(explicit.id);
 assert.equal([...quotas.values()][0].length,1);
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
  if(index===0)assert.ok(data.imageRequest,JSON.stringify({name,data}));else assert.equal(data.imageRequest,undefined);
  index++;
  if(data.imageRequest)assert.match(data.reply||data.context,/Warte kurz, ich zeig’s dir/);
  if(name==='chat' && !data.imageRequest)assert.doesNotMatch(data.reply,/Warte kurz/);
 }
 assert.equal([...quotas.values()][0].length,1);
});
test('image prompts preserve face and master hair color and request ordinary snapshots without subtitles',()=>{
 assert.match(source,/hair COLOR/);assert.match(source,/clearly different, natural head AND body orientation/);
 assert.match(source,/Typical casual PHONE SNAPSHOT/);assert.match(source,/No studio lighting/);
});
test('a recent cafe scene survives the time boundary briefly, then yields to the new slot',async()=>{
 reset();const before=new Date('2026-10-06T11:55Z');const first=await api.getSofiaLife(before);
 db.set(prefix+'life',JSON.stringify({...first,location:'in einem Café in Hamburg',activity:'Kaffee trinken'}));
 const transition=await api.getSofiaLife(new Date('2026-10-06T12:05Z'));
 assert.equal(transition.location,'in einem Café in Hamburg');assert.equal(transition.statusLabel,'in einem Café');
 assert.equal(transition.transitionUntil,'2026-10-06T12:30:00.000Z');
 const after=await api.getSofiaLife(new Date('2026-10-06T12:31Z'));
 assert.notEqual(after.location,transition.location);assert.equal(after.transitionUntil,undefined);
});
test('nighttime and date changes always override carried daytime scenes',async()=>{
 reset();const old=await api.getSofiaLife(new Date('2026-10-06T20:55Z'));
 db.set(prefix+'life',JSON.stringify({...old,location:'an der Alster'}));
 assert.match((await api.getSofiaLife(new Date('2026-10-06T21:05Z'))).location,/Bett/);
 const next=await api.getSofiaLife(new Date('2026-10-07T08:05Z'));
 assert.match(next.location,/Universität/);assert.equal(next.transitionUntil,undefined);
});
test('Text mood and Live-selected mood feed the same photograph context without changing identity',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');
 await api.getSofiaLife(now,'amüsiert');
 const text=await api.preparePortrait('Selfie',null,now);
 assert.equal(JSON.parse(db.get(prefix+'request:'+text.id)).mood,'amüsiert');
 const live=await api.preparePortrait('Selfie',null,now,'ernst');
 assert.equal(JSON.parse(db.get(prefix+'request:'+live.id)).mood,'ernst');
 assert.match(api.photoExpression('amüsiert'),/smile/);assert.match(api.photoExpression('ernst'),/no forced smile/);
 assert.equal((await api.getSofiaLife(now,'invalid')).mood,'ernst');
});
test('named Hamburg places and labels describe the same authoritative location',()=>{
 const places=new Set();
 for(let day=1;day<15;day++){
  const life=api.defaultSofiaLife(new Date(`2026-10-${String(day).padStart(2,'0')}T13:00Z`));
  places.add(life.location);assert.equal(life.statusLabel,api.lifeStatusLabel(life.location));
 }
 assert.ok(places.has('an der Alster'));assert.ok(places.has('an den Landungsbrücken'));
 assert.equal(api.portraitPreparationReply(new SyntaxError('raw provider JSON details')),api.PORTRAIT_FAILURE_REPLY);
 assert.match(api.portraitPreparationReply(new Error('Für diese Variante brauche ich zuerst ein Bild von mir.')),/zuerst/);
});
test('a delayed life extraction crossing bedtime cannot restore a stale outdoor scene',async()=>{
 reset();const now=new Date('2026-10-06T20:59:59Z');
 const originalClock=Date.now,normal=globalThis.fetch;let elapsed=0;
 Date.now=()=>100000+elapsed;
 narrative={location:'an der Alster',activity:'spazieren'};
 globalThis.fetch=async(e,o)=>{if(String(e).endsWith('/chat/completions'))elapsed=2000;return normal(e,o);};
 try {
  const life=await api.learnSofiaLife('Wo bist du gerade?','Ich spaziere an der Alster.',now);
  assert.match(life.location,/Bett/);assert.ok(life.key.endsWith(':sleep'));
 } finally {Date.now=originalClock;globalThis.fetch=normal;}
});
test('simultaneous cold starts converge on one revision and a stale editor gets a conflict',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');
 const states=await Promise.all([api.getSofiaLife(now),api.getSofiaLife(now),api.getSofiaLife(now)]);
 assert.ok(states.every(s=>s.revision===1));
 const updated=await api.editCharacterState({revision:1,field:'location',value:'zu Hause in Hamburg'},now);
 assert.equal(updated.revision,2);
 await assert.rejects(api.editCharacterState({revision:1,field:'location',value:'an der Alster'},now),/character_conflict/);
 assert.equal((await api.getSofiaLife(now)).location,'zu Hause in Hamburg');
});
test('late classification cannot overwrite a newer corrected state in the same time slot',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');const first=await api.getSofiaLife(now);
 const normal=globalThis.fetch;let release;
 globalThis.fetch=async(e,o)=>String(e).endsWith('/chat/completions')?new Promise(resolve=>release=resolve):normal(e,o);
 try {
  const pending=api.learnSofiaLife('Wo bist du?','Ich sitze im Café.',now,undefined,first.revision);
  await new Promise(setImmediate);
  await api.editCharacterState({revision:first.revision,field:'location',value:'zu Hause in Hamburg'},now);
  release(response({choices:[{message:{content:JSON.stringify({life:{location:'in einem Café'}})}}]}));
  assert.equal((await pending).location,'zu Hause in Hamburg');
 } finally {globalThis.fetch=normal;}
});
test('evidenced own preferences persist across dates; user guesses and quotations are not character facts',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');
 details={preferences:[{topic:'kaffee',value:'Sofia mag Cappuccino',evidence:'Ich mag Cappuccino'}],threads:[{topic:'arbeit',text:'Der Nutzer hat Stress',status:'open',evidence:'Mein Arbeitstag war stressig'}]};
 const learned=await api.learnSofiaLife('Mein Arbeitstag war stressig.','Ich mag Cappuccino.',now);
 assert.equal(learned.preferences[0].topic,'kaffee');assert.equal(learned.threads[0].origin,'user_statement');
 assert.equal(db.get('sofia:main:longterm'),undefined);
 const tomorrow=await api.getSofiaLife(new Date('2026-10-07T12:15Z'));
 assert.equal(tomorrow.preferences[0].value,'Sofia mag Cappuccino');
 const rejected=api.mergeCharacterDetails({...tomorrow,preferences:[],threads:[]},details,'Vielleicht: Mein Arbeitstag war stressig.','Du sagst „Ich mag Cappuccino“.',now);
 assert.equal(rejected.preferences.length,0);assert.equal(rejected.threads.length,0);
});
test('a known opinion needs a reason to evolve; corrected or deleted preferences are protected',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');
 let state=await api.getSofiaLife(now);
 const p={topic:'kaffee',value:'Espresso',evidence:'Ich mag Espresso'};
 state=api.mergeCharacterDetails(state,{preferences:[p]},'Was magst du?','Ich mag Espresso.',now);
 const changed={...p,value:'Cappuccino',evidence:'Ich mag Cappuccino'};
 assert.equal(api.mergeCharacterDetails(state,{preferences:[changed]},'','Ich mag Cappuccino.',now).preferences[0].value,'Espresso');
 assert.equal(api.mergeCharacterDetails(state,{preferences:[{...changed,reason:'Neuer Geschmack'}]},'','Ich mag Cappuccino.',now).preferences[0].previousValue,'Espresso');
 let corrected=await api.editCharacterState({revision:state.revision,field:'preference',topic:'kaffee',value:'Tee'},now);
 assert.equal(api.mergeCharacterDetails(corrected,{preferences:[changed]},'','Ich mag Cappuccino.',now).preferences[0].value,'Tee');
 corrected=await api.editCharacterState({revision:corrected.revision,field:'preference',topic:'kaffee',value:''},now);
 assert.equal(api.mergeCharacterDetails(corrected,{preferences:[changed]},'','Ich mag Cappuccino.',now).preferences[0].origin,'dismissed');
});
test('closed and expired threads stay out of context and dismissed threads are not reopened casually',()=>{
 const now=new Date(),future=new Date(now.getTime()+86400000).toISOString();
 const state={preferences:[],mood:'entspannt',threads:[{topic:'arbeit',text:'Arbeitsstress',status:'open',expiresAt:future},{topic:'prüfung',text:'Prüfung fertig',status:'resolved',expiresAt:future},{topic:'alt',text:'Vergangenes',status:'open',expiresAt:new Date(now.getTime()-1).toISOString()}]};
 const context=api.characterContext(state,'Mein Arbeitstag');assert.match(context,/Arbeitsstress/);assert.doesNotMatch(context,/Prüfung fertig|Vergangenes/);
 state.threads[0].status='dismissed';
 const reopened=api.mergeCharacterDetails(state,{threads:[{topic:'arbeit',text:'Arbeitsstress',status:'open',evidence:'Mein Arbeitstag'}]},'Mein Arbeitstag','',now);
 assert.equal(reopened.threads.find(t=>t.topic==='arbeit').status,'dismissed');
});
test('automatic mood changes need a repeated proposal and ten minutes; manual mode wins until released',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');let state=await api.getSofiaLife(now);
 state=api.proposeCharacterMood(state,'amüsiert',now);assert.equal(state.mood,'entspannt');
 assert.equal(api.proposeCharacterMood(state,'amüsiert',new Date(now.getTime()+1000)).mood,'entspannt');
 assert.equal(api.proposeCharacterMood(state,'amüsiert',new Date(now.getTime()+11*60000)).mood,'amüsiert');
 state=await api.editCharacterState({revision:state.revision,field:'mood',value:'ernst'},now);
 assert.equal(api.proposeCharacterMood(state,'amüsiert',new Date(now.getTime()+3600000)).mood,'ernst');
 state=await api.editCharacterState({revision:state.revision,field:'mood',value:'auto'},now);assert.equal(state.moodMode,'auto');
});
test('day story preserves current-day stations and resets next date without losing preferences',async()=>{
 reset();const first=await api.getSofiaLife(new Date('2026-10-06T08:00Z'));
 const noon=await api.getSofiaLife(new Date('2026-10-06T10:40Z'));
 assert.equal(noon.dayStory[0].location,first.location);assert.equal(noon.dayStory.at(-1).location,noon.location);
 const next=await api.getSofiaLife(new Date('2026-10-07T08:00Z'));assert.equal(next.dayStory.length,1);
});
test('memory API separates user memories from character state and validates correction versions',async()=>{
 reset();const now=new Date();let state=await api.getSofiaLife(now);
 const code=(await readFile(new URL('../api/memory.js',import.meta.url),'utf8')).replace('../lib/character-image.js',url(source)).replace('../lib/memory-view.js',new URL('../lib/memory-view.js',import.meta.url).href);
 const handler=(await import(url(code))).default;
 const session=crypto.createHmac('sha256','test-only').update('sofia-authorized-session-v1').digest('hex');
 db.set('sofia:main:longterm',JSON.stringify([{text:'Der Nutzer mag Tee.',category:'Vorlieben'}]));
 const invoke=async(method,body,cookie='sofia_session='+session)=>{let status,data;await handler({method,body,headers:{cookie}}, {setHeader(){},status(n){status=n;return this;},json(d){data=d;return d;}});return {status,data};};
 const before=await invoke('GET');assert.equal(before.data.items[0].text,'Der Nutzer mag Tee.');assert.equal(before.data.character.revision,state.revision);
 const item=before.data.items[0];assert.equal(item.owner,'user');assert.equal(typeof item.id,'string');
 assert.equal((await invoke('PUT',{old_memory:item.text,new_memory:'Der Nutzer mag Kaffee.',memoryId:'stale'})).status,409);
 assert.equal((await invoke('DELETE',{memory:item.text,memoryId:'stale'})).status,409);
 assert.equal(JSON.parse(db.get('sofia:main:longterm'))[0].text,item.text);
 const changed=await invoke('PUT',{old_memory:item.text,new_memory:'Der Nutzer mag Tee.',category:'Vorlieben',memoryId:item.id});assert.equal(changed.status,200);
 assert.notEqual((await invoke('GET')).data.items[0].id,item.id);
 const edit=await invoke('PUT',{scope:'character',revision:state.revision,field:'preference',topic:'getränk',value:'Sofia mag Kaffee.'});assert.equal(edit.status,200);
 const conflict=await invoke('PUT',{scope:'character',revision:state.revision,field:'preference',topic:'getränk',value:'Tee'});assert.equal(conflict.status,409);
 assert.equal((await invoke('GET')).data.items[0].text,'Der Nutzer mag Tee.');
 assert.equal((await invoke('PUT',{scope:'character',revision:edit.data.character.revision,field:'preference',topic:'x',value:'y'},'')).status,401);
});

test('shared dialogue carries topic, pending question and pause guidance',()=>{
 const now=new Date('2026-10-06T12:00Z');let life=api.defaultSofiaLife(now);
 life=api.updateDialogue(life,'Was liest du?','Ich lese einen Roman. Was liest du gern?',now);
 life=api.updateDialogue(life,'Und danach?','Danach gehe ich spazieren.',new Date(now.getTime()+60000));
 assert.equal(life.dialogue.topic,'Was liest du?');assert.equal(life.dialogue.questions.length,1);
 assert.match(api.lifeContext(life,'Und danach?'),/LETZTER GEMEINSAMER/);
 assert.match(api.initiativeContext(life,'Hallo',new Date(now.getTime()+10800000)),/WIEDERAUFNAHME NACH PAUSE/);
});
test('settings persist across dates, disable only proactive photos, and validate enums',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z'),first=await api.getSofiaLife(now);
 const settings={initiative:'quiet',photos:false,replyLength:'short'};
 const life=await api.editCharacterState({field:'settings',value:settings,revision:first.revision},now);
 assert.deepEqual((await api.getSofiaLife(new Date('2026-10-07T12:15Z'))).settings,settings);
 assert.equal(await api.prepareProactivePortrait('Wo bist du?',life,'',now),null);
 assert.match(api.initiativeContext(life,'Wie geht es dir?',now),/Zurückhaltend/);
 assert.ok(await api.preparePortrait('Ein Selfie bitte',null,now));
});
test('habits require repetition, interests retain progress and preferences retain history',()=>{
 const now=new Date('2026-10-06T12:00Z'),base=api.defaultSofiaLife(now);
 const message='Bitte antworte kurz.',reply='Ich lese gerade einen Roman. Ich mag Kaffee.';
 const decision={habits:[{topic:'länge',value:'kurz',evidence:message}],interests:[{topic:'roman',description:'Einen Roman lesen',progress:'Kapitel 2',evidence:'Ich lese gerade einen Roman.'}],preferences:[{topic:'kaffee',value:'Kaffee',evidence:'Ich mag Kaffee.'}]};
 const first=api.mergeCharacterDetails(base,decision,message,reply,now);assert.equal(first.habits[0].count,1);assert.equal(first.interests[0].progress,'Kapitel 2');
 const second=api.mergeCharacterDetails(first,decision,message,reply,new Date(now.getTime()+60000));assert.equal(second.habits[0].count,2);assert.equal(second.preferences[0].history.length,1);
});
test('same proactive motif is suppressed but another motif fits rolling quota',async()=>{
 reset();const now=new Date('2026-10-06T12:00Z');
 assert.equal(await api.reserveProactivePhoto('one',now,'cafe-selfie'),true);
 assert.equal(await api.reserveProactivePhoto('two',now,'cafe-selfie'),false);
 assert.equal(await api.reserveProactivePhoto('three',now,'alster-view'),true);
 assert.equal(await api.reserveProactivePhoto('four',now,'home'),false);
});

test('conversation reference distinguishes corrections, tasks, photos and ambiguous repeats',()=>{
 const now=new Date('2026-10-06T12:00Z');const life=api.updateDialogue(api.defaultSofiaLife(now),'Was liest du?','Ich lese einen Roman.',now);
 assert.equal(api.conversationReference(life,'Nein, ich meinte deinen Abend.',now).correction,true);
 assert.equal(api.conversationReference(life,'Ändere das in der Aufgabe',now).type,'task');
 assert.equal(api.conversationReference(life,'Das Foto nochmal',now).type,'photo');
 assert.equal(api.conversationReference(life,'Noch einmal',now).type,'ambiguous');
 assert.equal(api.conversationReference(life,'Und danach?',new Date(now.getTime()+86400000)).type,'none');
});
test('answered and skipped questions close without repeating pending state',()=>{
 const now=new Date('2026-10-06T12:00Z'),first=api.updateDialogue(api.defaultSofiaLife(now),'Hallo','Was liest du gern?',now);
 const answered=api.updateDialogue(first,'Ich lese Krimis.','Krimis mag ich auch.',now);assert.equal(answered.dialogue.questions[0].status,'answered');assert.equal(answered.dialogue.pendingQuestion,null);
 const skipped=api.updateDialogue(first,'Andere Frage: Was machst du?','Ich bin im Café.',now);assert.equal(skipped.dialogue.questions[0].status,'skipped');
 const repeated=api.updateDialogue(first,'Erzähl weiter','Was liest du gern?',now);assert.equal(repeated.dialogue.questions.length,1);assert.equal(repeated.dialogue.pendingQuestion,null);
});
test('current listening and brief requests override initiative and suppress proactive photos',async()=>{
 reset();const now=new Date('2026-10-06T12:00Z'),life=await api.getSofiaLife(now);
 assert.equal(api.conversationIntent('Hör mir einfach zu'),'listening');assert.equal(api.conversationIntent('Nur kurz: Wo bist du?'),'brief');
 assert.match(api.initiativeContext(life,'Ich möchte nur erzählen',now),/ZUHÖREN/);
 assert.equal(await api.prepareProactivePortrait('Nur kurz: Wo bist du?',life,'',now),null);
 assert.equal(await api.prepareProactivePortrait('Was machst du? Ich muss los',life,'',now),null);
});
test('weekly frame honors Hamburg date, weekend and bedtime',()=>{
 const night=api.defaultSofiaLife(new Date('2026-10-06T22:30Z'));assert.equal(night.weekFrame.day,'Mittwoch');assert.match(night.location,/Bett/);
 const saturday=api.defaultSofiaLife(new Date('2026-10-10T08:00Z'));assert.match(saturday.weekFrame.frame,/Freizeit/);assert.doesNotMatch(saturday.location,/Universität/);
 assert.match(api.defaultSofiaLife(new Date('2026-10-07T08:00Z')).activity,/Studienprojekt/);
});
test('own plans require exact own evidence and grounded reason for progress',async()=>{
 reset();const now=new Date('2026-10-06T12:00Z'),base=await api.getSofiaLife(now);
 const create={plans:[{topic:'roman',text:'Roman weiterlesen',status:'planned',evidence:'Ich möchte meinen Roman weiterlesen.'}]};
 const first=api.mergeCharacterDetails(base,create,'Was möchtest du machen?','Ich möchte meinen Roman weiterlesen.',now);assert.equal(first.plans.length,1);assert.equal(first.development.length,1);
 const unsupported=api.mergeCharacterDetails(first,{plans:[{topic:'roman',text:'Roman fertig',status:'completed',evidence:'Ich habe den Roman fertig gelesen.'}]},'Hallo','Ich habe den Roman fertig gelesen.',now);assert.equal(unsupported.plans[0].status,'planned');
 const complete=api.mergeCharacterDetails(first,{plans:[{topic:'roman',text:'Roman fertig',status:'completed',reason:'Die letzten Kapitel gelesen',evidence:'Ich habe den Roman fertig gelesen.'}]},'Und dein Buch?','Ich habe den Roman fertig gelesen.',new Date(now.getTime()+60000));assert.equal(complete.plans[0].status,'completed');assert.equal(complete.plans[0].history.length,2);
 assert.equal(api.mergeCharacterDetails(base,create,'Ich lese einen Roman.','Du möchtest weiterlesen.',now).plans.length,0);
});
test('plans persist across days without automatic completion and manual removal remains protected',async()=>{
 reset();const now=new Date('2026-10-06T12:00Z'),base=await api.getSofiaLife(now);db.set(prefix+'life',JSON.stringify({...base,plans:[{topic:'buch',text:'Lesen',status:'active'}]}));
 const tomorrow=await api.getSofiaLife(new Date('2026-10-07T12:00Z'));assert.equal(tomorrow.plans[0].status,'active');
 const removed=await api.editCharacterState({revision:tomorrow.revision,field:'plan',topic:'buch',value:''},new Date('2026-10-07T12:00Z'));assert.equal(removed.plans[0].dismissed,true);
});
test('shared phrases require actual repeated user use and reset independently',async()=>{
 reset();const now=new Date('2026-10-06T12:00Z'),base=await api.getSofiaLife(now),decision={sharedPhrases:[{text:'Team Kaffeepause',evidence:'Team Kaffeepause!'}]};
 const first=api.mergeCharacterDetails(base,decision,'Team Kaffeepause!','Genau.',now),second=api.mergeCharacterDetails(first,decision,'Team Kaffeepause!','Genau.',new Date(now.getTime()+60000));assert.equal(second.sharedPhrases[0].count,2);
 assert.equal(api.mergeCharacterDetails(base,decision,'Hallo','Team Kaffeepause!',now).sharedPhrases.length,0);
 db.set(prefix+'life',JSON.stringify(second));const saved=await api.editCharacterState({revision:second.revision,field:'sharedPhrases',value:'reset'},now);assert.equal(saved.sharedPhrases.length,0);
});

test('correction cannot overwrite unrelated character preferences or plans',()=>{
 const now=new Date('2026-10-06T12:00Z');const base={...api.defaultSofiaLife(now),preferences:[{topic:'kaffee',value:'Kaffee'},{topic:'musik',value:'Jazz'}],dialogue:{topic:'Dein Kaffee'}};
 const next=api.mergeCharacterDetails(base,{preferences:[{topic:'kaffee',value:'Espresso',evidence:'Ich mag Espresso.',reason:'Lieber kräftig'},{topic:'musik',value:'Rock',evidence:'Ich mag Rock.',reason:'Neue Musik'}]},'Nein, ich meinte deinen Kaffee.','Ich mag Espresso. Ich mag Rock.',now);
 assert.equal(next.preferences.find(x=>x.topic==='kaffee').value,'Espresso');assert.equal(next.preferences.find(x=>x.topic==='musik').value,'Jazz');
});


test('short follow-ups preserve topic and answered short replies close the pending question',()=>{
 const now=new Date('2026-10-07T12:00:00Z');
 let life=api.updateDialogue({threads:[]},'Dein Studium','Ich lerne heute. Und mit wem bist du unterwegs?',now);
 const follow=api.updateDialogue(life,'Warum?','Weil morgen eine Prüfung ist.',new Date(now.getTime()+1000));
 assert.equal(follow.dialogue.topic,life.dialogue.topic);
 assert.equal(follow.dialogue.pendingQuestion,life.dialogue.pendingQuestion);
 life=api.updateDialogue(life,'Mit Freunden.','Das klingt schön.',new Date(now.getTime()+2000));
 assert.equal(life.dialogue.pendingQuestion,null);
 assert.equal(life.dialogue.questions.at(-1).status,'answered');
});
test('topic changes and pauses do not resurrect pending questions',()=>{
 const now=new Date('2026-10-07T12:00:00Z');
 const life=api.updateDialogue({threads:[]},'Dein Studium','Was studierst du?',now);
 assert.equal(api.conversationContinuity(life,'Andere Frage: Was kochst du?',now).topic,null);
 const later=api.conversationContinuity(life,'Hallo',new Date(now.getTime()+3*3600000));
 assert.equal(later.paused,true);assert.equal(later.pendingQuestion,null);
 assert.equal(api.conversationContinuity(life,'Warum?',new Date(now.getTime()+25*3600000)).fresh,false);
});
test('corrections are bounded temporary context and future timestamps are ignored',()=>{
 const now=new Date('2026-10-07T12:00:00Z');
 let life=api.updateDialogue({threads:[]},'Mein Buch','Interessant.',now);
 life=api.updateDialogue(life,'Nein, ich meinte den Film.','Den Film also.',new Date(now.getTime()+1000));
 assert.equal(life.dialogue.corrections.length,1);
 life.dialogue.corrections.push({message:'future',at:'2030-01-01T00:00:00Z'});
 assert.equal(api.conversationContinuity(life,'Und du?',new Date(now.getTime()+2000)).corrections.length,1);
 assert.equal(life.preferences,undefined);
});
test('observed activity keeps its start and day changes discard transitions',()=>{
 const now=new Date('2026-10-07T12:00:00Z');
 const old={key:'2026-10-07:cafe',location:'Café',activity:'Kaffee trinken',updatedAt:now.toISOString()};
 const same=api.activityContinuity(old,{...old},new Date(now.getTime()+60000));
 assert.equal(same.activityState.since,old.updatedAt);
 const next=api.activityContinuity(same,{...same,location:'zu Hause',activity:'lesen'},new Date(now.getTime()+120000));
 assert.equal(next.transition.from,'Café');assert.equal(next.transition.to,'zu Hause');
 const day=api.activityContinuity(next,{...next,key:'2026-10-08:sleep',location:'im Bett'},new Date('2026-10-08T00:00:00Z'));
 assert.equal(day.transition,null);
});
test('framing varies for new photos while variants preserve their source',()=>{
 const first=api.snapshotStyle(null),second=api.snapshotStyle({snapshotStyle:first});
 assert.notEqual(first,second);
 assert.equal(api.snapshotStyle({snapshotStyle:first},true),first);
 assert.equal(api.snapshotStyle({},true),null);
});
test('expired mood evidence cannot cause an immediate mood jump',()=>{
 const now=new Date('2026-10-07T12:00:00Z');
 const life={mood:'neutral',moodMode:'auto',moodChangedAt:'2026-10-07T10:00:00Z',moodCandidate:{value:'amüsiert',count:3,at:'2026-10-07T10:00:00Z'}};
 const next=api.proposeCharacterMood(life,'amüsiert',now);
 assert.equal(next.mood,'neutral');assert.equal(next.moodCandidate.count,1);
});


test('shared expression respects manual mood and Hamburg night energy',()=>{
 const life={mood:'ernst',moodMode:'manual'};
 assert.match(api.expressionContext(life,new Date('2026-10-08T23:00Z')).energy,/ruhig/);
 assert.match(api.expressionContext(life).source,/ausdrücklich/);
 assert.match(api.expressionContext({mood:'entspannt'},new Date('2026-10-08T23:00Z')).energy,/leiser/);
 assert.match(api.expressionContext({mood:'entspannt'},new Date('2026-10-08T10:00Z')).energy,/lebendig/);
});
test('pose history avoids last three poses without changing explicit variants',()=>{
 const reference={photoPose:{index:0,head:'original'}};
 const recent=[0,1,2].map(index=>({photoPose:{index}}));
 assert.equal(api.photoPose(reference,false,'entspannt',recent).index,3);
 assert.equal(api.photoPose(reference,true,'ernst',recent),reference.photoPose);
 assert.doesNotMatch(api.photoPose(null,false,'ernst',recent).expression,/smile/);
});
test('conversation context carries recent own phrases and only relevant preferences',()=>{
 const life={dialogue:{recentTurns:[{assistant:'Ich mag das ruhige Café.'}]},preferences:[{topic:'kaffee',value:'kräftiger Kaffee'},{topic:'reise',value:'Berge'}]};
 const context=api.conversationStyleContext(life,'Wie trinkst du Kaffee?');
 assert.match(context,/Ich mag das ruhige Café/);assert.match(context,/kräftiger Kaffee/);assert.doesNotMatch(context,/Berge/);
 assert.match(context,/keine gemeinsam erlebten Ereignisse erfinden/);
});


test('learned situation expires, while permanent character preferences survive',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');narrative={location:'im Café',activity:'Kaffee trinken'};
 const learned=await api.learnSofiaLife('Wo bist du?','Ich trinke gerade Kaffee im Café.',now);
 assert.equal(learned.situation.location,'im Café');assert.equal(learned.situation.sources.location.source,'conversation');
 const expired=await api.getSofiaLife(new Date(+now+91*60000));assert.notEqual(expired.location,'im Café');assert.equal(expired.situation.location,expired.location);
});
test('classifier cannot introduce an outfit or hairstyle absent from the actual reply',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z'),initial=await api.getSofiaLife(now);
 narrative={location:'im Café',activity:'Kaffee trinken',outfit:'rotes Kleid',hairstyle:'strenger Dutt'};
 const learned=await api.learnSofiaLife('Wo bist du?','Ich trinke gerade Kaffee im Café.',now);
 assert.equal(learned.outfit,initial.outfit);assert.equal(learned.hairstyle,initial.hairstyle);
});
test('explicit conversation correction is shared with the next photo and status',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');await api.getSofiaLife(now);
 details={corrections:[{field:'location',value:'auf dem Sofa zu Hause',evidence:'Du bist gerade auf dem Sofa zu Hause'},{field:'activity',value:'auf dem Sofa sitzen',evidence:'auf dem Sofa sitzen'}]};
 const learned=await api.learnSofiaLife('Korrektur: Du bist gerade auf dem Sofa zu Hause. Du solltest auf dem Sofa sitzen.','Stimmt, ich sitze auf dem Sofa zu Hause.',now);
 assert.equal(learned.location,'auf dem Sofa zu Hause');assert.equal(learned.situation.sources.location.source,'correction');assert.match(learned.situation.posture,/sitzend/);
 const job=await api.preparePortrait('Selfie',null,now),request=JSON.parse(db.get(prefix+'request:'+job.id));assert.equal(request.life.location,learned.location);assert.equal(request.life.situation.revision,learned.revision);
});
test('manual mood persists while a sensitive turn uses a calm response tone',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z');await api.getSofiaLife(now,'amüsiert');
 const learned=await api.learnSofiaLife('Ich bin frustriert.','Das ist gerade ärgerlich.',now,'ernst');
 assert.equal(learned.mood,'amüsiert');assert.equal(learned.responseTone,'calm');assert.match(api.expressionContext(learned,now).energy,/ruhig/);
});

test('photo-only revision change permits own-contact continuity but a newer user turn wins',async()=>{
 reset();const now=new Date('2026-10-06T12:15Z'),previous=await api.getSofiaLife(now);
 db.set(prefix+'life',JSON.stringify({...previous,revision:previous.revision+1,lastPhoto:{id:'photo-only'}}));
 await api.recordOwnContact(previous,'Ein kleiner Gruß.','contact',now);
 const after=JSON.parse(db.get(prefix+'life'));assert.equal(after.dialogue.contactId,'contact');assert.equal(after.lastPhoto.id,'photo-only');
 db.set(prefix+'life',JSON.stringify({...after,revision:after.revision+1,dialogue:{...after.dialogue,lastUser:'Neuer Nutzerturn',at:new Date(+now+1000).toISOString()}}));
 await api.recordOwnContact(after,'Eine verspätete Nachricht.','stale',now);
 assert.equal(JSON.parse(db.get(prefix+'life')).dialogue.lastUser,'Neuer Nutzerturn');assert.notEqual(JSON.parse(db.get(prefix+'life')).dialogue.contactId,'stale');
});

test('present correction is authoritative before the reply and shared by status and next photo',async()=>{
 reset();const now=new Date('2026-10-08T12:15Z'),before=await api.getSofiaLife(now);
 const corrected=await api.synchronizeSituation('Du bist doch gerade in der Uni. Schick mir ein Selfie.',now);
 assert.equal(corrected.location,'in der Uni');assert.match(corrected.activity,/Lernen/);
 assert.equal(corrected.situation.location,corrected.location);assert.equal(corrected.statusLabel,'in der Uni');
 assert.equal(corrected.situation.sources.location.source,'correction');
 assert.equal(corrected.outfit,before.outfit);assert.equal(corrected.hairstyle,before.hairstyle);
 const job=await api.preparePortrait('Ein Selfie bitte',null,now),request=JSON.parse(db.get(prefix+'request:'+job.id));
 assert.equal(request.life.location,corrected.location);assert.equal(request.life.situation.posture,'sitzend');
 assert.match(api.lifeContext(corrected,'Wo bist du?'),/in der Uni/);
});
test('corrections are conservative for negation, history, hypothetical scenes and multiple places',()=>{
 for(const text of ['Du bist doch nicht in der Uni.','Du warst doch gestern in der Uni.','Angenommen, du bist doch gerade in der Uni.','Du bist doch in der Uni oder im Café.','Du bist doch in der Uni und im Café.','Sie sagte: "Du bist doch in der Uni."','Du bist doch vielleicht in der Uni.'])assert.equal(api.currentSituationCorrection(text),null,text);
 assert.equal(api.currentSituationCorrection('Korrektur: Du liegst gerade im Bett.').location,'im Bett');
 assert.equal(api.currentSituationCorrection('Nein, du sitzt gerade auf dem Sofa zu Hause.').location,'auf dem Sofa zu Hause');
});
test('night corrections cannot send Sofia to university and ordinary talk does not alter her scene',async()=>{
 reset();const now=new Date('2026-10-08T23:00Z');const life=await api.synchronizeSituation('Du bist doch gerade in der Uni.',now);
 assert.match(life.location,/Bett/);
 assert.equal(api.currentSituationCorrection('Ich bin gerade in der Uni.'),null);
 assert.equal(api.currentSituationCorrection('Wie würde ein Foto in der Uni aussehen?'),null);
});
test('preflight corrections expire and do not overwrite permanent identity or preferences',async()=>{
 reset();const now=new Date('2026-10-08T12:15Z');await api.synchronizeSituation('Du liegst doch gerade im Bett.',now);
 const soon=await api.getSofiaLife(new Date(+now+60000));assert.match(soon.location,/Bett/);assert.match(soon.situation.posture,/liegend/);
 const later=await api.getSofiaLife(new Date(+now+91*60000));assert.doesNotMatch(later.location,/Bett/);assert.equal(later.situation.location,later.location);
});
test('a contradictory classifier cannot undo an explicit correction from the same turn',async()=>{
 reset();const now=new Date('2026-10-08T12:15Z'),message='Du bist doch gerade in der Uni.';
 await api.synchronizeSituation(message,now);narrative={location:'im Café',activity:'Kaffee trinken'};
 const learned=await api.learnSofiaLife(message,'Ich trinke gerade Kaffee im Café.',now);
 assert.equal(learned.location,'in der Uni');assert.equal(learned.situation.sources.location.source,'correction');
});
test('conversation moves vary without turning every answer into a question',()=>{
 const now=new Date('2026-10-08T12:00Z');let life=api.defaultSofiaLife(now);
 const moves=[];
 for(let i=0;i<4;i++){const at=new Date(+now+i*60000),move=api.conversationMove(life,'Erzähl mir etwas über deinen Alltag.',at);moves.push(move.kind);life=api.updateDialogue(life,'Erzähl mir etwas über deinen Alltag.',move.question?'Und wie ist dein Tag?':'Ich mag solche kleinen Pausen.',at);}
 assert.ok(moves.includes('opinion'));assert.ok(moves.includes('reaction'));assert.ok(moves.includes('question'));
 assert.notEqual(moves[0],moves[1]);assert.equal(moves.filter(x=>x==='question').length,1);
});
test('listening, short replies, sensitive turns and quiet settings suppress voluntary questions',()=>{
 const now=new Date('2026-10-08T12:00Z'),life=api.defaultSofiaLife(now);
 for(const text of ['Hör mir einfach zu','Nur kurz: Wo bist du?','Ich bin traurig','Gute Nacht','Okay.'])assert.deepEqual(api.conversationMove(life,text,now),{kind:'respond',question:false,thread:null});
 assert.equal(api.conversationMove({...life,settings:{initiative:'quiet'}},'Was denkst du?',now).kind,'respond');
 assert.match(api.lifeContext(life,'Wie geht es dir?'),/GESPRÄCHSIMPULS DIESES TURNS/);
});
test('only relevant open, unasked threads can be brought back into conversation',()=>{
 const now=new Date('2026-10-08T12:00Z'),thread={topic:'prüfung',text:'Deine Prüfung am Freitag',status:'open',expiresAt:new Date(+now+86400000).toISOString()};
 const life={...api.defaultSofiaLife(now),threads:[thread]};
 assert.equal(api.conversationMove(life,'Meine Prüfung beschäftigt mich.',now).kind,'reference');
 assert.equal(api.conversationMove(life,'Was trinkst du?',now).thread,null);
 assert.equal(api.conversationMove({...life,threads:[{...thread,status:'resolved'}]},'Meine Prüfung',now).thread,null);
 assert.equal(api.conversationMove({...life,threads:[{...thread,lastAskedAt:now.toISOString()}]},'Meine Prüfung',now).thread,null);
 assert.equal(api.conversationMove({...life,dialogue:{at:now.toISOString(),closedTopics:[{topic:'prüfung'}]}},'Meine Prüfung',now).thread,null);
});


test('development retains stable titles and records only evidenced changes with reasons',()=>{
 const now=new Date('2026-10-08T12:00Z'),base={...api.defaultSofiaLife(now),interests:[{topic:'roman',description:'Der alte Roman',progress:'Kapitel 2',status:'active'}],plans:[{topic:'lesen',text:'Den Roman weiterlesen',status:'active',progress:'Kapitel 2'}]};
 const reply='Ich habe im Roman weitergelesen und bin bei Kapitel 3.';
 const changed=api.mergeCharacterDetails(base,{interests:[{topic:'roman',description:'Ein neuer Roman',progress:'Kapitel 3',reason:'Weitergelesen',evidence:reply}],plans:[{topic:'lesen',text:'Neues Buch',status:'active',progress:'Kapitel 3',reason:'Weitergelesen',evidence:reply}]},'Und dein Roman?',reply,now);
 assert.equal(changed.interests[0].description,'Der alte Roman');assert.equal(changed.plans[0].text,'Den Roman weiterlesen');assert.equal(changed.plans[0].progress,'Kapitel 3');
 assert.equal(changed.interests[0].history[0].reason,'Weitergelesen');
 const paused=api.mergeCharacterDetails(changed,{interests:[{topic:'roman',description:'Roman',status:'paused',reason:'Gerade zu wenig Zeit',evidence:'Ich pausiere meinen Roman gerade.'}]},'Wie läuft es?','Ich pausiere meinen Roman gerade.',now);
 assert.equal(paused.interests[0].status,'paused');assert.equal(paused.interests[0].progress,'Kapitel 3');
 const full={...base,interests:[1,2,3].map(n=>({topic:'i'+n,description:'Buch '+n,status:'active'}))};
 assert.equal(api.mergeCharacterDetails(full,{interests:[{topic:'neues',description:'Ein weiteres Buch',evidence:'Ich lese ein weiteres Buch.'}]},'Hallo','Ich lese ein weiteres Buch.',now).interests.length,3);
});
test('personal event dates use Hamburg day and reject ungrounded, ambiguous and invalid dates',()=>{
 const now=new Date('2026-10-08T22:30Z');
 assert.equal(api.conversationEventDate('morgen','Meine Prüfung ist morgen.',now),'2026-10-10');
 assert.equal(api.conversationEventDate('morgen','Meine Prüfung ist übermorgen.',now),null);
 assert.equal(api.conversationEventDate('übermorgen','Meine Prüfung ist übermorgen.',now),'2026-10-11');
 assert.equal(api.conversationEventDate('31.02.2026','Ich habe am 31.02.2026 eine Prüfung.',now),null);
 assert.equal(api.conversationEventDate('morgen','Vielleicht habe ich morgen eine Prüfung.',now),null);
 assert.equal(api.conversationEventDate('10.10.2026','Meine Prüfung ist am 10.10.2026.',now),'2026-10-10');
});
test('dated references are sparing and never revive resolved, closed or recently asked events',()=>{
 const now=new Date('2026-10-08T12:00Z'),thread={topic:'prüfung',text:'Deine Prüfung',status:'open',eventDate:'2026-10-08',expiresAt:'2026-10-12T12:00:00Z'},life={...api.defaultSofiaLife(now),threads:[thread]};
 assert.equal(api.personalEventReferences(life,'Hey, wie geht es dir?',now).length,1);
 for(const row of [{...thread,status:'resolved'},{...thread,lastAskedAt:now.toISOString()},{...thread,lastReferencedAt:now.toISOString()},{...thread,eventDate:'2026-10-05'}])assert.equal(api.personalEventReferences({...life,threads:[row]},'Hey, wie geht es dir?',now).length,0);
 assert.equal(api.personalEventReferences(life,'Nur kurz: Wie geht es dir?',now).length,0);
 assert.equal(api.personalEventReferences({...life,dialogue:{at:now.toISOString(),closedTopics:['prüfung']}},'Hey, wie geht es dir?',now).length,0);
});
test('forget uses CAS, removes payload and development, survives day change and blocks re-extraction',async()=>{
 reset();const now=new Date('2026-10-08T12:00Z'),base=await api.getSofiaLife(now);
 db.set(prefix+'life',JSON.stringify({...base,threads:[{topic:'prüfung',text:'Private Prüfung am Freitag',evidence:'Morgen ist meine Prüfung',status:'open',expiresAt:'2026-10-12T12:00:00Z'}],development:[{topic:'prüfung',text:'Private Details'}],preferences:[{topic:'kaffee',value:'Kaffee'}]}));
 await assert.rejects(api.editCharacterState({field:'forget',value:'thread',topic:'prüfung',revision:base.revision-1},now),/character_conflict/);
 const saved=await api.editCharacterState({field:'forget',value:'thread',topic:'prüfung',revision:base.revision},now);
 assert.equal(saved.threads.length,0);assert.equal(saved.development.length,0);assert.equal(saved.preferences.length,1);assert.equal(JSON.stringify(saved.forgottenContexts).includes('Private'),false);
 const tomorrow=await api.getSofiaLife(new Date('2026-10-09T12:00Z'));assert.equal(api.contextForgotten(tomorrow,'thread','prüfung'),true);
 const merged=api.mergeCharacterDetails(tomorrow,{threads:[{topic:'prüfung',text:'Alte Prüfung',status:'open',evidence:'Morgen ist meine Prüfung'}]},'Morgen ist meine Prüfung','Viel Erfolg',now);assert.equal(merged.threads.length,0);
});
test('photo motive preference persists and details stay grounded in the present activity',async()=>{
 reset();const now=new Date('2026-10-08T12:00Z'),base=await api.getSofiaLife(now);
 const saved=await api.editCharacterState({field:'settings',value:{initiative:'balanced',replyLength:'auto',photos:true,photoMix:'moments'},revision:base.revision},now);
 assert.equal((await api.getSofiaLife(new Date('2026-10-09T12:00Z'))).settings.photoMix,'moments');
 const cafe={...saved,location:'im Café',activity:'Kaffee trinken'};
 assert.equal(api.chooseEverydayPhotoKind(cafe,'environment','',()=>0),'detail');assert.equal(api.chooseEverydayPhotoKind(cafe,null,'Schick mir ein Selfie',()=>0),'environment');
 assert.equal(api.explicitDetailRequest('Zeig mir deinen Kaffee'),true);assert.equal(api.explicitDetailRequest('Zeig mir nicht deinen Kaffee'),false);assert.equal(api.explicitDetailRequest('Erinnere mich später: Zeig mir deinen Kaffee'),false);
 assert.equal(api.everydayPhotoSubject({...cafe,location:'zu Hause',activity:'auf dem Sofa ausruhen'}),null);
 assert.match(api.photoSceneContext({kind:'detail',life:cafe,requestedAt:now.toISOString()}),/behind the camera/);
});
test('explicit detail commands prepare a current photo and scheduled details retain scene context',async()=>{
 reset();const now=new Date('2026-10-08T12:00Z');
 const job=await api.preparePortrait('Zeig mir deinen Kaffee',null,now);const stored=JSON.parse(db.get(prefix+'request:'+job.id));assert.equal(stored.kind,'detail');assert.equal(stored.variant,false);assert.equal(stored.life.location,(await api.getSofiaLife(now)).location);
 const life={...await api.getSofiaLife(now),location:'im Café',activity:'Kaffee trinken'};
 const scheduled=await api.prepareScheduledPortrait(life,now,'detail');const request=JSON.parse(db.get(prefix+'request:'+scheduled.id));assert.equal(request.kind,'detail');assert.match(request.scene,/coffee/);assert.equal(request.life.location,'im Café');
});

test('five photo kinds persist across days and unsolicited selection respects the allowed set',async()=>{
 reset();const now=new Date('2026-10-08T12:00Z'),base=await api.getSofiaLife(now);
 const settings={initiative:'balanced',replyLength:'auto',photos:true,photoKinds:['full_selfie','portrait','full_portrait']};
 const saved=await api.editCharacterState({field:'settings',value:settings,revision:base.revision},now);
 assert.deepEqual((await api.getSofiaLife(new Date('2026-10-09T12:00Z'))).settings.photoKinds,settings.photoKinds);
 for(let n=0;n<3;n++)assert.ok(settings.photoKinds.includes(api.chooseEverydayPhotoKind(saved,null,'Zeig mir ein Selfie',()=>n)));
 assert.equal(api.chooseEverydayPhotoKind({...saved,settings:{...settings,photoKinds:[]}},null),null);
 for(const kinds of [[],['bad'],['selfie','selfie']])await assert.rejects(api.editCharacterState({field:'settings',value:{...settings,photoKinds:kinds},revision:(await api.getSofiaLife(now)).revision},now),/character_invalid/);
});

test('current topic ranks ahead of unrelated fresh or dated threads without mutating storage',()=>{
 const now=new Date('2026-10-08T12:00:00Z'),threads=[{topic:'buch',text:'Buch lesen',updatedAt:'2026-10-01T12:00:00Z'},{topic:'sport',text:'Sport',eventDate:'2026-10-08',updatedAt:now.toISOString()}];
 assert.equal(api.rankConversationThreads(threads,'Wie läuft das Buch?',now)[0].topic,'buch');assert.equal(threads[0].topic,'buch');
 assert.equal(api.rankConversationThreads(threads,'',now)[0].topic,'sport');
});
test('grounded classifier answer closes a pending question even in a follow-up; unsupported evidence cannot',()=>{
 const now=new Date('2026-10-08T12:00:00Z'),life={dialogue:{at:'2026-10-08T11:59:00Z',pendingQuestion:'Und bei dir?',questions:[{text:'Und bei dir?',status:'open'}]}};
 const closed=api.updateDialogue(life,'und bei dir','Alles gut.',now,{question:{status:'answered',evidence:'und bei dir'}});
 assert.equal(closed.dialogue.pendingQuestion,null);assert.equal(closed.dialogue.questions[0].status,'answered');
 const open=api.updateDialogue(life,'warum','Weil es passt.',now,{question:{status:'answered',evidence:'anderer Text'}});
 assert.equal(open.dialogue.pendingQuestion,'Und bei dir?');
});
test('photo mix balances permitted categories, aliases share one category, explicit choice remains authoritative',()=>{
 const life={location:'zu Hause',activity:'Kaffee trinken',settings:{photoKinds:['selfie','portrait','environment']}};
 assert.equal(api.chooseEverydayPhotoKind(life,'selfie','',()=>0,['selfie','selfie','environment','detail']),'portrait');
 assert.equal(api.chooseEverydayPhotoKind(life,'portrait','Schick ein Selfie',()=>0,['selfie','selfie']),'selfie');
 const only={...life,settings:{photoKinds:['portrait']}};assert.equal(api.chooseEverydayPhotoKind(only,'portrait','',()=>0,['portrait']),'portrait');
});
test('new portraits avoid recent expressions while a variant keeps its original pose',()=>{
 const first=api.photoPose(null,false,'entspannt'),reference={photoPose:first};
 const recent=[{photoPose:{index:0,expression:'small natural smile'}},{photoPose:{index:2,expression:'soft closed-mouth smile'}}];
 const next=api.photoPose(reference,false,'entspannt',recent);assert.equal(next.index,1);assert.equal(next.expression,'quiet attentive expression');
 assert.deepEqual(api.photoPose(reference,true,'ernst',recent),first);
});

test('observed day scenes are bounded, stable between reads and reset at Hamburg midnight',()=>{
 const now=new Date('2026-10-08T21:59:00Z'),life={location:'zu Hause',activity:'lesen'};
 let episodes=api.dayEpisodes(null,life,now);assert.equal(episodes.length,1);assert.equal(episodes[0].day,'2026-10-08');
 assert.deepEqual(api.dayEpisodes({dayEpisodes:episodes},life,new Date(+now+20000)),episodes);
 assert.equal(api.dayEpisodes({dayEpisodes:episodes},life,new Date('2026-10-08T22:01:00Z'))[0].day,'2026-10-09');
 for(let i=0;i<20;i++)episodes=api.dayEpisodes({dayEpisodes:episodes},{...life,activity:'Beobachtung '+i},new Date(+now+i));assert.equal(episodes.length,8);
});
test('day boundary and pauses never imply activities in gaps or reactivate yesterday',()=>{
 const now=new Date('2026-10-08T22:15:00Z'),life={dialogue:{at:'2026-10-08T20:00:00Z'}};
 assert.match(api.dailyContinuityContext(life,now),/NEUER HAMBURGER TAG/);assert.match(api.dailyContinuityContext(life,now),/GESPRÄCHSPAUSE/);
});
test('own plan next steps need literal evidence and do not become completed by time',()=>{
 const now=new Date('2026-10-08T12:00:00Z'),life={plans:[]};
 const reply='Ich möchte als Nächstes die Gliederung schreiben.';
 const d={plans:[{topic:'studienprojekt',text:'Studienprojekt',status:'planned',evidence:reply,nextStep:'die Gliederung schreiben',nextStepEvidence:reply}]};
 const next=api.mergeCharacterDetails(life,d,'Was hast du vor?',reply,now);assert.equal(next.plans[0].nextStep,'die Gliederung schreiben');assert.equal(next.plans[0].status,'planned');
 const invalid=api.mergeCharacterDetails(life,{plans:[{...d.plans[0],nextStep:'einen Termin buchen',nextStepEvidence:'Ich habe einen Termin gebucht.'}]},'Was hast du vor?',reply,now);assert.equal(invalid.plans[0].nextStep,'');
});
test('photographic camera and gaze vary independently and retained variants remain unchanged',()=>{
 const first=api.photoPose(null,false,'entspannt');const next=api.photoPose({photoPose:first},false,'entspannt',[{photoPose:first}]);
 assert.notEqual(next.head,first.head);assert.notEqual(next.camera,first.camera);assert.notEqual(next.gaze,first.gaze);
 assert.deepEqual(api.photoPose({photoPose:first},true,'ernst',[{photoPose:next}]),first);
});

