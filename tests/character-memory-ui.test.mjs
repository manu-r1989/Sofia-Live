import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('let flushCharacterSettings'),source.indexOf('function renderEmptyMemory'));
function harness(responseOk=true){
 class Node{constructor(tag){this.tag=tag;this.children=[];this.style={};this.textContent='';}append(...nodes){this.children.push(...nodes);}setAttribute(key,value){this[key]=value;}}
 const root=new Node('div'),requests=[],status=[],storage=new Map();let reloads=0;
 const state={revision:7,location:'zu Hause',activity:'lesen',outfit:'Pullover',hairstyle:'Haare offen',mood:'entspannt',moodMode:'auto',preferences:[{topic:'buch',value:'<img src=x onerror=bad>'}],threads:[{topic:'arbeit',text:'Ein schwieriger Arbeitstag',status:'open'}]};
 const context=vm.createContext({memoryList:root,latestSofiaLife:state,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{createElement:tag=>new Node(tag),getElementById:()=>null},window:{prompt:()=>null,location:{reload(){throw Error('unexpected reload');}}},updateSofiaLocation(){},setMemoryStatus:text=>status.push(text),loadLongTermMemories:async()=>reloads++,fetch:async(url,opts)=>{if(!opts?.method)return {ok:true,json:async()=>({character:state})};requests.push({url,...JSON.parse(opts.body)});return {status:responseOk?200:409,ok:responseOk,json:async()=>responseOk?{character:state}:{error:'Zustand geändert'}};}});
 vm.runInContext(block,context);context.renderCharacterMemories(state);
 return {root,requests,status,state,storage,context,reloads:()=>reloads};
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
 assert.deepEqual(h.requests[0].value,{initiative:'quiet',replyLength:'short',photos:false,photoKinds:['selfie','environment']});assert.equal(h.requests[0].revision,7);
 assert.equal(all(h.root).find(n=>n.textContent==='Gespräch und Fotos').tag,'summary');
});

test('character overview groups own plans, history and development and forgets individual phrases',async()=>{
 const h=harness();h.state.plans=[{topic:'buch',text:'Roman lesen',status:'active',history:[{at:'2026-10-06T12:00Z',status:'active',reason:'Weitergelesen'}]}];h.state.development=[{topic:'buch',text:'Kapitel 3',at:'2026-10-06T12:00Z',reason:'Weitergelesen'}];h.state.sharedPhrases=[{text:'Team Kaffeepause',count:2}];h.context.renderCharacterMemories(h.state);
 assert.ok(all(h.root).some(x=>x.textContent==='Sofias eigene Vorhaben'));assert.ok(all(h.root).some(x=>x.children[0]?.textContent==='In Arbeit: buch: Roman lesen'));
 assert.ok(all(h.root).some(x=>x.textContent.includes('Kapitel 3')));
 const phrase=all(h.root).find(x=>x.children[0]?.textContent==='Vertraute Formulierung: Team Kaffeepause');await phrase.children.find(x=>x.textContent==='Vergessen').onclick();assert.equal(h.requests[0].field,'forget');assert.equal(h.requests[0].value,'sharedPhrase');assert.equal(h.requests[0].topic,'Team Kaffeepause');assert.equal(h.requests[0].revision,7);
});


test('photo motive control saves the selected preference and failures keep visible feedback',async()=>{
 const h=harness(false),checkboxes=all(h.root).filter(n=>n.type==='checkbox'&&n.value);for(const input of checkboxes)input.checked=['portrait','full_selfie'].includes(input.value);
 await all(h.root).find(n=>n.textContent==='Gesprächseinstellungen speichern').onclick();
 assert.deepEqual(h.requests[0].value.photoKinds,['full_selfie','portrait']);assert.equal(h.reloads(),0);assert.match(h.status.at(-1),/Noch nicht gespeichert/);
 assert.ok(all(h.root).some(n=>n['aria-label']==='Vorliebe: buch vergessen'));
});

