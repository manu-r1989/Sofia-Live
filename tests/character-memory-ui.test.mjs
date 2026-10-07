import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('async function saveCharacterEdit'),source.indexOf('function renderEmptyMemory'));
function harness(responseOk=true){
 class Node{constructor(tag){this.tag=tag;this.children=[];this.style={};this.textContent='';}append(...nodes){this.children.push(...nodes);}}
 const root=new Node('div'),requests=[],status=[];let reloads=0;
 const state={revision:7,location:'zu Hause',activity:'lesen',outfit:'Pullover',hairstyle:'Haare offen',mood:'entspannt',moodMode:'auto',preferences:[{topic:'buch',value:'<img src=x onerror=bad>'}],threads:[{topic:'arbeit',text:'Ein schwieriger Arbeitstag',status:'open'}]};
 const context=vm.createContext({memoryList:root,latestSofiaLife:state,document:{createElement:tag=>new Node(tag),getElementById:()=>null},window:{prompt:()=>null,location:{reload(){throw Error('unexpected reload');}}},updateSofiaLocation(){},setMemoryStatus:text=>status.push(text),loadLongTermMemories:async()=>reloads++,fetch:async(url,opts)=>{requests.push({url,...JSON.parse(opts.body)});return {status:responseOk?200:409,ok:responseOk,json:async()=>responseOk?{character:state}:{error:'Zustand geändert'}};}});
 vm.runInContext(block,context);context.renderCharacterMemories(state);
 return {root,requests,status,state,context,reloads:()=>reloads};
}
test('character memory UI labels owners, renders strings safely and sends versioned removal separately',async()=>{
 const h=harness();assert.equal(h.root.children[0].textContent,'Über Sofia');
 const row=h.root.children.find(n=>n.children[0]?.textContent.startsWith('Vorliebe: buch'));
 assert.equal(row.children[0].textContent,'Vorliebe: buch: <img src=x onerror=bad>');
 assert.equal(row.children[0].children.length,0);
 await row.children.find(n=>n.textContent==='Entfernen').onclick();
 assert.equal(h.requests[0].url,'/api/memory');assert.equal(h.requests[0].scope,'character');assert.equal(h.requests[0].revision,7);assert.equal(h.requests[0].value,'');assert.equal(h.reloads(),1);
});
test('conflicting character edits show feedback and do not claim or render success',async()=>{
 const h=harness(false);assert.equal(await h.context.saveCharacterEdit('mood','ernst',undefined,7),false);
 assert.deepEqual(h.status,['Zustand geändert']);assert.equal(h.reloads(),0);
});

test('conversation settings use revision guarded character API and habits can be reset',async()=>{
 const h=harness();const controls=h.root.children.find(n=>n.children.some(x=>x.textContent==='Gesprächseinstellungen speichern'));
 const selects=controls.children.flatMap(n=>n.children).filter(n=>n.tag==='select');selects[0].value='quiet';selects[1].value='short';
 const photos=controls.children.flatMap(n=>n.children).find(n=>n.type==='checkbox');photos.checked=false;
 await controls.children.find(n=>n.textContent==='Gesprächseinstellungen speichern').onclick();
 assert.deepEqual(h.requests[0].value,{initiative:'quiet',replyLength:'short',photos:false});assert.equal(h.requests[0].revision,7);
 await h.root.children.find(n=>n.textContent==='Gesprächsgewohnheiten zurücksetzen').onclick();assert.equal(h.requests[1].field,'habits');
});

test('character overview renders own plans, history and development safely and resets shared phrases',async()=>{
 const h=harness();h.state.plans=[{topic:'buch',text:'Roman lesen',status:'active',history:[{at:'2026-10-06T12:00Z',status:'active',reason:'Weitergelesen'}]}];h.state.development=[{topic:'buch',text:'Kapitel 3',at:'2026-10-06T12:00Z',reason:'Weitergelesen'}];h.state.sharedPhrases=[{text:'Team Kaffeepause',count:2}];h.context.renderCharacterMemories(h.state);
 assert.ok(h.root.children.some(x=>x.textContent==='Sofias eigene Vorhaben'));assert.ok(h.root.children.some(x=>x.children[0]?.textContent==='In Arbeit: buch: Roman lesen'));
 assert.ok(h.root.children.some(x=>x.textContent.includes('Kapitel 3')));
 await h.root.children.find(x=>x.textContent==='Vertraute Gesprächsbezüge zurücksetzen').onclick();assert.equal(h.requests[0].field,'sharedPhrases');assert.equal(h.requests[0].revision,7);
});
