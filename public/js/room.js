import * as THREE from 'three';
import { DESKS } from './assign.js';
import { T } from './i18n.js';
import { box, canvasTexture, damp, felt, fitText, inkOn, lerp, matte, mesh, rng, swatch } from './util.js';

const WOOD = '#d8ae7c', WOOD_DARK = '#8a5f3c', WALL = '#5ba5a2', WAINSCOT = '#2c6a6e';

// ---------- Time of day ----------

const KEYS = [
  { h: 0, top: '#0b1836', bot: '#22386b', sun: '#9db9ff', sunI: 0.5, sky: '#5f7db8', gnd: '#4a3a44', hemi: 0.85, lamps: 1 },
  { h: 6, top: '#1c2c55', bot: '#77658c', sun: '#b7b9ff', sunI: 0.6, sky: '#8087b5', gnd: '#5a464a', hemi: 0.95, lamps: 0.9 },
  { h: 8, top: '#86b2de', bot: '#f8cda6', sun: '#ffd9ad', sunI: 2.6, sky: '#dbe6ee', gnd: '#b08a64', hemi: 2.1, lamps: 0.3 },
  { h: 12, top: '#69afe4', bot: '#d3ebf6', sun: '#fff2dc', sunI: 3.2, sky: '#e6f0f4', gnd: '#bd976e', hemi: 2.5, lamps: 0.12 },
  { h: 16, top: '#74abdb', bot: '#ffe0ae', sun: '#ffdda8', sunI: 3.0, sky: '#e8e6dc', gnd: '#b58659', hemi: 2.2, lamps: 0.22 },
  { h: 18, top: '#4c4f92', bot: '#ff9c63', sun: '#ff9d60', sunI: 2.2, sky: '#b79fc0', gnd: '#7a5240', hemi: 1.25, lamps: 0.75 },
  { h: 20, top: '#131f47', bot: '#3c3d73', sun: '#9db0ff', sunI: 0.55, sky: '#6c7fb6', gnd: '#4c3c46', hemi: 0.9, lamps: 1 },
  { h: 24, top: '#0b1836', bot: '#22386b', sun: '#9db9ff', sunI: 0.5, sky: '#5f7db8', gnd: '#4a3a44', hemi: 0.85, lamps: 1 },
];
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

export function daylight(hour) {
  const h = ((hour % 24) + 24) % 24;
  const i = KEYS.findIndex((k, n) => n < KEYS.length - 1 && h >= k.h && h < KEYS[n + 1].h);
  const a = KEYS[i], b = KEYS[i + 1], t = (h - a.h) / (b.h - a.h);
  return {
    hour: h, top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t), sun: mix(a.sun, b.sun, t),
    sky: mix(a.sky, b.sky, t), gnd: mix(a.gnd, b.gnd, t),
    sunI: lerp(a.sunI, b.sunI, t), hemi: lerp(a.hemi, b.hemi, t), lamps: lerp(a.lamps, b.lamps, t),
  };
}

