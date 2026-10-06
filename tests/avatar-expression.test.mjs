import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../avatar-expression.js',import.meta.url),'utf8');
function harness() {
  const handlers={}, page={}, events={}; let blocked=false;
  const root={dataset:{state:'idle'},appendChild:img=>{root.img=img;},querySelector:()=>blocked?{}:null};
  const host={querySelector:()=>root};
  const img={style:{},setAttribute(){},addEventListener:(name,fn)=>{events[name]=fn;}};
  let observer;
  const document={hidden:false,readyState:'complete',getElementById:id=>id==='sofiaAvatar'?host:null,
    createElement:()=>img,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  class MutationObserver {constructor(fn){observer=fn;}observe(){}}
  vm.runInNewContext(source,{document,window:{addEventListener:(name,fn)=>{page[name]=fn;}},MutationObserver});
  return {root,img,document,handlers,page,events,sync:()=>observer(),block:value=>{blocked=value;observer();}};
}
test('friendly overlay waits for asset then appears only while listening',()=>{
  const h=harness();h.root.dataset.state='listening';h.sync();assert.equal(h.img.hidden,true);
  h.events.load();assert.equal(h.img.hidden,false);
  for(const state of ['thinking','speaking','idle']){h.root.dataset.state=state;h.sync();assert.equal(h.img.hidden,true);}
});
test('mouth and wink frames take precedence; image failure falls back to master',()=>{
  const h=harness();h.events.load();h.root.dataset.state='listening';h.sync();
  h.block(true);assert.equal(h.img.hidden,true);h.block(false);assert.equal(h.img.hidden,false);
  h.events.error();assert.equal(h.img.hidden,true);
});
test('background and page lifecycle hide and restore the static expression without audio APIs',()=>{
  const h=harness();h.events.load();h.root.dataset.state='listening';h.sync();
  h.document.hidden=true;h.handlers.visibilitychange();assert.equal(h.img.hidden,true);
  h.document.hidden=false;h.handlers.visibilitychange();assert.equal(h.img.hidden,false);
  h.page.pagehide();assert.equal(h.img.hidden,true);h.page.pageshow();assert.equal(h.img.hidden,false);
  assert.equal(h.root.dataset.state,'listening');assert.equal(h.img.className,'sofia-avatar-v435-layer');
});
