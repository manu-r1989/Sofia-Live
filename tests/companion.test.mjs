import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCompanionState,applyCompanionEdit,companionContext} from '../lib/character-image.js';
test('profile validates enums and revision without mutating the old state',()=>{
 const state=defaultCompanionState(),value={name:'Manu',tone:'warm',humor:'balanced',directness:'direct',mode:'listen'};const next=applyCompanionEdit(state,{revision:0,operation:'profile',value});assert.equal(next.revision,1);assert.equal(state.profile.name,'');assert.match(companionContext(next),/Zuhören/);assert.match(companionContext(next,'help'),/Konkrete Hilfe/);
 assert.throws(()=>applyCompanionEdit(next,{revision:0,operation:'profile',value}));assert.throws(()=>applyCompanionEdit(state,{revision:0,operation:'profile',value:{...value,mode:'execute_everything'}}));
});
test('curated moments archive and restore while unrelated collections remain intact',()=>{
 let state=defaultCompanionState();state.wardrobe=[{id:'outfit',title:'Keep'}];state=applyCompanionEdit(state,{revision:0,operation:'upsert',collection:'moments',value:{title:'Insider',text:'Ein gemeinsam gewählter Satz',kind:'insider'}});const id=state.moments[0].id;state=applyCompanionEdit(state,{revision:1,operation:'archive',collection:'moments',id});assert.equal(state.moments[0].archived,true);assert.doesNotMatch(companionContext(state),/Ein gemeinsam gewählter Satz/);state=applyCompanionEdit(state,{revision:2,operation:'restore',collection:'moments',id});assert.match(companionContext(state),/Ein gemeinsam gewählter Satz/);assert.equal(state.wardrobe[0].title,'Keep');
});
test('memory confirmations are keyed to the shown memory version rather than duplicating on repeat',()=>{
 const value={title:'Bestätigt',text:'Eine Erinnerung',kind:'confirmed',reference:'memory-version'};let state=applyCompanionEdit(defaultCompanionState(),{revision:0,operation:'upsert',collection:'memoryReviews',value});state=applyCompanionEdit(state,{revision:1,operation:'upsert',collection:'memoryReviews',value});assert.equal(state.memoryReviews.length,1);assert.equal(state.memoryReviews[0].reference,value.reference);
});
