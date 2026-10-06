import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../live.js', import.meta.url), 'utf8');
const turn = source.slice(source.indexOf('  let pendingUserText ='), source.indexOf('  let pendingAssistantText ='));
const handler = source.slice(source.indexOf('  async function handleRealtimeEvent('), source.indexOf('  /* ========================================\n     STOP LIVE'));
function harness(fetchImpl = async () => ({ ok: true, json: async () => ({ context: 'Task erfolgreich erstellt.' }) })) {
  const timers = new Map(), sent = [], gates = [], stopped = [];
  let next = 0;
  const context = vm.createContext({
    window: { setTimeout: (fn, delay) => { timers.set(++next, { fn, delay }); return next; }, SofiaAvatar: { listen() {}, think() {} } },
    clearTimeout: id => timers.delete(id), fetch: fetchImpl, console, AbortController,
    setPresence() {}, setThought() {}, openCalendarImport() {}, app: null,
    stopLive: () => { stopped.push(true); context.cancel(); },
    suppressMicForAssistant: () => gates.push('closed')
  });
  vm.runInContext(`let liveActive=true, responseLocked=false, assistantResponding=false, ignoreInputUntil=0;
    const dataChannel={readyState:'open',send: x=>send(x)};
    ${turn}
    ${handler}
    liveSessionInstructions='Du bist Sofia. Antworte auf Deutsch. Behalte deine Persönlichkeit.';
    globalThis.event=handleRealtimeEvent;
    globalThis.cancel=()=>{cancelPendingLiveResponse();liveActive=false;};`, Object.assign(context, { send: x => sent.push(JSON.parse(x)) }));
  return { sent, gates, timers, stopped, event: context.event, cancel: context.cancel,
    run: async (elapsed = 1500) => { const entries = [...timers.entries()].filter(([, timer]) => timer.delay <= elapsed); entries.forEach(([id]) => timers.delete(id)); entries.forEach(([, timer]) => timer.fn()); for (let i=0;i<20;i++) await Promise.resolve(); } };
}
const start = id => ({ type: 'input_audio_buffer.speech_started', item_id: id });
const stop = id => ({ type: 'input_audio_buffer.speech_stopped', item_id: id });
const transcript = (id, text) => ({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text });

test('transcript during speech cannot close microphone or request a response', async () => {
  const h=harness(); await h.event(start('a')); await h.event(transcript('a','Hallo'));
  await h.run(); assert.equal(h.sent.length,0); assert.equal(h.gates.length,0);
  await h.event(stop('a')); await h.run(); assert.equal(h.sent.length,1);
});
test('resumed speech cancels wait and waits for its own final transcript', async () => {
  const h=harness(); await h.event(start('a')); await h.event(stop('a')); await h.event(transcript('a','Bitte'));
  await h.event(start('b')); await h.event(stop('b')); await h.run(); assert.equal(h.sent.length,0);
  await h.event(transcript('b','weiter zuhören')); await h.run(); assert.equal(h.sent.length,1);
});
test('resumed speech invalidates an in-flight context response without gating mic', async () => {
  let resolve; const deferred=new Promise(r=>resolve=r);
  const h=harness(()=>deferred); await h.event(stop('a')); await h.event(transcript('a','Hallo')); await h.run();
  assert.equal(h.gates.length,0); await h.event(start('b'));
  resolve({ok:true,json:async()=>({context:'Alter Kontext'})}); await h.run(); assert.equal(h.sent.length,0);
});
test('response preserves full session instructions and includes actual action context once', async () => {
  const h=harness(); await h.event(stop('a')); await h.event(transcript('a','Aufgabe erstellen'));
  await h.event(transcript('a','Aufgabe erstellen')); await h.run();
  assert.equal(h.sent.length,1); assert.match(h.sent[0].response.instructions,/Du bist Sofia\. Antworte auf Deutsch\. Behalte deine Persönlichkeit/);
  assert.match(h.sent[0].response.instructions,/Task erfolgreich erstellt/); assert.equal(h.gates.length,1);
});
test('stopping Live cancels queued inference', async () => {
  const h=harness(); await h.event(stop('a')); await h.event(transcript('a','Hallo')); h.cancel(); await h.run();
  assert.equal(h.sent.length,0); assert.equal(h.gates.length,0);
});

