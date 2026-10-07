import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile as nativeReadFile} from 'node:fs/promises';
const environmentSource=await nativeReadFile(new URL('../lib/environment.js',import.meta.url),'utf8');
const environmentUrl='data:text/javascript;base64,'+Buffer.from(environmentSource).toString('base64');
async function readFile(...args){const value=await nativeReadFile(...args);return typeof value==='string'?value.replaceAll('../lib/environment.js',environmentUrl):value;}

// No credentials or services are used: all HTTP calls are intercepted.
const root = new URL('../', import.meta.url);
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const datesUrl = moduleUrl(await readFile(new URL('lib/task-dates.js', root), 'utf8'));
const { addCalendarDays, nextRecurringDates } = await import(datesUrl);
const taskUrl = moduleUrl((await readFile(new URL('api/task-action.js', root), 'utf8')).replace('../lib/task-dates.js', datesUrl));
const engineUrl = moduleUrl((await readFile(new URL('api/action-engine.js', root), 'utf8')).replace('./task-action.js', taskUrl));
const { executeUnifiedAction, withTaskMutationLock } = await import(engineUrl);
const portraitUrl = moduleUrl(await readFile(new URL('lib/character-image.js', root), 'utf8'));
const endpoints = {};
for (const name of ['chat', 'live-context', 'tasks']) {
  endpoints[name] = (await import(moduleUrl((await readFile(new URL(`api/${name}.js`, root), 'utf8')).replace('./action-engine.js', engineUrl).replace('../lib/task-dates.js', datesUrl).replace('../lib/character-image.js', portraitUrl)))).default;
}
const TASKS = 'sofia:main:tasks';
const STATE = 'sofia:main:action-state';
const fixture = id => ({ id, title: `TEST ${id}`, status: 'open', dueAt: '2026-10-07T09:00:00', remindAt: '2026-10-07T08:30:00', priority: 'high', notes: 'keep me', recurrence: 'daily', createdAt: '2026-10-01T00:00:00Z' });
let db, writes, classifierCalls, parsed, classifierFailure, malformed, stateFailure, writeUncertain, finishFailure, modelHook, classifierHook, memoryFailure;
let calendarCalls, calendarOutput;
const savedFetch = globalThis.fetch;
const envNames = ['SOFIA_PASSWORD', 'OPENAI_API_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
const savedEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));

function reset(tasks = [], recentTaskId = null) {
  db = new Map([[TASKS, JSON.stringify(tasks)], [STATE, JSON.stringify({ lastTaskId: recentTaskId, lastActionSummary: 'previous action' })]]);
  writes = classifierCalls = 0;
  parsed = { action: 'none' };
  classifierFailure = malformed = stateFailure = writeUncertain = finishFailure = memoryFailure = false;
  modelHook = classifierHook = null;
  calendarCalls = 0; calendarOutput = null;
  process.env.SOFIA_PASSWORD = 'local-test-password';
  process.env.OPENAI_API_KEY = 'local-test-key';
  process.env.KV_REST_API_URL = 'https://redis.test';
  process.env.KV_REST_API_TOKEN = 'local-test-token';
}

