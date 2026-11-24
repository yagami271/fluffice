import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCESSORY_COUNT, CHEST_SLOTS, DESKS, FRONT_MAX, QUEUE_SHOWN, SEATS, SHELF_SLOTS, decorate, emptyMemory, isVisible } from '../public/js/assign.js';

const NOW = 1e12;
const mk = (id, project, state = 'work', min = 1) => ({ id, project, title: id, state, worked: true, since: NOW - min * 6e4, startedAt: NOW - 1e7 + Number(id.replace(/\D/g, '') || id.charCodeAt(0)) });
const many = (plan, projects = 14) => { const l = []; let i = 0; for (const [state, min, n] of plan) for (let k = 0; k < n; k++, i++) l.push(mk(`s${i}`, `p${i % projects}`, state, min + k / 100)); return l; };
const by = (l) => Object.fromEntries(l.map((s) => [s.id, s]));
const count = (l, zone) => l.filter((s) => s.zone === zone).length;
const spot = (s) => ({ desk: `desk${s.desk}.${s.seat}` }[s.zone] ?? `${s.zone}${s.slot}`);

function invariants(out) {
  const spots = out.filter((s) => isVisible(s.zone)).map(spot);
  assert.equal(new Set(spots).size, spots.length, 'two characters on the same spot');
  for (const s of out) {
    assert.ok(s.zone, `${s.id} has no zone`);
    if (s.mood === 'work') assert.match(s.zone, /^desk/, 'a working session is shown away from a desk');
    if (s.mood === 'ask' || s.mood === 'done') assert.match(s.zone, /^(front|queue)/);
    if (s.mood === 'sleep') assert.match(s.zone, /^(shelf|chest)/);
  }
  assert.ok(count(out, 'front') <= FRONT_MAX);
  assert.ok(out.filter((s) => isVisible(s.zone)).length <= FRONT_MAX + QUEUE_SHOWN + DESKS.length * SEATS + SHELF_SLOTS + CHEST_SLOTS);
}

test('small office: one desk per session, families side by side, stable places', () => {
  const mem = emptyMemory();
  let m = by(decorate([mk('a', 'X'), mk('b', 'X'), mk('c', 'X'), mk('d', 'Y')], mem, NOW));
  assert.equal(m.a.look, m.b.look); assert.notEqual(m.a.look, m.d.look);
  assert.equal(new Set(['a', 'b', 'c'].map((k) => m[k].acc)).size, 3);
  const before = ['a', 'b', 'c', 'd'].map((k) => [m[k].acc, m[k].desk]);
  m = by(decorate([mk('d', 'Y'), mk('c', 'X'), mk('e', 'Z'), mk('a', 'X'), mk('b', 'X')], mem, NOW));
  assert.deepEqual(['a', 'b', 'c', 'd'].map((k) => [m[k].acc, m[k].desk]), before);
});

test('a session that just opened has not finished anything', () => {
  assert.equal(decorate([{ ...mk('a', 'X', 'idle'), worked: false }], emptyMemory(), NOW)[0].mood, 'rest');
});

for (const [name, plan] of [
  ['50 sessions, realistic', [['work', 3, 4], ['ask', 1, 1], ['idle', 6, 2], ['idle', 700, 43]]],
  ['50 sessions, worst case', [['work', 3, 20], ['ask', 1, 10], ['idle', 6, 15], ['idle', 700, 5]]],
  ['200 sessions', [['work', 3, 80], ['ask', 1, 20], ['idle', 6, 40], ['idle', 700, 60]]],
  ['50 working', [['work', 3, 50]]], ['50 needing you', [['ask', 3, 50]]], ['50 sleepers', [['idle', 900, 50]]], ['none', []],
]) test(`${name}: nobody overlaps, nothing is untrue`, () => {
  for (const projects of [1, 3, 14, 40]) { const out = decorate(many(plan, projects), emptyMemory(), NOW); invariants(out); assert.equal(out.length, plan.reduce((a, p) => a + p[2], 0)); }
});

test('front: requests first, then the oldest; the next one moves up when one is handled', () => {
  const mem = emptyMemory(), l = many([['idle', 6, 8], ['ask', 1, 2]]);
  let out = decorate(l, mem, NOW);
  assert.deepEqual(out.filter((s) => s.zone === 'front').map((s) => s.mood).sort(), ['ask', 'ask', 'done', 'done', 'done']);
  const next = out.find((s) => s.zone === 'queue' && s.slot === 0);
  const treated = out.find((s) => s.zone === 'front' && s.mood === 'done');
  mem.sessions[treated.id].seen = NOW;
  out = decorate(l, mem, NOW);
  assert.equal(by(out)[next.id].zone, 'front'); invariants(out);
});

test('sleepers stay put when another arrives or wakes up', () => {
  const mem = emptyMemory(), l = many([['idle', 700, 40]]);
  const a = by(decorate(l, mem, NOW));
  const woken = Object.values(a).find((s) => s.zone === 'shelf');
  const b = by(decorate(l.map((s) => (s.id === woken.id ? { ...s, state: 'work', since: NOW } : s)), mem, NOW));
  const moved = Object.values(a).filter((s) => s.id !== woken.id && isVisible(s.zone) && spot(s) !== spot(b[s.id]));
  assert.deepEqual(moved, []);
  assert.equal(Object.values(b).filter((s) => s.zone === 'shelf').length, SHELF_SLOTS, 'a sleeper from the chest takes the free spot');
});

test('grouping by project does not flip-flop around the threshold', () => {
  const mem = emptyMemory(), seq = [9, 10, 9, 8, 9, 10, 7, 8, 9, 10].map((n) => { invariants(decorate(many([['work', 3, n]]), mem, NOW)); return !!mem.grouped; });
  assert.deepEqual(seq, [false, true, true, true, true, true, false, false, false, true]);
});

test('30 projects have 30 looks, 10 sessions of a project have 10 accessories', () => {
  assert.equal(new Set(decorate(many([['work', 1, 30]], 30), emptyMemory(), NOW).map((s) => s.look)).size, 30);
  assert.equal(new Set(decorate(many([['work', 1, ACCESSORY_COUNT]], 1), emptyMemory(), NOW).map((s) => s.acc)).size, ACCESSORY_COUNT);
});

test('memory survives a JSON round trip', () => {
  const old = { projects: { X: 3 }, sessions: { s0: { acc: 4, desk: 2 } } };
  const out = decorate([mk('s0', 'X')], JSON.parse(JSON.stringify(old)), NOW);
  assert.deepEqual([out[0].look, out[0].acc, out[0].desk], [3, 4, 2]);
});
