// What a booby-trapped project, a damaged file or a hostile website could try.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decorate, emptyMemory, repairMemory } from '../public/js/assign.js';

const PORT = 4798, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluffice-')), at = (...p) => path.join(dir, ...p);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let child, dead = false;

const call = (target, headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: target, method, headers: { host: `localhost:${PORT}`, ...headers } }, (res) => {
    let text = '';
    res.on('data', (d) => { text += d; if (target === '/events' && text.includes('\n\n')) { res.destroy(); resolve({ status: res.statusCode, text, headers: res.headers }); } });
    res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
  });
  req.on('error', reject); req.end(body);
});
const list = async () => JSON.parse((await call('/events')).text.replace(/^data: /, ''));
const session = (n, o) => fs.writeFileSync(at('claude/sessions', `${n}.json`), typeof o === 'string' ? o : JSON.stringify({ pid: process.pid, sessionId: `s${n}`, cwd: '/x/p', startedAt: 1, status: 'busy', statusUpdatedAt: Date.now(), entrypoint: 'cli', ...o }));
const title = (id, t) => fs.writeFileSync(at('claude/projects/-x-p', `${id}.jsonl`), `${JSON.stringify({ type: 'ai-title', aiTitle: t })}\n`);

before(async () => {
  for (const d of ['claude/sessions', 'claude/projects/-x-p', 'home', 'outside']) fs.mkdirSync(at(d), { recursive: true });
  child = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), '--no-open'], { env: { ...process.env, PORT: String(PORT), FLUFFICE_HOME: at('home'), FLUFFICE_CLAUDE_DIR: at('claude') }, stdio: 'ignore' });
  child.on('exit', () => { dead = true; });
  for (let i = 0; i < 40; i++) { try { await call('/health'); return; } catch { await wait(100); } }
  throw new Error('the server did not start');
});
after(() => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => { for (const f of fs.readdirSync(at('claude/sessions'))) fs.rmSync(at('claude/sessions', f)); });

test('a project can have any folder name', async () => {
  ['constructor', '__proto__', 'toString'].forEach((p, i) => session(i, { cwd: `/x/${p}` }));
  session(9, { status: 'constructor' }); await wait(1300);
  const l = await list();
  assert.equal(l.length, 4);
  for (const s of l) { assert.ok(Number.isInteger(s.look) && Number.isInteger(s.acc), s.project); assert.equal(typeof s.state, 'string'); }
});

test('an unexpected session file is skipped, and the others still show', async () => {
  session(1, { sessionId: 'good' });
  const odd = [{ cwd: 5 }, { sessionId: { a: 1 } }, { sessionId: '../../x' }, { pid: 'x' }, { pid: -1 }, 'null', '[1]', '{oops', ' '.repeat(200_000)];
  odd.forEach((o, i) => session(10 + i, o));
  session(40, { sessionId: 'dates', startedAt: 'x', statusUpdatedAt: null, name: { a: 1 }, nameSource: 'user' }); await wait(1300);
  assert.equal(dead, false);
  const l = await list();
  assert.deepEqual(l.map((s) => s.id).sort(), ['dates', 'good']);
  for (const s of l) { assert.ok(Number.isFinite(s.since) && Number.isFinite(s.startedAt)); assert.equal(typeof s.title, 'string'); }
});

test('a session id cannot reach a file elsewhere', async () => {
  fs.writeFileSync(at('outside/secret.jsonl'), '{"type":"ai-title","aiTitle":"LEAKED"}\n');
  session(1, { sessionId: '../../../outside/secret' }); await wait(1300);
  assert.ok(!JSON.stringify(await list()).includes('LEAKED'));
});

test('titles are short and hold no invisible or reversing characters', async () => {
  session(1, {}); title('s1', 'A'.repeat(2_000_000)); session(2, {}); title('s2', 'safe‮gnp.exe​\u0007'); await wait(1300);
  const l = Object.fromEntries((await list()).map((s) => [s.id, s.title]));
  assert.ok(l.s1.length <= 120);
  assert.equal(l.s2, 'safegnp.exe');
});

test('a damaged memory is repaired', () => {
  const raw = [null, [], 5, 'x', { projects: null, sessions: null }, { projects: { p: 'x', q: 99 }, sessions: { s: 5, t: { acc: 'z', desk: 77, slot: -1, seen: 'x' } }, grouped: true, groupDesks: { p: 50 } }];
  for (const m of raw) {
    const out = decorate([{ id: 't', project: 'p', title: '', state: 'work', since: 1, startedAt: 1 }], repairMemory(m));
    assert.ok(out[0].look >= 0 && out[0].look < 30 && out[0].acc < 10 && out[0].desk < 9);
  }
  const good = emptyMemory(); decorate([{ id: 't', project: 'constructor', title: '', state: 'work', since: 1, startedAt: 1 }], good);
  assert.deepEqual(JSON.stringify(repairMemory(JSON.parse(JSON.stringify(good)))), JSON.stringify(good));
});

test('a website can neither read nor use the server', async () => {
  session(1, {}); await wait(1300);
  const evil = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' };
  assert.equal((await call('/events', evil)).status, 403);
  assert.equal((await call('/js/main.js', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'script' })).status, 403);
  assert.equal((await call('/', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' })).status, 403);
  assert.equal((await call('/', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })).status, 200);
  assert.equal((await call('/seen', { ...evil, 'content-type': 'application/json' }, 'POST', '{"id":"s1"}')).status, 403);
  assert.equal((await call('/health', { host: 'evil.example' })).status, 403);
});

test('answers carry protective headers', async () => {
  const { headers } = await call('/');
  assert.match(headers['content-security-policy'], /default-src 'none'.*frame-ancestors 'none'/);
  for (const [k, v] of Object.entries({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'cross-origin-resource-policy': 'same-origin', 'referrer-policy': 'no-referrer' })) assert.equal(headers[k], v);
  assert.equal(headers['access-control-allow-origin'], undefined);
});

test('a flood of streams is capped and the page still answers', async () => {
  const held = Array.from({ length: 120 }, () => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/events', headers: { host: `localhost:${PORT}` } }, () => {}); r.on('error', () => {}); return r; });
  await wait(700);
  assert.ok(held.filter((r) => r.res?.statusCode === 200).length <= 40);
  assert.equal((await call('/style.css')).status, 200);
  held.forEach((r) => r.destroy()); await wait(200);
  assert.equal((await call('/events')).status, 200);
});
