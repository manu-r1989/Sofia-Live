import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCalendar,zonedInstant,availableSlots,calendarICS,overlaps,growthRecord,routineView,conversationPreferences,calendarPreview,calendarConfirm,slotPreview,slotConfirm,editGrowth,growthOverview,correctMemory,memoryTrace} from '../lib/companion-growth.js';
import {defaultCompanionState,applyCompanionEdit,memoryVersion,memoryReplyReferences,trustedMemoryHistory,filterCompanionMemories,companionContext} from '../lib/character-image.js';
import {adaptiveQuiz,buildBackup,validateBackup,mergeBackup} from '../lib/companion-evolution.js';
const now=new Date('2026-10-15T08:00:00Z'),id='11111111-1111-4111-8111-111111111111',taskId='22222222-2222-4222-8222-222222222222',prefix='sofia:main:portrait:';
const ics=(content='DTSTART;TZID=Europe/Berlin:20261015T100000\r\nDTEND;TZID=Europe/Berlin:20261015T110000')=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:meeting\r\nSUMMARY:Planung\r\n'+content+'\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
test('calendar handles Berlin time, UTC and exclusive all-day end across DST',()=>{
 assert.equal(zonedInstant('2026-10-15T10:00'),'2026-10-15T08:00:00.000Z');
 const events=parseCalendar(ics());assert.equal(events[0].start,'2026-10-15T08:00:00.000Z');
 const allDay=parseCalendar(ics('DTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261026'))[0];assert.equal((Date.parse(allDay.end)-Date.parse(allDay.start))/3600000,25);
 assert.throws(()=>zonedInstant('2026-03-29T02:30'),/existiert/);assert.throws(()=>zonedInstant('2026-10-25T02:30'),/Doppelte/);assert.throws(()=>zonedInstant('2026-02-30T10:00'));
});
test('unsupported recurrence, invalid ends and transparent appointments cannot create false busy slots',()=>{
 assert.throws(()=>parseCalendar(ics('DTSTART:20261015T080000Z\r\nDTEND:20261015T090000Z\r\nRRULE:FREQ=WEEKLY')),/Serientermine/);
 assert.throws(()=>parseCalendar(ics('DTSTART:20261015T080000Z\r\nDTEND:20261015T070000Z')));
 assert.throws(()=>parseCalendar(ics('DTSTART:20261015T080000Z\r\nDTEND:20261015T090000Z\r\nTRANSP:TRANSPARENT')),/Keine vollständigen/);
});
test('slots exclude overlaps and confirmed plans but do not invent external free/busy knowledge',()=>{
 const state=defaultCompanionState();state.calendarEvents=parseCalendar(ics());state.calendarSettings.enabled=true;
 const slots=availableSlots(state,{date:'2026-10-15',from:'10:00',until:'12:00',minutes:30},now);assert.equal(slots[0].start,'2026-10-15T09:00:00.000Z');
 assert.equal(overlaps({start:'2026-10-15T08:00Z',end:'2026-10-15T09:00Z'},{start:'2026-10-15T09:00Z',end:'2026-10-15T09:30Z'}),false);
 state.calendarSettings.enabled=false;assert.equal(availableSlots(state,{date:'2026-10-15',from:'10:00',until:'12:00',minutes:30},now)[0].start,'2026-10-15T08:00:00.000Z');
 state.calendarEvents[0].source='planned';assert.equal(availableSlots(state,{date:'2026-10-15',from:'10:00',until:'12:00',minutes:30},now)[0].start,'2026-10-15T09:00:00.000Z');
});
test('ICS export escapes user content, folds UTF-8 safely and uses stable UIDs',()=>{
 const event={id,title:'Ä'.repeat(110)+'\nBEGIN:VEVENT;foo,bar',start:'2026-10-15T08:00:00Z',end:'2026-10-15T09:00:00Z'},value=calendarICS(event,now);
 assert.equal((value.match(/BEGIN:VEVENT/g)||[]).length,2);assert.ok(value.includes('\\nBEGIN:VEVENT\\;foo\\,bar'));assert.match(value,/DTSTART:20261015T080000Z/);assert.equal(value.match(/UID:(.*)/)[1].trim(),id+'@sofia.local');for(const line of value.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);assert.equal(parseCalendar(value)[0].start,event.start.replace('Z','.000Z'));
});
test('routine status comes only from explicit current-day marks and archived routines are not due',()=>{
 const routine=growthRecord('routines',{title:'Morgen',kind:'morning',steps:[{title:'Wasser'},{title:'Planen'}],days:[0,1,2,3,4,5,6]},null,now);
 assert.equal(routineView(routine,now).completed,0);routine.history=[{day:'2026-10-15',stepId:routine.steps[0].id,title:'Wasser',status:'done',at:now.toISOString()},{day:'2026-10-15',stepId:routine.steps[1].id,title:'Planen',status:'skipped',at:now.toISOString()}];
 assert.equal(routineView(routine,now).completed,1);assert.equal(routineView(routine,now).skipped,1);assert.equal(routineView(routine,new Date(+now+86400000)).completed,0);routine.paused=true;assert.equal(routineView(routine,now).due,false);
});
test('adaptive rounds repeat actual missed questions and increase difficulty after demonstrated results',()=>{
 let state=defaultCompanionState(),quiz=adaptiveQuiz(state,'nature',now);assert.equal(quiz.difficulty,'easy');state.game=quiz;state=applyCompanionEdit(state,{revision:0,operation:'game',value:{action:'answer',step:0,choice:(quiz.definition.questions[0].answer+1)%3}},now);
 assert.equal(state.learningCards[0].errors,1);assert.equal(state.learningCards[0].dueAt,now.toISOString());assert.equal(adaptiveQuiz(state,'nature',now).definition.questions[0].learningId,quiz.definition.questions[0].learningId);
 state.learningCards=[];state.activityResults=Array(3).fill({type:'quiz',interest:'nature',score:3,total:3,at:now.toISOString()});assert.equal(adaptiveQuiz(state,'nature',now).difficulty,'advanced');
});
test('memory category pauses expire, validated references cannot be forged by client history',()=>{
 const item={text:'Ich mag Kaffee.',category:'Vorlieben'},state=defaultCompanionState(),reference=memoryVersion(item);state.memoryPauses=[{category:'Vorlieben',until:new Date(+now+3600000).toISOString()}];assert.equal(filterCompanionMemories([item],state,now).length,0);assert.equal(filterCompanionMemories([item],state,new Date(+now+7200000)).length,1);
 assert.deepEqual(memoryReplyReferences([0,1,1,90,'1'],[item]),[reference]);const turn={role:'assistant',content:'Kaffee',createdAt:now.toISOString(),memoryTraceVersion:1,memoryReferences:[reference]};assert.equal(trustedMemoryHistory([turn],[])[0].memoryTraceVersion,undefined);assert.deepEqual(trustedMemoryHistory([{...turn,memoryReferences:['forged']}],[turn])[0].memoryReferences,[reference]);
 const c=conversationPreferences({length:'brief',humor:'off',questions:'careful',transitions:'gentle'});state.conversationPreferences=c;assert.match(companionContext(state),/1 bis 3 Sätze/);assert.match(companionContext(state),/keine ungefragten Scherze/);
});
test('backup preserves new records but does not silently reactivate calendar consent',()=>{
 const state=defaultCompanionState();state.routines=[growthRecord('routines',{title:'Morgen',kind:'morning',steps:[{title:'Planen'}],days:[1,2,3,4,5]})];state.calendarEvents=parseCalendar(ics());state.calendarSettings.enabled=true;
 const validated=validateBackup(buildBackup(state,[],{revision:0,items:[]})),merged=mergeBackup(defaultCompanionState(),[],{revision:0,items:[]},validated,['settings']);assert.equal(merged.state.routines[0].steps.length,1);assert.equal(merged.state.calendarEvents.length,1);assert.equal(merged.state.calendarSettings.enabled,false);
});