// Emulate Redis command results and atomic EVAL execution. Actual Lua syntax
// and reservation behavior are additionally checked separately before release.
function redis(command) {
  const [op, key, ...args] = command;
  if (op === 'GET') {
    if (memoryFailure && key === 'sofia:main:longterm') throw new Error('memory read failed');
    return db.get(key) ?? null;
  }
  if (op === 'SET') {
    if (args.includes('NX') && db.has(key)) return null;
    if (key === STATE && stateFailure) throw new Error('state save failed');
    db.set(key, args[0]);
    if (key === TASKS) {
      writes++;
      if (writeUncertain) throw new Error('write response lost');
    }
    return 'OK';
  }
  if (op === 'EVAL') {
    const count = Number(args[0]);
    const keys = args.slice(1, count + 1);
    const argv = args.slice(count + 1);
    const [resultKey, lockKey] = keys;
    if (count === 1) {
      if (finishFailure) throw new Error('lock release failed');
      if (db.get(resultKey) !== argv[0]) return 0;
      db.delete(resultKey); return 1;
    }
    if (key.includes('local cached')) {
      const cached = db.get(resultKey);
      if (cached) {
        const value = JSON.parse(cached), state = JSON.parse(db.get(keys[2]) || '{}');
        const task = value.taskAction?.task;
        if (!task || task.id === state.lastTaskId || value.contextTaskId === state.lastTaskId) return ['cached', cached];
        db.delete(resultKey);
      }
      if (db.has(lockKey)) return ['busy', ''];
      db.set(lockKey, argv[0]); db.set(resultKey, argv[1]);
      return ['acquired', ''];
    }
    if (finishFailure) throw new Error('finalization failed');
    if (db.get(lockKey) !== argv[0]) return 0;
    if (argv[1]) db.set(resultKey, argv[1]); else db.delete(resultKey);
    db.delete(lockKey);
    return 1;
  }
  throw new Error(`Unexpected command ${op}`);
}

globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  if (String(url).startsWith('https://redis.test')) {
    const result = String(url).endsWith('/pipeline') ? body.map(command => ({ result: redis(command) })) : { result: redis(body) };
    return { ok: true, json: async () => result };
  }
  if (String(url).endsWith('/api/sofia-identity')) return { ok: true, json: async () => ({}) };
  assert.equal(String(url), 'https://api.openai.com/v1/responses');
  let output;
  if (body.instructions.includes('Task-Action-Parser')) {
    classifierCalls++;
    if (classifierHook) await classifierHook(body);
    if (classifierFailure) return { ok: false, status: 503, json: async () => ({}) };
    output = malformed ? 'not JSON' : JSON.stringify(parsed);
  } else if (body.instructions.includes('Kalender-Erinnerung') || body.instructions.includes('Kalendereintrag')) {
    calendarCalls++;
    output = JSON.stringify({ calendar_action: calendarOutput });
  } else if (Array.isArray(body.input)) {
    if (modelHook) modelHook(body);
    output = JSON.stringify({ reply: 'I falsely claim success', mood: 'entspannt', calendar_action: null, memory_action: { action: 'none' } });
  } else if (body.instructions.includes('NO_WEB')) output = 'NO_WEB';
  else output = JSON.stringify({ calendar_action: null, indexes: [] });
  return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: output }] }] }) };
};

const run = (message, mode = 'text', referenceTime = '2026-10-06 14:59:59') => executeUnifiedAction(message, referenceTime, { mode });
async function endpoint(name, message, extra = {}) {
  const session = crypto.createHmac('sha256', process.env.SOFIA_PASSWORD).update('sofia-authorized-session-v1').digest('hex');
  const req = { method: extra.method || 'POST', body: { message, ...extra.body }, query: extra.query, headers: { cookie: `sofia_session=${session}`, host: 'sofia.test' } };
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  await endpoints[name](req, res);
  assert.equal(res.code, extra.expectedStatus || 200);
  return res.value;
}

test('conversation skips task classifier and preserves continuity', async () => {
  reset([fixture('a')], 'a');
  await run('Hallo Sofia');
  assert.equal(classifierCalls, 0); assert.equal(writes, 0);
  assert.equal(JSON.parse(db.get(STATE)).lastActionSummary, 'previous action');
});

test('parallel same action is reserved before classifier execution', async () => {
  reset(); parsed = { action: 'create', task: { title: 'TEST new' } };
  let entered, release;
  const ready = new Promise(resolve => entered = resolve);
  const gate = new Promise(resolve => release = resolve);
  classifierHook = async () => { entered(); await gate; };
  const first = run('Lege eine Aufgabe an'); await ready;
  const second = await run('Lege eine Aufgabe an', 'live');
  assert.equal(second.taskAction.status, 'in_progress');
  release(); assert.equal((await first).taskAction.action, 'create');
  assert.equal(writes, 1); assert.equal(classifierCalls, 1);
});

