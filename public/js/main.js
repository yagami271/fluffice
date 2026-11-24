import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { decorate, emptyMemory, isVisible, SLEEP_MS } from './assign.js';
import { ago, buildCreature, colorOf, patternOf } from './creature.js';
import { lang, projectName, T, titleName } from './i18n.js';
import { createSound } from './sound.js';
import { buildRoom, CHEST, daylight, QUEUE_POST, SHELF } from './room.js';
import { damp, dispose, lerp, rng } from './util.js';

const params = new URLSearchParams(location.search);
const calmMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

const film = params.has('film');
let demo = false;

document.documentElement.lang = lang;
document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = T.ui[n.dataset.t]; });
$('roster').setAttribute('aria-label', T.ui.roster);

// ---------- Scene ----------

const renderer = new THREE.WebGLRenderer({ canvas: $('stage'), antialias: true, powerPreference: 'low-power' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.02;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#12292d');
const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 60);
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.7, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h, half = Math.tan(THREE.MathUtils.degToRad(15)) * (16 / 9);
  camera.aspect = aspect;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(aspect < 16 / 9 ? half / aspect : half / (16 / 9)));
  const tall = THREE.MathUtils.clamp((16 / 9 - aspect) / 1.2, 0, 1);
  camera.position.set(0, lerp(4.6, 5.6, tall), 12.2);
  camera.lookAt(0, lerp(1.28, 1.0, tall), -0.6);
  camera.updateProjectionMatrix();
  const pr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  composer.setPixelRatio(pr); composer.setSize(w, h);
  dirty = true;
}
let dirty = true;

const room = buildRoom(scene);
let hourOverride = params.has('hour') ? Number(params.get('hour')) : null;
const currentHour = () => { if (hourOverride !== null) return hourOverride; const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
let day = daylight(currentHour());
room.setHour(day);

// Arrival confetti
const bits = (() => {
  const n = 70, m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.12), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), n);
  const list = Array.from({ length: n }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: 0 }));
  const o = new THREE.Object3D(), r = rng(77);
  const palette = ['#a8f0c6', '#fff1d6', '#f29bb7', '#6cb4e8', '#d8543f'];
  list.forEach((_, i) => m.setColorAt(i, new THREE.Color(palette[i % palette.length])));
  m.frustumCulled = false; scene.add(m);
  let k = 0;
  return {
    burst(at) {
      if (calmMotion) return;
      for (let i = 0; i < 34; i++) {
        const b = list[k++ % n], a = r() * 6.28;
        b.life = 1.7; b.p.copy(at).y += 1.7; b.v.set(Math.cos(a) * (0.5 + r() * 1.5), 2.2 + r() * 2.2, Math.sin(a) * 0.9 + 0.3); b.w = (r() - 0.5) * 14;
      }
    },
    update(dt) {
      let any = false;
      list.forEach((b, i) => {
        b.life = Math.max(0, b.life - dt);
        if (b.life > 0) { any = true; b.v.y -= 5.2 * dt; b.v.multiplyScalar(1 - 0.9 * dt); b.p.addScaledVector(b.v, dt); b.r.x += b.w * dt; b.r.y += b.w * 0.7 * dt; }
        o.position.copy(b.p); o.rotation.copy(b.r); o.scale.setScalar(b.life > 0 ? Math.min(1, b.life * 3) : 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      });
      m.instanceMatrix.needsUpdate = true; m.visible = any;
    },
  };
})();

// ---------- Sound ----------

const sound = createSound({
  isNight: () => { const h = new Date().getHours(); return h >= 22 || h < 8; },
  onChange(status, pref) {
    const b = $('toggle-sound');
    b.textContent = T.sound[status]; b.setAttribute('aria-pressed', pref.on); b.classList.toggle('warn', status === 'blocked');
    $('sound').hidden = !pref.on; $('volume').value = pref.volume;
  },
});
sound.refresh();
// The click that unblocks the sound must not mute it: remember the state before the press.
let soundBefore = null;
for (const e of ['pointerdown', 'keydown']) $('toggle-sound').addEventListener(e, () => { soundBefore = sound.status(); });
$('toggle-sound').onclick = () => { sound.set((soundBefore ?? sound.status()) !== 'on'); soundBefore = null; };
$('volume').oninput = (e) => sound.setVolume(Number(e.target.value));
document.querySelectorAll('[data-hear]').forEach((b) => b.addEventListener('click', () => sound.preview(b.dataset.hear, showing.find((s) => s.mood === 'work')?.look ?? 0)));