function drawSky(ctx, w, h, d) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.85);
  g.addColorStop(0, d.top.getStyle()); g.addColorStop(1, d.bot.getStyle());
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const night = 1 - THREE.MathUtils.smoothstep(d.sunI, 0.6, 1.6);
  const r = rng(5);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = night * (0.3 + r() * 0.7);
    ctx.beginPath(); ctx.arc(r() * w, r() * h * 0.6, 1 + r() * 2.2, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const day = d.hour > 6.5 && d.hour < 19;
  const p = day ? (d.hour - 6.5) / 12.5 : (((d.hour + 24 - 19) % 24) / 11.5);
  const x = w * (0.12 + p * 0.76), y = h * (0.78 - Math.sin(p * Math.PI) * 0.6);
  ctx.fillStyle = day ? '#fff3c9' : '#f2f0e2';
  ctx.beginPath(); ctx.arc(x, y, day ? 46 : 36, 0, 7); ctx.fill();
  if (!day) { ctx.fillStyle = d.top.clone().lerp(d.bot, 0.3).getStyle(); ctx.beginPath(); ctx.arc(x + 17, y - 9, 30, 0, 7); ctx.fill(); }
  const hill = (base, amp, f, ph, color) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, h);
    for (let i = 0; i <= w; i += 8) ctx.lineTo(i, base - Math.sin(i * f + ph) * amp - Math.sin(i * f * 2.3 + ph * 2) * amp * 0.35);
    ctx.lineTo(w, h); ctx.fill();
  };
  hill(h * 0.74, 34, 0.007, 1, d.bot.clone().lerp(new THREE.Color('#3f6f74'), 0.45).getStyle());
  hill(h * 0.86, 26, 0.009, 3.2, d.bot.clone().lerp(new THREE.Color('#1e4a45'), 0.72).getStyle());
  ctx.fillStyle = d.bot.clone().lerp(new THREE.Color('#123630'), 0.84).getStyle();
  for (let i = 0; i < 9; i++) {
    const tx = 40 + i * 118 + r() * 50, th = 60 + r() * 60, ty = h * 0.95;
    ctx.beginPath(); ctx.moveTo(tx - th * 0.32, ty); ctx.lineTo(tx, ty - th); ctx.lineTo(tx + th * 0.32, ty); ctx.fill();
  }
  ctx.fillRect(0, h * 0.93, w, h);
}

// ---------- Textures ----------

function planks(ctx, w, h) {
  const r = rng(3), rows = 8, ph = h / rows;
  for (let y = 0; y < rows; y++) {
    let x = -r() * 300;
    while (x < w) {
      const len = 260 + r() * 260;
      const c = new THREE.Color('#c39a6c').offsetHSL((r() - 0.5) * 0.015, (r() - 0.5) * 0.06, (r() - 0.5) * 0.07);
      ctx.fillStyle = c.getStyle(); ctx.fillRect(x, y * ph, len, ph);
      ctx.strokeStyle = 'rgba(70,36,14,.16)'; ctx.lineWidth = 1.2;
      for (let k = 0; k < 5; k++) {
        const gy = y * ph + r() * ph; ctx.beginPath(); ctx.moveTo(x, gy);
        ctx.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 8, x + len * 0.6, gy + (r() - 0.5) * 8, x + len, gy); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(50,24,8,.5)'; ctx.fillRect(x + len - 2, y * ph, 2.5, ph);
      x += len;
    }
    ctx.fillStyle = 'rgba(50,24,8,.45)'; ctx.fillRect(0, y * ph, w, 2.5);
  }
}

function grain(base) {
  return (ctx, w, h) => {
    const r = rng(11);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const y = r() * h;
      ctx.strokeStyle = `rgba(80,44,18,${0.05 + r() * 0.1})`; ctx.lineWidth = 0.6 + r() * 1.8;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 18, w * 0.7, y + (r() - 0.5) * 18, w, y); ctx.stroke();
    }
  };
}

function rug(ctx, w, h) {
  const r = rng(9), bands = ['#b9473a', '#f0dcb4', '#274f63', '#f0dcb4', '#b9473a', '#d88a4b', '#b9473a', '#f0dcb4'];
  ctx.translate(w / 2, h / 2);
  bands.forEach((c, i) => {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.ellipse(0, 0, (w / 2) * (1 - i * 0.115), (h / 2) * (1 - i * 0.115), 0, 0, 7); ctx.fill();
  });
  for (let i = 0; i < 9000; i++) {
    const a = r() * 7, d = Math.sqrt(r());
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,240,210,.07)' : 'rgba(20,10,10,.09)';
    ctx.fillRect(Math.cos(a) * d * w / 2, Math.sin(a) * d * h / 2, 7, 2);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });
}

// ---------- Desk ----------

