import assert from 'node:assert/strict';
import test from 'node:test';
import { SOUNDS, instrumentOf, noteOf } from '../public/js/sound.js';

test('each project color has its note, each pattern its instrument', () => {
  const notes = Array.from({ length: 10 }, (_, i) => noteOf(i));
  assert.equal(new Set(notes).size, 10);
  assert.deepEqual([...notes].sort((a, b) => a - b), notes);
  assert.equal(new Set(Array.from({ length: 30 }, (_, i) => `${noteOf(i).toFixed(2)}-${instrumentOf(i)}`)).size, 30);
});

test('every note stays in a pleasant range', () => {
  for (let look = 0; look < 30; look++) for (const step of [0, 1, 2, 3, 4]) { const f = noteOf(look, step); assert.ok(f > 200 && f < 2200, `${look}/${step}: ${f}`); }
});

test('the expected sounds exist', () => assert.deepEqual(Object.keys(SOUNDS).sort(), ['ask', 'bye', 'done', 'hello', 'lamp', 'land', 'pop', 'puff', 'step']));
