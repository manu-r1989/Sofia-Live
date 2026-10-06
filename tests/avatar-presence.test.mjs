import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../avatar-presence.js', import.meta.url), 'utf8');
function harness({ hidden = false, ready = 'complete', missing = false } = {}) {
  const handlers = {}, page = {}, styles = [];
  const engine = { dataset: { state: 'idle' } };
  const container = { dataset: {}, querySelector: () => engine };
  const observers = [];
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
  }
  const document = {
    hidden, readyState: ready,
    getElementById: id => id === 'sofiaAvatar' ? (missing ? null : container) : styles.find(style => style.id === id),
    createElement: () => ({}),
    head: { appendChild: style => styles.push(style) },
    addEventListener: (name, fn) => { handlers[name] = fn; }
  };
  const window = { addEventListener: (name, fn) => { page[name] = fn; } };
  const context = { document, window, MutationObserver }; // No SofiaAvatar, audio API, timer or animation-frame API.
  vm.runInNewContext(source, context);
  return { document, container, engine, observers, handlers, page, styles, context };
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

test('posture profiles are limited to active state and reset under reduced motion', () => {
  const h = harness(), css = h.styles[0].textContent;
  for (const state of ['listening', 'thinking', 'speaking']) {
    assert.ok(css.includes('[data-presence-state="' + state + '"][data-presence-motion="active"]'));
  }
  assert.match(css, /rotate: -.18deg; translate: 0 -.5px; scale: 1.001/);
  assert.match(css, /rotate: .12deg; translate: 0 .4px; scale: 1/);
  assert.match(css, /rotate: 0deg; translate: 0 0; scale: 1/);
  assert.match(css, /translate: none !important; scale: none !important/);
});

test('presence observes listening and speaking without changing engine state or layers', () => {
  const h = harness();
  assert.equal(h.observers.length, 1);
  assert.equal(h.observers[0].target, h.container);
  assert.deepEqual(Array.from(h.observers[0].options.attributeFilter), ['data-state']);
  for (const state of ['listening', 'speaking', 'thinking', 'idle']) {
    h.engine.dataset.state = state; h.observers[0].callback();
    assert.equal(h.container.dataset.presenceState, state);
    assert.equal(h.engine.dataset.state, state);
  }
  h.engine.dataset.state = 'unexpected'; h.observers[0].callback();
  assert.equal(h.container.dataset.presenceState, 'idle');
  assert.equal(h.engine.dataset.state, 'unexpected');
  assert.match(h.styles[0].textContent, /transition: rotate 1.2s/);
  assert.match(h.styles[0].textContent, /rotate: none !important/);
});
