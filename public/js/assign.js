// Who looks like what and stands where. Shared by the server (real sessions) and the page (demo).
// Color and pattern = project. Accessory = session.
// The scene shows what needs attention, not an inventory: it keeps the same size with 9 or 200 sessions.

export const DESKS = [
  [-1.25, 0.42, -1.5], [1.25, 0.42, -1.5], [-3.75, 0.42, -1.5], [3.75, 0.42, -1.5],
  [0, 1.0, -3.7], [-2.5, 1.0, -3.7], [2.5, 1.0, -3.7], [-5, 1.0, -3.7], [5, 1.0, -3.7],
];
export const LOOK_COUNT = 30; // 10 colors × 3 patterns
export const ACCESSORY_COUNT = 10;
export const FRESH_MS = 30 * 60e3;
export const SLEEP_MS = 2 * 3600e3;
export const FRONT_MAX = 5;
export const QUEUE_SHOWN = 4;
export const SEATS = 3; // characters shown per desk when it is shared
export const SHELF_SLOTS = 16;
export const CHEST_SLOTS = 3; // sleepers whose head sticks out of the toy chest
const GROUP_ABOVE = DESKS.length, GROUP_UNTIL = DESKS.length - 2; // the gap avoids flip-flopping

// Zones: front, queue, queue-hidden, desk, desk-hidden, shelf, chest, chest-hidden.
export const isVisible = (zone) => !zone.endsWith('-hidden');

// No prototype: a project folder can be named "constructor" or "__proto__".
const bare = () => Object.create(null);
export const emptyMemory = () => ({ projects: bare(), sessions: bare() });

// Keeps what makes sense of a saved memory, so that a damaged file never breaks the office.
export function repairMemory(raw) {
  const memory = emptyMemory();
  const within = (v, max) => Number.isInteger(v) && v >= 0 && v < max;
  const entries = (v) => (v !== null && typeof v === 'object' ? Object.entries(v) : []);
  for (const [name, look] of entries(raw?.projects)) if (within(look, LOOK_COUNT)) memory.projects[name] = look;
  for (const [id, m] of entries(raw?.sessions)) {
    if (m === null || typeof m !== 'object') continue;
    const kept = (memory.sessions[id] = {});
    if (within(m.acc, ACCESSORY_COUNT)) kept.acc = m.acc;
    if (within(m.desk, DESKS.length)) kept.desk = m.desk;
    if (within(m.slot, SHELF_SLOTS + CHEST_SLOTS)) kept.slot = m.slot;
    for (const k of ['seen', 'done']) if (Number.isFinite(m[k])) kept[k] = m[k];
    if (typeof m.last === 'string') kept.last = m.last;
  }
  if (raw?.grouped === true) {
    memory.grouped = true; memory.groupDesks = bare();
    for (const [name, desk] of entries(raw.groupDesks)) if (within(desk, DESKS.length)) memory.groupDesks[name] = desk;
  }
  return memory;
}

function moodOf(s, m, now) {
  if (s.state !== 'idle') return s.state;
  const age = now - s.since;
  const unseen = (m.seen ?? 0) < s.since;
  // A session that never worked has not finished anything.
  if (unseen && (m.done === s.since || (s.worked && age < FRESH_MS))) return 'done';
  return age < SLEEP_MS ? 'rest' : 'sleep';
}

function pickLook(projects, live) {
  const load = Array.from({ length: LOOK_COUNT }, () => 0);
  for (const [name, look] of Object.entries(projects)) load[look] += live.has(name) ? 100 : 1;
  return load.indexOf(Math.min(...load));
}

function pickDesk(taken, mates, reserved) {
  const free = DESKS.map((_, i) => i).filter((i) => !taken.has(i));
  if (!free.length) return null;
  if (mates.length) {
    const near = (i) => Math.min(...mates.map((j) => Math.hypot(DESKS[i][0] - DESKS[j][0], (DESKS[i][2] - DESKS[j][2]) * 1.2)));
    return [...free].sort((a, b) => near(a) - near(b))[0];
  }
  return free.find((i) => !reserved.has(i)) ?? free[0];
}

// Front: requests first, then whoever has waited longest. The others stand in line.
function placeFront(out) {
  const oldest = (a, b) => a.since - b.since || (a.id < b.id ? -1 : 1);
  const hot = [...out.filter((s) => s.mood === 'ask').sort(oldest), ...out.filter((s) => s.mood === 'done').sort(oldest)];
  hot.forEach((s, i) => {
    s.zone = i < FRONT_MAX ? 'front' : i < FRONT_MAX + QUEUE_SHOWN ? 'queue' : 'queue-hidden';
    s.slot = i < FRONT_MAX ? i : i - FRONT_MAX;
  });
  return hot;
}

