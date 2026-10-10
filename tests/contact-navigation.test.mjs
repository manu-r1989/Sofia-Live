import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const navigation=app.slice(app.indexOf('let pendingContactOpen=null;'),app.indexOf("window.addEventListener('online'",app.indexOf('let pendingContactOpen=null;')));
const id='11111111-1111-4111-8111-111111111111';
function fixture(){
 const events={},dispatched=[],cancelled=[],scrolls=[],highlights=new Set();let node=null,full=false,url;
 const document={visibilityState:'visible'};
 const message={scrollIntoView:o=>scrolls.push(o),classList:{add:x=>highlights.add(x),remove:x=>highlights.delete(x)}};
 const ctx=vm.createContext({document,URL,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},messages:{querySelector:selector=>selector==='[data-contact-id="'+id+'"]'?node:null},
 window:{location:{href:'https://sofia.test/?contact='+id+'&keep=1#chat'},history:{state:{},replaceState:(_s,_t,u)=>url=u},matchMedia:()=>({matches:true}),addEventListener:(t,f)=>events[t]=f,dispatchEvent:e=>{dispatched.push(e);events[e.type]?.(e);}},
 syncConversationFromServer:async()=>false,setChatMinimized:value=>{full=!value;},chatScrollFrame:7,chatPinnedToLatest:true,cancelAnimationFrame:n=>cancelled.push(n),setTimeout(){}});
 vm.runInContext(navigation,ctx);
 return {ctx,events,document,dispatched,cancelled,scrolls,highlights,node:()=>{node=message;},full:()=>full,url:()=>url};
}
test('contact opening waits for its real message, then cancels latest scrolling and acknowledges only that contact',async()=>{
 const h=fixture();h.events['sofia-contact-open']({detail:{contactId:id}});await Promise.resolve();
 assert.equal(h.dispatched.length,0);h.node();vm.runInContext('focusPendingContact()',h.ctx);
 assert.equal(h.full(),true);assert.deepEqual(h.cancelled,[7]);assert.equal(h.ctx.chatPinnedToLatest,false);
 assert.equal(h.scrolls[0].block,'center');assert.equal(h.scrolls[0].behavior,'auto');assert.ok(h.highlights.has('contact-highlight'));
 assert.equal(h.dispatched[0].type,'sofia-contact-visible');assert.equal(h.dispatched[0].detail.contactId,id);
 assert.equal(h.url(),'/?keep=1#chat');vm.runInContext('focusPendingContact()',h.ctx);assert.equal(h.dispatched.length,1);
});
test('hidden tabs and invalid contact ids never acknowledge unseen messages',async()=>{
 const h=fixture();h.node();h.events['sofia-contact-open']({detail:{contactId:'bad"selector'}});await Promise.resolve();assert.equal(h.dispatched.length,0);
 h.document.visibilityState='hidden';h.events['sofia-contact-open']({detail:{contactId:id}});await Promise.resolve();assert.equal(h.dispatched.length,0);
 h.document.visibilityState='visible';vm.runInContext('focusPendingContact()',h.ctx);assert.equal(h.dispatched.length,1);
});


test('a retained contact absent from recent history is fetched, shown and acknowledged after insertion',async()=>{
 const h=fixture(),inserted=[];h.ctx.fetch=async url=>{assert.equal(url,'/api/session?social=1&contact='+id);return {ok:true,json:async()=>({contact:{id,text:'Ein früherer Gruß.',createdAt:'2026-10-07T12:00Z'}})};};
 h.ctx.addMessage=(...args)=>{inserted.push(args);h.node();return {};};h.ctx.messages.prepend=()=>{};
 h.events['sofia-contact-open']({detail:{contactId:id}});await new Promise(setImmediate);
 assert.equal(inserted.length,1);assert.equal(inserted[0][0],'Ein früherer Gruß.');assert.equal(inserted[0][3],id);assert.equal(h.dispatched[0].detail.contactId,id);
});
test('an unavailable retained contact gives feedback and never marks it read',async()=>{
 const h=fixture(),feedback=[];h.ctx.fetch=async()=>({ok:false,json:async()=>({error:'gone'})});h.ctx.setThought=text=>feedback.push(text);
 h.events['sofia-contact-open']({detail:{contactId:id}});await new Promise(setImmediate);assert.equal(h.dispatched.length,0);assert.match(feedback[0],/nicht mehr verfügbar/);
});