function makeDesk(scene, i, shared) {
  const [x, y, z] = DESKS[i], r = rng(100 + i * 17), g = new THREE.Group();
  g.position.set(x, y, z); scene.add(g);
  const panelTex = canvasTexture(1024, 320, () => {});
  const wood = shared.wood;
  box(1.86, 0.08, 0.84, 0.035, wood, g, [0, 0.66, 0]);
  box(0.09, 0.64, 0.7, 0.03, wood, g, [-0.84, 0.32, 0]);
  box(0.09, 0.64, 0.7, 0.03, wood, g, [0.84, 0.32, 0]);
  const panel = box(1.62, 0.5, 0.05, 0.02, matte('#ffffff', { map: null, roughness: 0.8 }), g, [0, 0.36, 0.3]);
  const name = mesh(new THREE.PlaneGeometry(1.56, 0.4875), new THREE.MeshStandardMaterial({ map: panelTex, transparent: true, roughness: 0.8, emissive: '#ffffff', emissiveMap: panelTex, emissiveIntensity: 0.12 }), g, [0, 0.36, 0.327], false);
  name.receiveShadow = true;

  const lap = new THREE.Group(); lap.position.set(-0.08, 0.7, 0.02); lap.scale.setScalar(0.82); g.add(lap);
  const alu = matte('#d9d4c8', { roughness: 0.45, metalness: 0.25 });
  box(0.62, 0.03, 0.42, 0.015, alu, lap, [0, 0.015, -0.06]);
  const lid = new THREE.Group(); lid.position.set(0, 0.03, 0.15); lap.add(lid);
  box(0.62, 0.4, 0.025, 0.02, alu, lid, [0, 0.2, 0]);
  const sticker = mesh(new THREE.CircleGeometry(0.065, 24), matte('#ffffff'), lid, [0, 0.21, 0.014], false);
  lid.rotation.x = 0.2;
  const screen = mesh(new THREE.PlaneGeometry(0.56, 0.34), new THREE.MeshBasicMaterial({ color: '#bfe9ff' }), lid, [0, 0.2, -0.014], false);
  screen.rotation.y = Math.PI;

  const lamp = new THREE.Group(); lamp.position.set(0.72, 0.7, -0.02); g.add(lamp);
  const enamel = matte('#e8633f', { roughness: 0.4 });
  mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 28), enamel, lamp, [0, 0.02, 0]);
  const a1 = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 10), enamel, lamp, [0.05, 0.22, 0]); a1.rotation.z = -0.24;
  const a2 = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.34, 10), enamel, lamp, [-0.02, 0.5, 0]); a2.rotation.z = 1.02;
  const head = new THREE.Group(); head.position.set(-0.18, 0.57, 0); head.rotation.z = -0.42; lamp.add(head);
  mesh(new THREE.CylinderGeometry(0.045, 0.15, 0.17, 30, 1, true), Object.assign(enamel.clone(), { side: THREE.DoubleSide }), head, [0, -0.04, 0]);
  mesh(new THREE.SphereGeometry(0.047, 18, 12), enamel, head, [0, 0.045, 0]);
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#3a2a1c' });
  mesh(new THREE.SphereGeometry(0.062, 18, 12), bulbMat, head, [0, -0.085, 0], false);
  const light = new THREE.PointLight('#ffb868', 0, 4.2, 1.7); light.position.set(0.46, 1.1, 0.2); g.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: shared.glow, color: '#ffb868', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.8); glow.position.set(0.5, 1.16, 0.1); g.add(glow);

  const colors = ['#f3e6c8', '#4a6fa5', '#c9574a', '#7f8f55', '#e7b7c5'];
  const pick = () => colors[Math.floor(r() * colors.length)];
  const kind = Math.floor(r() * 3);
  if (kind === 0) for (let k = 0; k < 3; k++) { const b = box(0.36, 0.065, 0.25, 0.012, matte(pick()), g, [-0.64, 0.735 + k * 0.067, 0.02]); b.rotation.y = (r() - 0.5) * 0.5; }
  if (kind === 1) {
    mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.16, 20), matte('#c9774a'), g, [-0.68, 0.78, 0.08]);
    for (let k = 0; k < 7; k++) {
      const leaf = mesh(new THREE.SphereGeometry(0.1, 12, 8), matte('#5f9155'), g, [-0.68, 0.92, 0.08]);
      const a = k * 0.9; leaf.scale.set(0.38, 1.25, 0.16); leaf.rotation.set(Math.sin(a) * 0.65, 0, Math.cos(a) * 0.65); leaf.translateY(0.1);
    }
  }
  if (kind === 2) {
    const c = pick();
    mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.16, 24), matte(c, { roughness: 0.4 }), g, [-0.64, 0.78, 0.16]);
    const h = mesh(new THREE.TorusGeometry(0.05, 0.015, 10, 20), matte(c, { roughness: 0.4 }), g, [-0.74, 0.78, 0.16]); h.scale.y = 1.15;
    const p = box(0.3, 0.012, 0.36, 0.004, matte('#fff6e3'), g, [0.28, 0.71, 0.1]); p.rotation.y = 0.2;
  }

  let want = 0, now = 0, wantLid = 1, nowLid = 1, painted = null;
  return {
    pos: new THREE.Vector3(x, y, z), seat: new THREE.Vector3(x, y, z - 0.6), gap: x + (x > 0 ? -1.25 : 1.25),
    paint(project, title, color, pattern = 0) {
      const key = `${project}|${title}|${color}|${pattern}`;
      if (key === painted) return;
      painted = key;
      panel.material.color.set(project ? color : '#c79a68');
      panel.material.emissive.set(project ? color : '#000000'); panel.material.emissiveIntensity = 0;
      sticker.material.color.set(project ? color : '#e9e3d6');
      panelTex.redraw((ctx, w, h) => {
        if (!project) return;
        if (pattern) swatch(ctx, 0, 0, w, h, color, pattern);
        ctx.fillStyle = inkOn(color); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const big = fitText(ctx, project, { width: w * 0.9, size: 128, min: 70, weight: 800, split: 0 });
        ctx.fillText(big.lines[0], w / 2, h * 0.36);
        const small = fitText(ctx, title, { width: w * 0.92, size: 84, min: 60, weight: 600, split: 0 });
        ctx.fillText(small.lines[0], w / 2, h * 0.74);
      });
    },
    set(on, open) { want = on ? 1 : 0; wantLid = open ? 1 : 0; },
    update(dt, day) {
      now = damp(now, want, 5, dt); nowLid = damp(nowLid, wantLid, 5, dt);
      const p = now * (0.45 + 0.55 * day.lamps);
      light.intensity = p * 3.0;
      panel.material.emissiveIntensity = day.lamps * 0.3;
      name.material.emissiveIntensity = 0.12 + day.lamps * 0.28;
      glow.material.opacity = p * 0.3;
      bulbMat.color.set('#3a2a1c').lerp(new THREE.Color('#fff0cf').multiplyScalar(2.2), now);
      screen.material.color.set('#15262c').lerp(new THREE.Color('#bfe9ff'), now);
      lid.rotation.x = lerp(-1.5, 0.2, nowLid);
    },
  };
}

