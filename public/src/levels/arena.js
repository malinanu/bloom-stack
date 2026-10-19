// Farm levels: "Mow the shape". A fresh field per level (shape, colour pattern, rocks, cart), mowed by the
// same gardener, stack and flowers as the garden. Win by mowing every flower before the timer runs out.
import * as THREE from 'three';
import { addLights, makeGround, followSun, CameraRig, instanced } from '../farm/world.js';
import { Flowers, TYPE_COLOR } from '../farm/flowers.js';
import { Player } from '../farm/player.js';
import { Stack } from '../farm/stack.js';
import { Guide } from '../farm/guide.js';
import { bunchGeometry, makeFlowerMaterial, groundMat } from '../farm/models.js';
import { SHAPES } from './shapes.js';
import { Particles, PALETTES } from '../fx/particles.js';
import { Flyers } from '../fx/flyers.js';
import { Tweens, ease } from '../core/tween.js';
import { FLOWER_TYPES } from '../core/economy.js';

const UNLOAD_INTERVAL = 0.03;
const HUNT_SHARE = 0.08; // sparkle the last 8% of flowers
const NO_MOVE = { x: 0, z: 0 };

/** Darker ground under the field in the level's shape, so the picture reads even once it is mowed. */
function shapeDecal(shape, radius) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const inside = SHAPES[shape];
  const span = 1.3; // the decal covers u, v in [-1.3, 1.3]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size * 2 - 1) * span;
      const v = ((y + 0.5) / size * 2 - 1) * span;
      if (!inside(u, v)) continue;
      const i = (y * size + x) * 4;
      img.data[i] = 112; img.data[i + 1] = 168; img.data[i + 2] = 64; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * span * 2, radius * span * 2).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.position.y = 0.012;
  mesh.receiveShadow = true;
  return mesh;
}

