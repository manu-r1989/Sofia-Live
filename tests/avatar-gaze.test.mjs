import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../avatar-gaze.js', import.meta.url), 'utf8');
function setup() {
  const timers=new Map(), events={}, mediaEvents={}, page={}, imageEvents={}; let id=0, callback, observing=false;
  const root={dataset:{state:'idle'}, blocked:false, appendChild(img){this.img=img;},querySelector(){return this.blocked?{}:null;}};
  const host={querySelector(){return root;}};
  const img={style:{},setAttribute(){},addEventListener(name,fn){imageEvents[name]=fn;}};
  const rightEvents={}, right={style:{},setAttribute(){},addEventListener(name,fn){rightEvents[name]=fn;}};
  let created=0;
  const media={matches:false,addEventListener(name,fn){mediaEvents[name]=fn;}};
  const document={readyState:'complete',hidden:false,getElementById(name){return name==='sofiaAvatar'?host:null;},createElement(){return created++===0?img:right;},addEventListener(name,fn){events[name]=fn;}};
  vm.runInNewContext(source,{document,window:{matchMedia(){return media;},addEventListener(name,fn){page[name]=fn;}},MutationObserver:class{constructor(fn){callback=fn;}observe(){observing=true;}disconnect(){observing=false;}},setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(key){timers.delete(key);},Math});
  const next=()=>{const [key,value]=timers.entries().next().value;timers.delete(key);value.fn();return value.ms;};
  return {observing:()=>observing,root,img,right,rightEvents,media,document,events,mediaEvents,page,imageEvents,timers,next,sync:()=>callback()};
}
test('glance waits for loaded asset and briefly shows only at rest',()=>{
 const h=setup();h.next();assert.equal(h.img.hidden,true);h.imageEvents.load();
 assert.ok(h.next()>=18000);assert.equal(h.img.hidden,false);assert.equal(h.next(),850);assert.equal(h.img.hidden,true);
});
test('speaking, blink, wink and mouth frames take precedence',()=>{
 const h=setup();h.imageEvents.load();h.next();h.root.dataset.state='speaking';h.sync();assert.equal(h.img.hidden,true);
 h.root.dataset.state='listening';h.root.blocked=true;h.next();assert.equal(h.img.hidden,true);
 h.root.blocked=false;h.next();assert.equal(h.img.hidden,false);h.root.blocked=true;h.sync();assert.equal(h.img.hidden,true);
});
test('background, reduced motion and page lifecycle cancel the optional glance',()=>{
 const h=setup();h.imageEvents.load();h.next();h.document.hidden=true;h.events.visibilitychange();assert.equal(h.img.hidden,true);assert.equal(h.timers.size,0);
 h.document.hidden=false;h.events.visibilitychange();h.media.matches=true;h.mediaEvents.change();assert.equal(h.timers.size,0);
 h.media.matches=false;h.mediaEvents.change();h.page.pagehide();assert.equal(h.timers.size,0);h.page.pageshow();assert.equal(h.timers.size,1);
});
test('image failure leaves existing portrait visible without an overlay',()=>{
 const h=setup();h.imageEvents.load();h.next();h.imageEvents.error();assert.equal(h.img.hidden,true);h.next();assert.equal(h.img.hidden,true);
});
test('loaded left and right glances alternate without simultaneous eye overlays',()=>{
 const h=setup();h.imageEvents.load();h.rightEvents.load();
 h.next();assert.equal(h.img.hidden,false);assert.equal(h.right.hidden,true);
 h.next();h.next();assert.equal(h.img.hidden,true);assert.equal(h.right.hidden,false);
 h.root.dataset.state='speaking';h.sync();assert.equal(h.img.hidden,true);assert.equal(h.right.hidden,true);
});
test('failed right asset preserves left glance fallback',()=>{
 const h=setup();h.imageEvents.load();h.rightEvents.load();h.next();h.next();h.next();
 h.rightEvents.error();assert.equal(h.right.hidden,true);h.next();assert.equal(h.img.hidden,false);
});

test('gaze observer disconnects in background and observes current state on return',()=>{
  const h=setup();assert.equal(h.observing(),true);h.document.hidden=true;h.events.visibilitychange();assert.equal(h.observing(),false);
  h.root.dataset.state='speaking';h.document.hidden=false;h.events.visibilitychange();assert.equal(h.observing(),true);assert.equal(h.img.hidden,true);
  h.page.pagehide();assert.equal(h.observing(),false);h.page.pageshow();assert.equal(h.observing(),true);
});


test('entering thinking schedules a brief glance promptly, speech still cancels it',()=>{
 const h=setup();h.imageEvents.load();h.root.dataset.state='thinking';h.sync();
 assert.equal(h.timers.size,1);const delay=h.next();assert.ok(delay>=5000&&delay<=8000);assert.equal(h.img.hidden,false);
 h.root.dataset.state='speaking';h.sync();assert.equal(h.img.hidden,true);assert.equal(h.right.hidden,true);
});
