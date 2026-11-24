import * as THREE from 'three';
import { T } from './i18n.js';
import { FONT, box, canvasTexture, damp, felt, fitText, furry, inkOn, matte, mesh, swatch } from './util.js';

// Colors for projects. Mint and saffron are left out: they mean "done" and "needs you".
export const COLORS = ['#d8543f', '#a888e0', '#6cb4e8', '#f29bb7', '#f3e4c9', '#4a68c8', '#8d5b44', '#8fa352', '#7b4b94', '#f2896b'];
export const ACCESSORIES = ['beanie', 'sprout', 'glasses', 'bearEars', 'headphones', 'bunnyEars', 'antenna', 'scarf', 'flower', 'horns'];
const SHAPES = [
  { H: 1.14, R: 0.42, p: 2.5, pear: 0.25 }, { H: 1.3, R: 0.37, p: 2.7, pear: 0.15 },
  { H: 1.02, R: 0.47, p: 2.4, pear: 0.2 }, { H: 1.16, R: 0.43, p: 2.2, pear: 0.5 },
];

function bodyGeometry({ H, R, p, pear }) {
  const pts = [], n = 28;
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n, c = Math.cos(a), s = Math.sin(a);
    const y = (H / 2) * (1 - Math.sign(c) * Math.abs(c) ** (2 / p));
    pts.push(new THREE.Vector2(Math.max(R * Math.abs(s) ** (2 / p) * (1 + pear * (0.5 - y / H)), 1e-4), y));
  }
  return new THREE.LatheGeometry(pts, 44);
}
const radiusAt = ({ H, R, p, pear }, y) => {
  const u = y / H;
  return R * (1 - Math.abs(2 * u - 1) ** p) ** (1 / p) * (1 + pear * (0.5 - u));
};

const ACC = {
  beanie(g, s, c) {
    const k = felt(c), y = s.H * 0.86, r = radiusAt(s, y) + 0.05;
    const cap = mesh(new THREE.SphereGeometry(r, 30, 18, 0, 7, 0, Math.PI / 2), k, g, [0, y, 0]); cap.scale.y = 0.95;
    const rim = mesh(new THREE.TorusGeometry(r, 0.06, 14, 36), felt('#fff1d6'), g, [0, y, 0]); rim.rotation.x = Math.PI / 2;
    g.add(Object.assign(furry(new THREE.SphereGeometry(0.1, 20, 14), '#fff1d6', { rep: [5, 3], len: 0.05, shells: 10 }), { name: 'pom' }));
    g.getObjectByName('pom').position.set(0, y + r * 0.95 + 0.05, 0);
  },
  sprout(g, s) {
    const leaf = felt('#6fae58');
    mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.24, 8), leaf, g, [0, s.H + 0.1, 0]);
    for (const d of [-1, 1]) { const l = mesh(new THREE.SphereGeometry(0.13, 18, 12), leaf, g, [d * 0.12, s.H + 0.25, 0]); l.scale.set(1, 0.3, 0.55); l.rotation.z = d * 0.5; }
  },
  glasses(g, s) {
    const m = matte('#2b2430', { roughness: 0.35 }), y = s.H * 0.71, r = radiusAt(s, y);
    for (const d of [-1, 1]) { const t = mesh(new THREE.TorusGeometry(0.115, 0.018, 12, 32), m, g, [Math.sin(d * 0.36) * r * 1.02, y, Math.cos(0.36) * r + 0.09]); t.rotation.y = d * 0.16; }
    const b = mesh(new THREE.CapsuleGeometry(0.014, 0.06, 4, 8), m, g, [0, y + 0.02, r + 0.07]); b.rotation.z = Math.PI / 2;
  },
  bearEars(g, s, c) {
    for (const d of [-1, 1]) {
      const e = furry(new THREE.SphereGeometry(0.14, 22, 16), c, { rep: [6, 4], len: 0.04, shells: 10 }); e.position.set(d * 0.27, s.H * 0.95, 0); e.scale.z = 0.6; g.add(e);
      const i = mesh(new THREE.SphereGeometry(0.085, 18, 12), felt('#f7cdbb'), g, [d * 0.27, s.H * 0.95, 0.075]); i.scale.z = 0.5;
    }
  },
  headphones(g, s) {
    const y = s.H * 0.72, r = radiusAt(s, y) + 0.06, m = matte('#2d3350', { roughness: 0.5 });
    const band = mesh(new THREE.TorusGeometry(r, 0.032, 12, 40, Math.PI), m, g, [0, y, 0]); band.scale.y = (s.H - y + 0.1) / r;
    for (const d of [-1, 1]) {
      const e = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.11, 28), m, g, [d * r, y, 0]); e.rotation.z = Math.PI / 2;
      const i = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.13, 24), felt('#f2896b'), g, [d * r, y, 0]); i.rotation.z = Math.PI / 2;
    }
  },
  bunnyEars(g, s, c) {
    for (const d of [-1, 1]) {
      const e = furry(new THREE.CapsuleGeometry(0.085, 0.34, 8, 18), c, { rep: [5, 5], len: 0.035, shells: 10 });
      e.position.set(d * 0.16, s.H + 0.17, -0.02); e.rotation.z = -d * (d < 0 ? 0.12 : 0.34); e.scale.z = 0.62; g.add(e);
    }
  },
  antenna(g, s, c) {
    const a = mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.34, 8), matte('#2b2430'), g, [0.03, s.H + 0.13, 0]); a.rotation.z = -0.15;
    mesh(new THREE.SphereGeometry(0.085, 20, 14), felt('#f2896b'), g, [0.06, s.H + 0.33, 0]);
  },
  scarf(g, s, c) {
    const y = s.H * 0.5, k = felt('#fff1d6');
    const t = mesh(new THREE.TorusGeometry(radiusAt(s, y) + 0.02, 0.085, 16, 44), k, g, [0, y, 0]); t.rotation.x = Math.PI / 2; t.scale.z = 1.1;
    const e = box(0.16, 0.34, 0.07, 0.03, k, g, [0.2, y - 0.2, radiusAt(s, y) + 0.04]); e.rotation.set(-0.12, 0.2, 0.1);
  },
  flower(g, s) {
    const f = new THREE.Group(); f.position.set(0.24, s.H * 0.95, 0.12); f.rotation.set(-0.5, 0.2, -0.45); g.add(f);
    for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3, p = mesh(new THREE.SphereGeometry(0.085, 16, 10), felt('#fff1d6'), f, [Math.cos(a) * 0.115, 0.03, Math.sin(a) * 0.115]); p.scale.y = 0.45; }
    mesh(new THREE.SphereGeometry(0.075, 16, 12), felt('#d8543f'), f, [0, 0.07, 0]).scale.y = 0.7;
  },
  horns(g, s) {
    for (const d of [-1, 1]) { const h = mesh(new THREE.ConeGeometry(0.085, 0.26, 20), felt('#f7e3bd'), g, [d * 0.2, s.H * 0.99, 0.02]); h.rotation.z = -d * 0.42; }
  },
};

