// Sounds made in the page, without any audio file.
// Only two alerts ("done" and "needs you"), played on the project's own note.
// The rest is quiet foley: felt footsteps, lamp, landing, hello and goodbye.

const PENTATONIC = [0, 2, 4, 7, 9];

// Each project color has its pitch, each pattern its instrument. Any mix is in tune.
export function noteOf(look, step = 0) {
  const d = (look % 10) + step;
  return 293.66 * 2 ** ((PENTATONIC[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5)) / 12);
}
export const instrumentOf = (look) => ['marimba', 'kalimba', 'musicbox'][Math.floor(look / 10) % 3];

// ---------- Synthesis (also works offline, for tests) ----------

const noiseCache = new WeakMap();
function noise(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; d[i] = s / 2147483648; }
    noiseCache.set(ctx, b);
  }
  return b;
}

function tone(ctx, out, t, { freq, to, dur, gain, type = 'sine', attack = 0.004 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
}

function hiss(ctx, out, t, { type = 'bandpass', freq, to, q = 1, dur, gain, offset = 0 }) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise(ctx); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out); s.start(t, offset % 0.5); s.stop(t + dur + 0.02);
}

const INSTRUMENTS = {
  marimba(ctx, out, t, f, v) { tone(ctx, out, t, { freq: f, dur: 0.55, gain: v }); tone(ctx, out, t, { freq: f * 3.93, dur: 0.09, gain: v * 0.32 }); hiss(ctx, out, t, { freq: 1800, dur: 0.03, gain: v * 0.16 }); },
  kalimba(ctx, out, t, f, v) { tone(ctx, out, t, { freq: f, dur: 0.95, gain: v * 0.8, type: 'triangle' }); tone(ctx, out, t, { freq: f * 2, dur: 0.4, gain: v * 0.12 }); tone(ctx, out, t, { freq: f * 5.42, dur: 0.06, gain: v * 0.24 }); },
  musicbox(ctx, out, t, f, v) { tone(ctx, out, t, { freq: f * 2, dur: 1.1, gain: v * 0.5 }); tone(ctx, out, t, { freq: f * 4.01, dur: 0.5, gain: v * 0.16 }); tone(ctx, out, t, { freq: f * 6.8, dur: 0.12, gain: v * 0.08 }); },
};

const knock = (ctx, out, t, v) => { tone(ctx, out, t, { freq: 235, to: 165, dur: 0.11, gain: v }); hiss(ctx, out, t, { freq: 900, q: 2, dur: 0.045, gain: v * 0.7 }); };

// Each sound gets the output, the time, the project look and a 0 to 1 variation.
export const SOUNDS = {
  // Three rising notes: it is settled.
  done(ctx, out, t, look) { const play = INSTRUMENTS[instrumentOf(look)]; [0, 2, 4].forEach((s, i) => play(ctx, out, t + i * 0.12, noteOf(look, s), 0.24 + i * 0.03)); },
  // A knock at the door, then two hanging notes: a question.
  ask(ctx, out, t, look) {
    const play = INSTRUMENTS[instrumentOf(look)];
    knock(ctx, out, t, 0.34); knock(ctx, out, t + 0.17, 0.3);
    play(ctx, out, t + 0.46, noteOf(look, 3), 0.24); play(ctx, out, t + 0.64, noteOf(look, 1), 0.26);
  },
  hello(ctx, out, t, look) { const play = INSTRUMENTS[instrumentOf(look)]; play(ctx, out, t, noteOf(look), 0.07); play(ctx, out, t + 0.16, noteOf(look, 2), 0.06); },
  bye(ctx, out, t, look) { const play = INSTRUMENTS[instrumentOf(look)]; play(ctx, out, t, noteOf(look, 2), 0.05); play(ctx, out, t + 0.2, noteOf(look), 0.045); },
  lamp(ctx, out, t) { hiss(ctx, out, t, { freq: 2600, q: 3, dur: 0.022, gain: 0.09 }); tone(ctx, out, t + 0.012, { freq: 1250, dur: 0.03, gain: 0.02 }); },
  step(ctx, out, t, look, r) { hiss(ctx, out, t, { type: 'lowpass', freq: 380 + r * 160, dur: 0.07, gain: 0.1, offset: r }); tone(ctx, out, t, { freq: 96 + r * 22, to: 58, dur: 0.06, gain: 0.07 }); },
  puff(ctx, out, t) { hiss(ctx, out, t, { freq: 3400, to: 900, q: 0.8, dur: 0.3, gain: 0.07 }); },
  land(ctx, out, t, look, r) { hiss(ctx, out, t, { type: 'lowpass', freq: 300, dur: 0.14, gain: 0.12, offset: r }); tone(ctx, out, t, { freq: 110, to: 52, dur: 0.13, gain: 0.1 }); },
  pop(ctx, out, t) { tone(ctx, out, t, { freq: 420, to: 900, dur: 0.075, gain: 0.12 }); },
};