test('retry across modes and minute boundary advances recurring task once', async () => {
  reset([fixture('a')], 'a'); parsed = { action: 'complete', id: 'a' };
  const first = await run('Die ist erledigt');
  const retry = await run('  DIE   IST erledigt  ', 'live', '2026-10-06 15:00:01');
  assert.equal(first.taskAction.action, 'complete_recurring');
  assert.deepEqual(retry, first); assert.equal(writes, 1);
  assert.equal(JSON.parse(db.get(TASKS))[0].dueAt, '2026-10-08T09:00:00');
});

test('parallel different action cannot overwrite another task mutation', async () => {
  reset(); parsed = { action: 'create', task: { title: 'TEST first' } };
  let entered, release;
  const ready = new Promise(resolve => entered = resolve);
  const gate = new Promise(resolve => release = resolve);
  classifierHook = async () => { entered(); await gate; };
  const first = run('Lege eine Aufgabe TEST first an'); await ready;
  const second = await run('Lege eine Aufgabe TEST second an');
  assert.equal(second.taskAction.status, 'in_progress');
  release(); await first;
  assert.equal(writes, 1); assert.equal(JSON.parse(db.get(TASKS)).length, 1);
});

test('same follow-up for a newly selected task does not reuse old result', async () => {
  reset([fixture('a'), fixture('b')], 'a'); parsed = { action: 'complete', id: 'a' };
  await run('Die ist erledigt');
  db.set(STATE, JSON.stringify({ lastTaskId: 'b' })); parsed = { action: 'complete', id: 'b' };
  const second = await run('Die ist erledigt');
  assert.equal(second.taskAction.task.id, 'b'); assert.equal(writes, 2);
});

test('state-save failure preserves real success and retry protection', async () => {
  reset([fixture('a')], null); stateFailure = true; parsed = { action: 'complete', id: 'a' };
  const first = await run('Erledige Aufgabe TEST a');
  assert.equal(first.taskAction.ok, true); assert.equal(first.continuityWarning, 'state_save_failed');
  assert.deepEqual(await run('Erledige Aufgabe TEST a', 'live'), first); assert.equal(writes, 1);
});

test('uncertain task write is not confirmed or replayed', async () => {
  reset([fixture('a')], 'a'); writeUncertain = true; parsed = { action: 'complete', id: 'a' };
  const first = await run('Die ist erledigt');
  assert.equal(first.taskAction.ok, false); assert.equal(first.taskAction.status, 'execution_failed');
  assert.deepEqual(await run('Die ist erledigt'), first); assert.equal(writes, 1);
});

test('failed finalization leaves pending reservation instead of replay', async () => {
  reset([fixture('a')], 'a'); finishFailure = true; parsed = { action: 'complete', id: 'a' };
  assert.equal((await run('Die ist erledigt')).taskAction.ok, true);
  assert.equal((await run('Die ist erledigt')).taskAction.status, 'in_progress'); assert.equal(writes, 1);
});

for (const kind of ['HTTP', 'JSON']) test(`classifier ${kind} error is explicit and performs no task write`, async () => {
  reset(); classifierFailure = kind === 'HTTP'; malformed = kind === 'JSON';
  const result = await run('Lege eine Aufgabe an');
  assert.equal(result.taskAction.ok, false); assert.equal(result.taskAction.status, 'execution_failed'); assert.equal(writes, 0);
});

