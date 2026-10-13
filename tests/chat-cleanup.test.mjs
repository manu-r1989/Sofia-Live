import test from 'node:test';
import assert from 'node:assert/strict';
import {chatCleanupPlan,CHAT_CLEANUP_SCRIPT,visibleConversation} from '../lib/message-context.js';
const turn=(content,createdAt)=>({role:'user',content,createdAt});
test('cleanup uses Hamburg days and seven calendar dates across a daylight-saving change',()=>{
 const now=new Date('2026-10-25T23:30Z'),items=[turn('old','2026-10-19T22:00Z'),turn('start','2026-10-19T22:01Z'),turn('today','2026-10-25T23:01Z'),turn('yesterday','2026-10-25T22:59Z')];
 assert.deepEqual(chatCleanupPlan(items,[],'today','',now).turns.map(x=>x.content),['today']);
 assert.equal(chatCleanupPlan(items,[],'week','',now).messageCount,4);
 assert.equal(chatCleanupPlan(items,[],'date','2026-10-25',now).messageCount,1);
});
test('cleanup deduplicates messages, includes undated legacy messages only in all, and snapshots photo ids',()=>{
 const t=turn('text','2026-10-13T19:00Z'),legacy={role:'assistant',content:'Legacy'},images=[{id:'one',createdAt:t.createdAt},{id:'two',createdAt:t.createdAt,chatHidden:true}];
 const plan=chatCleanupPlan([t,t,legacy],images,'today','',new Date('2026-10-13T20:00Z'));assert.equal(plan.messageCount,1);assert.deepEqual(plan.photoIds,['one']);assert.equal(chatCleanupPlan([t,legacy],images,'all').messageCount,2);
 assert.deepEqual(visibleConversation([t],plan.turns),[]);assert.deepEqual(images,[{id:'one',createdAt:t.createdAt},{id:'two',createdAt:t.createdAt,chatHidden:true}]);
});
test('invalid date and scope cannot produce a cleanup snapshot',()=>{
 for(const date of ['2026-02-30','2026-13-01','bad'])assert.throws(()=>chatCleanupPlan([],[],'date',date));assert.throws(()=>chatCleanupPlan([],[],'unknown'));
});
test('atomic cleanup and undo touch only history, visibility and their snapshot; no memory/task/image deletion',()=>{
 assert.match(CHAT_CLEANUP_SCRIPT,/job.status~='ready'/);assert.match(CHAT_CLEANUP_SCRIPT,/job.hiddenAdded/);assert.match(CHAT_CLEANUP_SCRIPT,/job.photoAdded/);assert.match(CHAT_CLEANUP_SCRIPT,/job.status='undone'/);assert.doesNotMatch(CHAT_CLEANUP_SCRIPT,/redis.call\('DEL'|longterm|tasks|image:|KEYS\[5\]/);
});