// ---------- Sessions → characters ----------

let pointer = null, showing = [], token = null, unpaired = false;
const actors = new Map();
const lastZones = new Map();
const vec = (p) => new THREE.Vector3(...p);
const base = (zone) => zone.replace('-hidden', '');
const remove = (a) => { scene.remove(a.c.root); dispose(a.c.root); actors.delete(a.id); };

// Where a session stands, given its zone.
const seatPos = (s) => {
  const seat = room.desks[s.desk].seat.clone(), side = [0, -1, 1][s.seat] ?? 0;
  return seat.add(new THREE.Vector3(side * 0.56, 0.34 + Math.abs(side) * 0.06, -Math.abs(side) * 0.2));
};
function spotOf(s, front) {
  switch (s.zone) {
    case 'front': return [new THREE.Vector3(front.x.get(s.id), 0, 1.8 + (s.mood === 'ask' ? 0.28 : 0)), 1.34 * front.k];
    case 'queue': return [new THREE.Vector3([-0.5, 0.5, -1.5, 1.5][s.slot] * front.step, 0, 0.1), 0.82];
    case 'queue-hidden': return [vec(QUEUE_POST), 0.02];
    case 'desk': return [seatPos(s), s.seat ? 0.82 : 1];
    case 'desk-hidden': return [s.desk === null ? new THREE.Vector3(-7.4, 0.42, -2.4) : seatPos({ ...s, seat: 0 }), 0.02];
    case 'chest': return [vec(CHEST.inside).add(new THREE.Vector3((s.slot - 1) * 0.43, 0.26, 0)), 0.58];
    case 'chest-hidden': return [vec(CHEST.inside), 0.02];
    default: return [new THREE.Vector3(SHELF.x + ((s.slot % SHELF.per) - (SHELF.per - 1) / 2) * SHELF.step, SHELF.rows[Math.floor(s.slot / SHELF.per)] - 0.02, SHELF.z + 0.12), 0.58];
  }
}

function makeActor(s) {
  const c = buildCreature(s), from = lastZones.get(s.id);
  scene.add(c.root);
  const a = { id: s.id, s, c, zone: null, mood: null, pos: new THREE.Vector3(), scale: 0.001, yaw: 0, path: null, u: 0, phase: 0, first: true, seatDesk: null };
  if (from && !isVisible(from.zone)) { a.first = false; a.prevZone = base(from.zone); a.seatDesk = from.desk; a.pos.copy(spotOf(from, { x: new Map(), k: 1, step: 2 })[0]); }
  actors.set(s.id, a);
  return a;
}

let frontOrder = [];
function layout(list) {
  // Front: everyone keeps their spot. A newcomer takes the freed one, or comes in from their desk's side.
  const deskX = (s) => (s.desk !== null ? room.desks[s.desk].pos.x : 0);
  const inFront = new Map(list.filter((s) => s.zone === 'front').map((s) => [s.id, s]));
  const fresh = [...inFront.values()].filter((s) => !frontOrder.includes(s.id)).sort((a, b) => deskX(a) - deskX(b) || a.startedAt - b.startedAt);
  frontOrder = frontOrder.map((id) => (inFront.has(id) ? id : fresh.shift()?.id)).filter(Boolean);
  for (const s of fresh) {
    const at = frontOrder.findIndex((id) => deskX(inFront.get(id)) > deskX(s));
    frontOrder.splice(at < 0 ? frontOrder.length : at, 0, s.id);
  }
  const row = frontOrder.map((id) => inFront.get(id));
  const n = row.length, step = Math.min(2.25, 8.2 / Math.max(n, 1));
  const front = { step, k: n > 4 ? 4.4 / n : 1, x: new Map(row.map((s, i) => [s.id, (i - (n - 1) / 2) * step])) };

  for (const s of list) {
    const a = actors.get(s.id);
    if (a) go(a, ...spotOf(s, front));
  }

  room.desks.forEach((d, i) => {
    const here = list.filter((s) => s.desk === i && base(s.zone) === 'desk'), owner = here[0] ?? list.find((s) => s.desk === i);
    const working = here.filter((s) => s.mood === 'work').length;
    d.paint(owner ? projectName(owner) : '', here.length > 1 ? T.working(here.length) : owner ? titleName(owner) : '', owner ? colorOf(owner.look) : '', owner ? patternOf(owner.look) : 0);
    d.set(working > 0, working > 0);
  });
  const queue = list.filter((s) => base(s.zone) === 'queue');
  room.setCrowd({
    chest: list.filter((s) => base(s.zone) === 'chest').length, queue: queue.length, queueAsk: queue.some((s) => s.mood === 'ask'),
    unseated: list.filter((s) => s.zone === 'desk-hidden' && s.desk === null).length,
  });
}

