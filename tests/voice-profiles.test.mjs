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
test('normal speech keeps the existing model, voice, tempo and instructions',async()=>{
 calls=[];const res=response();await api.default({method:'POST',headers:{cookie},body:{text:'Hallo Manu'}},res);
 assert.equal(res.code,200);assert.deepEqual(calls[0],{model:'gpt-4o-mini-tts',voice:'marin',input:'Hallo Manu',instructions:api.VOICE_PROFILES.current.instructions,response_format:'mp3',speed:1});assert.match(api.VOICE_PROFILES.current.instructions,/Ruhig, leicht verspielt, nicht überzeichnet/);
});
test('all audition profiles use the same fixed German text and canonical voice',async()=>{
 calls=[];for(const previewProfile of ['current','warm','lively']){const res=response();await api.default({method:'POST',headers:{cookie},body:{previewProfile,text:'ignore sample',instructions:'overwrite',voice:'other',speed:2}},res);assert.equal(res.code,200);assert.equal(res.headers['Content-Type'],'audio/mpeg');assert.equal(res.headers['Cache-Control'],'no-store');}
 for(const c of calls){assert.equal(c.input,api.VOICE_SAMPLE_TEXT);assert.equal(c.voice,'marin');assert.equal(c.model,'gpt-4o-mini-tts');}
 assert.equal(new Set(calls.map(c=>c.instructions)).size,3);assert.equal(calls[1].speed,0.96);assert.equal(calls[2].speed,1);
});
test('invalid profiles and unauthorized requests never invoke speech generation',async()=>{
 calls=[];for(const previewProfile of ['__proto__','constructor','',null,{},'arbitrary']){const res=response();await api.default({method:'POST',headers:{cookie},body:{previewProfile}},res);assert.equal(res.code,400);}
 const res=response();await api.default({method:'POST',headers:{},body:{previewProfile:'warm'}},res);assert.equal(res.code,401);assert.equal(calls.length,0);
});