test('sparse date update preserves priority, notes, recurrence and reminder', async () => {
  reset([fixture('a')], 'a'); parsed = { action: 'update', id: 'a', task: { dueAt: '2026-10-09T10:00:00' } };
  const { taskAction: { task } } = await run('Verschiebe die auf Freitag');
  assert.equal(task.priority, 'high'); assert.equal(task.notes, 'keep me'); assert.equal(task.recurrence, 'daily');
  assert.equal(task.remindAt, '2026-10-07T08:30:00'); assert.equal(task.dueAt, '2026-10-09T10:00:00');
});

test('multi-item list clears singular follow-up target and is not cached', async () => {
  reset([fixture('a'), fixture('b')], 'a'); parsed = { action: 'list' };
  await run('Zeig meine Aufgaben'); assert.equal(JSON.parse(db.get(STATE)).lastTaskId, null);
  db.set(TASKS, JSON.stringify([fixture('b')]));
  assert.equal((await run('Zeig meine Aufgaben')).taskAction.tasks.length, 1);
});

test('live without memories includes task result, continuity and calendar payload', async () => {
  reset([fixture('a')], 'a'); parsed = { action: 'calendar_export', id: 'a' };
  const result = await endpoint('live-context', 'Pack die in den Kalender');
  assert.equal(result.taskAction.action, 'calendar_export'); assert.equal(result.calendarAction.title, 'TEST a');
  assert.match(result.context, /Kalenderimport.*vorbereitet/); assert.match(result.context, /LETZTE AKTION/);
});

test('live error context cannot claim task success', async () => {
  reset(); classifierFailure = true;
  const result = await endpoint('live-context', 'Lege eine Aufgabe an');
  assert.equal(result.taskAction.ok, false); assert.match(result.context, /Keinen Erfolg behaupten/);
});

test('live without memories confirms actual creation', async () => {
  reset(); parsed = { action: 'create', task: { title: 'TEST live' } };
  const result = await endpoint('live-context', 'Lege eine Aufgabe TEST live an');
  assert.equal(result.taskAction.action, 'create'); assert.match(result.context, /TEST live.*gespeichert/);
});

test('live missing task date asks for a date instead of confirming export', async () => {
  reset([{ ...fixture('a'), dueAt: null }], 'a'); parsed = { action: 'calendar_export', id: 'a' };
  const result = await endpoint('live-context', 'Pack die in den Kalender');
  assert.equal(result.taskAction.ok, false); assert.equal(result.taskAction.status, 'missing_due_at');
  assert.match(result.context, /Datum und Uhrzeit/); assert.equal(result.calendarAction, null);
});

test('live preserves completed action even when downstream memory read fails', async () => {
  reset(); parsed = { action: 'create', task: { title: 'TEST fallback' } }; memoryFailure = true;
  const previousError = console.error;
  console.error = () => {};
  try {
    const result = await endpoint('live-context', 'Lege eine Aufgabe TEST fallback an');
    assert.equal(result.taskAction.ok, true); assert.match(result.context, /TEST fallback.*gespeichert/);
  } finally { console.error = previousError; }
});

test('text error overrides model success claim and receives actual failure context', async () => {
  reset(); classifierFailure = true;
  modelHook = body => assert.match(body.input.find(item => item.role === 'developer' && item.content.startsWith('Tatsächliches Task-Ergebnis')).content, /execution_failed/);
  const result = await endpoint('chat', 'Lege eine Aufgabe an');
  assert.equal(result.taskAction.ok, false); assert.match(result.reply, /nicht sicher bestätigen/);
});

test('text model receives result after task has actually been persisted', async () => {
  reset(); parsed = { action: 'create', task: { title: 'TEST text' } };
  modelHook = body => {
    assert.equal(writes, 1);
    assert.equal(JSON.parse(db.get(TASKS))[0].title, 'TEST text');
    assert.match(body.input.find(item => item.role === 'developer' && item.content.startsWith('Tatsächliches Task-Ergebnis')).content, /TEST text/);
  };
  const result = await endpoint('chat', 'Lege eine Aufgabe TEST text an');
  assert.equal(result.taskAction.ok, true); assert.match(result.reply, /als Aufgabe gespeichert/);
});

