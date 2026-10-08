import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('async function saveCharacterEdit'),source.indexOf('function renderEmptyMemory'));
function harness(responseOk=true){
 class Node{constructor(tag){this.tag=tag;this.children=[];this.style={};this.textContent='';}append(...nodes){this.children.push(...nodes);}setAttribute(key,value){this[key]=value;}}
 const root=new Node('div'),requests=[],status=[];let reloads=0;
 const state={revision:7,location:'zu Hause',activity:'lesen',outfit:'Pullover',hairstyle:'Haare offen',mood:'entspannt',moodMode:'auto',preferences:[{topic:'buch',value:'<img src=x onerror=bad>'}],threads:[{topic:'arbeit',text:'Ein schwieriger Arbeitstag',status:'open'}]};
 const context=vm.createContext({memoryList:root,latestSofiaLife:state,document:{createElement:tag=>new Node(tag),getElementById:()=>null},window:{prompt:()=>null,location:{reload(){throw Error('unexpected reload');}}},updateSofiaLocation(){},setMemoryStatus:text=>status.push(text),loadLongTermMemories:async()=>reloads++,fetch:async(url,opts)=>{requests.push({url,...JSON.parse(opts.body)});return {status:responseOk?200:409,ok:responseOk,json:async()=>responseOk?{character:state}:{error:'Zustand geändert'}};}});
 vm.runInContext(block,context);context.renderCharacterMemories(state);
 return {root,requests,status,state,context,reloads:()=>reloads};
}
const all=root=>root.children.flatMap(n=>[n,...all(n)]);
test('character memory UI labels owners, renders strings safely and sends versioned removal separately',async()=>{
 const h=harness();assert.equal(h.root.children[0].textContent,'Über Sofia');
 const row=all(h.root).find(n=>n.children[0]?.textContent.startsWith('Vorliebe: buch'));
 assert.equal(row.children[0].textContent,'Vorliebe: buch: <img src=x onerror=bad>');
 assert.equal(row.children[0].children.length,0);
 await row.children.find(n=>n.textContent==='Vergessen').onclick();
 assert.equal(h.requests[0].url,'/api/memory');assert.equal(h.requests[0].scope,'character');assert.equal(h.requests[0].revision,7);assert.equal(h.requests[0].field,'forget');assert.equal(h.requests[0].value,'preference');assert.equal(h.requests[0].topic,'buch');assert.equal(h.reloads(),1);
});
test('conflicting character edits show feedback and do not claim or render success',async()=>{
 const h=harness(false);assert.equal(await h.context.saveCharacterEdit('mood','ernst',undefined,7),false);
 assert.deepEqual(h.status,['Zustand geändert']);assert.equal(h.reloads(),0);
});

test('conversation settings use revision guarded character API and habits can be reset',async()=>{
 const h=harness();const controls=all(h.root).find(n=>n.children.some(x=>x.textContent==='Gesprächseinstellungen speichern'));
 const selects=controls.children.flatMap(n=>n.children).filter(n=>n.tag==='select');selects[0].value='quiet';selects[1].value='short';
 const photos=controls.children.flatMap(n=>n.children).find(n=>n.type==='checkbox');photos.checked=false;
 await controls.children.find(n=>n.textContent==='Gesprächseinstellungen speichern').onclick();
 assert.deepEqual(h.requests[0].value,{initiative:'quiet',replyLength:'short',photos:false,photoMix:'mixed'});assert.equal(h.requests[0].revision,7);
 assert.equal(all(h.root).find(n=>n.textContent==='Gespräch und Fotos').tag,'summary');
});

test('character overview groups own plans, history and development and forgets individual phrases',async()=>{
 const h=harness();h.state.plans=[{topic:'buch',text:'Roman lesen',status:'active',history:[{at:'2026-10-06T12:00Z',status:'active',reason:'Weitergelesen'}]}];h.state.development=[{topic:'buch',text:'Kapitel 3',at:'2026-10-06T12:00Z',reason:'Weitergelesen'}];h.state.sharedPhrases=[{text:'Team Kaffeepause',count:2}];h.context.renderCharacterMemories(h.state);
 assert.ok(all(h.root).some(x=>x.textContent==='Sofias eigene Vorhaben'));assert.ok(all(h.root).some(x=>x.children[0]?.textContent==='In Arbeit: buch: Roman lesen'));
 assert.ok(all(h.root).some(x=>x.textContent.includes('Kapitel 3')));
 const phrase=all(h.root).find(x=>x.children[0]?.textContent==='Vertraute Formulierung: Team Kaffeepause');await phrase.children.find(x=>x.textContent==='Vergessen').onclick();assert.equal(h.requests[0].field,'forget');assert.equal(h.requests[0].value,'sharedPhrase');assert.equal(h.requests[0].topic,'Team Kaffeepause');assert.equal(h.requests[0].revision,7);
});


test('photo motive control saves the selected preference and failures keep visible feedback',async()=>{
 const h=harness(false),selects=all(h.root).filter(n=>n.tag==='select');selects[2].value='moments';
 await all(h.root).find(n=>n.textContent==='Gesprächseinstellungen speichern').onclick();
 assert.equal(h.requests[0].value.photoMix,'moments');assert.equal(h.reloads(),0);assert.equal(h.status.at(-1),'Zustand geändert');
 assert.ok(all(h.root).some(n=>n['aria-label']==='Vorliebe: buch vergessen'));
});
