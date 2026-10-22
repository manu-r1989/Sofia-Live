import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../live.js',import.meta.url),'utf8');
test('manual microphone pause survives automatic restore and interruption cancels without losing the turn',()=>{
 const track={enabled:true},sent=[],timers=[],events=[];let commits=0,scheduled=0;
 const code=source.slice(source.indexOf('  let manuallyPaused='),source.indexOf('  function suppressMicForAssistant'));
 const c=vm.createContext({Date,CustomEvent:class{constructor(type){this.type=type;}},window:{dispatchEvent:e=>events.push(e.type),setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;}},clearTimeout(){},stopLive(){},setPresence(){},cancelPendingLiveResponse(){},scheduleLiveResponse(){scheduled++;},rememberLiveInterruption(){},commitCurrentTurn(){commits++;}});
 vm.runInContext(`let liveActive=true,localStream={getAudioTracks:()=>[track]},dataChannel={send:x=>sent.push(JSON.parse(x))},remoteAudio={pause(){}},userSpeaking=false;${code};globalThis.api={pause:()=>pauseLive(true),resume:()=>pauseLive(false),enable:()=>setRealtimeMicEnabled(true),interrupt:interruptLive,configure:configureLiveSession};`,Object.assign(c,{track,sent}));
 assert.equal(c.api.pause(),true);assert.equal(track.enabled,false);c.api.enable();assert.equal(track.enabled,false);c.api.resume();assert.equal(track.enabled,true);assert.equal(scheduled,1);c.api.interrupt();assert.equal(sent[0].type,'response.cancel');assert.equal(commits,1);c.api.configure({livePreferences:{turnDelay:2500},usageSession:{seconds:60,expiresAt:Date.now()+5000}});assert.ok(timers.at(-1).ms<=5000);assert.ok(events.includes('sofia-live-controls-changed'));
});

test('profile changes apply to the next Live turn while older responses cannot overwrite a newer revision',()=>{
 const start=source.indexOf("  let liveProfileContext="),end=source.indexOf('  window.SofiaLive = {'),listeners={},events=[];
 const c=vm.createContext({CustomEvent:class{constructor(type){this.type=type;}},window:{addEventListener:(type,fn)=>listeners[type]=fn,dispatchEvent:e=>events.push(e.type)}});
 vm.runInContext(`let turnDelay=1500;${source.slice(start,end)};globalThis.read=()=>({context:liveProfileContext,revision:liveProfileRevision,turnDelay});`,c);
 listeners['sofia-live-profile']({detail:{revision:5,context:'Neue warme Persönlichkeit',preferences:{turnDelay:2500}}});
 listeners['sofia-live-profile']({detail:{revision:4,context:'Veraltete Auswahl',preferences:{turnDelay:700}}});
 assert.equal(c.read().context,'Neue warme Persönlichkeit');assert.equal(c.read().revision,5);assert.equal(c.read().turnDelay,2500);assert.ok(events.includes('sofia-live-controls-changed'));
});
test('continuing an interrupted explanation sends one read-only response and never repeats action execution',()=>{
 const start=source.indexOf('  let lastInterruptedLive='),end=source.indexOf('  let liveProfileContext='),sent=[];
 const c=vm.createContext({Date,CustomEvent:class{constructor(type){this.type=type;}},window:{dispatchEvent(){}},sent,setPresence(){},suppressMicForAssistant(){}});
 vm.runInContext(`let pendingUserText='Erkläre mir den Plan',pendingAssistantText='Zunächst ist der erste Schritt',liveActive=true,manuallyPaused=false,userSpeaking=false,assistantResponding=false,responseLocked=false,liveProfileContext='Aktuelles Profil',liveSessionInstructions='Sofia';const dataChannel={readyState:'open',send:x=>sent.push(JSON.parse(x))};${source.slice(start,end)};globalThis.remember=rememberLiveInterruption;globalThis.resume=resumeInterruptedLive;globalThis.clear=()=>{pendingUserText='';pendingAssistantText='';};`,c);
 c.remember();c.clear();assert.equal(c.resume(),true);assert.equal(c.resume(),false);assert.equal(sent.length,1);assert.equal(sent[0].type,'response.create');assert.match(sent[0].response.instructions,/Keine Aufgaben, Fotos, Termine/);assert.match(sent[0].response.instructions,/Zunächst ist der erste Schritt/);assert.match(sent[0].response.instructions,/Aktuelles Profil/);
});
