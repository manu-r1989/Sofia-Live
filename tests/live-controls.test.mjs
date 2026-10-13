import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../live.js',import.meta.url),'utf8');
test('manual microphone pause survives automatic restore and interruption cancels without losing the turn',()=>{
 const track={enabled:true},sent=[],timers=[],events=[];let commits=0,scheduled=0;
 const code=source.slice(source.indexOf('  let manuallyPaused='),source.indexOf('  function suppressMicForAssistant'));
 const c=vm.createContext({Date,CustomEvent:class{constructor(type){this.type=type;}},window:{dispatchEvent:e=>events.push(e.type),setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;}},clearTimeout(){},stopLive(){},setPresence(){},cancelPendingLiveResponse(){},scheduleLiveResponse(){scheduled++;},commitCurrentTurn(){commits++;}});
 vm.runInContext(`let liveActive=true,localStream={getAudioTracks:()=>[track]},dataChannel={send:x=>sent.push(JSON.parse(x))},remoteAudio={pause(){}},userSpeaking=false;${code};globalThis.api={pause:()=>pauseLive(true),resume:()=>pauseLive(false),enable:()=>setRealtimeMicEnabled(true),interrupt:interruptLive,configure:configureLiveSession};`,Object.assign(c,{track,sent}));
 assert.equal(c.api.pause(),true);assert.equal(track.enabled,false);c.api.enable();assert.equal(track.enabled,false);c.api.resume();assert.equal(track.enabled,true);assert.equal(scheduled,1);c.api.interrupt();assert.equal(sent[0].type,'response.cancel');assert.equal(commits,1);c.api.configure({livePreferences:{turnDelay:2500},usageSession:{seconds:60,expiresAt:Date.now()+5000}});assert.ok(timers.at(-1).ms<=5000);assert.ok(events.includes('sofia-live-controls-changed'));
});