export class Arena {
  /**
   * @param {{ assets: import('../core/assets.js').Assets, sfx: object, input: import('../core/input.js').Input,
   *   onWin: (r: { timeLeft: number }) => void, onFail: () => void, lowFx?: boolean }} o
   */
  constructor({ assets, sfx, input, onWin, onFail, lowFx = false }) {
    this.assets = assets;
    this.sfx = sfx;
    this.input = input;
    this.onWin = onWin;
    this.onFail = onFail;
    this.scene = new THREE.Scene();
    this.sun = addLights(this.scene, lowFx);
    this.scene.add(makeGround());
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 220);
    this.rig = new CameraRig(this.camera, { minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
    this.particles = new Particles(this.scene);
    this.flyers = new Flyers(this.scene);
    const flowerMat = makeFlowerMaterial({ side: THREE.DoubleSide });
    for (const type of FLOWER_TYPES) this.flyers.addKind(`bunch-${type}`, bunchGeometry(type), flowerMat, { max: 60, color: TYPE_COLOR[type] });
    this.tweens = new Tweens();
    this.player = new Player(this.scene, assets, { bounds: this.rig.bounds, colliders: [], start: { x: 0, z: 6 } });
    this.stack = new Stack(this.scene);
    this.guide = new Guide(this.scene);

    // The cart: a crate on a drop mat at the field's edge (only used when the stack can't hold the field).
    this.cart = new THREE.Group();
    const crate = assets.prop('crate', 0.55);
    crate.position.set(1.25, 0, 0);
    this.cart.add(crate);
    this.cartMat = groundMat('drop', { size: 2.3 });
    this.cart.add(this.cartMat);
    this.scene.add(this.cart);

    this.level = []; // per-level objects to remove on the next start
    this.flowers = null;
    this.state = 'idle'; // idle | ready | playing | won | failed
    this.time = 0;
    this.timeScale = 1;
    this.aspect = 1;
  }

  resize(aspect) {
    this.aspect = aspect;
    this.rig.resize(aspect);
  }

  clearLevel() {
    this.flowers?.dispose();
    this.flowers = null;
    for (const o of this.level) {
      this.scene.remove(o);
      if (o.isInstancedMesh) o.dispose(); // shares the KayKit geometry: free only the instance buffers
      else {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      }
    }
    this.level = [];
    this.particles.clear();
  }

  add(o) {
    this.scene.add(o);
    this.level.push(o);
    return o;
  }

  /** Build the level's field and put the gardener at the entrance. Play starts with begin(). */
  start(def) {
    this.clearLevel();
    const f = def.farm;
    const field = f.field;
    this.def = def;
    this.flowers = new Flowers(this.scene, field.slots, { regrow: false, seed: def.n * 13 + 1 });
    this.add(shapeDecal(f.shape, f.radius));

    // Hedge around the play area, trees beyond it.
    const b = field.bounds;
    const hedge = [];
    for (let x = b.minX - 0.8; x <= b.maxX + 0.8; x += 1.25) { hedge.push({ x, z: b.minZ - 0.8, s: 2.8, rot: x * 1.7 }); hedge.push({ x, z: b.maxZ + 0.8, s: 2.8, rot: x * 2.3 }); }
    for (let z = b.minZ; z <= b.maxZ; z += 1.25) { hedge.push({ x: b.minX - 0.8, z, s: 2.8, rot: z * 1.3 }); hedge.push({ x: b.maxX + 0.8, z, s: 2.8, rot: z * 1.9 }); }
    this.add(instanced(this.assets.gltf.bush2.scene, hedge));
    this.add(instanced(this.assets.gltf.bush4.scene, hedge.filter((_, i) => i % 3 === 0).map((h) => ({ ...h, y: 0.15 }))));
    const trees = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (Math.sin(a) > 0.2) continue; // nothing on the camera side (+z) to block the view
      const r = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.5 + 5 + (i % 3) * 2;
      trees.push({ x: Math.cos(a) * r, z: Math.sin(a) * r + (b.minZ + b.maxZ) / 2, s: 1.1 + (i % 4) * 0.15, rot: i });
    }
    this.add(instanced(this.assets.gltf.tree1.scene, trees.filter((_, i) => i % 2 === 0)));
    this.add(instanced(this.assets.gltf.tree2.scene, trees.filter((_, i) => i % 2 === 1)));

    // Obstacles block the gardener.
    const colliders = [];
    const rocks = field.obstacles.filter((o) => o.kind === 'rock');
    const bushes = field.obstacles.filter((o) => o.kind === 'bush');
    if (rocks.length) this.add(instanced(this.assets.gltf.rock1.scene, rocks.map((o, i) => ({ x: o.x, z: o.z, s: 1.6, rot: i * 2.1 }))));
    if (bushes.length) this.add(instanced(this.assets.gltf.bush2.scene, bushes.map((o, i) => ({ x: o.x, z: o.z, s: 2.2, rot: i * 1.3 }))));
    for (const o of field.obstacles) colliders.push([o.x - 0.45, o.z - 0.45, o.x + 0.45, o.z + 0.45]);

    // Sand patch at the entrance, with the cart when this level needs it.
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.4).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xead9ac }));
    sand.position.set(0, 0.008, field.start.z - 0.6);
    sand.receiveShadow = true;
    this.add(sand);
    this.useCart = f.capacity < f.count;
    this.cart.visible = this.useCart;
    this.cart.position.set(field.cart.x, 0, field.cart.z);

    this.player.bounds = b;
    this.player.colliders = colliders;
    this.player.teleport(field.start.x, field.start.z);
    this.stack.load([]);
    this.stack.capacity = f.capacity;
    this.speed = f.speed;
    this.reach = f.reach;
    this.rig.bounds = b;
    this.rig.resize(this.aspect);
    this.rig.snap(this.player.pos);
    this.timeLimit = f.timeLimit;
    this.timeLeft = f.timeLimit;
    this.delivered = 0;
    this.unloadTimer = 0;
    this.huntTimer = 0;
    this.timeScale = 1;
    this.state = 'ready';
    this.guide.set(null);
  }

  /** The intro banner is gone: the clock starts. */
  begin() {
    if (this.state === 'ready') this.state = 'playing';
  }

  /** Rewarded continue after running out of time. */
  addTime(seconds) {
    this.timeLeft += seconds;
    this.state = 'playing';
  }

  get progress() {
    return this.flowers ? this.flowers.cutCount / Math.max(1, this.flowers.total) : 0;
  }

  get remaining() {
    return this.flowers ? this.flowers.remaining() : 0;
  }

  harvest() {
    const p = this.player;
    if (p.vel.lengthSq() < 0.25) return;
    const cut = p.cutPoint();
    const from = new THREE.Vector3();
    const n = this.flowers.harvest(cut.x, cut.z, this.reach, this.stack.space, (type, x, z) => {
      from.set(x, 0.6, z);
      this.stack.push(type, from);
      if (Math.random() < 0.5) this.particles.burst(from, { count: 3, palette: PALETTES[type], speed: 1.6, up: 2.5, size: 0.09, life: 0.6 });
    });
    if (n > 0) {
      this.sfx.snip();
      p.swing();
    }
  }

  unload(dt) {
    const p = this.player.pos;
    const c = this.def.farm.field.cart;
    if (!this.useCart || this.stack.count === 0 || Math.hypot(p.x - c.x, p.z - c.z) > c.r) return;
    this.unloadTimer -= dt;
    while (this.unloadTimer <= 0) {
      const item = this.stack.pop();
      if (!item) break;
      this.delivered++;
      const to = new THREE.Vector3(c.x + 1.25, 0.5 + Math.random() * 0.2, c.z);
      this.flyers.launch(`bunch-${item.type}`, item.pos, to, { dur: 0.25, arc: 0.9, onArrive: () => this.sfx.tick(1.3) });
      this.unloadTimer += UNLOAD_INTERVAL;
    }
  }

  /** The last few flowers sparkle and the arrow points to the nearest one. */
  hunt(dt) {
    const left = this.remaining;
    const p = this.player.pos;
    if (this.stack.full && this.useCart) {
      const c = this.def.farm.field.cart;
      this.guide.set({ x: c.x, z: c.z, r: 1.2 });
      return;
    }
    if (left > 0 && left <= Math.max(3, this.flowers.total * HUNT_SHARE)) {
      const near = this.flowers.nearestGrown(p.x, p.z, FLOWER_TYPES, 1);
      this.guide.set(near && near.dist > 1.6 ? { x: near.x, z: near.z, r: 0.7 } : null);
      this.huntTimer -= dt;
      if (this.huntTimer <= 0) {
        this.huntTimer = 0.45;
        let k = 0;
        const pos = new THREE.Vector3();
        this.flowers.forEachGrown((x, z) => {
          if (k++ > 24) return;
          this.particles.burst(pos.set(x, 0.9, z), { count: 2, palette: PALETTES.cash, speed: 0.6, up: 1.6, size: 0.09, life: 0.6, gravity: 2 });
        });
      }
      return;
    }
    this.guide.set(null);
  }

  win() {
    this.state = 'won';
    this.guide.set(null);
    this.sfx.unlockFanfare();
    this.player.cheer();
    const at = this.player.pos.clone().setY(1);
    this.particles.burst(at, { count: 90, palette: PALETTES.confetti, speed: 6, up: 9, size: 0.18, life: 1.8, spread: 1.5 });
    // A beat of slow motion and a camera push-in: the clip moment.
    this.timeScale = 0.3;
    const d0 = this.rig.distance;
    this.tweens.to(0.35, (t) => { this.rig.distance = d0 * (1 - 0.3 * t); }, {
      ease: ease.outCubic,
      onDone: () => {
        this.timeScale = 1;
        this.tweens.to(0.8, () => {}, { onDone: () => this.onWin({ timeLeft: this.timeLeft }) });
      },
    });
  }

  update(realDt, active) {
    const dt = realDt * this.timeScale;
    this.time += dt;
    const playing = this.state === 'playing';
    this.player.update(dt, playing && active ? this.input.move : NO_MOVE, this.speed);
    if (playing) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.harvest();
      this.unload(dt);
      this.hunt(dt);
      if (this.remaining === 0) this.win();
      else if (this.timeLeft <= 0) {
        this.state = 'failed';
        this.guide.set(null);
        this.sfx.gameOver();
        this.onFail();
      }
    }
    this.stack.update(dt, this.player);
    this.flowers?.update(dt);
    this.guide.update(dt, this.player.pos);
    this.particles.update(dt);
    this.flyers.update(dt);
    this.tweens.update(realDt);
    this.cartMat.material.opacity = 0.75 + Math.sin(this.time * 4) * 0.25;
    followSun(this.sun, this.rig.focus);
    const p = this.player;
    const lead = new THREE.Vector3(p.vel.x * 0.25, 0, p.vel.z * 0.25 - Math.min(this.stack.count, 60) * 0.012);
    this.rig.update(realDt, p.pos, lead);
  }
}