// ---------- Room ----------

export const SHELF = { x: 3.75, z: -4.86, rows: [2.66, 3.68], per: 8, step: 0.74 };

export const CHEST = { pos: [5.72, 0.42, -1.45], inside: [5.72, 0.42, -1.5] };
export const QUEUE_POST = [-4.9, 0, 0.6];

export function buildRoom(scene) {
  const shared = {
    glow: glowTexture(),
    wood: matte('#ffffff', { map: canvasTexture(512, 256, grain(WOOD)), roughness: 0.72 }),
  };
  const darkWood = matte('#ffffff', { map: canvasTexture(512, 256, grain(WOOD_DARK)), roughness: 0.75 });

  const floorTex = canvasTexture(1024, 1024, planks, [4, 2.4]);
  const floor = mesh(new THREE.PlaneGeometry(34, 9.5), matte('#ffffff', { map: floorTex, roughness: 0.68 }), scene, [0, 0, -1.35], false);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  box(34, 1.6, 0.3, 0.03, matte('#16383d'), scene, [0, -0.82, 3.36]);
  box(34, 0.07, 0.34, 0.03, shared.wood, scene, [0, -0.02, 3.36]);

  const wall = mesh(new THREE.PlaneGeometry(34, 9), matte(WALL, { roughness: 0.95 }), scene, [0, 4.5, -5.2], false);
  wall.receiveShadow = true;
  const boards = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = WAINSCOT; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,20,22,.5)'; ctx.fillRect(0, 0, 5, h);
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(6, 0, 4, h);
  }, [70, 1]);
  mesh(new THREE.PlaneGeometry(34, 1.6), matte('#ffffff', { map: boards }), scene, [0, 0.8, -5.17], false).receiveShadow = true;
  box(34, 0.1, 0.1, 0.03, matte('#1f4b50'), scene, [0, 1.6, -5.13]);

  const tier = (w, h, d, z) => {
    box(w, h, d, 0.04, shared.wood, scene, [0, h / 2, z]);
    box(w, 0.06, 0.09, 0.02, darkWood, scene, [0, h - 0.02, z + d / 2 + 0.01]);
    for (let k = 0; k <= 14; k++) box(0.05, h - 0.06, 0.03, 0.01, darkWood, scene, [(k / 14 - 0.5) * (w - 0.1), h / 2 - 0.03, z + d / 2 + 0.005]);
  };
  tier(13.6, 0.42, 4.4, -3.0);
  tier(13.6, 1.0, 2.4, -4.0);

  const rugMesh = mesh(new THREE.PlaneGeometry(10, 2.5), matte('#ffffff', { map: canvasTexture(1536, 400, rug), transparent: true, alphaTest: 0.5, roughness: 1 }), scene, [0, 0.012, 1.9], false);
  rugMesh.rotation.x = -Math.PI / 2; rugMesh.receiveShadow = true;

  // Window
  const W = 3.9, H = 2.1, wx = -3.9, wy = 3.2;
  const skyTex = canvasTexture(1024, 600, () => {});
  const sky = mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: skyTex }), scene, [wx, wy, -5.15], false);
  const frame = matte('#f1e2c4', { roughness: 0.6 });
  box(W + 0.34, 0.16, 0.18, 0.03, frame, scene, [wx, wy + H / 2 + 0.06, -5.08]);
  box(W + 0.56, 0.14, 0.4, 0.03, frame, scene, [wx, wy - H / 2 - 0.06, -5.0]);
  for (const s of [-1, 1]) box(0.16, H, 0.18, 0.03, frame, scene, [wx + s * (W / 2 + 0.06), wy, -5.08]);
  for (const s of [-1 / 6, 1 / 6]) box(0.07, H, 0.1, 0.02, frame, scene, [wx + s * W, wy, -5.1]);
  box(W, 0.07, 0.1, 0.02, frame, scene, [wx, wy + 0.2, -5.1]);
  const curtain = felt('#c65a4a');
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const f = mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.75, 14), curtain, scene, [wx + s * (W / 2 + 0.26 + k * 0.13), wy - 0.06, -4.98]);
    f.scale.z = 0.7;
  }
  const rod = mesh(new THREE.CylinderGeometry(0.035, 0.035, W + 1.8, 12), darkWood, scene, [wx, wy + H / 2 + 0.24, -4.95]); rod.rotation.z = Math.PI / 2;
  const pot = (x) => {
    mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.2, 20), matte('#c9774a'), scene, [x, wy - H / 2 + 0.11, -4.92]);
    for (let k = 0; k < 8; k++) {
      const l = mesh(new THREE.SphereGeometry(0.11, 10, 8), matte(k % 2 ? '#5f9155' : '#78a663'), scene, [x, wy - H / 2 + 0.24, -4.92]);
      l.scale.set(0.4, 1.2, 0.18); l.rotation.set(Math.sin(k) * 0.7, k, Math.cos(k * 1.7) * 0.7); l.translateY(0.12);
    }
  };
  pot(wx - 1.35); pot(wx - 0.95);

  // Sleepers' shelves
  for (const y of SHELF.rows) {
    box(SHELF.per * SHELF.step + 0.35, 0.09, 0.72, 0.03, shared.wood, scene, [SHELF.x, y - 0.045, SHELF.z]);
    for (const s of [-1, 1]) box(0.08, 0.26, 0.5, 0.02, darkWood, scene, [SHELF.x + s * (SHELF.per * SHELF.step / 2 - 0.25), y - 0.21, SHELF.z - 0.05]);
  }

  // Clock, on real time
  const clock = new THREE.Group(); clock.position.set(-0.62, 3.84, -5.1); scene.add(clock);
  const rim = mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 44), darkWood, clock); rim.rotation.x = Math.PI / 2;
  mesh(new THREE.CircleGeometry(0.38, 44), matte('#fff3da'), clock, [0, 0, 0.052], false);
  for (let k = 0; k < 12; k++) {
    const t = mesh(new THREE.PlaneGeometry(0.025, k % 3 ? 0.04 : 0.075), matte('#2b2430'), clock, [Math.sin(k * Math.PI / 6) * 0.32, Math.cos(k * Math.PI / 6) * 0.32, 0.055], false);
    t.rotation.z = -k * Math.PI / 6;
  }
  const hand = (len, w, c, z) => { const p = new THREE.Group(); clock.add(p); mesh(new THREE.PlaneGeometry(w, len), matte(c), p, [0, len * 0.42, z], false); return p; };
  const hh = hand(0.22, 0.035, '#2b2430', 0.058), mm = hand(0.31, 0.024, '#2b2430', 0.06);

  // String lights
  const pts = [];
  for (let k = 0; k <= 8; k++) pts.push(new THREE.Vector3(-8 + k * 2, k % 2 ? 4.34 : 4.66, -4.75));
  const curve = new THREE.CatmullRomCurve3(pts);
  mesh(new THREE.TubeGeometry(curve, 120, 0.012, 6), matte('#22302f'), scene, null, false);
  const bulbs = new THREE.MeshBasicMaterial({ color: '#ffd08a' });
  const bulbGeo = new THREE.SphereGeometry(0.052, 14, 10);
  for (let k = 0; k <= 34; k++) { const p = curve.getPointAt(k / 34); mesh(bulbGeo, bulbs, scene, [p.x, p.y - 0.06, p.z], false); }

  // Big plant
  const big = new THREE.Group(); big.position.set(-6.1, 0, -0.1); scene.add(big);
  mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.62, 30), matte('#e9d4ac'), big, [0, 0.31, 0]);
  mesh(new THREE.CylinderGeometry(0.425, 0.4, 0.16, 30), matte('#c9574a'), big, [0, 0.36, 0]);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0); leafShape.bezierCurveTo(0.26, 0.15, 0.22, 0.55, 0, 0.85); leafShape.bezierCurveTo(-0.22, 0.55, -0.26, 0.15, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 10);
  { const p = leafGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -(p.getY(i) ** 2) * 0.42 + Math.abs(p.getX(i)) * 0.35); leafGeo.computeVertexNormals(); }
  const lr = rng(44);
  for (let k = 0; k < 15; k++) {
    const l = mesh(leafGeo, matte(['#3f7a4d', '#4f8f55', '#6aa35c'][k % 3], { side: THREE.DoubleSide }), big, [0, 0.55 + lr() * 0.35, 0]);
    l.rotation.order = 'YXZ'; l.rotation.set(0.3 + lr() * 0.6, k * 2.4, 0); l.scale.setScalar(0.85 + lr() * 0.6);
  }
  // Toy chest: the sleepers that no longer fit on the shelves.
  const chest = new THREE.Group(); chest.position.set(...CHEST.pos); scene.add(chest);
  const blue = matte('#3d6f9c', { roughness: 0.7 });
  box(1.56, 0.06, 0.84, 0.02, darkWood, chest, [0, 0.03, 0]);
  box(1.5, 0.56, 0.06, 0.02, blue, chest, [0, 0.31, 0.37]);
  box(1.5, 0.56, 0.06, 0.02, blue, chest, [0, 0.31, -0.37]);
  for (const d of [-1, 1]) {
    box(0.06, 0.56, 0.8, 0.02, blue, chest, [d * 0.72, 0.31, 0]);
    box(0.1, 0.62, 0.1, 0.02, darkWood, chest, [d * 0.72, 0.31, 0.37]);
  }
  const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.38); chest.add(lid);
  box(1.6, 0.09, 0.86, 0.03, blue, lid, [0, 0.045, 0.4]);
  box(1.62, 0.1, 0.09, 0.02, darkWood, lid, [0, 0.05, 0.82]);
  const chestTex = canvasTexture(768, 256, () => {});
  mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshStandardMaterial({ map: chestTex, transparent: true, roughness: 0.8, emissive: '#ffffff', emissiveMap: chestTex, emissiveIntensity: 0.55 }), chest, [0, 0.31, 0.402], false);
  let chestN = null, lidWant = 0, lidNow = 0;

  // Sign for the waiting line.
  const post = new THREE.Group(); post.position.set(...QUEUE_POST); post.rotation.y = 0.18; scene.add(post);
  mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.07, 28), darkWood, post, [0, 0.035, 0]);
  mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.2, 14), darkWood, post, [0, 0.6, 0]);
  box(0.98, 0.62, 0.05, 0.03, matte('#b48a5c'), post, [0, 1.08, 0.05]);
  const postTex = canvasTexture(640, 400, () => {});
  const postFace = mesh(new THREE.PlaneGeometry(0.98, 0.612), new THREE.MeshStandardMaterial({ map: postTex, transparent: true, roughness: 0.9, emissive: '#ffffff', emissiveMap: postTex, emissiveIntensity: 0.1 }), post, [0, 1.08, 0.079], false);
  post.visible = false;
  let postKey = null;

  // Slate: working sessions without a visible desk.
  const slate = new THREE.Group(); slate.position.set(-0.62, 2.94, -5.1); scene.add(slate);
  box(1.34, 0.72, 0.06, 0.02, darkWood, slate, [0, 0, 0]);
  const slateTex = canvasTexture(650, 320, () => {});
  mesh(new THREE.PlaneGeometry(1.22, 0.6), new THREE.MeshStandardMaterial({ map: slateTex, roughness: 0.95, emissive: '#ffffff', emissiveMap: slateTex, emissiveIntensity: 0.25 }), slate, [0, 0, 0.034], false);
  slate.visible = false;
  let slateN = null;

  const desks = DESKS.map((_, i) => makeDesk(scene, i, shared));
  desks.forEach((d) => d.paint('', '', ''));

  // Lights
  const hemi = new THREE.HemisphereLight('#ffffff', '#886644', 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(-5.5, 8.5, 6.5); sun.target.position.set(0.5, 0, -1.2); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -6, near: 1, far: 24 });
  const spot = new THREE.SpotLight('#ffffff', 0, 14, 0.62, 0.9, 1.4); spot.position.set(0, 6.2, 5.4); spot.target.position.set(0, 0.5, 1.6); scene.add(spot, spot.target);

  // Patch of sun on the floor
  const patch = mesh(new THREE.PlaneGeometry(4.6, 2.6), new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    map: canvasTexture(512, 300, (ctx, w, h) => {
      ctx.filter = 'blur(7px)'; ctx.fillStyle = '#fff';
      for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) ctx.fillRect(30 + a * 155, 24 + b * 132, 136, 116);
      ctx.filter = 'none';
    }),
  }), scene, [-2.6, 0.02, 0.9], false);
  patch.rotation.set(-Math.PI / 2, 0, 0.42);

  const write = (ctx, text, x, y, size, color, width) => {
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const f = fitText(ctx, text, { width, size, min: 30, weight: 800, split: 0 });
    ctx.fillText(f.lines[0], x, y);
  };

  let spotNow = 0; const spotColor = new THREE.Color('#ffffff');
  return {
    desks,
    setCrowd({ chest: n, queue, queueAsk, unseated }) {
      lidWant = n ? 1 : 0;
      if (n !== chestN) { chestN = n; chestTex.redraw((ctx, w, h) => { if (!n) return; write(ctx, String(n), w / 2, h * 0.36, 170, '#fff1d6', w); write(ctx, T.chest(n), w / 2, h * 0.82, 70, '#fff1d6', w); }); }
      const key = `${queue}|${queueAsk}`;
      if (key !== postKey) {
        postKey = key; post.visible = queue > 0;
        postTex.redraw((ctx, w, h) => {
          ctx.fillStyle = queueAsk ? '#ffb92a' : '#8ce0b0'; ctx.beginPath(); ctx.roundRect(10, 10, w - 20, h - 20, 28); ctx.fill();
          const ink = queueAsk ? '#2e1a00' : '#06281b';
          write(ctx, `+${queue}`, w / 2, h * 0.4, 220, ink, w * 0.86);
          write(ctx, T.line(queue), w / 2, h * 0.79, 78, ink, w * 0.86);
        });
      }
      if (unseated !== slateN) {
        slateN = unseated; slate.visible = unseated > 0;
        slateTex.redraw((ctx, w, h) => { ctx.fillStyle = '#26373a'; ctx.fillRect(0, 0, w, h); write(ctx, `+${unseated}`, w / 2, h * 0.36, 180, '#fff1d6', w); write(ctx, T.slate(unseated), w / 2, h * 0.78, 92, '#fff1d6', w * 0.9); });
      }
    },
    update(dt, day, front) {
      lidNow = damp(lidNow, lidWant, 4, dt); lid.rotation.x = -lidNow * 1.75;
      postFace.material.emissiveIntensity = lerp(0.05, 0.5, day.lamps);
      hemi.color.copy(day.sky); hemi.groundColor.copy(day.gnd);
      const calm = 1 - spotNow * 0.16;
      hemi.intensity = day.hemi * calm; sun.color.copy(day.sun); sun.intensity = day.sunI * calm;
      spotNow = damp(spotNow, front ? 1 : 0, 3, dt);
      spotColor.lerp(new THREE.Color(front === 'ask' ? '#ffc561' : '#cffbe0'), 1 - Math.exp(-3 * dt));
      spot.color.copy(spotColor); spot.intensity = spotNow * (9 + 80 * day.lamps);
      bulbs.color.set('#e8d6b0').lerp(new THREE.Color('#ffc978').multiplyScalar(1.9), THREE.MathUtils.smoothstep(day.lamps, 0.3, 0.9));
      patch.material.color.copy(day.sun); patch.material.opacity = THREE.MathUtils.smoothstep(day.sunI, 1.2, 2.6) * 0.2;
      desks.forEach((d) => d.update(dt, day));
    },
    setHour(day) {
      skyTex.redraw((ctx, w, h) => drawSky(ctx, w, h, day));
      hh.rotation.z = -(day.hour / 12) * Math.PI * 2;
      mm.rotation.z = -(day.hour % 1) * Math.PI * 2;
    },
  };
}
