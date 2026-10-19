// Procedural low-poly models: flowers, stack bunches, bouquets, scythe, greenhouse, conveyor.
// Flowers are vertex coloured; the `aTint` attribute marks petals, which take the per-instance colour,
// so one InstancedMesh can show many shades. A small shader patch adds wind sway.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GREEN = 0x3f9b3a;
const LEAF = 0x57b847;
const WHITE = 0xffffff;

/** Merge parts [{ geo, color, tint, pos, rot, scale }] into one non-indexed geometry with color + aTint. */
export function buildGeo(parts) {
  const list = parts.map(({ geo, color = WHITE, tint = 0, pos, rot, scale }) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(pos || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))),
      new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale ?? 1, scale ?? 1, scale ?? 1])),
    );
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const colors = new Float32Array(n * 3);
    const tints = new Float32Array(n).fill(tint);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(tints, 1));
    return g;
  });
  const merged = mergeGeometries(list, false);
  merged.computeBoundingSphere();
  return merged;
}

/** Copy of a flower geometry with the petal colour baked in (for plain, non-instanced meshes). */
export function bakeTint(geometry, hex) {
  const g = geometry.clone();
  const c = new THREE.Color(hex);
  const col = g.attributes.color;
  const tint = g.attributes.aTint;
  for (let i = 0; i < col.count; i++) {
    if (tint.getX(i) < 0.5) continue;
    col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
    tint.setX(i, 0);
  }
  return g;
}

/** Lambert + vertex colours, petals tinted per instance, optional wind sway. */
export function makeFlowerMaterial({ wind = 0, side = THREE.FrontSide } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side });
  const uniforms = { uTime: { value: 0 }, uWind: { value: wind } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint;\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <color_vertex>', `
        vColor = vec3(1.0);
        #ifdef USE_COLOR
          vColor *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor *= mix(vec3(1.0), instanceColor, aTint);
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sway = sin(uTime * 1.7 + ip.x * 0.6 + ip.z * 0.45) * uWind * max(position.y, 0.0);
          transformed.x += sway;
          transformed.z += sway * 0.4;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'flower-v1';
  return mat;
}

const cyl = (rt, rb, h, seg = 5) => new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(0, h / 2, 0);
const leaf = (len) => new THREE.ConeGeometry(0.05, len, 4).scale(1, 1, 0.35).translate(0, len / 2, 0);

// ------------------------------------------------------------------ field flowers (≈0.75 tall)

export function tulipGeometry() {
  const cup = new THREE.LatheGeometry(
    [[0, 0], [0.07, 0.02], [0.105, 0.08], [0.1, 0.17], [0.075, 0.23], [0.06, 0.24]].map(([x, y]) => new THREE.Vector2(x, y)),
    6,
  );
  return buildGeo([
    { geo: cyl(0.018, 0.022, 0.52), color: GREEN },
    { geo: leaf(0.32), color: LEAF, rot: [0.35, 0, 0.1] },
    { geo: leaf(0.28), color: LEAF, rot: [-0.4, 0.4, -0.1] },
    { geo: cup, tint: 1, pos: [0, 0.5, 0] },
  ]);
}

export function roseGeometry() {
  return buildGeo([
    { geo: cyl(0.016, 0.02, 0.46), color: GREEN },
    { geo: leaf(0.22), color: 0x2f7d32, rot: [0.6, 0, 0], pos: [0, 0.18, 0] },
    { geo: leaf(0.22), color: 0x2f7d32, rot: [-0.6, 1.2, 0], pos: [0, 0.26, 0] },
    { geo: new THREE.ConeGeometry(0.06, 0.06, 5).rotateX(Math.PI), color: 0x2f7d32, pos: [0, 0.47, 0] },
    { geo: new THREE.DodecahedronGeometry(0.1), tint: 1, pos: [0, 0.54, 0], scale: [1, 0.85, 1] },
    { geo: new THREE.DodecahedronGeometry(0.065), color: 0xdddddd, tint: 1, pos: [0, 0.6, 0], rot: [0.5, 0.6, 0] },
  ]);
}

export function peonyGeometry() {
  const puff = (r) => new THREE.IcosahedronGeometry(r, 0);
  return buildGeo([
    { geo: cyl(0.02, 0.025, 0.36), color: GREEN },
    { geo: leaf(0.26), color: LEAF, rot: [0.7, 0, 0.2] },
    { geo: leaf(0.26), color: LEAF, rot: [-0.7, 0.9, -0.2] },
    { geo: leaf(0.24), color: LEAF, rot: [0.6, 2.2, 0.1] },
    { geo: puff(0.15), tint: 1, pos: [0, 0.44, 0], scale: [1.1, 0.8, 1.1] },
    { geo: puff(0.11), tint: 1, color: 0xf2f2f2, pos: [0.06, 0.52, 0.02] },
    { geo: puff(0.1), tint: 1, color: 0xe6e6e6, pos: [-0.05, 0.5, -0.04] },
  ]);
}

