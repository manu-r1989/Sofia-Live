import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const source=(await readFile(new URL('../lib/character-image.js',import.meta.url),'utf8'));
const api=await import(url(source));
const now=new Date('2026-10-07T11:00:00Z');
const fresh=(topic,extra={})=>({dialogue:{topic,topics:api.dialogueTopics(topic),at:now.toISOString(),...extra}});

test('multiple topics need clarification for a generic why but ordinal references resolve',()=>{
 const life=fresh('Mein Projekt stockt. Mein Auto macht Probleme.');
 assert.equal(api.conversationFocus(life,'Warum?',now).type,'ambiguous');
 assert.match(api.conversationFocus(life,'Zum zweiten Punkt',now).topic,/Auto/);
 assert.match(api.conversationFocus(life,'Zum Projekt',now).topic,/Projekt/);
 assert.equal(api.conversationFocus(life,'Zum dritten Punkt',now).type,'ambiguous');
});
test('and connects separate concerns without splitting a simple object list',()=>{
 assert.equal(api.dialogueTopics('Mein Projekt stockt und mein Auto macht Probleme').length,2);
 assert.equal(api.dialogueTopics('Ich mag Kaffee und Kuchen').length,1);
});
test('closing and explicit topic changes stop the old focus',()=>{
 assert.equal(api.conversationFocus(fresh('Studium',{intent:'closing'}),'Warum?',now).type,'none');
 assert.equal(api.conversationFocus(fresh('Studium'),'Anderes Thema: Sport',now).type,'new_topic');
 assert.equal(api.conversationContinuity(fresh('Studium',{intent:'closing'}),'Hallo',now).topic,null);
});
test('reprocessing exactly the same dialogue turn does not consume question budget twice',()=>{
 const first=api.updateDialogue({threads:[]},'Kaffee','Ich mag Kaffee.',now);
 assert.equal(api.updateDialogue(first,'Kaffee','Ich mag Kaffee.',now),first);
});
for(const text of ['Vielleicht mag ich Kaffee','Angenommen ich habe einen Hund','Heute trinke ich Kaffee','Ich würde in Hamburg wohnen','„Ich bin Lehrer“ ist nur ein Beispiel'])test('temporary or hypothetical statement stays out of permanent memory: '+text,()=>{
 assert.equal(api.permanentMemoryCandidate(text),false);
 assert.equal(api.guardPermanentMemory(text,{action:'add',new_memory:'Der Nutzer mag Kaffee'}).action,'none');
});
test('explicit stable preference may be saved with source evidence',()=>{
 const msg='Ich trinke meinen Kaffee immer schwarz';
 const action=api.guardPermanentMemory(msg,{action:'add',new_memory:'Der Nutzer trinkt Kaffee schwarz.'});
 assert.equal(action.action,'add');assert.equal(action.evidence,msg);assert.equal(action.certainty,'explicit_statement');
});
test('memory correction targets an existing exact memory and respects negation',()=>{
 const old='Der Nutzer trinkt Kaffee schwarz.';
 const good=api.guardPermanentMemory('Nein, ich meinte Kaffee mit Milch',{action:'update',old_memory:old,new_memory:'Der Nutzer trinkt Kaffee mit Milch.'},[old]);
 assert.equal(good.action,'update');
 assert.equal(api.guardPermanentMemory('Nein, ich meinte Kaffee mit Milch',{...good,old_memory:'another'},[old]).action,'none');
 assert.equal(api.guardPermanentMemory('Ich mag keinen Kaffee',{action:'add',new_memory:'Der Nutzer mag Kaffee.'}).action,'none');
});
test('deletion needs an explicit request and never turns a stale update into a new fact',()=>{
 const old='Der Nutzer liebt Kaffee';
 assert.equal(api.guardPermanentMemory('Vergiss die Erinnerung über Kaffee',{action:'delete',old_memory:old},[old]).action,'delete');
 assert.equal(api.guardPermanentMemory('Ich liebe Kaffee',{action:'delete',old_memory:old},[old]).action,'none');
});
test('long context has a strict character budget and older relevant topics are selected locally',()=>{
 const h=Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:(i===2?'Studienprojekt ':'unrelated ')+String(i)+' '+'x'.repeat(8000)}));
 const c=api.compactConversationHistory(h,'Studienprojekt',5000);
 assert.ok(c.recentHistory.reduce((n,x)=>n+x.content.length,0)<=5000);assert.ok(c.olderContext.length<=2000);
 assert.match(c.olderContext,/Studienprojekt/);assert.ok(c.recentHistory.at(-1).content.includes('39'));
});
test('bounded day archive preserves observed history without carrying an old location into today',()=>{
 const previous={key:'2026-10-06:evening',dayStory:[{location:'Alster'}],recentDays:[{date:'2026-09-01',events:[]}]};
 const days=api.recentDayContinuity(previous,{key:'2026-10-07:cafe'},now);
 assert.equal(days.length,1);assert.equal(days[0].date,'2026-10-06');assert.equal(days[0].events[0].location,'Alster');
});
test('activity only links existing active plans and never resumes or completes paused plans',()=>{
 const life={activity:'am Studienprojekt arbeiten',interests:[{topic:'studienprojekt',description:'mein Projekt',progress:'erste Skizze'}],plans:[{topic:'studienprojekt',text:'weiterarbeiten',status:'active'},{topic:'studienprojekt',text:'anderes',status:'paused'}]};
 const d=api.activityDevelopment(life);assert.equal(d.interests[0].progress,'erste Skizze');assert.equal(d.plans.length,1);assert.equal(d.plans[0].status,'active');
});
test('diagnostics contain only fixed codes and status, never provider or user content',()=>{
 assert.deepEqual(api.safeDiagnostic({code:'chat_provider_failed',status:429,message:'private',secret:'private'}),{code:'chat_provider_failed',status:429});
 assert.deepEqual(api.safeDiagnostic({code:'sensitive_provider_message',status:200}),{code:'request_failed'});
});