const originalFetch=globalThis.fetch,saved={...process.env};let db;
function reset(){db=new Map([[prefix+'companion',JSON.stringify(defaultCompanionState())]]);process.env.SOFIA_TEST_MODE='false';process.env.KV_REST_API_URL='https://growth-store.test';process.env.KV_REST_API_TOKEN='fixture';}
globalThis.fetch=async(url,options)=>{assert.equal(url,'https://growth-store.test');const a=JSON.parse(options.body),[op,k,v,...extra]=a;let result=null;
 if(op==='GET')result=db.get(k)||null;else if(op==='SET'){db.set(k,v);result='OK';}else if(op==='DEL'){result=Number(db.delete(k));}else if(op==='EVAL'){
  if(k.includes('sofia-companion-cas')){result=(db.get(a[3])||'')===a[4]?1:0;if(result)db.set(a[3],a[5]);}
  else if(k.includes('sofia-memory-correct')){result=(db.get(a[3])||'')===a[5]&&(db.get(a[4])||'')===a[6]?1:0;if(result){db.set(a[3],a[7]);db.set(a[4],a[8]);}}
  else if(k.includes('sofia-legacy-photo-expiry'))result=1;
  else throw Error('Unexpected script');
 }else throw Error('Unexpected command '+op);return {ok:true,json:async()=>({result})};};
