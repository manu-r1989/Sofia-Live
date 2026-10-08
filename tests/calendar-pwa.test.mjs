import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const app = await readFile(new URL('app.js', root), 'utf8');
const calendarSource = app.slice(app.indexOf('function calendarStartDate('), app.indexOf('window.SofiaCalendarDownload ='));
const workerSource = await readFile(new URL('sw.js', root), 'utf8');
const currentCache = workerSource.match(/const CACHE = "([^"]+)"/)[1];
const reminderSource = app.slice(app.indexOf("const TASK_NOTICE_KEY ="), app.indexOf('function startTaskReminderChecks('));
const deviceZones = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo'];

function calendarHarness({ date = Date } = {}) {
  const rows = [], notices = [], blobs = [];
  const element = tag => ({ tag, children: [], appendChild(child) { this.children.push(child); }, setAttribute() {}, addEventListener() {} });
  const context = vm.createContext({
    Date: date, Intl, Blob, Set,
    messages: { appendChild(row) { rows.push(row); } },
    document: { createElement: element },
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:isolated-calendar'; }, revokeObjectURL() {} },
    addMessage(message) { notices.push(message); },
    scrollChatToLatest() {}, setTimeout() {}, pendingCalendarAction: null
  });
  vm.runInContext(calendarSource, context);
  return { context, rows, notices, blobs };
}

