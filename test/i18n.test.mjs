import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGES } from '../public/js/i18n.js';

const shape = (v, at = '') => (typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).flatMap(([k, x]) => shape(x, `${at}.${k}`)) : [`${at}:${Array.isArray(v) ? `array${v.length}` : typeof v}`]);

test('every language has the same keys', () => {
  const [first, ...others] = Object.values(LANGUAGES).map((l) => shape(l).sort());
  for (const o of others) assert.deepEqual(o, first);
});