test('context failure still responds with German session persona', async () => {
  const h=harness(async()=>({ok:false,status:503}));
  await h.event(stop('a')); await h.event(transcript('a','Hallo')); await h.run();
  assert.equal(h.sent.length,1); assert.match(h.sent[0].response.instructions,/Antworte auf Deutsch/);
  assert.match(h.sent[0].response.instructions,/Behaupte keine erfolgreiche Ausführung/);
});

test('token endpoint supplies full instructions and preserves low-eagerness half duplex', async () => {
  const api=await readFile(new URL('../api/realtime.js',import.meta.url),'utf8');
  assert.match(api,/value: data.value,\s+instructions/);
  assert.match(api,/Antworte auf Deutsch\. Wechsle nur dann/);
  assert.match(api,/eagerness: "low",\s+create_response: false,\s+interrupt_response: false/);
});

test('duplicate stop event cannot start a second in-flight context request', async () => {
  let calls=0, resolve; const deferred=new Promise(r=>resolve=r);
  const h=harness(()=>{calls++;return deferred;});
  await h.event(stop('a')); await h.event(transcript('a','Hallo')); await h.run();
  await h.event(stop('a')); await h.run(); assert.equal(calls,1);
  resolve({ok:true,json:async()=>({context:'Kontext'})}); await h.run(); assert.equal(h.sent.length,1);
});

test('Realtime error closes session and invalidates a pending context response', async () => {
  let resolve; const deferred=new Promise(r=>resolve=r); const h=harness(()=>deferred);
  await h.event(stop('a')); await h.event(transcript('a','Hallo')); await h.run();
  await h.event({type:'error',error:{message:'Test error'}}); assert.equal(h.stopped.length,1);
  resolve({ok:true,json:async()=>({})}); await h.run(); assert.equal(h.sent.length,0);
});

test('hung context times out without success claims, aborts request and ignores late result', async () => {
  let resolve, signal; const deferred=new Promise(r=>resolve=r);
  const h=harness((_, options)=>{signal=options.signal;return deferred;});
  await h.event(stop('a')); await h.event(transcript('a','Aufgabe erstellen')); await h.run();
  assert.equal(h.sent.length,0); assert.equal(h.gates.length,0);
  await h.run(20000); assert.equal(signal.aborted,true); assert.equal(h.sent.length,1);
  assert.match(h.sent[0].response.instructions,/Status von Task- oder Kalenderaktionen ist unbekannt/);
  resolve({ok:true,json:async()=>({context:'Später Erfolg'})}); await h.run();
  assert.equal(h.sent.length,1); assert.equal(h.timers.size,0);
});

test('deadline covers a stalled response body and successful context clears timer', async () => {
  const h=harness(async()=>({ok:true,json:()=>new Promise(()=>{})}));
  await h.event(stop('a')); await h.event(transcript('a','Hallo')); await h.run();
  await h.run(20000); assert.equal(h.sent.length,1);
  const success=harness(); await success.event(stop('a')); await success.event(transcript('a','Hallo')); await success.run();
  assert.equal(success.sent.length,1); assert.equal(success.timers.size,0);
});

test('timeout after resumed speech does not interrupt the new utterance', async () => {
  const h=harness(()=>new Promise(()=>{}));
  await h.event(stop('a')); await h.event(transcript('a','Hallo')); await h.run();
  await h.event(start('b')); await h.run(20000);
  assert.equal(h.sent.length,0); assert.equal(h.gates.length,0);
});
