import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {experienceDefaults,validateExperiences,applyExperienceEdit,composedLook,experienceContext,experienceInitiativeContext,personalityExamples} from '../lib/experience-state.js';
import {defaultCompanionState,normalizeCompanionState,companionContext} from '../lib/character-image.js';
import {buildBackup,validateBackup,mergeBackup} from '../lib/companion-evolution.js';
const now=new Date('2026-10-22T20:00:00Z');
const edit=(s,action,value={},id=null,newId=randomUUID())=>applyExperienceEdit(s,{revision:s.revision,action,value,id},now,newId);
test('old profiles inherit empty experiences without changing clothing, identity or contact permissions',()=>{
 const base=defaultCompanionState();delete base.experiences;const next=normalizeCompanionState(base);
 assert.deepEqual(next.experiences,experienceDefaults());assert.deepEqual(next.contacts,base.contacts);assert.deepEqual(next.clothing,base.clothing);assert.equal(next.currentOutfit,null);
});
test('looks combine exact available garments and temporary wear keeps base style independent',()=>{
 let s=defaultCompanionState();s=edit(s,'garment_add',{title:'Jeans',category:'bottom',text:'Blaue Skinny Jeans'});const jeans=s.experiences.garments[0].id;
 s=edit(s,'garment_add',{title:'Top',category:'top',text:'Weißes figurbetontes Top'});const top=s.experiences.garments[1].id;
 s=edit(s,'look_save',{title:'Figurbetont – Alltag',garmentIds:[jeans,top],occasion:'Alltag'});const look=s.experiences.looks[0].id;
 assert.equal(composedLook(s.experiences,look).text,'Blaue Skinny Jeans; Weißes figurbetontes Top');const original=structuredClone(s.clothing);
 s=edit(s,'look_wear',{hours:4},look);assert.equal(s.currentOutfit.until,'2026-10-23T00:00:00.000Z');assert.deepEqual(s.clothing,original);
 s=edit(s,'archive',{collection:'garments'},jeans);assert.throws(()=>composedLook(s.experiences,look),/fehlt|archiviert/);
 assert.throws(()=>edit(s,'look_wear',{hours:4},look));assert.equal(s.currentOutfit.text,'Blaue Skinny Jeans; Weißes figurbetontes Top');
});
test('look edits replace one component while retaining the exact remaining garment IDs',()=>{
 let s=defaultCompanionState();for(const [title,category]of [['Jeans','bottom'],['Top','top'],['Pullover','top']])s=edit(s,'garment_add',{title,category,text:title});
 const [a,b,c]=s.experiences.garments;s=edit(s,'look_save',{title:'Alltag',garmentIds:[a.id,b.id]});const id=s.experiences.looks[0].id;
 s=edit(s,'look_save',{title:'Alltag',garmentIds:[a.id,c.id]},id);assert.deepEqual(s.experiences.looks[0].garmentIds,[a.id,c.id]);assert.equal(s.experiences.looks.length,1);
});
test('activity steps are explicit, durable and protected against replay and stale cursors',()=>{
 let s=edit(defaultCompanionState(),'activity_start',{kind:'cooking'}),a=s.experiences.activities[0];
 assert.equal(a.steps.length,4);s=edit(s,'activity_step',{cursor:0,note:'Zutaten für Pasta vorhanden'},a.id);
 assert.equal(s.experiences.activities[0].cursor,1);assert.throws(()=>edit(s,'activity_step',{cursor:0},a.id),/aktuell/);
 s=edit(s,'activity_pause',{},a.id);assert.equal(s.experiences.activeActivityId,null);assert.throws(()=>edit(s,'activity_step',{cursor:1},a.id));
 s=edit(s,'activity_resume',{},a.id);assert.equal(s.experiences.activeActivityId,a.id);
 s=edit(s,'activity_start',{kind:'movie'});assert.equal(s.experiences.activities[0].status,'paused');assert.equal(s.experiences.activities[1].status,'active');
 assert.match(companionContext(s),/Filmabend/);assert.doesNotMatch(companionContext(s),/Zutaten für Pasta vorhanden/);
 s=edit(s,'activity_resume',{},a.id);for(let cursor=1;cursor<4;cursor++)s=edit(s,'activity_step',{cursor,note:'Berichteter Schritt '+cursor},a.id);
 assert.equal(s.experiences.activities[0].status,'done');assert.equal(s.experiences.activeActivityId,null);assert.throws(()=>edit(s,'activity_resume',{},a.id));
});
test('source-backed connections preserve their provenance and five historical corrections',()=>{
 let s=defaultCompanionState();const moment=randomUUID();s.moments=[{id:moment,title:'Unser Thema',archived:false}];
 const id=randomUUID(),source={kind:'conversation',at:now.toISOString(),message:'Mein Lieblingsfilm ist jetzt ein anderer.'};
 s=applyExperienceEdit(s,{revision:0,action:'connection_add',value:{title:'Filmabend',text:'Alte Filmvorliebe',relatedIds:[moment]},verifiedSource:source},now,id);
 for(let i=0;i<7;i++)s=edit(s,'connection_update',{text:'Aktuelle Filmvorliebe '+i},id);
 const row=s.experiences.connections[0];assert.equal(row.history.length,5);assert.deepEqual(row.source,source);assert.equal(row.text,'Aktuelle Filmvorliebe 6');assert.deepEqual(row.relatedIds,[moment]);
 assert.match(experienceContext(s),/Aktuelle Filmvorliebe 6/);assert.doesNotMatch(experienceContext(s),/Alte Filmvorliebe/);
 s=edit(s,'archive',{collection:'connections'},id);assert.doesNotMatch(experienceContext(s),/Aktuelle Filmvorliebe 6/);
 assert.throws(()=>edit(s,'connection_add',{title:'Ungültig',text:'Hallo',relatedIds:[randomUUID()]}),/fehlt/);
});
test('personal role preferences remain explicit user data and personality examples cover every axis',()=>{
 let s=edit(defaultCompanionState(),'preference_add',{title:'Musik',text:'Sofia mag spanische Gitarrenmusik.'});
 assert.match(companionContext(s),/Gitarrenmusik/);assert.match(experienceContext(s),/keine reale Biografie/);
 assert.equal(personalityExamples(s.personality).length,8);assert.notEqual(personalityExamples({wit:0})[1][1],personalityExamples({wit:4})[1][1]);
 s=edit(s,'archive',{collection:'preferences'},s.experiences.preferences[0].id);assert.doesNotMatch(experienceContext(s),/Gitarrenmusik/);
});
test('initiative selection changes only permitted types, keeping frequency settings and limits unchanged',()=>{
 const s=defaultCompanionState();s.limits.images=12;s.nextPreferences.messageRate='less';
 const next=edit(s,'initiative',{activityKinds:['walk'],resume:true,sharedReferences:false});assert.equal(next.contacts.activities,true);assert.deepEqual(next.contacts.topics,s.contacts.topics);assert.deepEqual(next.limits,s.limits);assert.deepEqual(next.nextPreferences,s.nextPreferences);
 assert.match(experienceInitiativeContext(next),/Spaziergang/);assert.doesNotMatch(experienceInitiativeContext(next),/Filmabend/);
 const pausedOnly=edit(s,'initiative',{activityKinds:[],resume:true,sharedReferences:false});assert.equal(pausedOnly.contacts.activities,true);
 const off=edit(next,'initiative',{activityKinds:[],resume:false,sharedReferences:false});assert.equal(off.contacts.activities,false);
 assert.throws(()=>edit(s,'initiative',{activityKinds:['unknown']}));
});
test('portable backups include personal additions and restore active activities paused',()=>{
 let s=edit(defaultCompanionState(),'activity_start',{kind:'walk'});s=edit(s,'preference_add',{title:'Alltag',text:'Kaffee am Morgen'});
 const backup=buildBackup(s,[],{revision:0,selectedId:null,items:[]},now),validated=validateBackup(backup);
 assert.equal(validated.settings.experiences.activities[0].status,'paused');assert.equal(validated.settings.experiences.activeActivityId,null);
 const restored=mergeBackup(defaultCompanionState(),[],{revision:0,selectedId:null,items:[]},validated);
 assert.equal(restored.state.experiences.preferences[0].text,'Kaffee am Morgen');assert.equal(restored.state.experiences.activities[0].status,'paused');
});
test('invalid, oversized or contradictory portable state fails instead of guessing replacements',()=>{
 assert.throws(()=>validateExperiences({...experienceDefaults(),schema:2}));
 assert.throws(()=>edit(defaultCompanionState(),'series_save',{title:'Unvollständig',motifs:['Ein Motiv']}));
 assert.throws(()=>edit(defaultCompanionState(),'series_save',{title:'Zu viel',motifs:Array(5).fill('Motiv')}));
 const s=edit(defaultCompanionState(),'activity_start',{kind:'walk'}),bad=structuredClone(s.experiences);bad.activities[0].cursor=2;assert.throws(()=>validateExperiences(bad));
 assert.throws(()=>applyExperienceEdit(s,{revision:0,action:'activity_step',id:s.experiences.activeActivityId,value:{cursor:0}},now,randomUUID()),/geändert/);
 assert.throws(()=>edit(defaultCompanionState(),'garment_add',{title:'A',category:'unknown',text:'B'}));
});

test('restoring an older backup preserves existing new companion data and merging retains unrelated IDs',()=>{
 let current=edit(defaultCompanionState(),'preference_add',{title:'Musik',text:'Gitarrenmusik'});const original=current.experiences.preferences[0].id;
 const raw=defaultCompanionState();delete raw.experiences;const old=validateBackup(buildBackup(raw,[],{revision:0,selectedId:null,items:[]},now));
 const restored=mergeBackup(current,[],{revision:0,selectedId:null,items:[]},old);assert.equal(restored.state.experiences.preferences[0].id,original);
 const incoming=edit(defaultCompanionState(),'preference_add',{title:'Alltag',text:'Kaffee'}),validated=validateBackup(buildBackup(incoming,[],{revision:0,selectedId:null,items:[]},now));
 const merged=mergeBackup(current,[],{revision:0,selectedId:null,items:[]},validated);assert.equal(merged.state.experiences.preferences.length,2);
});