const liveCode=(await readFile(new URL('../api/live-memory.js',import.meta.url),'utf8')).replace('../lib/character-image.js',url(source));
const live=(await import(url(liveCode))).default;
for(const failure of ['http','json'])test('Live memory classifier '+failure+' failure still saves the completed conversation without invented memory',async()=>{
 const savedFetch=globalThis.fetch,keys=['SOFIA_PASSWORD','OPENAI_API_KEY','KV_REST_API_URL','KV_REST_API_TOKEN'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const db=new Map();let payload,status;
 Object.assign(process.env,{SOFIA_PASSWORD:'test',OPENAI_API_KEY:'test',KV_REST_API_URL:'https://redis.test',KV_REST_API_TOKEN:'test'});
 globalThis.fetch=async(endpoint,options)=>{
  const body=JSON.parse(options.body);
  if(endpoint==='https://redis.test'){if(body[0]==='GET')return {ok:true,json:async()=>({result:db.get(body[1])||null})};return {ok:true,json:async()=>({result:1})};}
  if(endpoint==='https://redis.test/pipeline'){for(const [op,key,value]of body)db.set(key,value);return {ok:true,json:async()=>body.map(()=>({result:'OK'}))};}
  assert.match(endpoint,/responses/);return failure==='http'?{ok:false,status:503,json:async()=>({error:{message:'private'}})}:{ok:true,json:async()=>({output_text:'invalid private'})};
 };
 try {
  const cookie=crypto.createHmac('sha256','test').update('sofia-authorized-session-v1').digest('hex');
  const res={setHeader(){},status(n){status=n;return this;},json(d){payload=d;return d;}};
  await live({method:'POST',headers:{cookie:'sofia_session='+cookie},body:{userText:'Ich mag Kaffee',assistantText:'Das klingt gut.'}},res);
  assert.equal(status,200);assert.equal(payload.memoryAction.action,'none');assert.ok(payload.memoryWarning);
  const history=JSON.parse(db.get('sofia:main:history'));assert.equal(history.length,2);assert.equal(history[0].content,'Ich mag Kaffee');
 }finally{globalThis.fetch=savedFetch;for(const k of keys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
});

test('proactive motif normalization suppresses cosmetic rewrites of the same scene',()=>{
 assert.equal(api.photoMotif({location:'in einem Café',activity:'gerade Kaffee trinken'},'selfie'),api.photoMotif({location:'im Cafe',activity:'Kaffee trinken'},'selfie'));
 assert.notEqual(api.photoMotif({location:'Cafe',activity:'Kaffee trinken'},'selfie'),api.photoMotif({location:'Alster',activity:'spazieren'},'selfie'));
});
test('requested hairstyle and time dimensions are explicit without broad outfit edits',()=>{
 assert.deepEqual(api.variantDimensions('Dasselbe Bild mit Pferdeschwanz'),['hairstyle']);
 assert.deepEqual(api.variantDimensions('Nur die Tageszeit ändern'),['time']);
});

test('generic ambiguous follow-up receives a concrete clarification while a named topic does not',()=>{
 const life=fresh('Mein Studienprojekt stockt und mein Auto macht Probleme');
 assert.match(api.conversationClarification(life,'Warum?',now),/Studienprojekt.*oder.*Auto/);
 assert.equal(api.conversationClarification(life,'Zum zweiten Punkt',now),null);
 assert.equal(api.conversationClarification(life,'Erledige Aufgabe TEST',now),null);
 assert.match(api.initiativeContext(life,'Warum?',now),/BEZUGSKLÄRUNG DIESES TURNS/);
});