test('Tasks API rejects a concurrent UI write while live action is running', async () => {
  reset(); parsed = { action: 'create', task: { title: 'TEST live pending' } };
  let entered, release;
  const ready = new Promise(resolve => entered = resolve);
  const gate = new Promise(resolve => release = resolve);
  classifierHook = async () => { entered(); await gate; };
  const live = run('Lege eine Aufgabe TEST live pending an', 'live'); await ready;
  const busy = await endpoint('tasks', '', { body: { action: 'create', task: { title: 'TEST UI' } }, expectedStatus: 409 });
  assert.equal(busy.ok, false); assert.equal(busy.status, 'in_progress'); assert.equal(writes, 0);
  release(); await live;
  await endpoint('tasks', '', { body: { action: 'create', task: { title: 'TEST UI' } } });
  assert.equal(writes, 2); assert.equal(JSON.parse(db.get(TASKS)).length, 2);
});

test('text action cannot run while UI owns the shared mutation lock', async () => {
  reset();
  let entered, release;
  const ready = new Promise(resolve => entered = resolve);
  const gate = new Promise(resolve => release = resolve);
  const ui = withTaskMutationLock(async () => { entered(); await gate; }); await ready;
  assert.equal((await run('Lege eine Aufgabe an')).taskAction.status, 'in_progress');
  assert.equal(classifierCalls, 0); assert.equal(writes, 0);
  release(); await ui;
  parsed = { action: 'create', task: { title: 'TEST after UI' } };
  assert.equal((await run('Lege eine Aufgabe an')).taskAction.ok, true);
});

test('Tasks API GET remains available during mutation and does not acquire a lock', async () => {
  reset([fixture('a')], 'a');
  db.set('sofia:main:action-lock:v2', 'other-owner');
  const result = await endpoint('tasks', '', { method: 'GET' });
  assert.equal(result.tasks.length, 1); assert.equal(db.get('sofia:main:action-lock:v2'), 'other-owner');
});

test('Tasks API validation error releases its lock for a subsequent valid request', async () => {
  reset();
  await endpoint('tasks', '', { body: { action: 'create', task: {} }, expectedStatus: 400 });
  assert.equal(db.has('sofia:main:action-lock:v2'), false);
  const result = await endpoint('tasks', '', { body: { action: 'create', task: { title: 'TEST valid' } } });
  assert.equal(result.ok, true); assert.equal(writes, 1);
});

test('UI lock release cannot delete a newer owner after lease expiry', async () => {
  reset();
  await withTaskMutationLock(async () => { db.set('sofia:main:action-lock:v2', 'new-owner'); });
  assert.equal(db.get('sofia:main:action-lock:v2'), 'new-owner');
});

test('ordinary live conversation does not run a calendar classifier', async () => {
  reset();
  const result = await endpoint('live-context', 'Hallo Sofia');
  assert.equal(result.calendarAction, null); assert.equal(calendarCalls, 0);
});

test('explicit live calendar request is classified once and returned', async () => {
  reset();
  calendarOutput = { title: 'TEST Termin', start: '2026-10-07T09:00:00', duration_minutes: 15, alarm_minutes: 0, notes: '' };
  const result = await endpoint('live-context', 'Kalendertermin morgen um neun');
  assert.deepEqual(result.calendarAction, calendarOutput); assert.equal(calendarCalls, 1);
});

test('confirmed task calendar export needs no calendar classifier', async () => {
  reset([fixture('a')], 'a'); parsed = { action: 'calendar_export', id: 'a' };
  const result = await endpoint('live-context', 'Die in den Kalender');
  assert.equal(result.calendarAction.start, fixture('a').dueAt); assert.equal(calendarCalls, 0);
});