for (const zone of deviceZones) test(`calendar exports Berlin wall time consistently on a ${zone} device`, async () => {
  const previous = process.env.TZ; process.env.TZ = zone;
  try {
    const harness = calendarHarness();
    harness.context.addCalendarDownload({ title: 'TEST calendar', start: '2026-10-07T09:00:00', duration_minutes: 15, alarm_minutes: 10 });
    assert.equal(harness.rows.length, 1); assert.equal(harness.notices.length, 0);
    const link = harness.rows[0].children[0];
    assert.equal(link.download, 'sofia-erinnerung.ics'); assert.equal(link.textContent, 'Zum Kalender hinzufügen');
    const ics = await harness.blobs[0].text();
    assert.match(ics, /DTSTART:20261007T070000Z\r\n/);
    assert.match(ics, /DTEND:20261007T071500Z\r\n/);
    assert.match(ics, /TRIGGER:-PT10M\r\n/);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('calendar resolves standard and daylight time offsets and minute-only inputs', () => {
  const { context } = calendarHarness();
  assert.equal(context.calendarStartDate('2026-01-10T09:00').toISOString(), '2026-01-10T08:00:00.000Z');
  assert.equal(context.calendarStartDate('2026-07-10T09:00:00').toISOString(), '2026-07-10T07:00:00.000Z');
});

test('calendar rejects nonexistent spring and ambiguous autumn times without creating a link', () => {
  for (const start of ['2026-03-29T02:30:00', '2026-10-25T02:30:00']) {
    const harness = calendarHarness();
    harness.context.addCalendarDownload({ title: 'TEST transition', start });
    assert.equal(harness.rows.length, 0); assert.equal(harness.blobs.length, 0);
    assert.match(harness.notices[0], /Zeitumstellung/); assert.equal(harness.context.pendingCalendarAction, null);
  }
});

test('calendar can distinguish explicit offsets during the autumn overlap', () => {
  const { context } = calendarHarness();
  assert.equal(context.calendarStartDate('2026-10-25T02:30:00+02:00').toISOString(), '2026-10-25T00:30:00.000Z');
  assert.equal(context.calendarStartDate('2026-10-25T02:30:00+01:00').toISOString(), '2026-10-25T01:30:00.000Z');
});

test('calendar rejects rollover dates and invalid hours', () => {
  const { context } = calendarHarness();
  for (const invalid of ['2026-02-30T09:00:00', '2026-10-07T24:00:00', '2026-13-01T09:00:00', 'not a date']) {
    assert.throws(() => context.calendarStartDate(invalid));
  }
});

test('calendar duration remains elapsed minutes across both DST transitions', async () => {
  for (const [start, expectedStart, expectedEnd] of [
    ['2026-03-29T01:55:00', '20260329T005500Z', '20260329T010500Z'],
    ['2026-10-25T01:55:00', '20261024T235500Z', '20261025T000500Z']
  ]) {
    const harness = calendarHarness();
    harness.context.addCalendarDownload({ title: 'TEST duration', start, duration_minutes: 10 });
    const ics = await harness.blobs[0].text();
    assert.ok(ics.includes('DTSTART:' + expectedStart)); assert.ok(ics.includes('DTEND:' + expectedEnd));
  }
});

for (const zone of deviceZones) test(`task reminder fires at Berlin due time on a ${zone} device and only once`, async () => {
  const previous = process.env.TZ; process.env.TZ = zone;
  try {
    let now = Date.parse('2026-10-07T06:59:59Z');
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    const harness = calendarHarness({ date: Clock }), storage = new Map();
    harness.context.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
    harness.context.window = {};
    harness.context.fetch = async () => ({ ok: true, json: async () => ({ tasks: [{ id: 'TEST a', title: 'TEST Berlin reminder', remindAt: '2026-10-07T09:00:00' }] }) });
    vm.runInContext(reminderSource, harness.context);
    await harness.context.checkTaskReminders(); assert.equal(harness.notices.length, 0);
    now = Date.parse('2026-10-07T07:00:00Z');
    await harness.context.checkTaskReminders(); assert.equal(harness.notices.length, 1);
    assert.match(harness.notices[0], /TEST Berlin reminder/);
    await harness.context.checkTaskReminders(); assert.equal(harness.notices.length, 1);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('startup brief uses the Berlin calendar day near midnight', async () => {
  const previous = process.env.TZ; process.env.TZ = 'UTC';
  try {
    const now = Date.parse('2026-10-06T22:30:00Z');
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    const harness = calendarHarness({ date: Clock });
    harness.context.localStorage = { getItem() { return null; }, setItem() {} };
    harness.context.window = {};
    harness.context.fetch = async () => ({ ok: true, json: async () => ({ tasks: [{ id: 'TEST today', title: 'TEST today', dueAt: '2026-10-07T09:00:00' }] }) });
    vm.runInContext(reminderSource, harness.context);
    await harness.context.checkTaskReminders({ startup: true });
    assert.match(harness.notices[0], /1 heute fällig/);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

function workerHarness({ offline = false } = {}) {
  const listeners = {}, stored = new Map(), cacheCalls = [], fetchCalls = [];
  const cache = {
    async put(key, value) { stored.set(typeof key === 'string' ? key : key.url, value); },
    async addAll(paths) { cacheCalls.push({ op: 'addAll', paths: [...paths] }); }
  };
  const caches = {
    async open(name) { cacheCalls.push({ op: 'open', name }); return cache; },
    async match(key) { cacheCalls.push({ op: 'match', key: typeof key === 'string' ? key : key.url }); return stored.get(typeof key === 'string' ? key : key.url); },
    async keys() { return ['sofia-live-v4129', 'sofia-live-v41810c1', currentCache]; },
    async delete(key) { cacheCalls.push({ op: 'delete', key }); return true; }
  };
  const context = vm.createContext({
    self: { addEventListener(type, listener) { listeners[type] = listener; }, async skipWaiting() {}, clients: { async claim() {} } },
    caches, URL, Response,
    async fetch(request) { fetchCalls.push(request.url); if (offline) throw new Error('offline'); return new Response('fresh', { status: 200 }); }
  });
  vm.runInContext(workerSource, context);
  const dispatch = request => {
    let response;
    listeners.fetch({ request, respondWith(value) { response = Promise.resolve(value); } });
    return response;
  };
  return { listeners, stored, cacheCalls, fetchCalls, dispatch };
}

test('service worker leaves authenticated API requests entirely to the network', () => {
  const harness = workerHarness();
  for (const path of ['/api/tasks?status=open', '/api/chat?history=1', '/api/session']) {
    assert.equal(harness.dispatch({ method: 'GET', url: 'https://sofia.test' + path, mode: 'cors' }), undefined);
  }
  assert.equal(harness.cacheCalls.length, 0); assert.equal(harness.fetchCalls.length, 0);
});

test('service worker refreshes cached navigation online', async () => {
  const harness = workerHarness(), request = { method: 'GET', url: 'https://sofia.test/', mode: 'navigate' };
  harness.stored.set(request.url, new Response('stale'));
  assert.equal(await (await harness.dispatch(request)).text(), 'fresh');
  assert.equal(harness.fetchCalls.length, 1);
});

test('service worker provides the latest cached document when offline', async () => {
  const harness = workerHarness({ offline: true }), request = { method: 'GET', url: 'https://sofia.test/', mode: 'navigate' };
  harness.stored.set(request.url, new Response('latest cached document'));
  harness.stored.set('./index.html', new Response('older install document'));
  assert.equal(await (await harness.dispatch(request)).text(), 'latest cached document');
});

test('service worker retains offline versioned assets and precaches the actual script URLs', async () => {
  const harness = workerHarness({ offline: true }), request = { method: 'GET', url: 'https://sofia.test/app.js?v=4619v1', mode: 'cors' };
  harness.stored.set(request.url, new Response('cached script'));
  assert.equal(await (await harness.dispatch(request)).text(), 'cached script');
  assert.equal(harness.fetchCalls.length, 0);
  let installed;
  harness.listeners.install({ waitUntil(value) { installed = value; } }); await installed;
  const paths = harness.cacheCalls.find(call => call.op === 'addAll').paths;
  assert.ok(paths.includes('./action-feedback.js?v=4619v1'));
  assert.ok(paths.includes('./sofia-projects.js?v=4619v1')); assert.ok(paths.includes('./app.js?v=4619v1')); assert.ok(paths.includes('./live.js?v=4619v1'));
  assert.ok(paths.includes('./avatar-gesture.js?v=4197m1'));
  assert.ok(paths.includes('./avatar-expression.js?v=4619v1')); assert.ok(paths.includes('./avatar/sofia-friendly-mouth.png?v=4194e1')); assert.ok(paths.includes('./avatar/sofia-thoughtful-mouth.png?v=4194e2'));
  assert.ok(paths.includes('./sofia-avatar.js?v=4192c1')); assert.ok(paths.includes('./avatar-presence.js?v=4193p3'));
});

test('service worker removes its old cache during activation', async () => {
  const harness = workerHarness(); let activated;
  harness.listeners.activate({ waitUntil(value) { activated = value; } }); await activated;
  assert.ok(harness.cacheCalls.some(call => call.op === 'delete' && call.key === 'sofia-live-v4129'));
  assert.ok(harness.cacheCalls.some(call => call.op === 'delete' && call.key === 'sofia-live-v41810c1'));
  assert.ok(!harness.cacheCalls.some(call => call.op === 'delete' && call.key === currentCache));
});