const KIND = { done: { paper: '#8ce0b0', ink: '#06281b' }, ask: { paper: '#ffb92a', ink: '#2e1a00' } };

export function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return T.now;
  if (m < 60) return T.minutes(m);
  const h = Math.floor(m / 60);
  return h < 24 ? T.hours(h) : T.days(Math.floor(h / 24));
}

function makeSign(parent, pawColor) {
  const g = new THREE.Group(); parent.add(g);
  const tex = canvasTexture(1024, 500, () => {});
  box(1.5, 0.74, 0.04, 0.02, matte('#b48a5c'), g, [0, 0, 0]);
  const face = mesh(new THREE.PlaneGeometry(1.5, 0.732), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.1 }), g, [0, 0, 0.022], false);
  face.receiveShadow = true;
  const paws = [-1, 1].map((d) => {
    const p = furry(new THREE.SphereGeometry(0.1, 20, 14), pawColor, { rep: [5, 3], len: 0.03, shells: 8 });
    p.position.set(d * 0.5, 0.36, 0.0); p.scale.set(1, 0.82, 0.95); g.add(p); return p;
  });
  g.glow = (v) => { face.material.emissiveIntensity = v; };
  g.grip = (both) => { paws[1].visible = both; };
  let drawn = null;
  g.draw = ({ project, title, color, pattern, need }, kind, when) => {
    const k = KIND[kind], label = kind === 'done' && when !== T.now ? T.doneSince(when) : T.mood[kind === 'ask' && need === 'question' ? 'question' : kind];
    const key = [project, title, color, pattern, kind, label].join('|');
    if (key === drawn) return;
    drawn = key;
    tex.redraw((ctx, w, h) => {
      ctx.save();
      ctx.beginPath(); ctx.roundRect(10, 10, w - 20, h - 20, 32); ctx.clip();
      ctx.fillStyle = k.paper; ctx.fillRect(0, 0, w, h);
      swatch(ctx, 0, 0, w, 122, color, pattern);
      ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = inkOn(color);
      const top = fitText(ctx, project, { width: w - 110, size: 86, min: 56, weight: 700, split: 0 });
      ctx.fillText(top.lines[0], w / 2, 70);
      ctx.fillStyle = k.ink;
      const fit = fitText(ctx, title, { width: w - 90, size: 140, min: 70, weight: 800, split: 112 });
      fit.lines.forEach((l, i) => ctx.fillText(l, w / 2, 254 + (i - (fit.lines.length - 1) / 2) * fit.size * 1.04));
      let px = 80;
      do { ctx.font = `600 ${px}px ${FONT}`; px -= 4; } while (ctx.measureText(label).width > w - 190 && px > 50);
      const state = ctx.font, tw = ctx.measureText(label).width, x0 = (w - tw - 100) / 2, y = 428;
      ctx.lineWidth = 18; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = k.ink;
      ctx.beginPath();
      if (kind === 'done') { ctx.moveTo(x0 + 6, y); ctx.lineTo(x0 + 30, y + 26); ctx.lineTo(x0 + 74, y - 30); ctx.stroke(); }
      else { ctx.arc(x0 + 40, y, 38, 0, 7); ctx.fill(); ctx.fillStyle = k.paper; ctx.font = `800 64px ${FONT}`; ctx.fillText('?', x0 + 40, y + 4); }
      ctx.fillStyle = k.ink; ctx.font = state; ctx.textAlign = 'left';
      ctx.fillText(label, x0 + 100, y + 4);
    });
  };
  g.visible = false; g.scale.setScalar(0.001);
  return g;
}