test('failed live reminder action never offers an independent calendar import', async () => {
  reset(); classifierFailure = true;
  calendarOutput = { title: 'TEST Reminder', start: '2026-10-07T09:00:00' };
  const result = await endpoint('live-context', 'Erinnere mich morgen um neun');
  assert.equal(result.taskAction.ok, false); assert.equal(result.calendarAction, null);
  assert.equal(calendarCalls, 0); assert.match(result.context, /unbestätigt/);
});

test('task without a due date asks for clarification without calendar fallback', async () => {
  reset([{ ...fixture('a'), dueAt: null }], 'a'); parsed = { action: 'calendar_export', id: 'a' };
  const result = await endpoint('live-context', 'Die in den Kalender');
  assert.equal(result.taskAction.status, 'missing_due_at'); assert.equal(result.calendarAction, null);
  assert.equal(calendarCalls, 0); assert.match(result.context, /Datum und Uhrzeit/);
});

for (const zone of ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo']) {
  test(`task calendar arithmetic is independent of server zone ${zone}`, () => {
    const previousTZ = process.env.TZ;
    try {
      process.env.TZ = zone;
      assert.deepEqual(nextRecurringDates({ dueAt: '2026-03-28T09:00:00', remindAt: '2026-03-27T09:00:00', recurrence: 'daily' }),
        { dueAt: '2026-03-29T09:00:00', remindAt: '2026-03-28T09:00:00' });
      assert.equal(addCalendarDays('2026-03-22 02:30:00', 7), '2026-03-29T02:30:00');
      assert.equal(nextRecurringDates({ dueAt: '2026-10-24T09:00', recurrence: 'weekly' }).dueAt, '2026-10-31T09:00:00');
      assert.equal(nextRecurringDates({ dueAt: '2026-01-31T09:00:00', recurrence: 'monthly' }).dueAt, '2026-02-28T09:00:00');
      assert.equal(nextRecurringDates({ dueAt: '2028-01-31T09:00:00', recurrence: 'monthly' }).dueAt, '2028-02-29T09:00:00');
      assert.equal(nextRecurringDates({ dueAt: '2026-12-31T09:00:00', recurrence: 'monthly' }).dueAt, '2027-01-31T09:00:00');
    } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
  });
}

test('monthly completion uses the same valid next date through actions and Tasks API', async () => {
  const task = { ...fixture('a'), recurrence: 'monthly', dueAt: '2026-01-31T09:00:00', remindAt: '2026-01-31T08:30:00' };
  reset([task], 'a'); parsed = { action: 'complete', id: 'a' };
  const action = await run('Die ist erledigt');
  reset([task], 'a');
  const ui = await endpoint('tasks', '', { body: { action: 'complete', id: 'a' } });
  for (const result of [action.taskAction, ui]) {
    assert.equal(result.task.dueAt, '2026-02-28T09:00:00');
    assert.equal(result.task.remindAt, '2026-02-28T08:30:00');
    assert.equal(result.task.status, 'open');
  }
});

test('week query ends after seven calendar days even across the DST gap', async () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Berlin';
    reset([
      { ...fixture('a'), dueAt: '2026-03-29T02:00:00' },
      { ...fixture('b'), dueAt: '2026-03-29T03:00:00' }
    ]);
    parsed = { action: 'list', scope: 'week' };
    const result = await run('Welche Aufgaben stehen diese Woche an?', 'text', '2026-03-22 02:30:00');
    assert.deepEqual(result.taskAction.tasks.map(task => task.id), ['a']);
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});

test('calendar arithmetic rejects rollover dates and unsupported recurrence', () => {
  assert.equal(addCalendarDays('2026-02-30T09:00:00', 7), null);
  assert.equal(addCalendarDays('2026-10-06T24:00:00', 7), null);
  assert.equal(nextRecurringDates({ dueAt: '2026-02-30T09:00:00', recurrence: 'daily' }), null);
  assert.equal(nextRecurringDates({ dueAt: '2026-10-06T09:00:00', recurrence: 'unknown' }), null);
});

