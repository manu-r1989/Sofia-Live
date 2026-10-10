import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const app=await readFile(new URL('app.js',root),'utf8');
const block=app.slice(app.indexOf('let latestSofiaLife ='),app.indexOf('const MEMORY_KEY ='));
test('status displays the authoritative life location, safely and without a guessed time schedule',()=>{
 const node={textContent:'…',title:''},window={};
 vm.runInNewContext(block,{window,document:{getElementById:()=>node}});
 for(const location of ['an der Universität in Hamburg','in einem Café','zu Hause im Bett','mit Freunden an der Alster','<img src=x onerror=bad>']) {
  window.SofiaLifeStatus.update({location,activity:'Aktuelle Tätigkeit'});assert.equal(node.textContent,location);assert.equal(node.title,'Aktuelle Tätigkeit');
 }
 window.SofiaLifeStatus.update(null);assert.equal(node.textContent,'<img src=x onerror=bad>');
});
test('header removes old labels and status updates even when conversation history has not changed',async()=>{
 const index=await readFile(new URL('index.html',root),'utf8');
 assert.doesNotMatch(index,/● online|Live conversation|<strong>\s*Sofia\s*<\/strong>/);
 assert.match(index,/id="sofiaLocation" role="status" aria-live="polite"/);
 const sync=app.slice(app.indexOf('async function syncConversationFromServer'),app.indexOf('function startConversationSync'));
 assert.ok(sync.indexOf('updateSofiaLocation(data.life)')<sync.indexOf('signature === lastServerHistorySignature'));
 const live=await readFile(new URL('live.js',root),'utf8');assert.match(live,/SofiaLifeStatus\?\.update\(contextData.life\)/);
});
test('late context or history responses cannot roll the visible location or mood back',()=>{
 const node={textContent:'…',title:''},window={},moods=[];
 vm.runInNewContext(block,{window,app:{dataset:{}},applyMood:m=>moods.push(m),document:{getElementById:()=>node}});
 window.SofiaLifeStatus.update({revision:4,location:'zu Hause',mood:'ernst'});
 window.SofiaLifeStatus.update({revision:3,location:'im Café',mood:'amüsiert'});
 assert.equal(node.textContent,'zu Hause');assert.deepEqual(moods,['ernst']);
});


test('a valid canonical snapshot drives both location and mood, stale snapshot versions fall back safely',()=>{
 const node={textContent:'…',title:''},window={},moods=[];
 vm.runInNewContext(block,{window,app:{dataset:{}},applyMood:m=>moods.push(m),document:{getElementById:()=>node}});
 window.SofiaLifeStatus.update({revision:10,location:'ältere Anzeige',mood:'amüsiert',situation:{schema:1,revision:10,location:'an der Universität in Hamburg',activity:'lernen',mood:'ernst'}});
 assert.equal(node.textContent,'an der Uni');assert.equal(node.title,'lernen');assert.deepEqual(moods,['ernst']);
 window.SofiaLifeStatus.update({revision:11,location:'zu Hause',activity:'auf dem Sofa',situation:{schema:1,revision:9,location:'im Café'}});assert.equal(node.textContent,'zu Hause');
});