function go(a, to, scale) {
  a.toScale = scale;
  if (a.dest && a.dest.distanceTo(to) < 0.01) return;
  const prev = a.prevZone, next = base(a.zone), from = a.pos.clone();
  const outDesk = prev === 'desk' && a.seatDesk !== null ? room.desks[a.seatDesk] : null;
  const inDesk = next === 'desk' && a.s.desk !== null ? room.desks[a.s.desk] : null;
  a.dest = to.clone(); a.prevZone = next; a.seatDesk = next === 'desk' ? a.s.desk : null;
  if (a.first || calmMotion) { a.first = false; a.pos.copy(to); a.path = null; return; }
  const aisle = (d) => {
    const gx = d.gap, z = d.seat.z, y = d.pos.y, side = -Math.sign(gx) * 1.25;
    return (y > 0.7
      ? [[gx, y, z], [gx, y, -2.95], [gx + side, 0.42, -2.6], [gx + side, 0.42, -1.5], [gx + side, 0, 0.1]]
      : [[gx, y, z], [gx, y, -0.9], [gx, 0, 0.1]]).map(vec);
  };
  const perch = (z) => z === 'shelf' || z === 'chest', floor = (z) => z === 'front' || z === 'queue';
  const pts = [from];
  a.jump = perch(prev) || perch(next) || (prev === 'desk' && next === 'desk');
  if (a.jump) { const m = from.clone().lerp(to, 0.5); m.y = Math.max(from.y, to.y) + 1.0; pts.push(m); }
  else if (outDesk && floor(next)) pts.push(...aisle(outDesk));
  else if (inDesk && floor(prev)) pts.push(...aisle(inDesk).reverse());
  pts.push(to);
  a.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  a.len = Math.max(a.path.getLength(), 0.1); a.u = 0; a.fromScale = a.scale;
}

function sync(list) {
  const ids = new Set(list.map((s) => s.id)), first = lastZones.size === 0;
  for (const [id, a] of actors) if (!ids.has(id)) remove(a);
  for (const [id, s] of lastZones) if (!ids.has(id)) { lastZones.delete(id); sound.foley('bye', { look: s.look }); }
  for (const s of list) {
    let a = actors.get(s.id);
    if (a && (a.s.look !== s.look || a.s.acc !== s.acc)) { remove(a); a = null; }
    if (!a && isVisible(s.zone)) a = makeActor(s);
    const was = lastZones.get(s.id)?.mood;
    if (!was && !first) sound.foley('hello', { look: s.look });
    if (was && was !== s.mood) {
      const at = { look: s.look, x: s.desk !== null ? room.desks[s.desk].pos.x : 0 };
      if (s.mood === 'done' || s.mood === 'ask') sound.alert(s.mood, at);
      else if (s.mood === 'work') sound.foley('lamp', at);
    }
    lastZones.set(s.id, { ...s });
    if (!a) continue;
    a.s = s; a.zone = s.zone; a.leaving = !isVisible(s.zone);
    if (s.mood !== a.mood) { a.mood = s.mood; a.arrive = s.mood === 'done' && !a.first; }
    const z = base(s.zone);
    a.c.setMood(z === 'queue' ? 'wait' : z === 'shelf' || z === 'chest' ? 'sleep' : s.mood);
    if (z === 'front') a.c.sign.draw({ project: projectName(s), title: titleName(s), color: colorOf(s.look), pattern: patternOf(s.look), need: s.need }, s.mood, ago(Date.now() - s.since));
  }
  showing = list;
  layout(list); say(list); rosterUI(list); dirty = true;
  if (pointer && !$('tip').hidden) hover(pointer);
}
const refresh = () => sync(showing);

function acknowledge(id) {
  const s = showing.find((x) => x.id === id);
  if (!s) return;
  if (demo || s.mood === 'done') sound.foley('pop', { x: actors.get(id)?.pos.x });
  if (demo) {
    const d = demoList.find((x) => x.id === id);
    if (s.mood === 'done') { demoMemory.sessions[id].seen = Date.now(); d.since = Date.now() - SLEEP_MS * 2; }
    else { d.state = 'work'; d.since = Date.now(); }
    showDemo();
  } else if (s.mood === 'done') {
    fetch('/seen', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ id }) }).catch(() => {});
  }
}

