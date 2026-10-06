import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../avatar-expression.js',import.meta.url),'utf8');
function harness() {
  const handlers={}, page={}, events={}, images=[], timers=new Map(); let blocked=false, timerId=0;
  const root={dataset:{state:'idle'},appendChild:img=>{root.img=img;},querySelector:()=>blocked?{}:null};
  const host={querySelector:()=>root};
  function createImage(){const ownEvents={};const image={style:{},setAttribute(){},events:ownEvents,addEventListener:(name,fn)=>{ownEvents[name]=fn;if(images[0]===image)events[name]=fn;}};images.push(image);return image;}
  let observer, observing=false;
  const document={hidden:false,readyState:'complete',getElementById:id=>id==='sofiaAvatar'?host:null,
    createElement:createImage,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  class MutationObserver {constructor(fn){observer=fn;}observe(){observing=true;}disconnect(){observing=false;}}
  vm.runInNewContext(source,{document,clearTimeout:id=>timers.delete(id),window:{setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},addEventListener:(name,fn)=>{page[name]=fn;}},MutationObserver});
  return {observing:()=>observing,timers,run:()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},root,img:images[0],thoughtful:images[1],document,handlers,page,events,sync:()=>observer(),block:value=>{blocked=value;observer();}};
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

test('thoughtful overlay appears only during thinking and never overlaps friendly',()=>{
  const h=harness(); h.events.load(); h.thoughtful.events.load();
  for(const state of ['idle','listening','thinking','speaking']){
    h.root.dataset.state=state;h.sync();h.run();
    assert.equal(h.img.hidden,state!=='listening');assert.equal(h.thoughtful.hidden,state!=='thinking');
  }
  h.root.dataset.state='thinking';h.sync();h.block(true);assert.equal(h.thoughtful.hidden,true);
  h.block(false);h.run();assert.equal(h.thoughtful.hidden,false);h.thoughtful.events.error();assert.equal(h.thoughtful.hidden,true);
  h.root.dataset.state='listening';h.sync();assert.equal(h.img.hidden,false);
});

test('thoughtful expression respects background and page lifecycle',()=>{
  const h=harness();h.thoughtful.events.load();h.root.dataset.state='thinking';h.sync();h.run();
  h.document.hidden=true;h.handlers.visibilitychange();assert.equal(h.thoughtful.hidden,true);
  h.document.hidden=false;h.handlers.visibilitychange();h.run();assert.equal(h.thoughtful.hidden,false);
  h.page.pagehide();assert.equal(h.thoughtful.hidden,true);h.page.pageshow();h.run();assert.equal(h.thoughtful.hidden,false);
});

test('short thinking state never flashes and queued expression cannot cover speech',()=>{
  const h=harness();h.thoughtful.events.load();h.root.dataset.state='thinking';h.sync();
  assert.equal(h.thoughtful.hidden,true);assert.equal(h.timers.size,1);
  h.root.dataset.state='speaking';h.sync();assert.equal(h.timers.size,0);h.run();assert.equal(h.thoughtful.hidden,true);
});

test('repeated DOM changes do not restart settling; background cancels pending expression',()=>{
  const h=harness();h.thoughtful.events.load();h.root.dataset.state='thinking';h.sync();
  const first=[...h.timers.keys()][0];h.sync();h.sync();assert.equal([...h.timers.keys()][0],first);
  h.document.hidden=true;h.handlers.visibilitychange();assert.equal(h.timers.size,0);h.run();assert.equal(h.thoughtful.hidden,true);
  h.document.hidden=false;h.handlers.visibilitychange();assert.equal(h.thoughtful.hidden,true);h.run();assert.equal(h.thoughtful.hidden,false);
});

test('optional expression observer disconnects in background and reconnects on return',()=>{
  const h=harness();assert.equal(h.observing(),true);
  h.document.hidden=true;h.handlers.visibilitychange();assert.equal(h.observing(),false);
  h.document.hidden=false;h.handlers.visibilitychange();assert.equal(h.observing(),true);
  h.page.pagehide();assert.equal(h.observing(),false);h.page.pageshow();assert.equal(h.observing(),true);
});

test('unchanged state does not rewrite mouth visibility',()=>{
  const h=harness();let writes=0,hidden=h.img.hidden;
  Object.defineProperty(h.img,'hidden',{get:()=>hidden,set:value=>{hidden=value;writes++;}});
  h.events.load();h.root.dataset.state='listening';h.sync();const before=writes;h.sync();h.sync();assert.equal(writes,before);
});