export const colorOf = (look) => COLORS[look % COLORS.length];
export const patternOf = (look) => Math.floor(look / COLORS.length) % 3;

export function buildCreature({ look: lookIndex, acc: accIndex }) {
  const s = SHAPES[accIndex % SHAPES.length], color = colorOf(lookIndex), pattern = patternOf(lookIndex);
  const acc = ACCESSORIES[accIndex % ACCESSORIES.length], look = { index: lookIndex * 3 + accIndex };
  const root = new THREE.Group(), bob = new THREE.Group(); root.add(bob);

  const trunk = new THREE.Group(); trunk.position.y = 0.08; bob.add(trunk);
  trunk.add(furry(bodyGeometry(s), color, { rep: [17, 8], len: 0.05, shells: 16, pattern }));

  const dark = new THREE.Color(color).offsetHSL(0, 0.02, -0.12);
  const feet = [-1, 1].map((d) => { const f = mesh(new THREE.SphereGeometry(0.15, 22, 14), felt(dark), bob, [d * 0.17, 0.075, 0.12]); f.scale.set(0.95, 0.55, 1.25); return f; });

  const arms = [-1, 1].map((d) => {
    const p = new THREE.Group(); p.position.set(d * radiusAt(s, s.H * 0.48) * 0.93, s.H * 0.5, 0.04); trunk.add(p);
    const a = furry(new THREE.CapsuleGeometry(0.085, 0.24, 8, 18), dark, { rep: [4, 4], len: 0.032, shells: 9 });
    a.position.y = -0.17; p.add(a);
    return p;
  });

  const face = new THREE.Group(); trunk.add(face);
  const gloss = new THREE.MeshPhysicalMaterial({ color: '#17121a', roughness: 0.12, clearcoat: 1 });
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const ey = s.H * 0.71, er = radiusAt(s, ey);
  const eyes = [-1, 1].map((d) => {
    const e = new THREE.Group(), th = d * 0.36; e.position.set(Math.sin(th) * er, ey, Math.cos(th) * er + 0.03); e.rotation.y = th; face.add(e);
    const ball = mesh(new THREE.SphereGeometry(0.072, 22, 16), gloss, e, null, false); ball.scale.z = 0.6;
    mesh(new THREE.SphereGeometry(0.023, 10, 8), white, e, [0.024, 0.03, 0.036], false);
    mesh(new THREE.SphereGeometry(0.011, 8, 6), white, e, [-0.022, -0.02, 0.04], false);
    return e;
  });
  for (const d of [-1, 1]) {
    const y = s.H * 0.6, th = d * 0.62, r = radiusAt(s, y);
    const c = mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: '#ff7f78', transparent: true, opacity: 0.5 }), face, [Math.sin(th) * (r + 0.05), y, Math.cos(th) * (r + 0.05)], false);
    c.rotation.y = th; c.scale.y = 0.72;
  }
  const my = s.H * 0.6, mr = radiusAt(s, my) + 0.045;
  const smile = mesh(new THREE.TorusGeometry(0.062, 0.014, 10, 24, Math.PI), gloss, face, [0, my + 0.012, mr], false); smile.rotation.z = Math.PI;
  const oh = mesh(new THREE.SphereGeometry(0.038, 16, 12), gloss, face, [0, my - 0.02, mr], false); oh.scale.z = 0.4;
  const flat = mesh(new THREE.CapsuleGeometry(0.012, 0.055, 4, 8), gloss, face, [0, my - 0.01, mr], false); flat.rotation.z = Math.PI / 2;

  ACC[acc](trunk, s, color);

  const signRig = new THREE.Group(); signRig.position.set(0, 0.275, 0.56); trunk.add(signRig);
  const sign = makeSign(signRig, dark);

  const pose = { aLz: -0.3, aLx: 0, aRz: 0.3, aRx: 0, eye: 1, sign: 0, look: 0, tilt: 0, sq: 1 };
  let mood = 'work', hop = 0, blink = 2 + look.index * 0.7;

  return {
    root, color, sign, height: s.H, parts: { feet },
    setMood(m) { mood = m; },
    cheer() { hop = 1.1; },
    update(dt, t, walking, phase) {
      const front = (mood === 'done' || mood === 'ask') && !walking;
      const T = { aLz: -0.28, aLx: 0, aRz: 0.28, aRx: 0, eye: 1, sign: front ? 1 : 0, look: 0, tilt: 0 };
      if (walking) { T.aLx = Math.sin(phase) * 0.7; T.aRx = -Math.sin(phase) * 0.7; }
      else if (mood === 'work') { T.aLx = -1.1 + Math.sin(t * 9) * 0.05; T.aRx = -1.1 + Math.sin(t * 9 + 2) * 0.05; T.look = 0.1; T.eye = 0.82; }
      else if (mood === 'done') { T.aLx = -1.05; T.aRx = -1.05; T.aLz = -0.1; T.aRz = 0.1; }
      else if (mood === 'ask') { T.aLx = -1.05; T.aLz = -0.1; T.aRz = 2.45 + Math.sin(t * 3.4) * 0.28; }
      else if (mood === 'wait') { T.look = -0.04; }
      else if (mood === 'rest') { T.eye = 0.5; T.look = 0.06; }
      else if (mood === 'sleep') { T.eye = 0.12; T.tilt = (look.index % 2 ? 1 : -1) * 0.14; T.look = 0.12; }
      blink -= dt; if (blink < 0) blink = 4 + ((look.index * 37) % 5);
      if (blink < 0.16 && mood !== 'sleep') T.eye = 0.12;
      for (const k in T) pose[k] = damp(pose[k], T[k], k === 'eye' ? 26 : 9, dt);
      arms[0].rotation.set(pose.aLx, 0, pose.aLz); arms[1].rotation.set(pose.aRx, 0, pose.aRz);
      eyes.forEach((e) => { e.scale.y = Math.max(pose.eye, 0.12); });
      face.rotation.x = pose.look; face.position.z = -pose.look * 0.1;
      smile.visible = mood === 'done' || mood === 'sleep'; oh.visible = mood === 'ask'; flat.visible = !smile.visible && !oh.visible;
      trunk.rotation.z = pose.tilt;
      sign.visible = pose.sign > 0.02; sign.scale.setScalar(Math.max(pose.sign * 0.86, 0.001)); sign.grip(mood !== 'ask'); sign.rotation.z = (1 - pose.sign) * 0.5 - 0.03;
      const breathe = Math.sin(t * (mood === 'sleep' ? 1.1 : 1.9) + look.index) * (mood === 'sleep' ? 0.018 : 0.009);
      let y = 0, sq = 1 + breathe, roll = 0;
      if (walking) { y = Math.abs(Math.sin(phase)) * 0.13; roll = Math.sin(phase) * 0.11; feet.forEach((f, i) => { f.position.z = 0.12 + Math.sin(phase + i * Math.PI) * 0.13; f.position.y = 0.075 + Math.max(0, Math.cos(phase + i * Math.PI)) * 0.06; }); }
      else feet.forEach((f) => { f.position.z = damp(f.position.z, mood === 'sleep' ? 0.3 : 0.12, 10, dt); f.position.y = damp(f.position.y, 0.075, 12, dt); });
      if (hop > 0) { hop = Math.max(0, hop - dt); const u = (1.1 - hop) / 0.55, w = u % 1; y += Math.sin(w * Math.PI) * 0.3; sq *= 1 + Math.sin(w * Math.PI) * 0.08 - (w < 0.12 ? 0.1 : 0); }
      bob.position.y = y; bob.rotation.z = roll; trunk.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    },
  };
}
