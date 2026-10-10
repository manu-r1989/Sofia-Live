import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryIdentity,memoryReview,selectMemory} from '../lib/memory-view.js';
const a={text:'Ich wohne in Hamburg.',category:'Sonstiges',createdAt:'2026-10-10T12:00:00Z',updatedAt:null};
test('memory identity changes with the displayed revision',()=>{
 assert.notEqual(memoryIdentity(a),memoryIdentity({...a,updatedAt:'2026-10-10T13:00:00Z'}));
 assert.equal(selectMemory([a],a.text,memoryIdentity(a)).index,0);
 assert.equal(selectMemory([{...a,updatedAt:'2026-10-10T13:00:00Z'}],a.text,memoryIdentity(a)),null);
});
test('ambiguous legacy edits do not choose the first duplicate',()=>{
 assert.equal(selectMemory([a,{...a}],a.text),null);
 assert.equal(selectMemory([a,{...a}],a.text,memoryIdentity(a)),null);
});
test('different duplicate revisions can be selected explicitly',()=>{
 const b={...a,updatedAt:'2026-10-10T13:00:00Z'};
 assert.equal(selectMemory([a,b],a.text,memoryIdentity(b)).index,1);
});
test('review marks conflicting current homes without changing either fact',()=>{
 const b={...a,text:'Ich wohne in Lübeck.'};const result=memoryReview([a,b]);
 assert.ok(result.every(x=>x.review.some(t=>t.includes('Wohnort'))));
 assert.deepEqual(result.map(x=>x.text),[a.text,b.text]);assert.equal(a.review,undefined);
});
for(const text of ['Gestern war ich in Lübeck.','Sofia wohnt in Lübeck.','Meine Freundin wohnt in Lübeck.','Früher wohnte ich in Lübeck.'])test('review separates current residence from '+text,()=>{
 assert.ok(memoryReview([a,{...a,text}]).every(x=>x.review.length===0));
});
test('duplicate review does not create a residence correction',()=>{
 const result=memoryReview([a,{...a,text:'ICH WOHNE IN HAMBURG!'}]);
 assert.ok(result.every(x=>x.review.length===1&&x.review[0].includes('mehrfach')));
});
test('unmatched selection cannot mutate an unrelated memory',()=>assert.equal(selectMemory([a],'Ich mag Kaffee.',memoryIdentity(a)),null));
