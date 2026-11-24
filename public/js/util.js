import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const FONT = '"Bricolage Grotesque", "Avenir Next", "Trebuchet MS", sans-serif';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const lerp = (a, b, t) => a + (b - a) * t;

export function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...repeat); }
  tex.redraw = (fn = draw) => { ctx.clearRect(0, 0, w, h); fn(ctx, w, h); tex.needsUpdate = true; };
  tex.redraw();
  return tex;
}

// Felt grain: tileable noise used as a bump map.
const feltBump = (() => {
  const n = 128, data = new Uint8Array(n * n * 4), r = rng(7);
  for (let i = 0; i < n * n; i++) { const v = 90 + r() * 165; data.set([v, v, v, 255], i * 4); }
  const t = new THREE.DataTexture(data, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
})();

export function felt(color, opts = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.95, bumpMap: feltBump, bumpScale: 0.6,
    sheen: 0.7, sheenRoughness: 0.5, sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.4), ...opts,
  });
}

// Plain, striped or dotted color, for desks and signs.
export function swatch(ctx, x, y, w, h, color, pattern) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ctx.strokeStyle = 'rgba(255,240,214,.34)';
  if (pattern === 1) { ctx.lineWidth = 18; for (let i = -h; i < w; i += 54) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); } }
  if (pattern === 2) for (let j = 0; j * 44 < h + 44; j++) for (let i = 0; i * 60 < w + 60; i++) { ctx.beginPath(); ctx.arc(x + i * 60 + (j % 2) * 30, y + j * 44 + 12, 11, 0, 7); ctx.fill(); }
  ctx.restore();
}

// Frees the GPU memory of a leaving character (shared textures stay).
export function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) if (m) { if (m.map?.isCanvasTexture) m.map.dispose(); m.dispose(); }
    if (o.isInstancedMesh) o.dispose();
  });
}

// Ink that stays readable on a given color.
export function inkOn(color) {
  const c = new THREE.Color(color);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.27 ? '#2a1f2b' : '#fff4df';
}

export const matte = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });

export function mesh(geo, mat, parent, pos, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = shadow;
  if (pos) m.position.set(...pos);
  if (parent) parent.add(m);
  return m;
}

export function box(w, h, d, r, mat, parent, pos) {
  return mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat, parent, pos);
}

// Fur: stacked shells, pierced by a map of strands.
const furMap = (() => {
  const n = 128, h = new Float32Array(n * n), r = rng(21);
  for (let k = 0; k < 190; k++) {
    const cx = r() * n, cy = r() * n, rad = 4.2 + r() * 2.6, top = 0.55 + r() * 0.45;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d >= 1) continue;
      const i = ((y + n) % n) * n + ((x + n) % n);
      h[i] = Math.max(h[i], top * (1 - d * d * 0.85));
    }
  }
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) { const v = h[i] * 255; data.set([v, v, v, 255], i * 4); }
  const t = new THREE.DataTexture(data, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
})();

export function furry(geo, color, { rep = [14, 7], len = 0.045, shells = 14, pattern = 0 } = {}) {
  const g = geo.clone();
  const a = new Float32Array(shells);
  for (let i = 0; i < shells; i++) a[i] = i / (shells - 1);
  g.setAttribute('aShell', new THREE.InstancedBufferAttribute(a, 1));
  const mat = new THREE.MeshLambertMaterial({ color });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uFur: { value: furMap }, uLen: { value: len }, uRep: { value: new THREE.Vector2(...rep) }, uPat: { value: pattern } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aShell; uniform float uLen; uniform vec2 uRep; varying float vShell; varying vec2 vFur;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShell = aShell; vFur = uv * uRep;\ntransformed += normalize(objectNormal) * aShell * uLen;\ntransformed.y -= aShell * aShell * uLen * 0.55;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uFur; uniform vec2 uRep; uniform int uPat; varying float vShell; varying vec2 vFur;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vShell > 0.02 && texture2D(uFur, vFur).r < vShell) discard;\nvec2 q = vFur / uRep; float mark = 0.0;\nif (uPat == 1) mark = smoothstep(0.46, 0.54, abs(fract(q.y * 5.0) - 0.5) * 2.0);\nif (uPat == 2) { vec2 c = vec2(q.x * 11.0, q.y * 6.0); c.x += mod(floor(c.y), 2.0) * 0.5; mark = 1.0 - smoothstep(0.26, 0.34, length(fract(c) - 0.5)); }\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.93, 0.8), mark * 0.78);\ndiffuseColor.rgb *= mix(0.58, 1.16, vShell);');
  };
  mat.customProgramCacheKey = () => 'fur';
  const m = new THREE.InstancedMesh(g, mat, shells);
  const id = new THREE.Matrix4();
  for (let i = 0; i < shells; i++) m.setMatrixAt(i, id);
  m.receiveShadow = true;
  const caster = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  caster.castShadow = true;
  m.add(caster);
  return m;
}

// Picks the largest size that fits, on one or two lines.
export function fitText(ctx, text, { width, size, min, weight, split }) {
  const measure = (lines, px) => { ctx.font = `${weight} ${px}px ${FONT}`; return Math.max(...lines.map((l) => ctx.measureText(l).width)); };
  const fit = (lines, from) => { let px = from; while (px > min && measure(lines, px) > width) px -= 4; return px; };
  let best = { lines: [text], size: fit([text], size) };
  const words = text.split(/(?<=[-_])|\s+/).filter(Boolean);
  if (best.size < split && words.length > 1) {
    for (let i = 1; i < words.length; i++) {
      const join = (w) => w.reduce((a, b) => (/[-_]$/.test(a) ? a + b : a ? `${a} ${b}` : b), '');
      const lines = [join(words.slice(0, i)), join(words.slice(i))], px = fit(lines, split);
      if (px > best.size) best = { lines, size: px };
    }
  }
  ctx.font = `${weight} ${best.size}px ${FONT}`;
  best.lines = best.lines.map((l) => { let t = l; while (t.length > 3 && ctx.measureText(t).width > width) t = `${t.slice(0, -2)}…`; return t; });
  return best;
}
