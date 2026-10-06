import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const block=app.slice(app.indexOf('let chatScrollFrame ='),app.indexOf('function addMessage('));
test('history positioning cancels queued smooth scrolls and follows late thumbnails unless user scrolls up',()=>{
 const frames=new Map(),events={},calls=[];let id=0;
 const messages={scrollHeight:2000,clientHeight:600,scrollTop:1400,addEventListener:(type,fn)=>events[type]=fn,scrollTo:o=>calls.push(o)};
 const ctx=vm.createContext({messages,requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
 vm.runInContext(block,ctx);
 for(let i=0;i<40;i++)vm.runInContext("scrollChatToLatest('smooth')",ctx);
 vm.runInContext("scrollChatToLatest('auto')",ctx);
 const flush=()=>{while(frames.size){const pending=[...frames];frames.clear();for(const [,fn]of pending)fn();}};
 flush();assert.equal(calls.length,2);assert.ok(calls.every(c=>c.behavior==='auto'&&c.top===2000));
 messages.scrollHeight=2200;events.load({target:{tagName:'IMG'}});flush();assert.equal(calls.at(-1).top,2200);
 messages.scrollTop=100;events.scroll();const count=calls.length;events.load({target:{tagName:'IMG'}});flush();assert.equal(calls.length,count);
});