// A small wooden room: some reverb, and a limiter so it never clips.
export function buildBus(ctx, destination) {
  const input = ctx.createGain(), master = ctx.createGain(), limiter = ctx.createDynamicsCompressor(), wet = ctx.createGain(), room = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 0.7), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c), n = noise(ctx).getChannelData(0);
    let low = 0;
    for (let i = 0; i < len; i++) { low += (n[(i * (c ? 3 : 1) + c * 777) % n.length] - low) * 0.35; d[i] = low * (1 - i / len) ** 3; }
  }
  room.buffer = ir; wet.gain.value = 0.2;
  limiter.threshold.value = -14; limiter.ratio.value = 8; limiter.attack.value = 0.003; limiter.release.value = 0.2;
  input.connect(limiter); input.connect(room).connect(wet).connect(limiter);
  limiter.connect(master).connect(destination);
  return { input, master };
}

// ---------- Page engine ----------

const FOLEY_GAP = { step: 0.07, land: 0.12, lamp: 0.15, puff: 0.2, pop: 0.05, hello: 0.4, bye: 0.4 };

export function createSound({ isNight, onChange }) {
  let pref = { on: false, volume: 0.6 };
  try { pref = { ...pref, ...JSON.parse(localStorage.getItem('fluffice:sound')) }; } catch { /* unreadable setting or no storage */ }
  pref = { on: pref.on === true, volume: Number.isFinite(pref.volume) ? Math.max(0, Math.min(1, pref.volume)) : 0.6 };
  let ctx = null, bus = null, current = null, queued = null, nextAlert = 0, recent = [];
  const lastFoley = {};

  const status = () => (!pref.on ? 'off' : ctx?.state !== 'running' ? 'blocked' : current ? 'on' : 'elsewhere');
  const changed = () => onChange(status(), pref);
  const save = () => { try { localStorage.setItem('fluffice:sound', JSON.stringify(pref)); } catch { /* no storage */ } };

  // Only one tab of the browser plays sounds. The last one clicked takes over.
  function claim(steal) {
    if (current) return;
    if (!navigator.locks) { current = { free() {} }; return; }
    queued?.abort();
    const wait = new AbortController(), mine = {};
    queued = wait;
    navigator.locks.request('fluffice-sound', steal ? { steal: true } : { signal: wait.signal }, () => {
      if (!pref.on) return undefined;
      current = mine; changed();
      return new Promise((free) => { mine.free = free; });
    }).catch(() => { /* cancelled, or taken by another tab */ }).finally(() => {
      if (current !== mine) return;
      current = null; changed();
      if (pref.on) claim(false);
    });
  }

  function start(steal) {
    if (!ctx) { ctx = new AudioContext(); bus = buildBus(ctx, ctx.destination); ctx.onstatechange = changed; }
    const wake = () => { if (pref.on) ctx.resume(); };
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
      for (const e of ['pointerdown', 'keydown']) addEventListener(e, wake, { once: true });
    }
    claim(steal);
  }

  function fire(name, { look = 0, x = 0, gain = 1 } = {}, at) {
    const g = ctx.createGain(), p = ctx.createStereoPanner();
    g.gain.value = gain; p.pan.value = Math.max(-0.6, Math.min(0.6, x / 7));
    g.connect(p).connect(bus.input);
    bus.master.gain.value = pref.volume * (isNight() ? 0.5 : 1);
    SOUNDS[name](ctx, g, at, look, Math.random());
    setTimeout(() => p.disconnect(), (at - ctx.currentTime + 2) * 1000);
  }

  if (pref.on) start(false);
  return {
    status,
    set(on) {
      pref.on = on; save();
      if (on) start(true);
      else { queued?.abort(); current?.free?.(); ctx?.suspend(); }
      changed();
    },
    setVolume(v) { pref.volume = v; save(); changed(); },
    // Alerts never overlap, and a burst only plays three.
    alert(name, opts) {
      if (status() !== 'on') return;
      const now = ctx.currentTime;
      recent = recent.filter((t) => now - t < 4);
      if (recent.length >= 3) return;
      recent.push(now);
      const at = Math.max(now + 0.02, nextAlert);
      nextAlert = at + 0.85;
      fire(name, opts, at);
    },
    foley(name, opts) {
      if (status() !== 'on' || document.hidden) return;
      const now = ctx.currentTime;
      if (now - (lastFoley[name] ?? -1) < FOLEY_GAP[name]) return;
      lastFoley[name] = now;
      fire(name, opts, now + 0.005);
    },
    preview(name, look) { if (status() === 'on') fire(name, { look }, ctx.currentTime + 0.02); },
    refresh: changed,
  };
}
