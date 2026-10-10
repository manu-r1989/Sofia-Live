import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../avatar-gesture.js',import.meta.url),'utf8');
function harness(){
  const timers=new Map(),motions=[],handlers={},page={},media={};let sync,now=100000,blocked=false,next=0,observing=false;
  const root={dataset:{state:'idle'},querySelector:()=>blocked?{}:null};
  const host={dataset:{},querySelector:()=>root,animate:(frames,options)=>{const motion={frames,options,cancelled:false,cancel(){this.cancelled=true;}};motions.push(motion);return motion;}};
  const document={hidden:false,readyState:'complete',getElementById:()=>host,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const reduced={matches:false,addEventListener:(name,fn)=>{media[name]=fn;}};
  class MutationObserver{constructor(fn){sync=fn;}observe(){observing=true;}disconnect(){observing=false;}}
  vm.runInNewContext(source,{document,MutationObserver,Date:{now:()=>now},clearTimeout:id=>timers.delete(id),
    getComputedStyle:()=>({rotate:'-.55deg',translate:'0px -1px'}),
    window:{matchMedia:()=>reduced,addEventListener:(name,fn)=>{page[name]=fn;},setTimeout:fn=>{timers.set(++next,fn);return next;}}});
  return {observing:()=>observing,motions,timers,host,root,document,reduced,handlers,page,media,setState:state=>{root.dataset.state=state;sync();},block:value=>{blocked=value;sync();},advance:ms=>{now+=ms;},run:()=>{const fns=[...timers.values()];timers.clear();fns.forEach(fn=>fn());}};
}
test('only a sustained listening state produces one small nod without audio APIs',()=>{
  const h=harness();h.setState('listening');assert.equal(h.motions.length,0);h.run();assert.equal(h.motions.length,1);
  assert.equal(h.motions[0].options.duration,950);assert.equal(h.motions[0].options.fill,'none');
  assert.equal(h.motions[0].frames[0].rotate,'-.55deg');assert.equal(h.root.dataset.state,'listening');
  h.run();assert.equal(h.motions.length,1);
});
test('short listening and speaking cancel queued or active gestures',()=>{
  const h=harness();h.setState('listening');h.setState('thinking');h.run();assert.equal(h.motions.length,0);
  h.setState('listening');h.run();h.setState('speaking');assert.equal(h.motions[0].cancelled,true);
});
test('blink or mouth frame immediately cancels nod and repeated turns respect cooldown',()=>{
  const h=harness();h.setState('listening');h.run();h.block(true);assert.equal(h.motions[0].cancelled,true);
  h.block(false);h.setState('idle');h.setState('listening');h.run();assert.equal(h.motions.length,1);
  h.advance(35000);h.setState('idle');h.setState('listening');h.run();assert.equal(h.motions.length,2);
});
test('background, pagehide and reduced motion suppress nods',()=>{
  const h=harness();h.setState('listening');h.page.pagehide();h.run();assert.equal(h.motions.length,0);
  h.page.pageshow();h.setState('idle');h.setState('listening');h.run();h.document.hidden=true;h.handlers.visibilitychange();
  assert.equal(h.motions[0].cancelled,true);
  h.document.hidden=false;h.reduced.matches=true;h.media.change();h.advance(35000);h.setState('idle');h.setState('listening');h.run();assert.equal(h.motions.length,1);
});

test('gesture observer disconnects while hidden and on pagehide',()=>{
  const h=harness();assert.equal(h.observing(),true);h.document.hidden=true;h.handlers.visibilitychange();assert.equal(h.observing(),false);
  h.document.hidden=false;h.handlers.visibilitychange();assert.equal(h.observing(),true);h.page.pagehide();assert.equal(h.observing(),false);h.page.pageshow();assert.equal(h.observing(),true);
});
