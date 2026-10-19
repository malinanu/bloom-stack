// Flower Tower: the one-tap mode. A flower-bed slab slides over the tower; tap to drop it.
// Overhang is sliced off and falls; a perfect drop keeps the full size.
// Endless mode: one miss ends the run. Level mode (start(config)): reach the target height; hearts allow
// misses, and twists (gold, wind, shrink, sides, blink) change the rules.
import * as THREE from 'three';
import { BASE_SIZE, dropLayer, slideSpeed, slidePosition, windFactor } from './stackMath.js';
import { mulberry32 } from '../levels/levels.js';
import { ease } from '../core/tween.js';
import { PALETTES } from '../fx/particles.js';

const LAYER_H = 0.42;
const RANGE = 4.2;
const TILE = 0.9; // world size of one repeat of the flower-carpet texture
const GOLD = 0xffc93c;

const ENDLESS = { target: Infinity, baseSize: BASE_SIZE, speedMul: 1, hearts: 1, twists: [], goldEvery: 5, wind: 0.4, seed: 1 };

function carpetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9e9e9';
  ctx.fillRect(0, 0, 128, 128);
  const flower = (x, y, r) => {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe58a';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  };
  const spots = [[20, 22, 9], [70, 16, 8], [108, 40, 9], [44, 60, 10], [92, 84, 9], [18, 96, 8], [62, 110, 9], [118, 118, 7], [2, 60, 6]];
  for (const [x, y, r] of spots) {
    for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) flower(x + ox, y + oy, r);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Box with world-aligned UVs on the top face so the carpet pattern stays continuous when sliced. */
function slabGeometry(w, d, cx, cz) {
  const geo = new THREE.BoxGeometry(w, LAYER_H, d);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  // BoxGeometry faces: +x, −x, +y, −y, +z, −z with 4 vertices each; +y is vertices 8..11.
  for (let i = 8; i < 12; i++) uv.setXY(i, (pos.getX(i) + cx) / TILE, (pos.getZ(i) + cz) / TILE);
  uv.needsUpdate = true;
  return geo;
}

function layerColor(i) {
  // Pink → red → lilac → peach, cycling gently as the tower grows.
  const stops = [0xff5c9a, 0xe0233a, 0xf08ad8, 0xb17bff, 0xffa55c, 0xffd23f, 0xff5c9a];
  const t = (i * 0.07) % (stops.length - 1);
  const a = Math.floor(t);
  return new THREE.Color(stops[a]).lerp(new THREE.Color(stops[a + 1]), t - a);
}

const SKY = [[0, 0xffe3ec], [20, 0xd9d4ff], [45, 0xa9c8ff], [80, 0x5d6fd6], [130, 0x241f5c]];
function skyColor(h, out) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, c0] = SKY[i];
    const [h1, c1] = SKY[i + 1];
    if (h <= h1 || i === SKY.length - 2) {
      const t = THREE.MathUtils.clamp((h - h0) / (h1 - h0), 0, 1);
      return out.setHex(c0).lerp(new THREE.Color(c1), t);
    }
  }
  return out;
}

export class Tower {
  /**
   * @param {{ sfx: import('../core/audio.js').Sfx, particles: import('../fx/particles.js').Particles, tweens: import('../core/tween.js').Tweens,
   *   onScore?: (n: number) => void, onPerfect?: (combo: number, total: number) => void, onGameOver?: (height: number) => void,
   *   onWin?: (r: { height: number, perfects: number }) => void, onHeart?: (left: number) => void, onGold?: () => void }} o
   */
  constructor({ sfx, particles, tweens, onScore, onPerfect, onGameOver, onWin, onHeart, onGold }) {
    this.sfx = sfx;
    this.particles = particles;
    this.tweens = tweens;
    this.cb = { onScore, onPerfect, onGameOver, onWin, onHeart, onGold };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY[0][1]);
    this.camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8e8, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(-4, 10, 6);
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.carpet = carpetTexture();
    this.root = new THREE.Group();
    this.scene.add(this.root);

