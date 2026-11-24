#!/usr/bin/env node
// Reads the state of local Claude Code sessions and streams it to the page. Nothing leaves this machine.
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decorate, emptyMemory } from './public/js/assign.js';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.dirname(SELF);
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const PORT = Number(process.env.PORT || 4747);
const CLAUDE = process.env.FLUFFICE_CLAUDE_DIR || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SESSIONS = path.join(CLAUDE, 'sessions');
const TRANSCRIPTS = path.join(CLAUDE, 'projects');
const HOME = process.env.FLUFFICE_HOME || path.join(os.homedir(), '.fluffice');
const MEMORY = path.join(HOME, 'memory.json');
const PIDFILE = path.join(HOME, 'server.pid');
const TOKENFILE = path.join(HOME, 'token');
const PUBLIC = path.join(ROOT, 'public');
const ORIGIN = `http://localhost:${PORT}`;
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map((h) => `http://${h}`));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const args = new Set(process.argv.slice(2));
const FRENCH = /^fr\b/i.test(Intl.DateTimeFormat().resolvedOptions().locale);
const say = (en, fr) => console.log(FRENCH ? fr : en);

// Statuses written by Claude Code. "waiting" gives its reason in waitingFor.
const STATES = { busy: 'work', shell: 'work', waiting: 'ask', idle: 'idle' };
const needOf = (waitingFor) => (waitingFor === 'input needed' ? 'question' : 'approval');

// ---------- Memory (looks, desks, sessions already seen) ----------

const memory = (() => {
  try { return { ...emptyMemory(), ...JSON.parse(fs.readFileSync(MEMORY, 'utf8')) }; } catch { return emptyMemory(); }
})();
let saved = JSON.stringify(memory);

function saveMemory() {
  const json = JSON.stringify(memory);
  if (json === saved) return;
  saved = json;
  try {
    fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${MEMORY}.tmp`, json, { mode: 0o600 });
    fs.renameSync(`${MEMORY}.tmp`, MEMORY);
  } catch (e) { console.error(`Could not save memory: ${e.message}`); }
}

// ---------- Access ----------
// Other accounts of this computer can reach localhost too, so a browser must be paired once.
// The token stays in a private file. A browser trades a one-time key for it and keeps it in its own storage.

const KEY_LIFE_MS = 10 * 60e3;
const keys = new Map();
const random = () => crypto.randomBytes(24).toString('base64url');

function readToken() {
  try { return fs.readFileSync(TOKENFILE, 'utf8').trim() || null; } catch { return null; }
}

function ensureToken() {
  const known = readToken();
  if (known) return known;
  const token = random();
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKENFILE, token, { mode: 0o600 });
  return token;
}

let token = null;
function isPaired(req) {
  const given = Buffer.from(req.headers.authorization || ''), wanted = Buffer.from(`Bearer ${token}`);
  return token !== null && given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

function newKey() {
  const now = Date.now();
  for (const [k, until] of keys) if (until < now) keys.delete(k);
  const key = random();
  keys.set(key, now + KEY_LIFE_MS);
  return key;
}

function takeKey(key) {
  const until = keys.get(key);
  keys.delete(key);
  return until !== undefined && until >= Date.now();
}

// ---------- Session titles ----------
// Claude Code writes a title in the transcript. Only the end of the file is read, and never the messages.

const titles = new Map();
const TITLE_FIELDS = { 'custom-title': 'customTitle', 'ai-title': 'aiTitle' };

function transcriptOf(id, cwd) {
  const direct = path.join(TRANSCRIPTS, cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`);
  if (fs.existsSync(direct)) return direct;
  try {
    for (const dir of fs.readdirSync(TRANSCRIPTS)) {
      const file = path.join(TRANSCRIPTS, dir, `${id}.jsonl`);
      if (fs.existsSync(file)) return file;
    }
  } catch { /* no transcript yet */ }
  return null;
}

function scanTitle(file, size) {
  const fd = fs.openSync(file, 'r');
  try {
    for (const span of [256 << 10, 2 << 20, 16 << 20]) {
      const len = Math.min(span, size), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n');
      const found = {};
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('-title"')) continue;
        let rec;
        try { rec = JSON.parse(lines[i]); } catch { continue; }
        const field = TITLE_FIELDS[rec.type];
        if (field && rec[field] && !found[rec.type]) found[rec.type] = String(rec[field]).trim();
      }
      const title = found['custom-title'] || found['ai-title'];
      if (title || len === size) return title || null;
    }
  } finally { fs.closeSync(fd); }
  return null;
}

