import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../live.js', import.meta.url), 'utf8');
const turn = source.slice(source.indexOf('  let pendingUserText ='), source.indexOf('  let pendingAssistantText ='));
const handler = source.slice(source.indexOf('  async function handleRealtimeEvent('), source.indexOf('  /* ========================================\n     STOP LIVE'));
function harness(fetchImpl = async () => ({ ok: true, json: async () => ({ context: 'Task erfolgreich erstellt.' }) })) {
  const timers = new Map(), sent = [], gates = [];
  let next = 0;
  const context = vm.createContext({
    window: { setTimeout: fn => { timers.set(++next, fn); return next; }, SofiaAvatar: { listen() {}, think() {} } },
    clearTimeout: id => timers.delete(id), fetch: fetchImpl, console,
    setPresence() {}, openCalendarImport() {}, app: null,
    suppressMicForAssistant: () => gates.push('closed')
  });
  vm.runInContext(`let liveActive=true, responseLocked=false, assistantResponding=false, ignoreInputUntil=0;
    const dataChannel={readyState:'open',send: x=>send(x)};
    ${turn}
    ${handler}
    liveSessionInstructions='Du bist Sofia. Antworte auf Deutsch. Behalte deine Persönlichkeit.';
    globalThis.event=handleRealtimeEvent;
    globalThis.cancel=()=>{cancelPendingLiveResponse();liveActive=false;};`, Object.assign(context, { send: x => sent.push(JSON.parse(x)) }));
  return { sent, gates, timers, event: context.event, cancel: context.cancel,
    run: async () => { const entries = [...timers.values()]; timers.clear(); entries.forEach(fn => fn()); for (let i=0;i<8;i++) await Promise.resolve(); } };
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
});

test('token endpoint supplies full instructions and preserves low-eagerness half duplex', async () => {
  const api=await readFile(new URL('../api/realtime.js',import.meta.url),'utf8');
  assert.match(api,/value: data.value,\s+instructions/);
  assert.match(api,/Antworte auf Deutsch\. Wechsle nur dann/);
  assert.match(api,/eagerness: "low",\s+create_response: false,\s+interrupt_response: false/);
});
