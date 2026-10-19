import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sofia-startup.js',import.meta.url),'utf8');
function harness({target='421107v1',allowed=true,stored=null,offline=false,delayed=false}={}){
 const events={},calls=[],storage=new Map(stored?[['sofia_auto_update_target',stored]]:[]);let message;
 class Channel{constructor(){this.port1={close(){},onmessage:null};this.port2={respond:data=>this.port1.onmessage?.({data})};}}
 const controller={postMessage:(_data,ports)=>{message=()=>ports[0].respond({version:target});if(!delayed)message();}},registration={update:async()=>calls.push('update'),waiting:null};
 const window={addEventListener:(name,fn)=>events[name]=fn,SofiaWorkspace:{notice:text=>calls.push(text),applyUpdate:async options=>{calls.push(options.automatic?'automatic':'manual');return allowed;}}};
 const navigator={serviceWorker:{controller,addEventListener:(name,fn)=>events[name]=fn,register:async(path,options)=>{calls.push({path,options});if(offline)throw Error('offline');return registration;}}};
 const document={readyState:'complete',querySelector:()=>({getAttribute:()=> './app.js?v=421107v1'}),addEventListener:(name,fn)=>events[name]=fn};
 vm.runInNewContext(source,{window,document,navigator,MessageChannel:Channel,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},Date,setTimeout,clearTimeout});
 return {events,calls,storage,respond:()=>message?.()};
}
const settle=()=>new Promise(setImmediate);
test('every launch registers uncached worker and explicitly checks updates without reloading current assets',async()=>{const h=harness();await settle();assert.equal(h.calls[0].path,'./sw.js');assert.equal(h.calls[0].options.updateViaCache,'none');assert.ok(h.calls.includes('update'));assert.ok(!h.calls.includes('automatic'));});
test('an installed newer revision reloads an untouched startup once',async()=>{const h=harness({target:'418100v1'});await settle();assert.equal(h.calls.filter(x=>x==='automatic').length,1);assert.equal(h.storage.get('sofia_auto_update_target'),'418100v1');h.events.controllerchange();await settle();assert.equal(h.calls.filter(x=>x==='automatic').length,1);});
test('same target guard prevents stale-cache reload loops',async()=>{const h=harness({target:'418100v1',stored:'418100v1'});await settle();assert.ok(!h.calls.includes('automatic'));});
test('user interaction before update completion prevents an automatic reload',async()=>{const h=harness({target:'418100v1',delayed:true});await settle();h.events.pointerdown();h.respond();await settle();assert.ok(!h.calls.includes('automatic'));assert.ok(h.calls.some(x=>typeof x==='string'&&x.includes('Neue Version bereit')));});
test('active-action rejection preserves the version guard for a later safe attempt',async()=>{const h=harness({target:'418100v1',allowed:false});await settle();assert.ok(h.calls.includes('automatic'));assert.equal(h.storage.has('sofia_auto_update_target'),false);});
test('offline startup neither reloads nor discards any stored state',async()=>{const h=harness({offline:true,stored:'previous'});await settle();assert.equal(h.storage.get('sofia_auto_update_target'),'previous');assert.ok(!h.calls.includes('automatic'));});
