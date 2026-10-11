import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-navigation.js',import.meta.url),'utf8');
function harness(){
 const calls=[],storage=new Map([['sofia-draft-v448','retained draft'],['sofia-gallery-view-v463','retained gallery']]);
 const host={children:[],insertBefore(n){this.children.unshift(n);}},dialogs=[];
 const node=()=>({children:[],attrs:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},append(n){this.children.push(n);}});
 const window={SofiaToday:{open:()=>{calls.push('today');dialogs.push({id:'sofia-today',open:true,close(){this.open=false;}});}},SofiaImages:{openGallery:()=>calls.push('gallery')},SofiaChatViewport:{reveal:()=>calls.push('chat')},SofiaWorkspace:{notice:()=>calls.push('blocked')}};
 const document={body:{},querySelector:()=>host,querySelectorAll:()=>dialogs.filter(d=>d.open),getElementById:id=>dialogs.find(d=>d.id===id),createElement:node};
 vm.runInNewContext(source,{document,window,localStorage:{getItem:k=>storage.get(k),setItem(){throw Error('unexpected migration');},removeItem(){throw Error('unexpected deletion');}}});return {host,calls,storage,dialogs,api:window.SofiaNavigation};
}
test('navigation starts on Chat and preserves old drafts and gallery state',()=>{const h=harness();assert.equal(h.host.children.length,1);assert.deepEqual(h.host.children[0].children.map(x=>x.textContent),['Chat','Heute','Galerie']);assert.equal(h.calls.length,0);assert.equal(h.storage.get('sofia-draft-v448'),'retained draft');h.api.open('today');assert.equal(h.host.children[0].children[1].attrs['aria-current'],'page');h.api.open('chat');assert.equal(h.dialogs[0].open,false);assert.deepEqual(h.calls,['today','chat']);});
test('navigation leaves an outstanding photo confirmation and its source untouched',()=>{const h=harness();const edit={id:'photo-edit',open:true,sourceId:'exact-selected-photo',close(){throw Error('unexpected dismissal');}};h.dialogs.push(edit);h.api.open('gallery');assert.deepEqual(h.calls,['blocked']);assert.equal(edit.sourceId,'exact-selected-photo');assert.equal(edit.open,true);});
