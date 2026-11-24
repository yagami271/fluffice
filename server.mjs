#!/usr/bin/env node
// Reads the state of local Claude Code sessions and streams it to the page. Nothing leaves this machine.
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decorate, repairMemory } from './public/js/assign.js';

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
const PUBLIC = path.join(ROOT, 'public');
const ORIGIN = `http://localhost:${PORT}`;
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map((h) => `http://${h}`));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const args = new Set(process.argv.slice(2));
const FRENCH = /^fr\b/i.test(Intl.DateTimeFormat().resolvedOptions().locale);
const say = (en, fr) => console.log(FRENCH ? fr : en);

// Statuses written by Claude Code. "waiting" gives its reason in waitingFor.
const STATES = new Map(Object.entries({ busy: 'work', shell: 'work', waiting: 'ask', idle: 'idle' }));
const needOf = (waitingFor) => (waitingFor === 'input needed' ? 'question' : 'approval');

// ---------- Memory (looks, desks, sessions already seen) ----------

const memory = (() => {
  try { return repairMemory(JSON.parse(fs.readFileSync(MEMORY, 'utf8'))); } catch { return repairMemory(null); }
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

// ---------- Session titles ----------
// Claude Code writes a title in the transcript. Only the end of the file is read, and never the messages.

const titles = new Map();
const TITLE_FIELDS = new Map(Object.entries({ 'custom-title': 'customTitle', 'ai-title': 'aiTitle' }));

// Names come from folders and transcripts, whose content is not trusted: no control, invisible or reversing characters.
const clean = (text, max) => (typeof text === 'string' ? [...text.slice(0, 2000).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim()].slice(0, max).join('') : '');

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
        const value = clean(rec?.[TITLE_FIELDS.get(rec?.type)], 120);
        if (value && !found[rec.type]) found[rec.type] = value;
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
  const name = clean(path.basename(cwd.split(/[\\/]\.claude[\\/]worktrees[\\/]/)[0]), 60);
  return name.startsWith('scratch-') ? '' : name;
}

// The session files are internal to Claude Code and can change: anything unexpected is skipped, never fatal.
const time = (v) => (Number.isFinite(v) && v > 0 ? v : null);
function readSession(file) {
  try {
    const full = path.join(SESSIONS, file), st = fs.statSync(full);
    if (!st.isFile() || st.size > 64 << 10) return null;
    const s = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (typeof s?.sessionId !== 'string' || !/^[\w-]{1,64}$/.test(s.sessionId) || typeof s.cwd !== 'string' || !Number.isInteger(s.pid) || s.pid <= 0 || !isAlive(s.pid)) return null;
    const startedAt = time(s.startedAt) ?? st.mtimeMs;
    return { ...s, startedAt, at: time(s.statusUpdatedAt) ?? time(s.updatedAt) ?? startedAt };
  } catch { return null; }
}

function readSessions() {
  let files;
  try { files = fs.readdirSync(SESSIONS).filter((f) => f.endsWith('.json')); } catch { return []; }
  const raw = [];
  for (const s of files.map(readSession)) {
    if (!s || raw.some((o) => o.id === s.sessionId)) continue;
    const before = previous.get(s.sessionId);
    // A menu opened by the user is not a request from Claude: the previous state goes on.
    const menu = s.status === 'waiting' && s.waitingFor === 'dialog open';
    const state = menu ? before?.state ?? 'idle' : STATES.get(s.status) ?? 'idle';
    const since = before?.state === state ? before.since : s.at;
    if (before && before.state !== 'idle' && state === 'idle') (memory.sessions[s.sessionId] ??= {}).done = since;
    previous.set(s.sessionId, { state, since });
    const found = titleOf(s.sessionId, s.cwd);
    const named = s.nameSource !== 'derived' ? clean(s.name, 120) : '';
    raw.push({
      id: s.sessionId, project: projectOf(s.cwd), title: named || found || '', worked: !!titles.get(s.sessionId).file,
      app: s.entrypoint === 'claude-desktop' ? 'app' : 'terminal', state, need: state === 'ask' ? needOf(s.waitingFor) : null, since, startedAt: s.startedAt,
    });
  }
  const list = decorate(raw, memory), here = new Set(list.map((s) => s.id));
  for (const map of [previous, titles]) for (const id of map.keys()) if (!here.has(id)) map.delete(id);
  const today = new Date().toISOString().slice(0, 10), limit = Date.now() - 7 * 864e5;
  for (const s of list) memory.sessions[s.id].last = today;
  for (const [id, m] of Object.entries(memory.sessions)) if (!(Date.parse(m.last) >= limit)) delete memory.sessions[id];
  saveMemory();
  return list;
}

const MAX_CLIENTS = 40;
const clients = new Set();
let last = '[]';
function push() {
  let json;
  try { json = JSON.stringify(readSessions()); } catch (e) { console.error(`Could not read the sessions: ${e.message}`); return; }
  if (json === last) return;
  last = json;
  for (const res of clients) res.write(`data: ${json}\n\n`);
}

function markSeen(req, res) {
  if (!ALLOWED_ORIGINS.has(req.headers.origin) || !/^application\/json/.test(req.headers['content-type'] || '')) { res.writeHead(403).end(); return; }
  let body = '';
  req.on('data', (d) => { body += d; if (body.length > 1024) req.destroy(); });
  req.on('end', () => {
    let id;
    try { ({ id } = JSON.parse(body)); } catch { /* unreadable body */ }
    if (typeof id !== 'string' || !Object.hasOwn(memory.sessions, id)) { res.writeHead(404).end(); return; }
    memory.sessions[id].seen = Date.now();
    push();
    res.writeHead(204).end();
  });
}

// Only our own files run in the page, and nothing is loaded from elsewhere.
const IMPORT_MAP = /<script type="importmap">([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'))[1];
const HEADERS = {
  'content-security-policy': `default-src 'none'; script-src 'self' 'sha256-${crypto.createHash('sha256').update(IMPORT_MAP).digest('base64')}'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data: blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  'cross-origin-resource-policy': 'same-origin', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
};

// A website can make the browser send requests here. It cannot read the answers, but it has no business asking either.
// Following a link to the page is fine.
function fromElsewhere({ headers }, pathname) {
  if (headers.origin !== undefined && !ALLOWED_ORIGINS.has(headers.origin)) return true;
  const site = headers['sec-fetch-site'];
  if (site === undefined || site === 'same-origin' || site === 'none') return false;
  return !(pathname === '/' && headers['sec-fetch-mode'] === 'navigate' && headers['sec-fetch-dest'] === 'document');
}

const server = http.createServer((req, res) => {
  for (const [name, value] of Object.entries(HEADERS)) res.setHeader(name, value);
  if (!ALLOWED_HOSTS.has(req.headers.host)) { res.writeHead(403).end(); return; }
  if (!URL.canParse(req.url, ORIGIN)) { res.writeHead(400).end(); return; }
  const url = new URL(req.url, ORIGIN);
  if (fromElsewhere(req, url.pathname)) { res.writeHead(403).end(); return; }
  if (url.pathname === '/events') {
    if (clients.size >= MAX_CLIENTS) { res.writeHead(503).end(); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    res.write(`data: ${last}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ app: 'fluffice', version: VERSION, pid: process.pid }));
    return;
  }
  if (url.pathname === '/seen' && req.method === 'POST') { markSeen(req, res); return; }
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
function openBrowser() {
  const [cmd, argv] = process.platform === 'darwin' ? ['/usr/bin/open', [ORIGIN]]
    : process.platform === 'win32' ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), ['/c', 'start', '', ORIGIN]] : ['xdg-open', [ORIGIN]];
  spawn(cmd, argv, { stdio: 'ignore', detached: true, cwd: ROOT }).on('error', () => {}).unref();
}

