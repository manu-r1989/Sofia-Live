import test from 'node:test';
import assert from 'node:assert/strict';
import {diaryRecord,nextPreferences,parseMedia,cosine,rankSearch,diaryDraft,editNext,semanticSearch,transcribeVoice,analyzeUpload,uploadPlan,confirmUploadEdit} from '../lib/companion-next.js';
import {defaultCompanionState,initiativeFrequency,initiativeWeight,chooseEverydayPhotoKind} from '../lib/character-image.js';
import {buildBackup,validateBackup,mergeBackup} from '../lib/companion-evolution.js';
import {contactKind} from '../lib/social.js';
const id='11111111-1111-4111-8111-111111111111',id2='22222222-2222-4222-8222-222222222222',prefix='sofia:main:portrait:',now=new Date('2026-10-14T12:00:00Z');
test('per-format caps use the Hamburg day and separate text from photos',()=>{
 const items=[{contactKind:'photo',createdAt:now.toISOString()}];
 assert.equal(initiativeFrequency('photo',{photoRate:'less'},items,now),'format_limit');
 assert.equal(initiativeFrequency('observation',{messageRate:'less'},items,now),null);
 assert.equal(initiativeFrequency('photo',{photoRate:'off'},[],now),'format_limit');
 assert.equal(initiativeFrequency('photo',{photoRate:'less'},items,new Date('2026-10-15T12:00Z')),null);
});
test('feedback biases kinds and photo categories without overriding 100 percent photos',()=>{
 assert.ok(initiativeWeight('opinion',[{kind:'opinion',rating:'more'}])>initiativeWeight('opinion',[{kind:'opinion',rating:'less'}]));
 assert.equal(initiativeWeight('photo-selfie',[{kind:'photo',photoKind:'mirror',rating:'less'}]),1);
 const prefs={photos:true,photoShare:100,topics:['opinion'],contactFeedback:[{kind:'opinion',rating:'more'}]};
 assert.equal(contactKind({settings:{}},{sequence:0,read:0,items:[]},[],prefs,()=>0),null);
 assert.equal(chooseEverydayPhotoKind({location:'zu Hause',settings:{photoKinds:['selfie']}},null,'',()=>0,[],[{kind:'photo',photoKind:'environment',rating:'more'}]),'selfie');
});
test('diary validates dates and links and backup retains confirmed text without tasks or audio',()=>{
 assert.throws(()=>diaryRecord({title:'Tag',text:'Text',date:'2026-02-30',imageIds:[]}));
 assert.throws(()=>diaryRecord({title:'Tag',text:'Text',date:'2026-02-20',imageIds:['forged']}));
 const state=defaultCompanionState();state.diary=[diaryRecord({title:'Garten',text:'Ein geprüfter Eintrag.',date:'2026-10-14',imageIds:[]},null,now)];state.nextPreferences={messageRate:'less',photoRate:'more',audioReply:true};
 const backup=buildBackup(state,[],{revision:0,items:[]},now),validated=validateBackup(backup),merged=mergeBackup(defaultCompanionState(),[],{revision:0,items:[]},validated,['settings']);
 assert.equal(merged.state.diary[0].text,'Ein geprüfter Eintrag.');assert.equal(merged.state.nextPreferences.audioReply,true);assert.equal('audio' in backup,false);
 const old=buildBackup(defaultCompanionState(),[],{revision:0,items:[]},now);assert.doesNotThrow(()=>validateBackup(old));
 assert.throws(()=>nextPreferences({messageRate:'every_second',photoRate:'more',audioReply:true}));
});
test('media validation rejects URLs, forged formats and oversized payloads',()=>{
 assert.throws(()=>parseMedia('https://example.test/a.jpg','image'));
 assert.throws(()=>parseMedia('data:image/jpeg;base64,'+Buffer.from('not an image at all').toString('base64'),'image'));
 assert.throws(()=>parseMedia('data:audio/webm;base64,'+'A'.repeat(3200004),'audio'));
 const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(30)]);assert.equal(parseMedia('data:image/jpeg;base64,'+jpeg.toString('base64'),'image').mime,'image/jpeg');
});
test('semantic ranking matches meaning with a synonym and rejects invalid vectors',()=>{
 const docs=[{id:'a',title:'Reise',text:'Unser Urlaub in Spanien'},{id:'b',title:'Kochen',text:'Nudeln zubereiten'}];
 const ranked=rankSearch('Ferien',docs,[[1,0],[0,1]],[1,0]);assert.equal(ranked[0].id,'a');assert.equal(ranked.length,1);
 assert.equal(cosine([NaN],[1]),0);assert.equal(cosine([1],[1,2]),0);
});