function titleOf(id, cwd) {
  const now = Date.now();
  const c = titles.get(id) ?? { file: null, mtime: 0, checked: 0, title: null };
  titles.set(id, c);
  if (now - c.checked < 3000) return c.title;
  c.checked = now;
  try {
    c.file ??= transcriptOf(id, cwd);
    if (!c.file) return c.title;
    const st = fs.statSync(c.file);
    if (st.mtimeMs !== c.mtime) { c.mtime = st.mtimeMs; c.title = scanTitle(c.file, st.size) || c.title; }
  } catch { c.file = null; }
  return c.title;
}

// ---------- Sessions ----------

const previous = new Map();

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Empty string: no project. The page names it in the reader's language.
function projectOf(cwd) {
  const name = path.basename(cwd.split(/[\\/]\.claude[\\/]worktrees[\\/]/)[0]);
  return name.startsWith('scratch-') ? '' : name;
}

function readSessions() {
  let files;
  try { files = fs.readdirSync(SESSIONS).filter((f) => f.endsWith('.json')); } catch { return []; }
  const raw = [];
  for (const file of files) {
    let s;
    try { s = JSON.parse(fs.readFileSync(path.join(SESSIONS, file), 'utf8')); } catch { continue; }
    if (!s.sessionId || !s.cwd || !isAlive(s.pid)) continue;
    const before = previous.get(s.sessionId);
    // A menu opened by the user is not a request from Claude: the previous state goes on.
    const menu = s.status === 'waiting' && s.waitingFor === 'dialog open';
    const state = menu ? before?.state ?? 'idle' : STATES[s.status] || 'idle';
    const since = before?.state === state ? before.since : s.statusUpdatedAt || s.updatedAt || s.startedAt;
    if (before && before.state !== 'idle' && state === 'idle') (memory.sessions[s.sessionId] ??= {}).done = since;
    previous.set(s.sessionId, { state, since });
    const found = titleOf(s.sessionId, s.cwd);
    const named = s.name && s.nameSource !== 'derived' ? s.name : null;
    raw.push({
      id: s.sessionId, project: projectOf(s.cwd), title: named || found || '', worked: !!titles.get(s.sessionId).file,
      app: s.entrypoint === 'claude-desktop' ? 'app' : 'terminal', state, need: state === 'ask' ? needOf(s.waitingFor) : null, since, startedAt: s.startedAt,
    });
  }
  const list = decorate(raw, memory);
  const today = new Date().toISOString().slice(0, 10), limit = Date.now() - 7 * 864e5;
  for (const s of list) memory.sessions[s.id].last = today;
  for (const [id, m] of Object.entries(memory.sessions)) if (!m.last || Date.parse(m.last) < limit) delete memory.sessions[id];
  saveMemory();
  return list;
}

const clients = new Set();
let last = '';
function push() {
  const json = JSON.stringify(readSessions());
  if (json === last) return;
  last = json;
  for (const res of clients) res.write(`data: ${json}\n\n`);
}

function readJson(req, res, then) {
  if (!/^application\/json/.test(req.headers['content-type'] || '')) { res.writeHead(403).end(); return; }
  let body = '';
  req.on('data', (d) => { body += d; if (body.length > 1024) req.destroy(); });
  req.on('end', () => {
    let value;
    try { value = JSON.parse(body); } catch { /* unreadable body */ }
    if (value === null || typeof value !== 'object') { res.writeHead(400).end(); return; }
    then(value);
  });
}