async function health() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(1500) });
    const h = await res.json();
    return h.app === 'fluffice' ? h : null;
  } catch { return null; }
}

function listen() {
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') say(`Port ${PORT} is used by another program. Try PORT=4800.`, `Le port ${PORT} est utilisé par un autre programme. Essaie PORT=4800.`);
    else console.error(e.message);
    process.exit(1);
  });
  server.listen(PORT, '127.0.0.1', () => {
    try { fs.mkdirSync(HOME, { recursive: true, mode: 0o700 }); fs.writeFileSync(PIDFILE, String(process.pid), { mode: 0o600 }); } catch { /* --stop will not find it */ }
    for (const old of ['token', 'open.html']) fs.rmSync(path.join(HOME, old), { force: true }); // left by 0.1.1
    push(); setInterval(push, 1000);
    say(`Fluffice is open: ${ORIGIN}`, `Fluffice est ouvert : ${ORIGIN}`);
    if (!fs.existsSync(SESSIONS)) say(`No Claude Code session found in ${SESSIONS} yet.`, `Pas encore de session Claude Code dans ${SESSIONS}.`);
    if (!args.has('--no-open')) openBrowser();
  });
}

// Only a server that has the pid we saved is ours to stop.
function stop(running) {
  let pid = null;
  try { pid = Number(fs.readFileSync(PIDFILE, 'utf8')); } catch { /* never started */ }
  if (!running || running.pid !== pid) return false;
  try { process.kill(pid); } catch { return false; }
  fs.rmSync(PIDFILE, { force: true });
  return true;
}

function isOlder(version) {
  const [a, b] = [version, VERSION].map((v) => String(v).split('.').map(Number));
  const i = [0, 1, 2].find((k) => a[k] !== b[k]);
  return i !== undefined && a[i] < b[i];
}

function startInBackground(open) {
  spawn(process.execPath, [SELF, ...(open ? [] : ['--no-open'])], { detached: true, stdio: 'ignore', cwd: ROOT }).unref();
}

if (args.has('--help') || args.has('-h')) {
  console.log(`fluffice ${VERSION}

  fluffice               start and open the office in your browser
  fluffice --no-open     start without opening the browser
  fluffice --background  start in the background if it is not running yet
  fluffice --stop        stop the office running in the background

  PORT=4800 fluffice     use another port`);
} else if (args.has('--version')) {
  console.log(VERSION);
} else {
  const running = await health();
  if (args.has('--stop')) {
    if (stop(running)) say('Fluffice stopped.', 'Fluffice est arrêté.');
    else say('Fluffice is not running.', 'Fluffice ne tourne pas.');
  } else if (args.has('--background')) {
    // Called when a Claude Code session starts: stays silent, and opens the browser only the very first time.
    const open = args.has('--open') || !fs.existsSync(MEMORY);
    if (!running) startInBackground(open);
    else if (isOlder(running.version) && stop(running)) { await new Promise((r) => setTimeout(r, 400)); startInBackground(args.has('--open')); }
    else if (args.has('--open')) openBrowser();
  } else if (running) {
    say(`Fluffice is already open: ${ORIGIN}`, `Fluffice est déjà ouvert : ${ORIGIN}`);
    if (!args.has('--no-open')) openBrowser();
  } else listen();
}