test('explicit null removes recurrence and dates through both task paths', async () => {
  const patch = { dueAt: null, remindAt: null, recurrence: null };
  reset([fixture('a')], 'a'); parsed = { action: 'update', id: 'a', task: patch };
  const action = await run('Entferne Termin und Wiederholung dieser Aufgabe');
  reset([fixture('a')], 'a');
  const ui = await endpoint('tasks', '', { body: { action: 'update', id: 'a', task: patch } });
  for (const result of [action.taskAction, ui]) {
    assert.equal(result.task.dueAt, null); assert.equal(result.task.remindAt, null);
    assert.equal(result.task.recurrence, null); assert.equal(result.task.notes, 'keep me');
  }
  const completed = await endpoint('tasks', '', { body: { action: 'complete', id: 'a' } });
  assert.equal(completed.task.status, 'completed');
});

test('Tasks API sparse update preserves dates and recurrence', async () => {
  reset([fixture('a')], 'a');
  const result = await endpoint('tasks', '', { body: { action: 'update', id: 'a', task: { priority: 'low' } } });
  assert.equal(result.task.priority, 'low'); assert.equal(result.task.dueAt, fixture('a').dueAt);
  assert.equal(result.task.remindAt, fixture('a').remindAt); assert.equal(result.task.recurrence, 'daily');
});

const invalidPatches = [
  { dueAt: '2026-02-30T09:00:00' },
  { remindAt: '2026-10-07T24:00:00' },
  { dueAt: 123 },
  { recurrence: 'yearly' }
];
for (const action of ['create', 'update']) {
  test(`invalid ${action} classifier fields never persist a task or confirm success`, async () => {
    for (const patch of invalidPatches) {
      reset([fixture('a')], 'a'); parsed = { action, id: 'a', task: { title: 'TEST invalid', ...patch } };
      const before = db.get(TASKS);
      const result = await run(action === 'create' ? 'Lege eine Aufgabe an' : 'Ändere diese Aufgabe');
      assert.equal(result.taskAction.ok, false); assert.equal(writes, 0); assert.equal(db.get(TASKS), before);
    }
  });
  test(`Tasks API rejects invalid ${action} fields with HTTP 400 before writing`, async () => {
    for (const patch of invalidPatches) {
      reset([fixture('a')], 'a'); const before = db.get(TASKS);
      const result = await endpoint('tasks', '', { body: { action, id: 'a', task: { title: 'TEST invalid', ...patch } }, expectedStatus: 400 });
      assert.equal(result.status, 'invalid_task'); assert.equal(writes, 0); assert.equal(db.get(TASKS), before);
      assert.equal(db.has('sofia:main:action-lock:v2'), false);
    }
  });
}

test.after(() => {
  globalThis.fetch = savedFetch;
  for (const key of envNames) if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
});

test('normal conversation and topic change bypass task Redis even when unavailable',async()=>{
 reset([fixture('a')],'a');const normal=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{requests++;throw Error('task store unavailable');};
 try {for(const message of ['Andere Frage: Was machst du gerade?','Ich lese gern Krimis.','Und danach?','Nein, ich meinte deinen Abend.','Hallo Sofia','Das klingt gut.','Die Frage habe ich beantwortet.','Am liebsten lese ich Krimis.'])assert.deepEqual(await run(message),{taskAction:{ok:true,action:'none'}});assert.equal(requests,0);}finally{globalThis.fetch=normal;}
});
test('actual task requests still fail closed when reservation store is unavailable',async()=>{
 reset();const normal=globalThis.fetch;globalThis.fetch=async()=>{throw Error('task store unavailable');};
 try{assert.equal((await run('Lege eine Aufgabe Bericht an')).taskAction.status,'execution_failed');}finally{globalThis.fetch=normal;}
});