// ------------------------------------------------------------------ carried bunch (stack item, 0.1 tall)

export function bunchGeometry(type) {
  const head = type === 'tulip'
    ? new THREE.LatheGeometry([[0, 0], [0.06, 0.02], [0.075, 0.08], [0.06, 0.14], [0.04, 0.15]].map(([x, y]) => new THREE.Vector2(x, y)), 5)
    : new THREE.DodecahedronGeometry(type === 'peony' ? 0.085 : 0.07);
  const parts = [];
  // Six flowers lying sideways, heads fanned out to both ends, tied in the middle: reads as a pink block.
  const rows = [-0.13, 0, 0.13];
  for (const dir of [-1, 1]) {
    rows.forEach((z, i) => {
      const hx = dir * (0.11 + (i % 2) * 0.03);
      parts.push({ geo: new THREE.CylinderGeometry(0.014, 0.014, 0.1, 4), color: GREEN, rot: [0, 0, Math.PI / 2], pos: [dir * 0.05, 0.05, z * 0.6] });
      parts.push(type === 'tulip'
        ? { geo: head, tint: 1, rot: [0, 0, -dir * Math.PI / 2], pos: [hx, 0.05, z], scale: 1.35 }
        : { geo: head, tint: 1, pos: [hx + dir * 0.04, 0.05, z], rot: [i, i * 0.7 + dir, 0], scale: 1.3 });
    });
  }
  parts.push({ geo: new THREE.CylinderGeometry(0.045, 0.045, 0.2, 6), color: 0x7cc35a, rot: [Math.PI / 2, 0, 0], pos: [0, 0.05, 0] });
  return buildGeo(parts);
}

// ------------------------------------------------------------------ bouquet (wrapped cone, ≈0.5 long)

export function bouquetGeometry(type) {
  const head = type === 'tulip' ? new THREE.SphereGeometry(0.06, 5, 4).scale(1, 1.3, 1) : new THREE.DodecahedronGeometry(type === 'peony' ? 0.075 : 0.06);
  const parts = [
    { geo: new THREE.ConeGeometry(0.15, 0.34, 7, 1, true).rotateX(Math.PI), color: 0xfdf6e3, pos: [0, 0.17, 0] },
    { geo: new THREE.TorusGeometry(0.06, 0.018, 4, 8).rotateX(Math.PI / 2), color: 0xffcf3f, pos: [0, 0.07, 0] },
  ];
  const ring = [[0, 0.34, 0], [0.08, 0.31, 0.03], [-0.07, 0.31, 0.05], [0.02, 0.31, -0.08], [-0.04, 0.39, -0.02], [0.05, 0.38, 0.05]];
  for (const p of ring) parts.push({ geo: head, tint: 1, pos: p });
  parts.push({ geo: leaf(0.12), color: LEAF, pos: [0.1, 0.27, -0.03], rot: [0, 0, -0.6] });
  parts.push({ geo: leaf(0.12), color: LEAF, pos: [-0.1, 0.27, 0.02], rot: [0, 0, 0.6] });
  return buildGeo(parts);
}

// ------------------------------------------------------------------ props

export function scytheMesh() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x9a6a3a });
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.6, roughness: 0.3 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.5, 6), wood);
  shaft.position.y = 0.75;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 5), wood);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0.1, 1.0, 0);
  const blade = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 3, 14, Math.PI * 0.55), steel);
  blade.scale.set(1, 1, 0.35);
  blade.rotation.set(Math.PI / 2, 0, Math.PI);
  blade.position.set(0.42, 1.48, 0);
  g.add(shaft, grip, blade);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function strawHat() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xf2cf6b });
  const band = new THREE.MeshLambertMaterial({ color: 0xe0457b });
  const g = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.05, 14), mat);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.3, 12), mat);
  crown.position.y = 0.17;
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.08, 12), band);
  ribbon.position.y = 0.06;
  g.add(brim, crown, ribbon);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Glass greenhouse with an arched roof. Origin at the floor centre, door side facing +z. */