test('five photo options allow multiple selections and reject enabled photos with no selected kind',async()=>{
 const h=harness(),choices=all(h.root).filter(n=>n.type==='checkbox'&&n.value);assert.equal(choices.length,5);
 for(const choice of choices)choice.checked=false;
 await all(h.root).find(n=>n.textContent==='Gesprächseinstellungen speichern').onclick();assert.equal(h.requests.length,0);assert.match(h.status.at(-1),/mindestens einen Fototyp/);
});
test('toolbar starts closed despite stored open preference and toggles explicitly',()=>{
 const code=source.slice(source.indexOf('const toolsToggle ='),source.indexOf('const moodToggle ='));
 const classes=new Set(),attrs={},stored={sofia_tools_open:'1'};let click;
 const toggle={setAttribute:(k,v)=>attrs[k]=v,classList:{toggle(){}},addEventListener:(type,fn)=>click=fn};
 const ctx=vm.createContext({document:{querySelector:selector=>selector==='#toolsToggle'?toggle:{}},app:{classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key),contains:key=>classes.has(key)}},localStorage:{setItem:(k,v)=>stored[k]=v,getItem:k=>stored[k]}});
 vm.runInContext(code,ctx);assert.equal(classes.has('tools-closed'),true);assert.equal(attrs['aria-expanded'],'false');click();assert.equal(classes.has('tools-closed'),false);assert.equal(attrs['aria-expanded'],'true');
});

test('photo selection saves automatically without the separate save button or rerendering controls',async()=>{
 const h=harness(),choices=all(h.root).filter(n=>n.type==='checkbox'&&n.value);
 choices.find(x=>x.value==='portrait').checked=true;await choices.find(x=>x.value==='portrait').onchange();
 assert.deepEqual(h.requests[0].value.photoKinds,['selfie','portrait','environment']);assert.equal(h.status.at(-1),'Gespeichert.');assert.equal(h.reloads(),0);
 assert.equal(await vm.runInContext('flushCharacterSettings()',h.context),true);assert.equal(h.requests.length,1);
});
test('close flush waits for pending settings writes and sends the latest checkbox state serially',async()=>{
 const h=harness(),choices=all(h.root).filter(n=>n.type==='checkbox'&&n.value);let release,calls=0;
 h.context.fetch=async()=>{calls++;if(calls===1)await new Promise(resolve=>release=resolve);return {ok:true,status:200,json:async()=>({character:{...h.state,revision:7+calls}})};};
 choices.find(x=>x.value==='portrait').checked=true;const first=choices.find(x=>x.value==='portrait').onchange();
 choices.find(x=>x.value==='full_selfie').checked=true;const closed=vm.runInContext('flushCharacterSettings()',h.context);release();
 assert.equal(await first,true);assert.equal(await closed,true);assert.equal(calls,2);assert.equal(h.status.at(-1),'Gespeichert.');
});
test('failed automatic save prevents closing and keeps the changed selection for retry',async()=>{
 const h=harness(false),choices=all(h.root).filter(n=>n.type==='checkbox'&&n.value),portrait=choices.find(x=>x.value==='portrait');portrait.checked=true;
 assert.equal(await portrait.onchange(),false);assert.equal(await vm.runInContext('flushCharacterSettings()',h.context),false);assert.equal(portrait.checked,true);assert.match(h.status.at(-1),/Noch nicht gespeichert/);
});
test('settings retry a stale revision once using refreshed character state',async()=>{
 const h=harness();const revisions=[];let writes=0;
 h.context.fetch=async(url,opts)=>{if(!opts.method)return {ok:true,json:async()=>({character:{...h.state,revision:9}})};revisions.push(JSON.parse(opts.body).revision);writes++;return {ok:writes>1,status:writes>1?200:409,json:async()=>writes>1?{character:{...h.state,revision:10}}:{error:'Zustand geändert'}};};
 assert.equal(await h.context.saveCharacterEdit('settings',{initiative:'balanced',replyLength:'auto',photos:true,photoKinds:['portrait']},undefined,7,true),true);assert.deepEqual(revisions,[7,9]);
});

