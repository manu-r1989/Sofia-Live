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