export function greenhouse({ w = 8, d = 10, h = 2.2, frame = 0xf4f1e6, trim = 0xd8b04a } = {}) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ color: frame });
  const trimMat = new THREE.MeshLambertMaterial({ color: trim });
  const glass = new THREE.MeshLambertMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.25, d + 0.3), new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }));
  base.position.y = 0.06;
  base.receiveShadow = true;
  g.add(base);

  const post = new THREE.BoxGeometry(0.14, h, 0.14).translate(0, h / 2, 0);
  for (const x of [-w / 2, 0, w / 2]) {
    for (const z of [-d / 2, -d / 6, d / 6, d / 2]) {
      if (x === 0 && Math.abs(z) < d / 2) continue;
      const p = new THREE.Mesh(post, frameMat);
      p.position.set(x, 0, z);
      p.castShadow = true;
      g.add(p);
    }
  }
  // Wall glass, leaving a door gap in the front.
  const side = new THREE.PlaneGeometry(d, h);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(side, glass);
    m.rotation.y = Math.PI / 2;
    m.position.set((sx * w) / 2, h / 2, 0);
    g.add(m);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass);
  back.position.set(0, h / 2, -d / 2);
  g.add(back);
  for (const sx of [-1, 1]) {
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w / 2 - 1.1, h), glass);
    front.position.set(sx * (w / 4 + 0.55), h / 2, d / 2);
    g.add(front);
  }
  // Arched roof: half cylinder along z, ribs and a golden ridge.
  const r = w / 2;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d, 18, 1, true, -Math.PI / 2, Math.PI), glass);
  roof.rotation.x = Math.PI / 2;
  roof.scale.set(1, 1, 0.55);
  roof.position.y = h;
  g.add(roof);
  for (const z of [-d / 2, -d / 6, d / 6, d / 2]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 4, 18, Math.PI), z === d / 2 || z === -d / 2 ? trimMat : frameMat);
    rib.scale.set(1, 0.55, 1);
    rib.position.set(0, h, z);
    g.add(rib);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, d + 0.2), trimMat);
  ridge.position.y = h + r * 0.55;
  g.add(ridge);
  for (const sx of [-1, 1]) {
    const eave = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, d + 0.2), trimMat);
    eave.position.set((sx * w) / 2, h, 0);
    g.add(eave);
  }
  return g;
}

/** Conveyor belt along +x of the given length. `update(dt)` scrolls the rollers. */
export function conveyor(length) {
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: 0x6b7a8f });
  const belt = new THREE.MeshLambertMaterial({ color: 0x2f3542 });
  const legMat = new THREE.MeshLambertMaterial({ color: 0x4b5566 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 0.7), belt);
  body.position.y = 0.62;
  body.receiveShadow = true;
  g.add(body);
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.08), frame);
    rail.position.set(0, 0.66, sz * 0.39);
    g.add(rail);
  }
  const stripes = [];
  const stripeGeo = new THREE.BoxGeometry(0.06, 0.01, 0.62);
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0x55607a });
  const count = Math.floor(length / 0.4);
  for (let i = 0; i < count; i++) {
    const s = new THREE.Mesh(stripeGeo, stripeMat);
    s.position.set(-length / 2 + i * 0.4, 0.685, 0);
    g.add(s);
    stripes.push(s);
  }
  for (const x of [-length / 2 + 0.3, 0, length / 2 - 0.3]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), legMat);
      leg.position.set(x, 0.3, sz * 0.3);
      leg.castShadow = true;
      g.add(leg);
    }
  }
  g.userData.update = (dt, speed) => {
    for (const s of stripes) {
      s.position.x += speed * dt;
      if (s.position.x > length / 2) s.position.x -= count * 0.4;
    }
  };
  return g;
}

/** Text drawn on a canvas, for signs and ground labels. */
export function textTexture(text, { w = 512, h = 128, font = 'Lilita One', size = 84, color = '#fff', stroke = 'rgba(0,0,0,0.35)', bg = null, radius = 28 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, radius);
    ctx.fill();
  }
  ctx.font = `${size}px "${font}", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = size * 0.14;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, w / 2, h / 2 + size * 0.05);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Flat ground marker (dashed rounded square with an icon) showing where to stand. */
export function groundMat(icon, { size = 2.4, color = '#ffffff', fill = 'rgba(255,255,255,0.22)' } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(14, 14, 228, 228, 36);
  ctx.fill();
  ctx.setLineDash([26, 16]);
  ctx.lineWidth = 12;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (icon === 'drop') {
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(128, 64); ctx.lineTo(128, 170);
    ctx.moveTo(84, 128); ctx.lineTo(128, 174); ctx.lineTo(172, 128);
    ctx.stroke();
  } else if (icon === 'cash') {
    ctx.font = '150px "Lilita One", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 128, 138);
  } else if (icon === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 36 : 82;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(128 + Math.cos(a) * r, 132 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else if (icon === 'up') {
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(128, 186); ctx.lineTo(128, 80);
    ctx.moveTo(84, 124); ctx.lineTo(128, 78); ctx.lineTo(172, 124);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.position.y = 0.03;
  mesh.renderOrder = 1;
  return mesh;
}

/** First mesh's geometry and material in a loaded model (for instancing single-mesh props). */
export function meshParts(object) {
  let found = null;
  object.traverse((o) => { if (!found && o.isMesh) found = o; });
  return { geometry: found.geometry, material: found.material };
}

/** A sign on two posts with text, origin on the ground. */
export function signBoard(text, { width = 2.4, height = 0.6, bg = '#7a4a26', color = '#fff6d8' } = {}) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.08),
    [wood, wood, wood, wood, new THREE.MeshBasicMaterial({ map: textTexture(text, { bg, color, w: 512, h: Math.round((512 * height) / width), size: 64 }) }), wood],
  );
  board.position.y = 1.5;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), wood);
    post.position.set((sx * width) / 2.4, 0.75, -0.02);
    post.castShadow = true;
    g.add(post);
  }
  board.castShadow = true;
  g.add(board);
  return g;
}
