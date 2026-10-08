import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-projects.js',import.meta.url),'utf8');
function harness({fail=false,project=null}={}) {
 class Node {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.value='';this.textContent='';}
  append(...children){for(let child of children){if(typeof child==='string'){const n=new Node('text');n.textContent=child;child=n;}child.parentNode=this;this.children.push(child);}}
  get isConnected(){return this.tag==='body'||!!this.parentNode?.isConnected;}
  all(){return this.children.flatMap(x=>[x,...x.all()]);}
  setAttribute(k,v){this[k]=v;}focus(){}showModal(){}
  addEventListener(name,fn){this.events||={};(this.events[name]||=[]).push(fn);}
  close(){for(const fn of this.events?.close||[])fn();}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
  replaceChildren(...children){this.children=[];this.append(...children);}
 }
 const body=new Node('body'),requests=[];let state={revision:2,selectedId:project?.id||null,items:project?[project]:[],tasks:[]};
 const document={body,createElement:tag=>new Node(tag),getElementById:id=>[body,...body.all()].find(x=>x.id===id)||null};
 const context={window:{},document,fetch:async(url,options={})=>{if(options.method==='POST'){const data=JSON.parse(options.body);requests.push({url,...data});if(fail)return {ok:false,status:409,json:async()=>({error:'Vorhaben geändert'})};state=structuredClone(state);state.revision++;if(data.operation==='create'){state.items.push({id:'p2',title:data.value,status:'active',goals:[],decisions:[],questions:[],taskIds:[]});state.selectedId='p2';}if(data.operation==='pause')state.items.find(p=>p.id===data.id).status='paused';return {ok:true,json:async()=>({projects:state})};}return {ok:true,json:async()=>url.startsWith('/api/tasks')?{tasks:[]}:{projects:state}};}};
 vm.runInNewContext(source,context);
 return {body,requests,api:context.window.SofiaProjects,find:label=>body.all().find(n=>n.textContent===label),labeled:label=>body.all().find(n=>n['aria-label']===label)};
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const project={id:'p1',title:'<img src=x onerror=bad>',status:'active',goals:['Kartons organisieren'],decisions:['Samstag'],questions:['Wer hilft?'],taskIds:['gone']};
test('project overview renders user content safely and missing task explicitly',async()=>{const h=harness({project});await h.api.open();assert.equal(h.find(project.title).tag,'h3');assert.equal(h.find(project.title).children.length,0);assert.ok(h.find('Aufgabe nicht mehr vorhanden'));assert.ok(h.find('Nächster möglicher Schritt: Wer hilft?.'));assert.equal(h.body.all().filter(n=>n.tag==='img').length,0);});
test('project creation is explicit, versioned and never creates a task implicitly',async()=>{const h=harness();await h.api.open();const input=h.labeled('Name des Vorhabens');input.value='Testreise';const form=input.parentNode;await form.onsubmit({preventDefault(){}});assert.deepEqual(h.requests,[{url:'/api/memory',scope:'project',revision:2,operation:'create',value:'Testreise'}]);assert.ok(h.find('Testreise'));assert.ok(h.find('Vorhaben gespeichert.'));});
test('pause hides active edit forms while retaining goals and showing resume',async()=>{const h=harness({project});await h.api.open();await h.find('Pausieren').onclick();await turn();assert.ok(h.find('Wieder aufnehmen'));assert.ok(h.find('Kartons organisieren'));assert.equal(h.labeled('Ziele für '+project.title),undefined);assert.equal(h.requests[0].operation,'pause');assert.equal(h.requests[0].revision,2);});
test('conflicting project edit reloads and shows failure without claiming saved',async()=>{const h=harness({project,fail:true});await h.api.open();await h.find('Pausieren').onclick();await turn();assert.ok(h.find('Vorhaben geändert'));assert.equal(h.find('Vorhaben gespeichert.'),undefined);assert.ok(h.find('Pausieren'));});