    // Terracotta pot under the tower, on a grassy island.
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 1.7, 2.2, 24), new THREE.MeshLambertMaterial({ color: 0xc8643c }));
    pot.position.y = -LAYER_H / 2 - 1.1;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, 0.35, 24), new THREE.MeshLambertMaterial({ color: 0xd9784e }));
    rim.position.y = -LAYER_H / 2 - 0.17;
    const island = new THREE.Mesh(new THREE.CylinderGeometry(5, 4.2, 1.2, 28), new THREE.MeshLambertMaterial({ color: 0x8cc957 }));
    island.position.y = -LAYER_H / 2 - 2.8;
    this.scene.add(pot, rim, island);

    // Goal line for levels: a golden frame at the target height with a flag.
    this.goal = new THREE.Group();
    const goalMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85 });
    for (const [w, d, x, z] of [[4.2, 0.08, 0, 2.1], [4.2, 0.08, 0, -2.1], [0.08, 4.2, 2.1, 0], [0.08, 4.2, -2.1, 0]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), goalMat);
      bar.position.set(x, 0, z);
      this.goal.add(bar);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    pole.position.set(2.1, 0.6, 2.1);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshBasicMaterial({ color: 0xff5c9a, side: THREE.DoubleSide }));
    flag.position.set(2.4, 1.0, 2.1);
    this.goal.add(pole, flag);
    this.goal.visible = false;
    this.scene.add(this.goal);

    this.layers = []; // { box: {x,z,w,d}, mesh, y, gold }
    this.falling = []; // { mesh, vx, vy, vz, rx, rz }
    this.moving = null;
    this.camY = 0;
    this.state = 'idle'; // idle | playing | dropping | respawn | won | over
    this.combo = 0;
    this.perfects = 0;
    this.revived = false;
    this.aspect = 1;
    this.time = 0;
    this.config = ENDLESS;
    this.hearts = 1;
  }

  get height() {
    return this.layers.length - 1;
  }

  has(twist) {
    return this.config.twists.includes(twist);
  }

  resize(aspect) {
    this.aspect = aspect;
    const cam = this.camera;
    // Keep the slide range visible in portrait, and the stack tall enough in landscape.
    const viewW = aspect < 1 ? 9.5 : Math.max(11, 13 * aspect);
    const viewH = Math.max(viewW / aspect, 12);
    const w = Math.max(viewW, viewH * aspect);
    const h = w / aspect;
    cam.left = -w / 2; cam.right = w / 2; cam.top = h / 2; cam.bottom = -h / 2;
    cam.updateProjectionMatrix();
  }

  isGold(index) {
    return this.has('gold') && index >= 3 && index % this.config.goldEvery === 0;
  }

  makeLayerMesh(box, y, index) {
    const gold = this.isGold(index);
    const color = gold ? new THREE.Color(GOLD) : layerColor(index);
    const side = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.72), emissive: gold ? 0x6b4a00 : 0x000000 });
    const top = new THREE.MeshLambertMaterial({ color, map: this.carpet, emissive: gold ? 0x7a5600 : 0x000000 });
    const mesh = new THREE.Mesh(slabGeometry(box.w, box.d, box.x, box.z), [side, side, top, side, side, side]);
    mesh.position.set(box.x, y, box.z);
    this.root.add(mesh);
    return mesh;
  }

  clear() {
    for (const l of this.layers) this.disposeMesh(l.mesh);
    for (const f of this.falling) this.disposeMesh(f.mesh);
    if (this.moving) this.disposeMesh(this.moving.mesh);
    this.layers = [];
    this.falling = [];
    this.moving = null;
  }

  disposeMesh(mesh) {
    this.root.remove(mesh);
    mesh.geometry.dispose();
    for (const m of mesh.material) m.dispose();
  }

  /** Start a run. No config = endless mode (as before); a level passes its tower config. */
  start(config = null) {
    this.clear();
    this.config = { ...ENDLESS, ...(config || {}) };
    this.rand = mulberry32(this.config.seed);
    const s = this.config.baseSize;
    const base = { x: 0, z: 0, w: s, d: s };
    this.layers.push({ box: base, mesh: this.makeLayerMesh(base, 0, 0), y: 0 });
    this.combo = 0;
    this.perfects = 0;
    this.hearts = this.config.hearts;
    this.revived = false;
    this.camY = 0;
    this.state = 'playing';
    this.goal.visible = Number.isFinite(this.config.target);
    if (this.goal.visible) this.goal.position.y = this.config.target * LAYER_H + LAYER_H / 2 + 0.02;
    this.spawn();
    this.cb.onScore?.(0);
  }

  spawn() {
    const top = this.layers[this.layers.length - 1];
    const axis = this.layers.length % 2 === 1 ? 'x' : 'z';
    const box = { ...top.box };
    if (this.has('shrink')) {
      box.w = Math.max(0.8, box.w * 0.97);
      box.d = Math.max(0.8, box.d * 0.97);
    }
    const y = top.y + LAYER_H;
    // "Both sides" twist: start from either end of the slide.
    const fromFar = this.has('sides') && this.rand() < 0.5;
    this.moving = {
      axis, box, y,
      travelled: fromFar ? RANGE * 2 : 0,
      mesh: this.makeLayerMesh(box, y, this.layers.length),
      center: top.box[axis],
      age: 0,
    };
    this.place(this.moving);
  }

  place(m) {
    m.box[m.axis] = slidePosition(m.center, RANGE, m.travelled);
    m.mesh.position.set(m.box.x, m.y, m.box.z);
  }

  /** Player tapped. */
  tap() {
    if (this.state !== 'playing' || !this.moving) return;
    const m = this.moving;
    const top = this.layers[this.layers.length - 1];
    const res = dropLayer(top.box, m.box, m.axis, this.combo, { maxSize: this.config.baseSize });
    this.disposeMesh(m.mesh);
    this.moving = null;

    if (res.result === 'miss') {
      this.addFalling(m.box, m.y, m.axis, Math.sign(m.box[m.axis] - top.box[m.axis]) || 1);
      this.combo = 0;
      this.hearts--;
      if (this.hearts > 0) {
        // Lose a heart; the same layer slides in again.
        this.sfx.error();
        this.cb.onHeart?.(this.hearts);
        this.state = 'respawn';
        this.tweens.to(0.55, () => {}, { onDone: () => { if (this.state === 'respawn') { this.state = 'playing'; this.spawn(); } } });
        return;
      }
      this.state = 'dropping';
      this.sfx.gameOver();
      this.tweens.to(0.9, () => {}, { onDone: () => { this.state = 'over'; this.cb.onGameOver?.(this.height); } });
      return;
    }

    this.combo = res.combo;
    const index = this.layers.length;
    const gold = this.isGold(index);
    const mesh = this.makeLayerMesh(res.layer, m.y, index);
    this.layers.push({ box: res.layer, mesh, y: m.y, gold });
    // Land with a little squash.
    mesh.scale.set(1, 0.6, 1);
    this.tweens.to(0.25, (t) => mesh.scale.set(1, 0.6 + 0.4 * t, 1), { ease: ease.outBack });

    if (res.result === 'perfect') {
      this.perfects++;
      this.sfx.perfect(this.combo);
      this.cb.onPerfect?.(this.combo, this.perfects);
      this.perfectRing(res.layer, m.y);
      this.particles.burst(new THREE.Vector3(res.layer.x, m.y + 0.3, res.layer.z), {
        count: 14 + Math.min(this.combo, 10) * 2, palette: PALETTES.confetti, speed: 3.5, up: 4, size: 0.16, life: 0.9, spread: res.layer.w * 0.5,
      });
      if (gold) {
        this.sfx.cash();
        this.particles.burst(new THREE.Vector3(res.layer.x, m.y + 0.4, res.layer.z), { count: 26, palette: PALETTES.cash, speed: 4, up: 5, size: 0.18, life: 1 });
        this.cb.onGold?.();
      }
    } else {
      this.sfx.slice();
      this.sfx.place(index);
      if (res.cut) this.addFalling(res.cut, m.y, m.axis, Math.sign(m.box[m.axis] - top.box[m.axis]));
    }
    this.cb.onScore?.(this.height);

    if (this.height >= this.config.target) {
      this.state = 'won';
      this.goal.visible = false;
      this.sfx.unlockFanfare();
      this.particles.burst(new THREE.Vector3(res.layer.x, m.y + 0.6, res.layer.z), { count: 90, palette: PALETTES.confetti, speed: 6, up: 8, size: 0.2, life: 1.6, spread: 2 });
      this.tweens.to(0.9, () => {}, { onDone: () => this.cb.onWin?.({ height: this.height, perfects: this.perfects }) });
      return;
    }
    this.spawn();
  }

  addFalling(box, y, axis, sign) {
    const mesh = this.makeLayerMesh(box, y, this.layers.length);
    this.falling.push({
      mesh,
      vx: axis === 'x' ? sign * 1.6 : 0,
      vz: axis === 'z' ? sign * 1.6 : 0,
      vy: 1.2,
      rx: axis === 'z' ? sign * 2.2 : 0,
      rz: axis === 'x' ? -sign * 2.2 : 0,
    });
  }

  perfectRing(box, y) {
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(box.w + 0.3, box.d + 0.3).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    ring.position.set(box.x, y + LAYER_H / 2 + 0.02, box.z);
    this.root.add(ring);
    this.tweens.to(0.45, (t) => {
      ring.scale.setScalar(1 + t * 0.35);
      ring.material.opacity = 0.7 * (1 - t);
    }, { onDone: () => { this.root.remove(ring); ring.geometry.dispose(); ring.material.dispose(); } });
  }

  /** Continue after the run ended (rewarded ad): one more heart, a fresh slab at the current size. */
  revive() {
    this.revived = true;
    for (const f of this.falling) this.disposeMesh(f.mesh);
    this.falling = [];
    this.hearts = 1;
    this.state = 'playing';
    this.combo = 0;
    this.goal.visible = Number.isFinite(this.config.target);
    this.spawn();
  }

  update(dt) {
    this.time += dt;
    const h = this.height;
    const m = this.moving;
    if (this.state === 'playing' && m) {
      const wind = this.has('wind') ? windFactor(this.time, this.config.wind) : 1;
      m.travelled += slideSpeed(h, this.config.speedMul) * wind * dt;
      m.age += dt;
      this.place(m);
      // Blink twist: the slab flickers out of sight for a moment each pass.
      if (this.has('blink')) m.mesh.visible = (m.age % 1.3) < 0.85 || (m.age % 0.1) < 0.03;
    }
    for (const f of this.falling) {
      f.vy -= 14 * dt;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.position.z += f.vz * dt;
      f.mesh.rotation.x += f.rx * dt;
      f.mesh.rotation.z += f.rz * dt;
    }
    const dead = this.falling.filter((f) => f.mesh.position.y < this.camY - 25);
    for (const f of dead) this.disposeMesh(f.mesh);
    if (dead.length) this.falling = this.falling.filter((f) => !dead.includes(f));

    // Camera rises with the tower; isometric angle like the original Stack.
    const topY = this.layers.length ? this.layers[this.layers.length - 1].y : 0;
    const showAll = this.state === 'over' || this.state === 'won';
    const wantY = showAll ? topY * 0.5 : topY;
    this.camY += (wantY - this.camY) * Math.min(1, dt * 4);
    const cam = this.camera;
    cam.position.set(10, this.camY + 9.5, 10);
    cam.lookAt(0, this.camY - 1.2, 0);
    if (showAll) {
      // Zoom out to show off the whole tower.
      const want = Math.max(1, (topY + 6) / 12);
      cam.zoom += (1 / want - cam.zoom) * Math.min(1, dt * 3);
      cam.updateProjectionMatrix();
    } else if (cam.zoom !== 1) {
      cam.zoom = 1;
      cam.updateProjectionMatrix();
    }
    this.goal.children[5].rotation.y = Math.sin(this.time * 4) * 0.25;
    this.sun.position.set(-4, this.camY + 10, 6);
    this.sun.target.position.set(0, this.camY, 0);
    skyColor(h, this.scene.background);
  }
}
