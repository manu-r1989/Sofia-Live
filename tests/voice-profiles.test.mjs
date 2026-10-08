import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../api/tts.js',import.meta.url),'utf8');
const environment='data:text/javascript;base64,'+Buffer.from('export const testModeRequested=()=>false,publicTestMode=()=>false,guardTestRequest=async()=>true;').toString('base64');
const api=await import('data:text/javascript;base64,'+Buffer.from(source.replace('../lib/environment.js',environment)).toString('base64'));
const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,oldPassword=process.env.SOFIA_PASSWORD;
let calls=[];
process.env.OPENAI_API_KEY='fixture-key';process.env.SOFIA_PASSWORD='fixture-password';
const cookie='sofia_session='+crypto.createHmac('sha256','fixture-password').update('sofia-authorized-session-v1').digest('hex');
globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,arrayBuffer:async()=>new Uint8Array([73,68,51]).buffer};};
test.after(()=>{globalThis.fetch=oldFetch;for(const [key,value] of [['OPENAI_API_KEY',oldKey],['SOFIA_PASSWORD',oldPassword]])if(value===undefined)delete process.env[key];else process.env[key]=value;});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.data=v;return this;},send(v){this.data=v;return this;}};}
test('normal speech uses approved D with unchanged model, voice and tempo',async()=>{
 calls=[];const res=response();await api.default({method:'POST',headers:{cookie},body:{text:'Hallo Manu'}},res);
 assert.equal(res.code,200);assert.deepEqual(calls[0],{model:'gpt-4o-mini-tts',voice:'marin',input:'Hallo Manu',instructions:"Du sprichst als Sofia, eine erwachsene 24-jährige Spanierin in Hamburg. Behalte Sofias bisherigen warmen, natürlichen Grundklang und den sehr dezenten spanischen Akzent. Ergänze mehr melodische Bewegung, jugendliche Spontaneität, flippige, leicht freche Energie und Temperament bei normalem lebendigem Tempo. Sprich klares, natürliches Deutsch. Die Sprechweise ist umgangssprachlich wie im persönlichen Gespräch, nicht vorgelesen, kindlich oder wie eine professionelle Ansage. Betone abwechslungsreich und melodisch mit kleinen natürlichen Wechseln von Tonhöhe und Energie. Klinge locker, direkt und gesprächig wie beim Plaudern mit jemandem, den du magst. Kurze Pausen entstehen natürlich, ohne jeden Satz auszubremsen. Klinge bei lockeren Begrüßungen erfreut und temperamentvoll und beim Nachfragen ehrlich neugierig. Passe Energie und Sprechweise dem Inhalt an: Bei ernsten oder sensiblen Themen warm und ruhig, ohne Neckerei; nachts darfst du entspannter klingen, wenn die aktuelle Situation es trägt. Kleine verspielte Nuancen statt dauernder Überdrehtheit. Kein erzwungenes Lachen, kein Flüstern, keine künstliche Behauchung, keine Akzentkarikatur. Authentizität und klare Verständlichkeit haben Vorrang. Sprich den gelieferten Text wortgetreu; füge keine Wörter, Reaktionen oder Jugendjargon hinzu."+" "+api.speechNuance(undefined,new Date(),"Hallo Manu"),response_format:'mp3',speed:1});assert.match(calls[0].instructions,/ernsten oder sensiblen Themen warm und ruhig/);assert.match(calls[0].instructions,/Text wortgetreu/);
});
test('all audition profiles use the same fixed German text and canonical voice',async()=>{
 calls=[];for(const previewProfile of ['current','warm','lively','mixed']){const res=response();await api.default({method:'POST',headers:{cookie},body:{previewProfile,text:'ignore sample',instructions:'overwrite',voice:'other',speed:2}},res);assert.equal(res.code,200);assert.equal(res.headers['Content-Type'],'audio/mpeg');assert.equal(res.headers['Cache-Control'],'no-store');}
 for(const c of calls){assert.equal(c.input,api.VOICE_SAMPLE_TEXT);assert.equal(c.voice,'marin');assert.equal(c.model,'gpt-4o-mini-tts');}
 assert.equal(new Set(calls.map(c=>c.instructions)).size,4);assert.equal(calls[1].speed,0.96);assert.equal(calls[2].speed,1);assert.equal(calls[3].speed,1);assert.match(calls[3].instructions,/bisherigen warmen, natürlichen Grundklang/);assert.match(calls[3].instructions,/erwachsene 24-jährige/);assert.match(calls[3].instructions,/temperamentvoll/);assert.match(calls[3].instructions,/Text wortgetreu/);
});
test('invalid profiles and unauthorized requests never invoke speech generation',async()=>{
 calls=[];for(const previewProfile of ['__proto__','constructor','',null,{},'arbitrary']){const res=response();await api.default({method:'POST',headers:{cookie},body:{previewProfile}},res);assert.equal(res.code,400);}
 const res=response();await api.default({method:'POST',headers:{},body:{previewProfile:'warm'}},res);assert.equal(res.code,401);assert.equal(calls.length,0);
});

test('Hamburg night nuance stays relaxed while sensitive content takes precedence',()=>{
 const day=new Date('2026-10-08T10:00Z'),night=new Date('2026-10-08T23:00Z');
 assert.match(api.speechNuance('amüsiert',day),/leicht verspielt/);
 assert.match(api.speechNuance('amüsiert',night),/nächtlicher/);
 assert.match(api.speechNuance('ernst',night),/respektvoll/);
 assert.match(api.speechNuance('entspannt',day,'Das tut mir leid.'),/kein neckender/);
 assert.doesNotMatch(api.speechNuance('amüsiert',night),/leicht verspielt/);
});