// ---------- Text ----------

const el = (tag, text, cls) => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
const phraseOf = (s) => T.mood[s.mood === 'ask' && s.need === 'question' ? 'question' : s.mood];

// The project is enough when only one of its sessions is awake. Otherwise the title tells them apart.
function nameOf(s, list) {
  const awake = list.filter((o) => o.project === s.project && o.mood !== 'sleep').length;
  return awake > 1 || !s.project ? titleName(s) : s.project;
}

function say(list) {
  const by = (m) => list.filter((s) => s.mood === m);
  const hot = [...by('ask'), ...by('done')], work = by('work').length, off = by('rest').length + by('sleep').length;
  const parts = [];
  if (hot.length === 0) parts.push(unpaired && !demo ? T.unpaired : work ? T.calm : T.quiet);
  else {
    const full = hot.map((s) => [`${nameOf(s, list)} ${phraseOf(s)}`, s.mood]);
    const count = (m, one, plural, named) => { const n = by(m).length; return n ? [[n > 1 ? `${n} ${plural}` : `${named ? nameOf(by(m)[0], list) : 1} ${one}`, m]] : []; };
    const needs = new Set(by('ask').map((s) => s.need));
    const kind = needs.size > 1 ? 'answer' : needs.has('question') ? 'question' : 'ask';
    const both = (named) => [...count('ask', T.one[kind], T.many[kind], named), ...count('done', T.one.done, T.many.done, named)];
    const options = [hot.length < 3 ? full : null, both(true), both(false)].filter(Boolean);
    const pick = options.find((o) => o.map((f) => f[0]).join(', ').length <= 56) ?? options[options.length - 1];
    pick.forEach(([text, mood], i) => { if (i) parts.push(', '); parts.push(el('span', text, mood)); });
  }
  const line = el('p', ''); line.append(...parts);
  if ($('sentence').textContent !== line.textContent) $('sentence').replaceChildren(...line.childNodes);
  $('tally').textContent = [work && T.working(work), off && T.resting(off)].filter(Boolean).join(', ');
  document.title = hot.length ? `(${hot.length}) Fluffice` : 'Fluffice';
}

let rosterKey = '';
function rosterUI(list) {
  const order = { ask: 0, done: 1, work: 2, rest: 3, sleep: 4 };
  const rows = [...list].sort((a, b) => order[a.mood] - order[b.mood]).map((s) => [s.id, `${projectName(s)}, ${titleName(s)}, ${phraseOf(s)}`, s.mood]);
  const key = JSON.stringify(rows);
  if (key === rosterKey) return;
  rosterKey = key;
  const focused = document.activeElement?.dataset?.id;
  $('roster').replaceChildren(...rows.map(([id, text, mood]) => {
    const li = document.createElement('li');
    if (mood !== 'done') { li.textContent = text; return li; }
    const b = el('button', text); b.type = 'button'; b.dataset.id = id; b.onclick = () => acknowledge(id);
    li.append(b);
    return li;
  }));
  if (focused) $('roster').querySelector(`[data-id="${CSS.escape(focused)}"]`)?.focus();
}

// ---------- Interaction ----------

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const boxAt = (x, y, z, w, h, d) => new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, d));