// One desk per session while it fits, then one per project. A working session is never shown asleep.
function placeDesks(out, memory, hot) {
  const of = (s) => memory.sessions[s.id];
  const workers = out.filter((s) => s.mood === 'work');
  const grouped = workers.length > (memory.grouped ? GROUP_UNTIL : GROUP_ABOVE);
  const taken = new Set();

  if (!grouped) {
    delete memory.grouped; delete memory.groupDesks;
    const reserved = new Set(out.map((s) => of(s).desk).filter((d) => d !== undefined));
    // Workers come first: a session that is away or resting can give up its desk.
    for (const group of [workers, hot, out.filter((s) => s.mood === 'rest')]) {
      for (const s of group) { const d = of(s).desk; if (d !== undefined && !taken.has(d)) { s.desk = d; taken.add(d); } }
      for (const s of group) {
        if (s.desk !== null) continue;
        const d = pickDesk(taken, out.filter((o) => o.project === s.project && o.desk !== null).map((o) => o.desk), reserved);
        if (d === null) continue;
        s.desk = d; of(s).desk = d; taken.add(d);
      }
    }
    for (const s of out) if ((s.mood === 'work' || s.mood === 'rest') && s.desk !== null) s.zone = 'desk';
    return;
  }

  memory.grouped = true;
  const known = (memory.groupDesks ??= bare());
  const projects = [...new Set(workers.map((s) => s.project))];
  for (const p of Object.keys(known)) if (!projects.includes(p)) delete known[p];
  for (const p of projects) if (known[p] !== undefined) taken.add(known[p]);
  for (const p of projects) {
    if (known[p] !== undefined) continue;
    const wanted = workers.filter((s) => s.project === p).map((s) => of(s).desk).find((d) => d !== undefined && !taken.has(d));
    const d = wanted ?? pickDesk(taken, [], new Set());
    if (d !== null) { known[p] = d; taken.add(d); }
  }
  for (const p of projects) {
    workers.filter((s) => s.project === p).forEach((s, i) => {
      s.desk = known[p] ?? null;
      s.seat = i;
      s.zone = s.desk !== null && i < SEATS ? 'desk' : 'desk-hidden';
    });
  }
  for (const s of hot) s.desk = known[s.project] ?? null;
}

// The most recent sleepers stay visible and keep their spot. The others go in the toy chest.
function placeSleepers(out, memory) {
  const of = (s) => memory.sessions[s.id];
  const rest = out.filter((s) => s.zone === null).sort((a, b) => b.since - a.since || (a.id < b.id ? -1 : 1));
  const shown = rest.slice(0, SHELF_SLOTS + CHEST_SLOTS), taken = new Set();
  const restIds = new Set(shown.map((s) => s.id));
  for (const s of out) if (!restIds.has(s.id)) delete of(s).slot;
  for (const s of shown) { const k = of(s).slot; if (k !== undefined && !taken.has(k)) { s.slot = k; taken.add(k); } else s.slot = null; }
  for (const s of shown) {
    if (s.slot === null) { let k = 0; while (taken.has(k)) k++; s.slot = k; taken.add(k); of(s).slot = k; }
    s.zone = s.slot < SHELF_SLOTS ? 'shelf' : 'chest';
    if (s.zone === 'chest') s.slot -= SHELF_SLOTS;
  }
  for (const s of rest.slice(SHELF_SLOTS + CHEST_SLOTS)) s.zone = 'chest-hidden';
}

// Completes each session: mood, look, zone, spot. Updates `memory`.
export function decorate(sessions, memory, now = Date.now()) {
  const list = [...sessions].sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : 1));
  const live = new Set(list.map((s) => s.project));
  const of = (s) => (memory.sessions[s.id] ??= {});
  for (const s of list) {
    memory.projects[s.project] ??= pickLook(memory.projects, live);
    const m = of(s);
    if (m.acc === undefined) {
      const used = new Set(list.filter((o) => o !== s && o.project === s.project).map((o) => of(o).acc));
      const start = memory.projects[s.project] % ACCESSORY_COUNT;
      m.acc = Array.from({ length: ACCESSORY_COUNT }, (_, k) => (start + k) % ACCESSORY_COUNT).find((k) => !used.has(k)) ?? start;
    }
  }
  const out = list.map((s) => ({ ...s, mood: moodOf(s, of(s), now), look: memory.projects[s.project], acc: of(s).acc, desk: null, seat: 0, zone: null, slot: 0 }));
  placeDesks(out, memory, placeFront(out));
  placeSleepers(out, memory);
  return out;
}
