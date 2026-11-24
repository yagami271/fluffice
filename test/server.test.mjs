import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

const PORT = 4799, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluffice-'));
const env = { ...process.env, PORT: String(PORT), FLUFFICE_HOME: path.join(dir, 'home'), FLUFFICE_CLAUDE_DIR: path.join(dir, 'claude') };
const sessions = path.join(dir, 'claude', 'sessions'), transcripts = path.join(dir, 'claude', 'projects', '-x-p');
let child;

// Raw requests, so that the Host header and the path go out exactly as written.
const call = (target, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: target, method, headers: { host: `localhost:${PORT}`, ...headers } }, (res) => {
    let text = '';
    res.on('data', (d) => { text += d; if (target === '/events') { res.destroy(); resolve({ status: res.statusCode, text }); } });
    res.on('end', () => resolve({ status: res.statusCode, text }));
  });
  req.on('error', reject); req.end(body);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const list = async () => JSON.parse((await call('/events')).text.replace(/^data: /, ''));
const put = (status, waitingFor) => fs.writeFileSync(path.join(sessions, '1.json'), JSON.stringify({ pid: process.pid, sessionId: 's1', cwd: '/x/p', startedAt: 1, status, waitingFor, statusUpdatedAt: Date.now(), entrypoint: 'cli' }));
const seen = (headers, id = 's1') => call('/seen', { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://localhost:${PORT}`, ...headers }, body: JSON.stringify({ id }) });

before(async () => {
  fs.mkdirSync(sessions, { recursive: true }); fs.mkdirSync(transcripts, { recursive: true });
  fs.writeFileSync(path.join(transcripts, 's1.jsonl'), '{"type":"ai-title","aiTitle":"Auto"}\n{"type":"user","message":"{\\"type\\":\\"ai-title\\",\\"aiTitle\\":\\"DECOY\\"}"}\n');
  put('busy');
  child = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), '--no-open'], { env, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await call('/health'); return; } catch { await wait(100); } }
  throw new Error('the server did not start');
});
after(() => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test('malformed and hostile requests never crash the server', async () => {
  assert.equal((await call('//')).status, 400);
  assert.equal((await call('/../server.mjs')).status, 404);
  assert.equal((await call('/%2e%2e/server.mjs')).status, 404);
  assert.equal((await call('/health', { headers: { host: 'evil.example' } })).status, 403);
  assert.equal(JSON.parse((await call('/health')).text).app, 'fluffice');
});

test('another site cannot mark sessions as seen', async () => {
  assert.equal((await seen({ origin: 'https://evil.example' })).status, 403);
  assert.equal((await seen({ 'content-type': 'text/plain' })).status, 403);
  assert.equal((await seen({}, '__proto__')).status, 404);
});

test('a session goes from working to done, then rests once seen', async () => {
  assert.deepEqual((await list()).map((s) => [s.title, s.mood]), [['Auto', 'work']]);
  put('idle'); await wait(1300);
  assert.equal((await list())[0].mood, 'done');
  assert.equal((await seen({})).status, 204);
  assert.equal((await list())[0].mood, 'rest');
});

test('the reason for waiting is told apart, and an open menu is ignored', async () => {
  put('busy'); await wait(1100);
  put('waiting', 'dialog open'); await wait(1100);
  assert.equal((await list())[0].mood, 'work');
  put('waiting', 'permission prompt'); await wait(1100);
  assert.deepEqual([(await list())[0].mood, (await list())[0].need], ['ask', 'approval']);
  put('waiting', 'input needed'); await wait(1100);
  assert.equal((await list())[0].need, 'question');
});
