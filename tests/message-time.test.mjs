import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-timeline.js',import.meta.url),'utf8');
function harness(){
 const window={},document={createElement:()=>({setAttribute(k,v){this[k]=v;},remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}})};
 vm.runInNewContext(source,{window,document,Intl,Date});
 const node={dataset:{},textContent:'Eine Nachricht',children:[],append(x){x.parent=this;this.children.push(x);},querySelector(){return this.children.find(x=>x.className==='message-time');}};
 return {node,decorate:window.SofiaTimeline.decorate};
}
test('message times consistently use Hamburg time including midnight and winter',()=>{
 for(const [iso,time] of [['2026-10-07T22:23:10Z','00:23'],['2026-12-01T12:15:00Z','13:15']]){const h=harness();h.decorate(h.node,iso);assert.equal(h.node.children[0].textContent,time);assert.equal(h.node.children[0].dateTime,new Date(iso).toISOString());assert.equal(h.node.dataset.messageText,'Eine Nachricht');}
});
test('reload reuses persisted times and never invents timestamps for legacy messages',()=>{
 const h=harness(),iso='2026-10-07T21:13:00Z';h.decorate(h.node,iso);h.decorate(h.node,iso);assert.equal(h.node.children.length,1);assert.equal(h.node.children[0].textContent,'23:13');
 for(const invalid of [null,undefined,'invalid']){const old=harness();old.decorate(old.node,invalid);assert.equal(old.node.children.length,0);}
});