// What can be hovered: characters, and the places that gather several of them.
function targets() {
  const out = [...actors.values()].map((a) => ({
    a, box: boxAt(a.pos.x, a.pos.y + 0.62 * a.scale, a.pos.z, a.scale, 1.25 * a.scale, 0.9 * a.scale), top: a.pos.clone().setY(a.pos.y + (a.c.height + 0.35) * a.scale),
  }));
  const group = (list, title, box, top) => { if (list.length) out.push({ list, title, box, top }); };
  const [cx, cy, cz] = CHEST.pos, [px, , pz] = QUEUE_POST;
  group(showing.filter((s) => base(s.zone) === 'chest'), T.inChest, boxAt(cx, cy + 0.3, cz + 0.2, 1.6, 0.7, 0.6), new THREE.Vector3(cx, cy + 1.2, cz));
  group(showing.filter((s) => base(s.zone) === 'queue'), T.inLine, boxAt(px, 0.8, pz, 1, 1.5, 0.3), new THREE.Vector3(px, 1.5, pz));
  room.desks.forEach((d, i) => {
    const here = showing.filter((s) => s.desk === i && base(s.zone) === 'desk');
    if (here.length > 1) group(here, projectName(here[0]), boxAt(d.pos.x, d.pos.y + 0.36, d.pos.z + 0.35, 1.7, 0.6, 0.2), d.pos.clone().setY(d.pos.y + 1.0));
  });
  return out;
}
function hit(e) {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  let best = null, bd = Infinity;
  for (const t of targets()) {
    const p = ray.ray.intersectBox(t.box, new THREE.Vector3());
    if (p && p.distanceTo(camera.position) < bd) { bd = p.distanceTo(camera.position); best = t; }
  }
  return best;
}
function hover(e) {
  const h = hit(e), tip = $('tip');
  $('stage').style.cursor = h?.a?.mood === 'done' ? 'pointer' : '';
  tip.hidden = !h;
  if (!h) return;
  if (h.a) {
    const s = h.a.s;
    tip.replaceChildren(T.label(projectName(s), titleName(s)), el('small', `${phraseOf(s)}, ${ago(Date.now() - s.since)} (${T.where[s.app]})`));
  } else {
    const more = h.list.length - 8;
    tip.replaceChildren(h.title, ...h.list.slice(0, 8).map((s) => el('small', T.label(projectName(s), titleName(s)))), ...(more > 0 ? [el('small', T.more(more))] : []));
  }
  const p = h.top.clone().project(camera);
  tip.style.left = `${THREE.MathUtils.clamp((p.x * 0.5 + 0.5) * innerWidth, 170, innerWidth - 170)}px`;
  tip.style.top = `${Math.max(tip.offsetHeight + 8, (-p.y * 0.5 + 0.5) * innerHeight)}px`;
}
$('stage').addEventListener('pointermove', (e) => { pointer = { clientX: e.clientX, clientY: e.clientY }; hover(pointer); });
$('stage').addEventListener('pointerleave', () => { pointer = null; $('tip').hidden = true; });
$('stage').addEventListener('click', (e) => { const h = hit(e); if (h?.a) acknowledge(h.a.id); });

// ---------- Demo ----------

let demoList = [], demoMemory = emptyMemory(), live = [];
const demoSession = (id, [project, title], state, min, i) => ({ id, project, title, app: 'terminal', state, need: 'approval', worked: true, since: Date.now() - min * 60e3 - i * 1000, startedAt: Date.now() - 1e7 + i });
const demoData = () => [['work', 4], ['ask', 1], ['idle', 6], ['work', 12], ['work', 2], ['work', 22], ['idle', 900], ['idle', 2000], ['idle', 5000]]
  .map(([state, min], i) => demoSession(`demo-${i}`, T.demo[i], state, min, i));
function demoCrowd() {
  const { projects, titles } = T.crowd;
  return [['work', 3, 14], ['ask', 1, 3], ['idle', 6, 7], ['idle', 700, 26]].flatMap(([state, min, n]) => Array.from({ length: n }, () => [state, min]))
    .map(([state, min], i) => demoSession(`crowd-${i}`, [projects[i % projects.length], titles[(i * 3) % titles.length]], state, min, i));
}
const showDemo = () => sync(decorate(demoList, demoMemory));

function setDemo(on) {
  demo = on;
  $('demo').hidden = !on; $('toggle-demo').setAttribute('aria-expanded', on); $('toggle-demo').textContent = on ? T.ui.mine : T.ui.demo;
  [...actors.values()].forEach(remove); lastZones.clear();
  if (on) { demoList = demoData(); demoMemory = emptyMemory(); $('hour').value = currentHour(); showDemo(); }
  else { hourOverride = null; setHour(); sync(live); }
}
$('toggle-demo').onclick = () => setDemo(!demo);
$('hour').oninput = (e) => { hourOverride = Number(e.target.value); setHour(); };
document.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', () => {
  const todo = b.dataset.do, now = Date.now();
  if (todo === 'crowd') { [...actors.values()].forEach(remove); lastZones.clear(); demoList = demoCrowd(); demoMemory = emptyMemory(); }
  else if (todo === 'reset') demoList.forEach((s) => { s.state = 'work'; s.since = now; });
  else {
    const s = demoList.find((x) => x.state === 'work');
    if (s) { s.state = todo === 'done' ? 'idle' : 'ask'; s.need = todo === 'ask' && Math.random() < 0.5 ? 'question' : 'approval'; s.since = now; }
  }
  showDemo();
}));

// ---------- Loop, at 12 frames per second (stop motion) ----------