function sendJson(res, value) {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

function markSeen(req, res) {
  readJson(req, res, ({ id }) => {
    if (typeof id !== 'string' || !Object.hasOwn(memory.sessions, id)) { res.writeHead(404).end(); return; }
    memory.sessions[id].seen = Date.now();
    push();
    res.writeHead(204).end();
  });
}

function handlePost(pathname, req, res) {
  const fromPage = ALLOWED_ORIGINS.has(req.headers.origin);
  if (pathname === '/claim' && fromPage) readJson(req, res, ({ key }) => (takeKey(key) ? sendJson(res, { token }) : res.writeHead(401).end()));
  else if (pathname === '/seen' && fromPage) { if (isPaired(req)) markSeen(req, res); else res.writeHead(401).end(); }
  else if (pathname === '/key' && isPaired(req)) sendJson(res, { key: newKey() });
  else res.writeHead(403).end();
}

const server = http.createServer((req, res) => {
  if (!ALLOWED_HOSTS.has(req.headers.host)) { res.writeHead(403).end(); return; }
  if (!URL.canParse(req.url, ORIGIN)) { res.writeHead(400).end(); return; }
  const url = new URL(req.url, ORIGIN);
  if (req.method === 'POST') { handlePost(url.pathname, req, res); return; }
  if (url.pathname === '/events') {
    if (!isPaired(req)) { res.writeHead(401).end(); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    res.write(`data: ${JSON.stringify(readSessions())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/health') { sendJson(res, { app: 'fluffice', version: VERSION, pid: process.pid }); return; }
  const file = path.join(PUBLIC, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
});

// ---------- Command line ----------

// Absolute paths and a trusted folder: this can run from a project folder, whose content is not trusted.
function openBrowser(key) {
  const url = `${ORIGIN}/#key=${key}`;
  const [cmd, argv] = process.platform === 'darwin' ? ['/usr/bin/open', [url]]
    : process.platform === 'win32' ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(cmd, argv, { stdio: 'ignore', detached: true, cwd: ROOT }).on('error', () => {}).unref();
}

async function health() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(1500) });
    const h = await res.json();
    return h.app === 'fluffice' ? h : null;
  } catch { return null; }
}

// The server that answers is ours only if it has the pid we saved. Anything else must never receive the token.
function isOurs(running) {
  try { return running !== null && running.pid === Number(fs.readFileSync(PIDFILE, 'utf8')) && process.kill(running.pid, 0); } catch { return false; }
}

async function askKey(running) {
  if (!isOurs(running)) return null;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/key`, { method: 'POST', headers: { authorization: `Bearer ${readToken()}` }, signal: AbortSignal.timeout(1500) });
    return res.ok ? (await res.json()).key : null;
  } catch { return null; }
}

function listen() {
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') say(`Port ${PORT} is used by another program. Try PORT=4800.`, `Le port ${PORT} est utilisé par un autre programme. Essaie PORT=4800.`);
    else console.error(e.message);
    process.exit(1);
  });
  token = ensureToken();
  server.listen(PORT, '127.0.0.1', () => {
    try { fs.mkdirSync(HOME, { recursive: true, mode: 0o700 }); fs.writeFileSync(PIDFILE, String(process.pid), { mode: 0o600 }); } catch { /* --stop will not find it */ }
    setInterval(push, 1000);
    say(`Fluffice is open: ${ORIGIN}`, `Fluffice est ouvert : ${ORIGIN}`);
    if (!fs.existsSync(SESSIONS)) say(`No Claude Code session found in ${SESSIONS} yet.`, `Pas encore de session Claude Code dans ${SESSIONS}.`);
    if (!args.has('--no-open')) openBrowser(newKey());
    if (args.has('--link')) console.log(`${ORIGIN}/#key=${newKey()}`);
  });
}

function stop(running) {
  if (!isOurs(running)) { say('Fluffice is not running.', 'Fluffice ne tourne pas.'); return; }
  process.kill(running.pid);
  fs.rmSync(PIDFILE, { force: true });
  say('Fluffice stopped.', 'Fluffice est arrêté.');
}

if (args.has('--help') || args.has('-h')) {
  console.log(`fluffice ${VERSION}

  fluffice               start and open the office in your browser
  fluffice --no-open     start without opening the browser
  fluffice --background  start in the background if it is not running yet
  fluffice --link        print a link that connects another browser, good for 10 minutes
  fluffice --stop        stop the office running in the background

  PORT=4800 fluffice     use another port`);
} else if (args.has('--version')) {
  console.log(VERSION);
} else {
  const running = await health();
  if (args.has('--stop')) stop(running);
  else if (args.has('--background')) {
    // Called when a Claude Code session starts: stays silent, and opens the browser only the very first time.
    const open = args.has('--open') || !fs.existsSync(MEMORY);
    if (!running) spawn(process.execPath, [SELF, ...(open ? [] : ['--no-open'])], { detached: true, stdio: 'ignore', cwd: ROOT }).unref();
    else if (args.has('--open')) { const key = await askKey(running); if (key) openBrowser(key); }
  } else if (running) {
    const key = await askKey(running);
    if (!key) { say(`Port ${PORT} is used by another Fluffice. Try PORT=4800.`, `Le port ${PORT} est utilisé par un autre Fluffice. Essaie PORT=4800.`); process.exitCode = 1; }
    else if (args.has('--link')) console.log(`${ORIGIN}/#key=${key}`);
    else {
      say(`Fluffice is already open: ${ORIGIN}`, `Fluffice est déjà ouvert : ${ORIGIN}`);
      if (!args.has('--no-open')) openBrowser(key);
    }
  } else listen();
}