test.after(()=>{globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);});
test('calendar preview requires consent, does not save and rejects stale confirmation',async()=>{
 reset();await assert.rejects(calendarPreview({file:ics()}),/freigeben/);const preview=await calendarPreview({file:ics(),consent:true});assert.equal(JSON.parse(db.get(prefix+'companion')).calendarEvents.length,0);
 db.set(prefix+'companion',JSON.stringify({...defaultCompanionState(),revision:1}));await assert.rejects(calendarConfirm({id:preview.id,ids:[preview.events[0].id],confirm:true}),/Stand geändert/);
 const fresh=await calendarPreview({file:ics(),consent:true});await calendarConfirm({id:fresh.id,ids:[fresh.events[0].id],confirm:true});assert.equal(JSON.parse(db.get(prefix+'companion')).calendarSettings.enabled,true);assert.equal(db.has(prefix+'calendar-preview:'+fresh.id),false);
});
test('confirmed slot creates one plan only and a concurrent blocker invalidates a preview',async()=>{
 reset();const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.parse(start)+1800000).toISOString(),preview=await slotPreview({title:'Lesen',start,end});assert.equal(JSON.parse(db.get(prefix+'companion')).calendarEvents.length,0);
 await assert.rejects(slotConfirm({id:preview.id}),/bestätigen/);await slotConfirm({id:preview.id,confirm:true});await slotConfirm({id:preview.id,confirm:true});assert.equal(JSON.parse(db.get(prefix+'companion')).calendarEvents.length,1);
 await assert.rejects(slotPreview({title:'Anderer Termin',start,end}),/belegt/);
});
test('project evidence counts completed tasks and missing task links do not become progress',async()=>{
 reset();const state=defaultCompanionState();state.steps=[{id,projectId:id,title:'Prüfen',taskId,dependencies:[],progress:100}];db.set(prefix+'companion',JSON.stringify(state));db.set(prefix+'shared-projects',JSON.stringify({revision:0,items:[{id,title:'Projekt',status:'active',taskIds:[taskId]}]}));db.set('sofia:main:tasks',JSON.stringify([{id:taskId,title:'Prüfen',status:'completed'}]));let result=await growthOverview();assert.equal(result.projects[0].completedTasks,1);assert.equal(result.projects[0].steps[0].progress,100);
 db.set('sofia:main:tasks','[]');result=await growthOverview();assert.equal(result.projects[0].completedTasks,0);assert.equal(result.projects[0].steps[0].progress,0);assert.equal(result.projects[0].missingTasks.length,1);
});
test('direct correction preserves temporary policy and trace cannot expose deleted or paused memories',async()=>{
 reset();const item={text:'Kaffee',category:'Vorlieben',createdAt:null,updatedAt:null},reference=memoryVersion(item),state=defaultCompanionState();state.memoryPolicies=[{reference,scope:'temporary',expiresAt:new Date(Date.now()+86400000).toISOString()}];db.set(prefix+'companion',JSON.stringify(state));db.set('sofia:main:longterm',JSON.stringify([item]));const turn={role:'assistant',content:'Ein Kaffee?',createdAt:now.toISOString(),memoryTraceVersion:1,memoryReferences:[reference]};db.set('sofia:main:history',JSON.stringify([turn]));assert.equal((await memoryTrace({turn})).items.length,1);
 const result=await correctMemory({reference,text:'Tee',category:'Vorlieben'});const updated=JSON.parse(db.get('sofia:main:longterm'))[0];assert.equal(result.state.memoryPolicies[0].reference,memoryVersion(updated));assert.equal(result.state.memoryPolicies[0].scope,'temporary');assert.equal((await memoryTrace({turn})).items.length,0);
 await assert.rejects(correctMemory({reference,text:'Wasser',category:'Vorlieben'}),/geändert/);
});
test('routine edits reject stale revisions and preserve unrelated settings',async()=>{
 reset();let result=await editGrowth({revision:0,action:'upsert',collection:'routines',value:{title:'Abend',kind:'evening',steps:[{title:'Lesen'}],days:[0,1,2,3,4,5,6]}});assert.equal(result.diary.length,0);await assert.rejects(editGrowth({revision:0,action:'routine_pause',id:result.routines[0].id,value:{paused:true}}),/Stand geändert/);result=await editGrowth({revision:1,action:'routine_pause',id:result.routines[0].id,value:{paused:true}});assert.equal(result.routines[0].paused,true);
});
test('retained done photos can be annotated and associated with projects without changing their bytes',async()=>{
 reset();const at=new Date().toISOString(),photo={id,caption:'Testfoto',createdAt:at,sentAt:at,published:true};db.set(prefix+'gallery',JSON.stringify([photo]));db.set(prefix+'image:'+id,JSON.stringify({...photo,base64:'unchanged'}));
 let overview=await growthOverview();assert.equal(overview.images.length,1);
 const state=await editGrowth({revision:0,action:'upsert',collection:'photoNotes',value:{title:'Mein Motiv',imageId:id,tags:'Garten',text:'Prüfnotiz'}});assert.equal(state.photoNotes[0].imageId,id);assert.equal(JSON.parse(db.get(prefix+'image:'+id)).base64,'unchanged');
 overview=await growthOverview();assert.equal(overview.images[0].id,id);
});
test('legacy plain-string memories retain their audit identity through explicit correction',async()=>{
 reset();db.set('sofia:main:longterm',JSON.stringify(['Alte Angabe']));const reference=memoryVersion({text:'Alte Angabe'}),state=defaultCompanionState();state.memoryPolicies=[{reference,scope:'temporary',expiresAt:new Date(Date.now()+86400000).toISOString()}];db.set(prefix+'companion',JSON.stringify(state));
 const result=await correctMemory({reference,text:'Geprüfte neue Angabe',category:'Sonstiges'}),item=JSON.parse(db.get('sofia:main:longterm'))[0];assert.equal(item.text,'Geprüfte neue Angabe');assert.equal(result.state.memoryPolicies[0].reference,memoryVersion(item));
});
