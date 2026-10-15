import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile as nativeReadFile} from 'node:fs/promises';
async function readFile(...args){const value=await nativeReadFile(...args);return typeof value==='string'?value.replaceAll('./expansion-state.js',new URL('../lib/expansion-state.js',import.meta.url).href).replaceAll('./studio-state.js',new URL('../lib/studio-state.js',import.meta.url).href):value;}
const root=new URL('../',import.meta.url);
const source=await readFile(new URL('lib/environment.js',root),'utf8');
const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const env=await import(url);
const encode=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const photoURL=encode((await readFile(new URL('lib/character-image.js',root),'utf8')).replace('../lib/environment.js',url));
const featureStateURL=encode(await readFile(new URL('lib/feature-state.js',root),'utf8'));
const socialURL=encode((await readFile(new URL('lib/social.js',root),'utf8')).replace('./environment.js',url).replace('./character-image.js',photoURL).replace('./feature-state.js',featureStateURL));
const handlerURL=encode((await readFile(new URL('lib/social-handler.js',root),'utf8')).replace('./environment.js',url).replace('./character-image.js',photoURL).replace('./social.js',socialURL));
async function dependencyURL(path,cache=new Map([['lib/environment.js',url],['lib/character-image.js',photoURL]])){if(cache.has(path))return cache.get(path);let text=await readFile(new URL(path,root),'utf8');for(const match of [...text.matchAll(/from\s+['\"](\.[^'\"]+)['\"]/g)]){const name=new URL(match[1],new URL(path,root)).pathname.slice(root.pathname.length);text=text.replace(match[1],await dependencyURL(name,cache));}const result=encode(text);cache.set(path,result);return result;}
const evolutionURL=await dependencyURL('lib/companion-evolution.js');
const growthURL=await dependencyURL('lib/companion-growth.js');
const nextURL=await dependencyURL('lib/companion-next.js');
const featuresURL=await dependencyURL('lib/companion-features.js');
const upgradeURL=await dependencyURL('lib/companion-upgrade.js');
const expansionURL=await dependencyURL('lib/companion-expansion.js');
const companionURL=encode((await readFile(new URL('lib/companion-handler.js',root),'utf8')).replace('./environment.js',url).replace('./character-image.js',photoURL).replace('./companion-evolution.js',evolutionURL).replace('./companion-next.js',nextURL).replace('./companion-growth.js',growthURL).replace('./companion-features.js',featuresURL).replace('./companion-upgrade.js',upgradeURL).replace('./companion-expansion.js',expansionURL));
const session=(await import('data:text/javascript;base64,'+Buffer.from((await readFile(new URL('api/session.js',root),'utf8')).replace('../lib/environment.js',url).replace('../lib/social-handler.js',handlerURL).replace('../lib/companion-handler.js',companionURL)).toString('base64'))).default;
const names=['SOFIA_TEST_MODE','SOFIA_DATA_NAMESPACE','SOFIA_TEST_PROJECT_ID','VERCEL_PROJECT_ID','SOFIA_TEST_STORAGE','SOFIA_TEST_ALLOW_PAID','KV_REST_API_URL','KV_REST_API_TOKEN','SOFIA_PASSWORD'];
const saved=Object.fromEntries(names.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=originalFetch;for(const k of names)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];});
let store,calls;
function setup(){
 for(const k of names)delete process.env[k];
 Object.assign(process.env,{SOFIA_TEST_MODE:'true',SOFIA_DATA_NAMESPACE:'test-web',SOFIA_TEST_PROJECT_ID:'prj_Test123',VERCEL_PROJECT_ID:'prj_Test123',SOFIA_TEST_STORAGE:'isolated',SOFIA_TEST_ALLOW_PAID:'true',KV_REST_API_URL:'https://isolated.test',KV_REST_API_TOKEN:'fixture'});
 store=new Map();calls=[];
 globalThis.fetch=async(u,o)=>{
  assert.equal(u,'https://isolated.test');const command=JSON.parse(o.body);calls.push(command);
  const [op,...args]=command;let result;
  if(op==='GET')result=store.get(args[0])||null;
  else if(op==='EVAL'){
   const [script,count,...rest]=args,keys=rest.slice(0,count),a=rest.slice(count),n=k=>Number(store.get(k)||0);
   if(script===env.TEST_BUDGET_SCRIPT){
    if(store.has(keys[3]))result=-2;
    else if(n(keys[0])+Number(a[0])>100||n(keys[1])>=Number(a[1]))result=-4;
    else if(n(keys[2])>=10)result=-3;
    else{store.set(keys[0],n(keys[0])+Number(a[0]));store.set(keys[1],n(keys[1])+1);store.set(keys[2],n(keys[2])+1);store.set(keys[3],a[2]);result=1;}
   }else if(script===env.TEST_IMAGE_SCRIPT){if(n(keys[0])>=2||n(keys[1])+10>100)result=0;else{store.set(keys[0],n(keys[0])+1);store.set(keys[1],n(keys[1])+10);result=1;}}
   else if(script===env.RESET_TEST_SCRIPT){if(store.get(keys[0])!==a[1])result=-1;else{const matches=[...store.keys()].filter(k=>k.startsWith(a[0]));if(matches.length>500)result=-2;else{result=0;for(const k of matches)if(!k.startsWith(a[0]+'_budget:')){store.delete(k);result++;}}}}
   else if(script.includes("INCR")){result=n(keys[0])+1;store.set(keys[0],result);}
   else {result=store.get(keys[0])===a[0]?1:0;if(result)store.delete(keys[0]);}
  }else throw Error('Unexpected Redis command');
  return {ok:true,json:async()=>({result})};
 };
}
function response(){return {code:200,headers:{},status(n){this.code=n;return this;},setHeader(k,v){this.headers[k]=v;},json(v){this.body=v;return this;}};}
function req(method='POST',body={}){return {method,body,headers:{host:'test.example','x-forwarded-for':'192.0.2.1'}};}
test('public test access requires every isolation setting and refuses the production project',()=>{
 setup();assert.equal(env.publicTestMode(),true);assert.equal(env.dataPrefix(),'sofia:test-web:');
 for(const k of ['SOFIA_TEST_PROJECT_ID','VERCEL_PROJECT_ID','SOFIA_TEST_STORAGE','SOFIA_DATA_NAMESPACE']){const v=process.env[k];delete process.env[k];assert.equal(env.publicTestMode(),false,k);process.env[k]=v;}
 process.env.VERCEL_PROJECT_ID=process.env.SOFIA_TEST_PROJECT_ID='prj_OM40eTT531hrPCMVMfvRL3rfuBU4';assert.equal(env.publicTestMode(),false);
 process.env.SOFIA_DATA_NAMESPACE='main';assert.equal(env.dataPrefix(),'sofia:disabled-test:');
 delete process.env.SOFIA_TEST_MODE;assert.equal(env.publicTestMode(),false);assert.equal(env.dataPrefix(),'sofia:main:');
});
test('normal production guard performs no extra requests and session keeps password protection',async()=>{
 setup();delete process.env.SOFIA_TEST_MODE;process.env.SOFIA_PASSWORD='fixture-password';assert.equal(await env.guardTestRequest(req(),response()),true);assert.equal(calls.length,0);
 const r=response();await session(req('GET'),r);assert.equal(r.code,401);assert.equal(r.body.authenticated,false);
 const reset=response();await session(req('POST',{operation:'reset_test'}),reset);assert.equal(reset.code,405);assert.equal(calls.length,0);
});
test('incomplete test config and default disabled AI fail before storage or provider access',async()=>{
 setup();delete process.env.SOFIA_TEST_STORAGE;let r=response();assert.equal(await env.guardTestRequest(req(),r),false);assert.equal(r.code,503);assert.equal(calls.length,0);
 setup();delete process.env.SOFIA_TEST_ALLOW_PAID;r=response();assert.equal(await env.guardTestRequest(req(),r,'realtime'),false);assert.equal(r.code,503);await assert.rejects(env.reserveTestImage());assert.equal(calls.length,0);
});
test('cross-origin mutations are rejected',async()=>{setup();const q=req();q.headers.origin='https://other.example';const r=response();assert.equal(await env.guardTestRequest(q,r),false);assert.equal(r.code,403);assert.equal(calls.length,0);});
test('new voice, search and upload operations keep authorization, origin and paid-test guards',async()=>{
 for(const operation of ['voice_transcribe','semantic_search','upload_analyze','upload_confirm','next_edit','diary_draft','upload_plan','growth_edit','growth_overview','calendar_preview','calendar_confirm','calendar_slots','slot_preview','slot_confirm','memory_trace','memory_correct','calendar_export','feature_edit','feature_overview','region_source','berlin_time','card_draft','upgrade_edit','cards_import_preview','cards_import_confirm','template_preview','template_confirm','data_audit','contact_preview','expansion_edit','expansion_overview','expansion_preview','expansion_turn','expansion_quiz_answer','expansion_photo','session_vocabulary','workbench_edit','workbench_generate','workbench_merge']){
  setup();delete process.env.SOFIA_TEST_MODE;const q=req('POST',{operation});q.query={companion:'1'};const r=response();await session(q,r);assert.equal(r.code,401,operation);assert.equal(calls.length,0);
  setup();const other=req('POST',{operation});other.query={companion:'1'};other.headers.origin='https://other.example';const blocked=response();await session(other,blocked);assert.equal(blocked.code,403,operation);assert.equal(calls.length,0);
 }
 for(const operation of ['voice_transcribe','semantic_search','upload_analyze','upload_confirm','card_draft','contact_preview','expansion_turn','expansion_quiz_answer','expansion_photo','workbench_generate']){
  setup();delete process.env.SOFIA_TEST_ALLOW_PAID;const q=req('POST',{operation});q.query={companion:'1'};const r=response();await session(q,r);assert.equal(r.code,503,operation);assert.equal(calls.length,0);
 }
});
test('one active mutation blocks another request and reset until the response completes',async()=>{
 setup();const first=response();assert.equal(await env.guardTestRequest(req(),first),true);
 const other=response();assert.equal(await env.guardTestRequest(req(),other),false);assert.equal(other.code,429);
 const reset=response();await session(req('POST',{operation:'reset_test'}),reset);assert.equal(reset.code,429);
 await first.json({ok:true});assert.equal(await env.guardTestRequest(req(),response()),true);
});
test('image limit counts actual generated images independently of text requests and stops the third',async()=>{
 setup();await env.reserveTestImage();await env.reserveTestImage();await assert.rejects(env.reserveTestImage(),/Bildlimit/);
 assert.equal(store.get('sofia:test-web:_budget:image:'+new Date().toISOString().slice(0,10)),2);
});
test('realtime limit allows two starts per UTC day',async()=>{setup();for(let i=0;i<2;i++){const r=response();assert.equal(await env.guardTestRequest(req(),r,'realtime'),true);await r.json({});}const r=response();assert.equal(await env.guardTestRequest(req(),r,'realtime'),false);assert.equal(r.code,429);});
test('test reset deletes only test data and preserves production keys and usage budgets',async()=>{
 setup();store.set('sofia:main:history','private');store.set('sofia:test-web:history','test');store.set('sofia:test-web:portrait:image:fixture','test');store.set('sofia:test-other:tasks','other');
 await env.reserveTestImage();const r=response();await session(req('POST',{operation:'reset_test'}),r);assert.equal(r.code,200);assert.equal(r.body.deleted,2);assert.equal(store.get('sofia:main:history'),'private');assert.equal(store.get('sofia:test-other:tasks'),'other');assert.equal(store.has('sofia:test-web:history'),false);
 assert.equal(store.get('sofia:test-web:_budget:image:'+new Date().toISOString().slice(0,10)),1);assert.equal(store.has('sofia:test-web:_budget:activity'),false);
});
test('reset refuses excessive key counts and storage outage blocks AI access',async()=>{
 setup();for(let i=0;i<501;i++)store.set('sofia:test-web:fixture:'+i,'x');const r=response();await session(req('POST',{operation:'reset_test'}),r);assert.equal(r.code,409);assert.equal(store.has('sofia:test-web:fixture:0'),true);
 globalThis.fetch=async()=>{throw Error('offline');};const failure=response();assert.equal(await env.guardTestRequest(req(),failure),false);assert.equal(failure.code,503);
});
test('read requests remain available with AI disabled but have a per-IP minute limit',async()=>{
 setup();delete process.env.SOFIA_TEST_ALLOW_PAID;for(let i=0;i<60;i++)assert.equal(await env.guardTestRequest(req('GET'),response()),true);const r=response();assert.equal(await env.guardTestRequest(req('GET'),r),false);assert.equal(r.code,429);
});
test('session exposes explicit public-test and AI-enabled metadata without a password',async()=>{
 setup();const r=response();await session(req('GET'),r);assert.deepEqual(r.body,{authenticated:true,testMode:true,paidEnabled:true});
 delete process.env.SOFIA_TEST_ALLOW_PAID;const disabled=response();await session(req('GET'),disabled);assert.equal(disabled.body.paidEnabled,false);
});
const moduleUrls=new Map([['lib/environment.js',url]]);
async function moduleUrl(path){
 if(moduleUrls.has(path))return moduleUrls.get(path);
 let content=await readFile(new URL(path,root),'utf8');
 const imports=[...content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)];
 for(const match of imports){const relative=new URL(match[1],new URL(path,root));const name=relative.pathname.slice(root.pathname.length);content=content.replace(match[1],await moduleUrl(name));}
 const result='data:text/javascript;base64,'+Buffer.from(content).toString('base64');moduleUrls.set(path,result);return result;
}
test('all public API handlers retain normal authorization and reject invalid test configuration',async()=>{
 setup();
 const handlers=[];for(const name of ['chat','live-context','live-memory','memory','realtime','sofia-identity','tasks','tts'])handlers.push([name,(await import(await moduleUrl('api/'+name+'.js'))).default]);
 delete process.env.SOFIA_TEST_MODE;process.env.SOFIA_PASSWORD='fixture-password';
 for(const [name,handler] of handlers){const r=response();await handler(req(),r);assert.equal(r.code,401,name);}
 process.env.SOFIA_TEST_MODE='true';delete process.env.SOFIA_TEST_STORAGE;
 for(const [name,handler] of handlers){const r=response();await handler(req(),r);assert.ok([401,503].includes(r.code),name);}
 assert.equal(calls.length,0);
});
test('task listing uses only the test namespace even when production keys are present',async()=>{
 setup();store.set('sofia:main:tasks',JSON.stringify([{id:'private',title:'Private',status:'open'}]));store.set('sofia:test-web:tasks',JSON.stringify([{id:'test',title:'Test',status:'open'}]));
 const handler=(await import(await moduleUrl('api/tasks.js'))).default,r=response();await handler(req('GET'),r);assert.equal(r.code,200);assert.deepEqual(r.body.tasks.map(t=>t.id),['test']);
 assert.equal(calls.some(c=>c[0]==='GET'&&c[1]==='sofia:main:tasks'),false);
});



 test('daily and minute test limits retain budgets and expose different reliable deadlines',async()=>{
 setup();store.set('sofia:test-web:_budget:chat:'+new Date().toISOString().slice(0,10),50);let r=response();assert.equal(await env.guardTestRequest(req(),r),false);assert.equal(r.body.code,'test_daily_limit');assert.equal(new Date(r.body.retryAt).getUTCHours(),0);
 setup();for(let i=0;i<10;i++){r=response();assert.equal(await env.guardTestRequest(req(),r),true);await r.json({ok:true});}r=response();assert.equal(await env.guardTestRequest(req(),r),false);assert.equal(r.body.code,'test_rate_limit');assert.equal(r.body.retryAfterSeconds,60);
 });
