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
let db,quotas,decision,narrative,inputs,details;
function reset(){db=new Map();quotas=new Map();decision=true;narrative=null;details={};inputs=[];process.env.KV_REST_API_URL='https://redis.test';process.env.KV_REST_API_TOKEN='test';process.env.OPENAI_API_KEY='test';process.env.SOFIA_PASSWORD='test-only';}
const response=data=>({ok:true,json:async()=>data});
globalThis.fetch=async(endpoint,options)=>{
 const body=JSON.parse(options.body);
 if(String(endpoint).endsWith('/api/sofia-identity'))return response({ok:true});
 if(endpoint==='https://redis.test/pipeline'){for(const [op,key,value] of body){assert.equal(op,'SET');db.set(key,value);}return response(body.map(()=>({result:'OK'})));}
 if(endpoint==='https://redis.test') {
  const [op,key,value,...args]=body;
  if(op==='GET')return response({result:db.get(key)||null});
  if(op==='SET'){db.set(key,value);return response({result:'OK'});}
  if(op==='EVAL' && key.includes('sofia-portrait-jobs')) {const target=body[3],id=body[4];let jobs=JSON.parse(db.get(target)||'[]').filter(x=>x.id!==id);if(body[5])jobs.push(JSON.parse(body[5]));db.set(target,JSON.stringify(jobs.slice(-20)));return response({result:1});}
  if(op==='EVAL' && key.includes('sofia-life-cas')) {
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
 assert.match(source,/hair COLOR/);assert.match(source,/Small natural variations in facial expression/);
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
 const code=(await readFile(new URL('../api/memory.js',import.meta.url),'utf8')).replace('../lib/character-image.js',url(source));
 const handler=(await import(url(code))).default;
 const session=crypto.createHmac('sha256','test-only').update('sofia-authorized-session-v1').digest('hex');
 db.set('sofia:main:longterm',JSON.stringify([{text:'Der Nutzer mag Tee.',category:'Vorlieben'}]));
 const invoke=async(method,body,cookie='sofia_session='+session)=>{let status,data;await handler({method,body,headers:{cookie}}, {setHeader(){},status(n){status=n;return this;},json(d){data=d;return d;}});return {status,data};};
 const before=await invoke('GET');assert.equal(before.data.items[0].text,'Der Nutzer mag Tee.');assert.equal(before.data.character.revision,state.revision);
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