function setHour() { day = daylight(currentHour()); room.setHour(day); dirty = true; }
if (!film) { setInterval(setHour, 60e3); setInterval(() => (demo ? showDemo() : refresh()), 30e3); }

const STEP = 1 / 12, UP = new THREE.Vector3();
let acc = 0, last = performance.now(), t = 0;

function tick(dt) {
  t += dt;
  let front = null;
  for (const a of actors.values()) {
    const walking = !!a.path;
    if (a.path) {
      a.u = Math.min(1, a.u + (dt * (a.jump ? 3.6 : 2.7)) / a.len);
      const e = a.jump ? a.u * a.u * (3 - 2 * a.u) : a.u;
      a.path.getPointAt(e, UP);
      const dx = UP.x - a.pos.x, dz = UP.z - a.pos.z;
      if (Math.hypot(dx, dz) > 0.01) { let dy = Math.atan2(dx, dz) - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * 0.55; }
      const stride = Math.floor(a.phase / Math.PI);
      a.pos.copy(UP); a.phase += dt * 11;
      if (!a.jump && Math.floor(a.phase / Math.PI) !== stride) sound.foley('step', { x: a.pos.x, gain: lerp(0.35, 1, THREE.MathUtils.clamp((a.pos.z + 4) / 6, 0, 1)) });
      a.scale = lerp(a.fromScale, a.toScale, e);
      if (a.u >= 1) { a.path = null; if (a.jump) sound.foley('land', { x: a.pos.x, gain: 0.7 }); if (a.arrive) { a.arrive = false; sound.foley('puff', { x: a.pos.x }); a.c.cheer(); bits.burst(a.pos); } if (a.leaving) { remove(a); continue; } }
    } else {
      if (a.leaving) { remove(a); continue; }
      const rest = a.zone === 'front' ? -a.pos.x * 0.05 : a.zone === 'shelf' ? -0.08 : -a.pos.x * 0.02;
      let dy = rest - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * (1 - Math.exp(-9 * dt));
      a.scale = damp(a.scale, a.toScale ?? 1, 10, dt);
      if (a.zone === 'front' && (front !== 'ask')) front = a.mood;
    }
    a.c.root.position.copy(a.pos); a.c.root.rotation.y = a.yaw; a.c.root.scale.setScalar(Math.max(a.scale, 0.001));
    a.c.sign.glow(lerp(0.05, 0.5, day.lamps));
    a.c.update(dt, t, walking, a.phase);
  }
  bits.update(dt); room.update(dt, day, front);
}

function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min(0.4, (now - last) / 1000); last = now;
  if (acc < STEP && !dirty) return;
  while (acc >= STEP) { acc -= STEP; tick(STEP); }
  dirty = false;
  composer.render();
}

addEventListener('resize', resize);
await document.fonts.load('800 40px "Bricolage Grotesque"').catch(() => {});
resize();
if (!film) requestAnimationFrame(frame);

// ---------- Connection ----------

// A one-time key in the address (after the #, so it is never sent) is traded once for the token.
async function pair() {
  const key = new URLSearchParams(location.hash.slice(1)).get('key');
  if (key) {
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const res = await fetch('/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) });
      if (res.ok) { token = (await res.json()).token; try { localStorage.setItem('fluffice:token', token); } catch { /* no storage: paired until the page closes */ } }
    } catch { /* the stream below reports it */ }
  }
  try { token ??= localStorage.getItem('fluffice:token'); } catch { /* no storage */ }
}

async function follow() {
  for (let received = false; ;) {
    try {
      const res = await fetch('/events', { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 401) { unpaired = true; if (!demo) sync([]); return; }
      if (!res.ok) throw new Error(res.status);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (let buffer = ''; ;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        for (let end; (end = buffer.indexOf('\n\n')) >= 0; buffer = buffer.slice(end + 2)) {
          live = JSON.parse(buffer.slice('data: '.length, end)); received = true;
          if (!demo) sync(live);
        }
      }
    } catch { if (!received && !demo) setDemo(true); }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

if (params.has('demo')) setDemo(true);
if (!film) { await pair(); follow(); }
addEventListener('hashchange', async () => { if (location.hash.includes('key=')) { token = null; await pair(); location.reload(); } });

// Handle used by the tests and to film the demo frame by frame (?demo&film).
window.fluffice = {
  actors, sync, setDemo, renderer, composer, sound, tick, STEP, showing: () => showing, demoList: () => demoList, showDemo,
  setHour(h) { hourOverride = h; setHour(); },
};
