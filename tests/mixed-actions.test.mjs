import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile as nativeReadFile} from 'node:fs/promises';
const environmentSource=await nativeReadFile(new URL('../lib/environment.js',import.meta.url),'utf8');
const environmentUrl='data:text/javascript;base64,'+Buffer.from(environmentSource).toString('base64');
const messageContextSource=await nativeReadFile(new URL('../lib/message-context.js',import.meta.url),'utf8');
const messageContextUrl='data:text/javascript;base64,'+Buffer.from(messageContextSource).toString('base64');
async function readFile(...args){const value=await nativeReadFile(...args);return typeof value==='string'?value.replaceAll('../lib/environment.js',environmentUrl).replaceAll('../lib/message-context.js',messageContextUrl):value;}
const root=new URL('../',import.meta.url),url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const portrait=url(await readFile(new URL('lib/character-image.js',root),'utf8'));
const engine=url(`export async function executeUnifiedAction(message,time,options){globalThis.__mixedCalls.push({message,time,options});return {taskAction:globalThis.__mixedResult};}export async function getActionState(){return {};}export async function getResearchState(){return null;}`);
const endpoints={};for(const name of ['chat','live-context'])endpoints[name]=(await import(url((await readFile(new URL('api/'+name+'.js',root),'utf8')).replace('../lib/character-image.js',portrait).replace('./action-engine.js',engine)))).default;
const names=['SOFIA_PASSWORD','KV_REST_API_URL','KV_REST_API_TOKEN','OPENAI_API_KEY'],env=Object.fromEntries(names.map(k=>[k,process.env[k]])),normalFetch=globalThis.fetch;
let db,plan;
function reset(){db=new Map();plan={action:'mixed',photoAction:'new',photoMessage:'Mach ein Selfie',taskMessage:'erstelle eine Aufgabe Bericht morgen'};globalThis.__mixedCalls=[];globalThis.__mixedResult={ok:true,action:'create',task:{id:'task-1',title:'Bericht'}};process.env.SOFIA_PASSWORD='test-only';process.env.KV_REST_API_URL='https://redis.test';process.env.KV_REST_API_TOKEN='test';process.env.OPENAI_API_KEY='test';}
const response=result=>({ok:true,json:async()=>result});
globalThis.fetch=async(endpoint,options)=>{
 const body=JSON.parse(options.body);
 if(endpoint==='https://redis.test'){
  const [op,key,value]=body;
  if(op==='GET')return response({result:db.get(key)||null});
  if(op==='SET'){db.set(key,value);return response({result:'OK'});}
  if(op==='EVAL' && key.includes('sofia-life-cas')){if((db.get(body[3])||'')!==body[4])return response({result:0});db.set(body[3],body[5]);return response({result:1});}
  if(op==='EVAL' && key.includes('sofia-portrait-jobs')){const jobs=JSON.parse(db.get(body[3])||'[]').filter(x=>x.id!==body[4]);if(body[5])jobs.push(JSON.parse(body[5]));db.set(body[3],JSON.stringify(jobs));return response({result:1});}
  if(op==='EVAL'){db.set(body[3],JSON.stringify([{role:'user',content:body[4]},{role:'assistant',content:body[5],imageRequestId:body[6]}]));return response({result:1});}
 }
 if(String(endpoint).endsWith('/chat/completions'))return response({choices:[{message:{content:JSON.stringify(plan)}}]});
 throw new Error('unexpected request');
};
test.after(()=>{globalThis.fetch=normalFetch;delete globalThis.__mixedCalls;delete globalThis.__mixedResult;for(const k of names)if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];});
async function run(name){const session=crypto.createHmac('sha256','test-only').update('sofia-authorized-session-v1').digest('hex');let payload,status;const res={setHeader(){},status(n){status=n;return this;},json(x){payload=x;return this;}};await endpoints[name]({method:'POST',headers:{cookie:'sofia_session='+session},body:{message:'Mach ein Selfie und erstelle eine Aufgabe Bericht morgen'}},res);assert.equal(status,200);return payload;}
for(const mode of ['chat','live-context']) {
 test(mode+' runs exact task clause before returning photo acknowledgment',async()=>{reset();const result=await run(mode);assert.equal(result.taskAction.action,'create');assert.ok(result.imageRequest.id);assert.match(result.reply||result.context,/Als Aufgabe gespeichert/);assert.equal(globalThis.__mixedCalls[0].message,plan.taskMessage);assert.match(globalThis.__mixedCalls[0].time,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);assert.equal(globalThis.__mixedCalls[0].options.mode,mode==='chat'?'text':'live');});
 test(mode+' keeps photo job independent and never confirms failed task',async()=>{reset();globalThis.__mixedResult={ok:false,status:'execution_failed',action:'none'};const result=await run(mode);assert.ok(result.imageRequest.id);assert.match(result.reply||result.context,/unbestätigt/);assert.doesNotMatch(result.reply||result.context,/Als Aufgabe gespeichert/);});
}

