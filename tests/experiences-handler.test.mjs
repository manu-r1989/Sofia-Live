import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler from '../lib/companion-handler.js';
import {defaultCompanionState} from '../lib/character-image.js';
const original=globalThis.fetch,keys=['KV_REST_API_URL','KV_REST_API_TOKEN','SOFIA_PASSWORD'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
let db,calls;
const prefix='sofia:main:portrait:',at='2026-10-22T20:00:00.000Z';
function reset(){db=new Map();calls=[];process.env.KV_REST_API_URL='https://experiences.test';process.env.KV_REST_API_TOKEN='test';process.env.SOFIA_PASSWORD='test-only';}
globalThis.fetch=async(url,options)=>{
 assert.equal(url,'https://experiences.test','No provider request is permitted in these operations');const args=JSON.parse(options.body);calls.push(args);
 const [op,key,value]=args;let result;
 if(op==='GET')result=db.get(key)||null;
 else if(op==='SET'){db.set(key,value);result='OK';}
 else if(op==='EVAL'&&key.includes('sofia-companion-cas')){result=(db.get(args[3])||'')===args[4]?1:0;if(result)db.set(args[3],args[5]);}
 else throw Error('Unexpected store operation '+op);
 return {ok:true,json:async()=>({result})};
};
test.after(()=>{globalThis.fetch=original;for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];});
async function call(operation,data={},headers={}){let status,body;const session=crypto.createHmac('sha256','test-only').update('sofia-authorized-session-v1').digest('hex');await handler({method:'POST',headers:{cookie:'sofia_session='+session,...headers},body:{operation,...data}},{setHeader(){},status(n){status=n;return this;},json(d){body=d;return d;}});return {status,body};}
test('experience mutations require authentication and same-origin requests',async()=>{
 reset();let r=await call('experiences_edit',{edit:{revision:0,action:'activity_start',value:{kind:'walk'}}},{cookie:''});assert.equal(r.status,401);assert.equal(calls.length,0);
 r=await call('experiences_edit',{edit:{revision:0,action:'activity_start',value:{kind:'walk'}}},{origin:'https://other.test',host:'sofia.test'});assert.equal(r.status,403);assert.equal(calls.filter(x=>x[0]!=='GET').length,0);
});
test('source selection uses actual visible history and rejects forged or hidden quotations',async()=>{
 reset();const source={role:'user',content:'Ich mag Spaziergänge am Wasser.',createdAt:at};db.set('sofia:main:history',JSON.stringify([source]));
 let r=await call('experiences_edit',{edit:{revision:0,action:'connection_add',value:{title:'Spaziergänge',text:'Spaziergänge am Wasser',sourceRef:source}}});assert.equal(r.status,200);assert.equal(r.body.state.experiences.connections[0].source.message,source.content);assert.match(r.body.liveContext,/Spaziergänge am Wasser/);
 const before=db.get(prefix+'companion');r=await call('experiences_edit',{edit:{revision:1,action:'connection_add',value:{title:'Falsch',text:'Anderer Inhalt',sourceRef:{...source,content:'Falsches Zitat'}}}});assert.equal(r.status,409);assert.equal(db.get(prefix+'companion'),before);
 db.set('sofia:main:chat-hidden-messages',JSON.stringify([source]));r=await call('experiences_overview');assert.equal(r.status,200);assert.equal(r.body.sources.length,0);
 r=await call('experiences_edit',{edit:{revision:1,action:'connection_add',value:{title:'Verborgen',text:'Nicht kopieren',sourceRef:source}}});assert.equal(r.status,409);assert.equal(db.get(prefix+'companion'),before);
});
test('client supplied provenance cannot manufacture a conversation source and stale revisions cannot advance an activity',async()=>{
 reset();let r=await call('experiences_edit',{edit:{revision:0,action:'connection_add',verifiedSource:{kind:'conversation',at,message:'Erfunden'},value:{title:'Manuell',text:'Mein Eintrag'}}});assert.equal(r.status,200);assert.equal(r.body.state.experiences.connections[0].source.kind,'manual');
 r=await call('experiences_edit',{edit:{revision:1,action:'activity_start',value:{kind:'movie'}}});const id=r.body.state.experiences.activeActivityId;assert.equal(r.status,200);
 r=await call('experiences_edit',{edit:{revision:1,action:'activity_step',id,value:{cursor:0,note:'Alt'}}});assert.equal(r.status,409);assert.equal(JSON.parse(db.get(prefix+'companion')).experiences.activities[0].cursor,0);
 r=await call('experiences_edit',{edit:{revision:2,action:'activity_step',id,value:{cursor:0,note:'Filmauswahl getroffen'}}});assert.equal(r.status,200);assert.equal(r.body.state.experiences.activities[0].cursor,1);
});
