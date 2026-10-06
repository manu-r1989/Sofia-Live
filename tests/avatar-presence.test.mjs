import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../avatar-presence.js', import.meta.url), 'utf8');
function harness({ hidden = false, ready = 'complete', missing = false } = {}) {
  const handlers = {}, page = {}, styles = [];
  const container = { dataset: {} };
  const document = {
    hidden, readyState: ready,
    getElementById: id => id === 'sofiaAvatar' ? (missing ? null : container) : styles.find(style => style.id === id),
    createElement: () => ({}),
    head: { appendChild: style => styles.push(style) },
    addEventListener: (name, fn) => { handlers[name] = fn; }
  };
  const window = { addEventListener: (name, fn) => { page[name] = fn; } };
  const context = { document, window }; // No SofiaAvatar, audio API, timer or animation-frame API.
  vm.runInNewContext(source, context);
  return { document, container, handlers, page, styles, context };
}

test('presence starts on outer container without touching avatar or audio APIs', () => {
  const h = harness();
  assert.equal(h.container.dataset.presenceMotion, 'active');
  assert.equal(h.styles.length, 1);
  assert.ok(!h.styles[0].textContent.includes('.sofia-avatar-v435-layer'));
});

test('background and page lifecycle pause presence and resume it', () => {
  const h = harness();
  h.document.hidden = true; h.handlers.visibilitychange();
  assert.equal(h.container.dataset.presenceMotion, 'paused');
  h.document.hidden = false; h.handlers.visibilitychange();
  assert.equal(h.container.dataset.presenceMotion, 'active');
  h.page.pagehide(); assert.equal(h.container.dataset.presenceMotion, 'paused');
  h.page.pageshow(); assert.equal(h.container.dataset.presenceMotion, 'active');
});

test('hidden startup remains paused; reduced motion disables animation in CSS', () => {
  const h = harness({ hidden: true });
  assert.equal(h.container.dataset.presenceMotion, 'paused');
  assert.match(h.styles[0].textContent, /prefers-reduced-motion: reduce/);
  assert.match(h.styles[0].textContent, /animation: none !important; transform: none/);
});

test('initialization waits for DOM and does not duplicate style or handlers', () => {
  const h = harness({ ready: 'loading' });
  assert.equal(h.styles.length, 0); h.handlers.DOMContentLoaded();
  assert.equal(h.styles.length, 1);
  const handler = h.handlers.visibilitychange;
  vm.runInNewContext(source, { ...h.context, document: { ...h.document, readyState: 'complete' } });
  assert.equal(h.styles.length, 1); assert.equal(h.handlers.visibilitychange, handler);
});

test('missing avatar is harmless', () => {
  assert.equal(harness({ missing: true }).styles.length, 0);
});