test('closing the real memory overlay waits for auto-save and stays open after failure',async()=>{
 const closing=source.slice(source.indexOf('async function closeMemoryView()'),source.indexOf('async function loadLongTermMemories()'));
 for(const succeeds of [true,false]){
  const h=harness(),overlay={style:{display:'block'},_restoreUI:()=>{}};h.context.memoryOverlay=overlay;h.context.document.body={style:{overflow:'hidden'}};vm.runInContext(closing,h.context);
  let release;h.context.fetch=async()=>{await new Promise(resolve=>release=resolve);return {ok:succeeds,status:succeeds?200:500,json:async()=>succeeds?{character:h.state}:{error:'Speichern fehlgeschlagen'}};};
  const portrait=all(h.root).find(n=>n.value==='portrait');portrait.checked=true;const pending=portrait.onchange(),close=h.context.closeMemoryView();assert.equal(overlay.style.display,'block');release();await pending;await close;
  assert.equal(overlay.style.display,succeeds?'none':'block');
 }
});

test('failed settings survive a rendered restart and successful retry clears only acknowledged draft',async()=>{
 const h=harness(false),select=all(h.root).find(n=>n.tag==='select');select.value='active';await select.onchange();
 assert.equal(JSON.parse(h.storage.get('sofia_character_settings_pending_v1')).value.initiative,'active');
 h.root.children=[];h.context.renderCharacterMemories(h.state);
 assert.equal(all(h.root).find(n=>n.tag==='select').value,'active');
 h.context.fetch=async()=>({ok:true,status:200,json:async()=>({character:h.state})});
 assert.equal(await vm.runInContext('flushCharacterSettings()',h.context),true);assert.equal(h.storage.size,0);
});
test('settings draft restores changed fields while preserving fresh server preferences',async()=>{
 const h=harness(false);const select=all(h.root).find(n=>n.tag==='select');select.value='active';await select.onchange();
 h.state.settings={initiative:'balanced',replyLength:'short',photos:false,photoKinds:['portrait']};
 h.root.children=[];h.context.renderCharacterMemories(h.state);
 const selects=all(h.root).filter(n=>n.tag==='select');assert.equal(selects[0].value,'active');assert.equal(selects[1].value,'short');
 const checks=all(h.root).filter(n=>n.tag==='input');assert.equal(checks.find(n=>n.value==='portrait').checked,true);
});
test('invalid photo choice remains recoverable and does not issue a write',async()=>{
 const h=harness();for(const n of all(h.root).filter(n=>n.tag==='input'&&n.value))n.checked=false;
 assert.equal(await vm.runInContext('flushCharacterSettings()',h.context),false);assert.equal(h.requests.length,0);
 assert.match(all(h.root).find(n=>n.role==='status').textContent,/mindestens einen Fototyp/);
});

test('revision retry merges just the changed setting into newer server choices',async()=>{
 const h=harness();let attempt=0,last;
 h.context.fetch=async(url,opts)=>{if(!opts?.method)return {ok:true,json:async()=>({character:{revision:9,settings:{initiative:'balanced',replyLength:'short',photos:false,photoKinds:['portrait']}}})};
 last=JSON.parse(opts.body);return ++attempt===1?{status:409,ok:false,json:async()=>({error:'changed'})}:{status:200,ok:true,json:async()=>({character:h.state})};};
 const value={initiative:'active',replyLength:'auto',photos:true,photoKinds:['selfie','environment']};
 assert.equal(await h.context.saveCharacterEdit('settings',value,undefined,7,true,{...value,initiative:'balanced'}),true);
 assert.equal(last.revision,9);assert.equal(last.value.initiative,'active');assert.equal(last.value.replyLength,'short');assert.equal(last.value.photos,false);assert.deepEqual(last.value.photoKinds,['portrait']);
});