const savedEnv={...process.env},originalFetch=globalThis.fetch;let db,providerCalls=[],during=null;
function reset(){db=new Map([[prefix+'companion',JSON.stringify(defaultCompanionState())]]);providerCalls=[];during=null;process.env.SOFIA_TEST_MODE='false';process.env.KV_REST_API_URL='https://next-store.test';process.env.KV_REST_API_TOKEN='fixture';process.env.OPENAI_API_KEY='fixture';}
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('openai.com')){
  providerCalls.push({url,body:options.body instanceof FormData?options.body:JSON.parse(options.body)});if(during)during();
  if(String(url).endsWith('audio/transcriptions'))return {ok:true,json:async()=>({text:'Ein geprüftes Transkript.'})};
  const b=JSON.parse(options.body);
  if(String(url).endsWith('embeddings'))return {ok:true,json:async()=>({data:b.input.map((_,index)=>({index,embedding:[1,...Array(255).fill(0)]}))})};
  if(String(url).endsWith('images/edits'))return {ok:true,json:async()=>({data:[{b64_json:'/9j/AAAA'}]})};
  return {ok:true,json:async()=>({choices:[{message:{content:'Auf dem Bild sind Pflanzen zu sehen.'}}]})};
 }
 assert.equal(url,'https://next-store.test');const a=JSON.parse(options.body),[op,k,v,...extra]=a;let result=null;
 if(op==='GET')result=db.get(k)||null;
 else if(op==='SET'){if(!extra.includes('NX')||!db.has(k)){db.set(k,v);result='OK';}}
 else if(op==='EVAL'){
  if(k.includes('sofia-companion-cas')){if((db.get(a[3])||'')===a[4]){db.set(a[3],a[5]);result=1;}else result=0;}
  else if(k.includes('sofia-upload-gallery')){const list=JSON.parse(db.get(a[3])||'[]');list.push(JSON.parse(a[4]));db.set(a[3],JSON.stringify(list));result=1;}
  else if(k.includes('sofia-companion-usage'))result=1;
  else if(k.includes('sofia-legacy-photo-expiry'))result=1;
  else{if(db.get(a[3])===a[4])db.delete(a[3]);result=1;}
 }else throw Error('Unexpected operation '+op);
 return {ok:true,json:async()=>({result})};
};
test.after(()=>{globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in savedEnv))delete process.env[k];Object.assign(process.env,savedEnv);});
test('monthly review is a source-bound draft and does not save itself',async()=>{
 reset();const state=defaultCompanionState();state.diary=[diaryRecord({title:'Garten',text:'Unsere ausgewählte Geschichte.',date:'2026-10-14',imageIds:[]},null,now)];db.set(prefix+'companion',JSON.stringify(state));
 const draft=await diaryDraft({kind:'month',month:'2026-10'});assert.match(draft.text,/Unsere ausgewählte Geschichte/);assert.equal(draft.sources[0].id,state.diary[0].id);assert.equal(JSON.parse(db.get(prefix+'companion')).diary.length,1);
 await editNext({revision:0,action:'diary_save',draftId:draft.id,value:{title:draft.title,text:draft.text,date:'2026-10-14',imageIds:[]}});assert.equal(JSON.parse(db.get(prefix+'companion')).diary.length,2);
 await assert.rejects(editNext({revision:0,action:'diary_save',value:{title:'Stale',text:'No',date:'2026-10-14',imageIds:[]}}),/Stand geändert/);
});
test('contact feedback uses the server contact kind and replaces previous feedback',async()=>{
 reset();db.set(prefix+'contact-inbox',JSON.stringify({items:[{id,contactKind:'photo',photoKind:'selfie'}]}));
 let state=await editNext({revision:0,action:'feedback',id,value:{rating:'more',kind:'forged'}});assert.equal(state.contactFeedback[0].kind,'photo');assert.equal(state.contactFeedback[0].photoKind,'selfie');
 state=await editNext({revision:1,action:'feedback',id,value:{rating:'less'}});assert.equal(state.contactFeedback.length,1);assert.equal(state.contactFeedback[0].rating,'less');
 await assert.rejects(editNext({revision:2,action:'feedback',id:id2,value:{rating:'like'}}),/nicht mehr verfügbar/);
});
test('voice transcription uploads file bytes and never writes a chat turn',async()=>{
 reset();const data=await transcribeVoice('data:audio/webm;base64,'+Buffer.alloc(32,1).toString('base64'));
 assert.equal(data.transcript,'Ein geprüftes Transkript.');assert.equal(providerCalls[0].body.get('model'),'gpt-4o-mini-transcribe');assert.equal(providerCalls[0].body.get('file').size,32);assert.equal(db.has('sofia:main:history'),false);
});
test('uploaded image edits require reviewed instructions, do not use the Sofia master and are idempotent',async()=>{
 reset();const image='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(30)]).toString('base64');
 const analyzed=await analyzeUpload({image,question:'Was ist zu sehen?'});assert.equal(providerCalls.length,1);
 const plan=await uploadPlan({id:analyzed.id,instruction:'Nur das Licht weicher machen.'});assert.equal(providerCalls.length,1);assert.equal(db.has(prefix+'gallery'),false);
 await assert.rejects(confirmUploadEdit({id:plan.id}),/bestätigen/);const result=await confirmUploadEdit({id:plan.id,confirm:true});assert.equal(result.image.userProvided,true);
 const call=providerCalls.find(x=>x.url.endsWith('images/edits'));assert.equal(call.body.images.length,1);assert.equal(call.body.images[0].image_url,image);assert.match(call.body.prompt,/Never insert Sofia/);
 await confirmUploadEdit({id:plan.id,confirm:true});assert.equal(providerCalls.filter(x=>x.url.endsWith('images/edits')).length,1);assert.equal(JSON.parse(db.get(prefix+'gallery')).length,1);
});
test('semantic search excludes hidden, archived, expired and concurrently deleted source content',async()=>{
 reset();const state=defaultCompanionState();state.topics=[{id,title:'Urlaub',summary:'Spanien',archived:true}];db.set(prefix+'companion',JSON.stringify(state));
 const turn={role:'user',content:'Ferien planen',createdAt:now.toISOString()};db.set('sofia:main:history',JSON.stringify([turn]));db.set('sofia:main:chat-hidden-messages',JSON.stringify([turn]));
 const empty=await semanticSearch({query:'Urlaub'});assert.equal(empty.items.length,0);assert.equal(providerCalls.length,0);
 db.set('sofia:main:chat-hidden-messages','[]');during=()=>db.set('sofia:main:chat-hidden-messages',JSON.stringify([turn]));const result=await semanticSearch({query:'Urlaub'});assert.equal(result.items.length,0);
});
