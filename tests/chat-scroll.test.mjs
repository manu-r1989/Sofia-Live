import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const block=app.slice(app.indexOf('let chatScrollFrame ='),app.indexOf('function addMessage('));
test('programmatic history positioning survives intermediate scroll events until a user scroll gesture',()=>{
 const frames=new Map(),events={},calls=[];let id=0;const messages={scrollHeight:2000,clientHeight:600,scrollTop:0,addEventListener:(t,f)=>events[t]=f,scrollTo:o=>calls.push(o)};
 const ctx=vm.createContext({window:{},messages,requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:n=>frames.delete(n)});vm.runInContext(block,ctx);ctx.window.SofiaChatViewport.latest();events.scroll();assert.equal(frames.size,1);
 while(frames.size){const pending=[...frames];frames.clear();for(const [,f]of pending)f();}assert.equal(calls.length,2);events.wheel();events.scroll();vm.runInContext("scrollChatToLatest('auto')",ctx);assert.equal(frames.size,0);
});
test('reading older turns suppresses automatic scrolling and an explicit latest action resumes following',()=>{
 const frames=new Map(),events={},calls=[],button={hidden:true};let id=0;const messages={scrollHeight:2000,clientHeight:600,scrollTop:1400,addEventListener:(t,fn)=>events[t]=fn,scrollTo:o=>calls.push(o)};
 const ctx=vm.createContext({window:{},document:{getElementById:()=>button},messages,requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:n=>frames.delete(n)});vm.runInContext(block,ctx);
 messages.scrollTop=200;events.scroll();vm.runInContext("scrollChatToLatest('smooth')",ctx);assert.equal(frames.size,0);assert.equal(button.hidden,false);
 ctx.window.SofiaChatViewport.latest();while(frames.size){const pending=[...frames];frames.clear();for(const [,f]of pending)f();}assert.equal(calls.length,2);assert.equal(button.hidden,true);
});
test('history positioning cancels queued smooth scrolls and follows late thumbnails unless user scrolls up',()=>{
 const frames=new Map(),events={},calls=[];let id=0;
 const messages={scrollHeight:2000,clientHeight:600,scrollTop:1400,addEventListener:(type,fn)=>events[type]=fn,scrollTo:o=>calls.push(o)};
 const ctx=vm.createContext({window:{},messages,requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
 vm.runInContext(block,ctx);
 for(let i=0;i<40;i++)vm.runInContext("scrollChatToLatest('smooth')",ctx);
 vm.runInContext("scrollChatToLatest('auto')",ctx);
 const flush=()=>{while(frames.size){const pending=[...frames];frames.clear();for(const [,fn]of pending)fn();}};
 flush();assert.equal(calls.length,2);assert.ok(calls.every(c=>c.behavior==='auto'&&c.top===2000));
 messages.scrollHeight=2200;events.load({target:{tagName:'IMG'}});flush();assert.equal(calls.at(-1).top,2200);
 events.wheel();messages.scrollTop=100;events.scroll();const count=calls.length;events.load({target:{tagName:'IMG'}});flush();assert.equal(calls.length,count);
});
test('parallel history reads are coalesced and delayed history cannot replace a pending user turn',async()=>{
 const sync=app.slice(app.indexOf('async function syncConversationFromServer'),app.indexOf('function startConversationSync'));
 let release,calls=0,saves=0;
 const ctx=vm.createContext({isResponding:false,historySyncInFlight:false,messages:null,
  lastServerHistorySignature:'',MAX_STORED_MESSAGES:100,window:{},console,
  fetch:()=>{calls++;return new Promise(resolve=>release=resolve);},
  focusPendingContact(){},updateSofiaLocation(){},historySignature:JSON.stringify,saveMemory:()=>saves++});
 vm.runInContext(sync,ctx);
 const first=ctx.syncConversationFromServer({silent:true});
 assert.equal(await ctx.syncConversationFromServer({silent:true}),false);assert.equal(calls,1);
 ctx.isResponding=true;
 release({status:200,ok:true,json:async()=>({history:[{role:'assistant',content:'old'}]})});
 assert.equal(await first,false);assert.equal(saves,0);assert.equal(ctx.historySyncInFlight,false);
});
test('a rebuilt history keeps the same visible message at the same offset while reading',()=>{
 const events={},frames=new Map();let id=0;
 const messages={scrollHeight:2400,clientHeight:600,scrollTop:400,
   addEventListener:(t,fn)=>events[t]=fn,getBoundingClientRect:()=>({top:100}),querySelectorAll:()=>nodes,
   scrollTo(){throw Error('Reading older turns must not jump to latest');}};
 const node=(text,y)=>({id:'',className:'msg sofia',textContent:text,getBoundingClientRect:()=>({top:y,bottom:y+80})});
 let nodes=[node('older',-50),node('visible',130),node('later',230)];
 const ctx=vm.createContext({window:{},document:{getElementById:()=>null},messages,
   requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
 vm.runInContext(block,ctx);events.scroll();
 const snapshot=ctx.window.SofiaChatViewport.capture();
 // A prepended retained picture shifts the same message downward by 280 pixels.
 nodes=[node('older',230),node('visible',410),node('later',510)];messages.scrollHeight+=280;
 ctx.window.SofiaChatViewport.restore(snapshot);
 assert.equal(messages.scrollTop,680);assert.equal(frames.size,0);
});


test('offline reconciliation performs no requests and never automatically resends an uncertain turn',async()=>{
 const sync=app.slice(app.indexOf('async function syncConversationFromServer'),app.indexOf('function startConversationSync'));
 let calls=0;const ctx=vm.createContext({isResponding:false,historySyncInFlight:false,navigator:{onLine:false},fetch:()=>calls++});
 vm.runInContext(sync,ctx);assert.equal(await ctx.syncConversationFromServer(),false);assert.equal(calls,0);
});
test('server history cannot erase an unconfirmed local user turn',async()=>{
 const sync=app.slice(app.indexOf('async function syncConversationFromServer'),app.indexOf('function startConversationSync'));
 let saves=0;const local=[{role:'user',content:'Erstelle Aufgabe TEST',delivery:'unconfirmed'}];
 const ctx=vm.createContext({isResponding:false,historySyncInFlight:false,conversationHistory:local,messages:null,MAX_STORED_MESSAGES:100,
 window:{},fetch:async()=>({ok:true,status:200,json:async()=>({history:[{role:'assistant',content:'old'}],images:[]})}),focusPendingContact(){},updateSofiaLocation(){},saveMemory:()=>saves++});
 vm.runInContext(sync,ctx);assert.equal(await ctx.syncConversationFromServer({silent:true}),false);assert.equal(saves,0);assert.equal(ctx.conversationHistory[0].content,'Erstelle Aufgabe TEST');
});

test('a rejected parallel test call is waiting, while an unknown action outcome stays uncertain',()=>{
 const helper=app.slice(app.indexOf('function chatFailureFeedback('),app.indexOf('async function askSofia('));
 const ctx=vm.createContext({});vm.runInContext(helper,ctx);
 const busy=ctx.chatFailureFeedback(429,'test_busy',true,false);assert.equal(busy.uncertainAction,false);assert.equal(busy.statusLabel,'Bitte kurz warten');
 const lost=ctx.chatFailureFeedback(undefined,undefined,true,false);assert.equal(lost.uncertainAction,true);assert.match(lost.message,/Aufgabenstand/);
 assert.equal(ctx.chatFailureFeedback(500,'chat_provider_failed',true,true).uncertainAction,false);
});

test('a persisted text receipt clears transport markers so older confirmed turns cannot freeze later history sync',()=>{
 const helper=app.slice(app.indexOf('function confirmLocalHistory('),app.indexOf('function chatFailureFeedback('));const ctx=vm.createContext({});vm.runInContext(helper,ctx);
 const history=[{role:'user',content:'older',delivery:'unconfirmed'},{role:'assistant',content:'later'}];
 const confirmed=ctx.confirmLocalHistory(history,{memoryMessages:2});assert.equal(confirmed[0].delivery,undefined);assert.equal(confirmed[0].content,'older');assert.equal(history[0].delivery,'unconfirmed');
 assert.equal(ctx.confirmLocalHistory(history,{imageRequest:{id:'photo'}}),history);
});

test('local reload preserves unconfirmed delivery markers until a persisted receipt',()=>{
 const helper=app.slice(app.indexOf('function loadMemory()'),app.indexOf('function saveMemory('));
 const ctx=vm.createContext({MEMORY_KEY:'test',MAX_STORED_MESSAGES:100,console,localStorage:{getItem:()=>JSON.stringify([{role:'user',content:'pending',delivery:'unconfirmed'}])}});
 vm.runInContext(helper,ctx);assert.equal(ctx.loadMemory()[0].delivery,'unconfirmed');
});


