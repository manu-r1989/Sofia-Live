import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),source=await readFile(new URL('live.js',root),'utf8');
const backend=await readFile(new URL('api/realtime.js',root),'utf8');
const handler=(await import('data:text/javascript;base64,'+Buffer.from(backend).toString('base64'))).default;
const normalFetch=globalThis.fetch,names=['SOFIA_PASSWORD','OPENAI_API_KEY','KV_REST_API_URL','KV_REST_API_TOKEN'],saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));
test.after(()=>{globalThis.fetch=normalFetch;for(const k of names)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];});
async function endpoint(provider){for(const k of names)process.env[k]=k==='KV_REST_API_URL'?'https://redis.test':'test-only';let sessionBody;
 globalThis.fetch=async(url,options)=>{if(url==='https://redis.test')throw new Error('optional context unavailable');sessionBody=JSON.parse(options.body);return provider;};
 const token=crypto.createHmac('sha256','test-only').update('sofia-authorized-session-v1').digest('hex');let payload,status;const res={setHeader(){},status(n){status=n;return this;},json(x){payload=x;return this;}};
 await handler({method:'POST',headers:{cookie:'sofia_session='+token},body:{history:[{role:'user',content:'Was machst du?'}]}},res);return {payload,status,sessionBody};
}
test('optional Redis outage does not block realtime token and client handoff context',async()=>{
 const r=await endpoint({ok:true,json:async()=>({value:'test-ephemeral'})});assert.equal(r.status,200);assert.equal(r.payload.value,'test-ephemeral');assert.match(r.payload.instructions,/Was machst du/);
 assert.equal(r.sessionBody.session.audio.input.turn_detection.create_response,false);assert.equal(r.sessionBody.session.audio.input.turn_detection.interrupt_response,false);assert.equal(r.sessionBody.session.audio.output.voice,'marin');
});
test('provider limits return safe actionable code without raw provider message',async()=>{
 const r=await endpoint({ok:false,status:429,json:async()=>({error:{code:'rate_limit_exceeded',message:'private provider details'}})});assert.equal(r.status,429);assert.equal(r.payload.code,'realtime_limit');assert.doesNotMatch(JSON.stringify(r.payload),/private provider/);
});
function startHarness(stage){const modes=[],thoughts=[],presences=[];let stops=0;
 const c=vm.createContext({console:{error(){}},window:{SofiaAvatar:{think(){}},location:{reload(){}}},localStorage:{getItem:()=>null},setLiveButtonState(){},setMode:x=>modes.push(x),setThought:x=>thoughts.push(x),setPresence:(s,x)=>presences.push(x),stopLive:()=>{stops++;modes.push('bereit');presences.push('bereit');},cancelPendingLiveResponse(){},fetch:async()=>stage==='session'?{status:429,ok:false,json:async()=>({code:'realtime_limit'})}:{status:200,ok:true,json:async()=>({value:'test-only'})},navigator:{mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});}}}});
 const start=source.slice(source.indexOf('  function liveStartFailure'),source.indexOf('  async function handleRealtimeEvent'));
 vm.runInContext(`let liveActive=false,connecting=false,pendingUserText='',pendingImageRequestId=null,pendingLifeRevision=null,pendingAssistantText='',userSpeaking=false,latestSpeechItemId=null,liveSessionInstructions='',localStream=null;const transcribedSpeechItems=new Set();${start};globalThis.start=startLive;`,c);
 return {run:c.start,modes,thoughts,presences,stops:()=>stops};
}
test('session failure stays visible after cleanup instead of returning silently to ready',async()=>{
 const h=startHarness('session');await h.run();assert.equal(h.stops(),1);assert.equal(h.modes.at(-1),'Live-Start fehlgeschlagen');assert.match(h.thoughts.at(-1),/Nutzungslimit/);assert.equal(h.presences.at(-1),'Live-Start fehlgeschlagen');
});
test('microphone permission failure identifies the permission and allows another start',async()=>{
 const h=startHarness('microphone');await h.run();assert.match(h.thoughts.at(-1),/Mikrofonzugriff/);await h.run();assert.equal(h.stops(),2);
});
