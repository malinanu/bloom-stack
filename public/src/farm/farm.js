// Farm mode: wires the world, flowers, gardener, stack, stations and unlock pads into the idle-arcade loop.
import * as THREE from 'three';
import { World, CameraRig } from './world.js';
import { Flowers, slotsFromFields } from './flowers.js';
import { Player } from './player.js';
import { Stack } from './stack.js';
import { Stations } from './stations.js';
import { Unlocks } from './unlocks.js';
import { Guide } from './guide.js';
import { FIELDS, STATION, COUNTER, UPGRADE_STAND, TOWER_STAND } from './layout.js';
import { bunchGeometry, bouquetGeometry, makeFlowerMaterial, meshParts, signBoard, groundMat } from './models.js';
import { TYPE_COLOR } from './flowers.js';
import { Particles, PALETTES } from '../fx/particles.js';
import { Flyers } from '../fx/flyers.js';
import { Tweens } from '../core/tween.js';
import { FLOWER_TYPES, BOOST, upgradeValue, upgradeCost, flowerTypesFor } from '../core/economy.js';
import { t } from '../core/i18n.js';

const FIELD_FOR_UNLOCK = { field2: 'field2', rose: 'roseBeds', peony: 'peonyBeds' };

export class Farm {
  /**
   * @param {{ assets: import('../core/assets.js').Assets, state: object, sfx: object, hud: import('../ui/hud.js').Hud,
   *   floaters: import('../ui/floaters.js').Floaters, platform: object, input: import('../core/input.js').Input,
   *   save: (now?: boolean) => void, onZone: (zone: string|null) => void, lowFx?: boolean }} o
   */
  constructor({ assets, state, sfx, hud, floaters, platform, input, save, onZone, lowFx = false }) {
    this.state = state;
    this.sfx = sfx;
    this.hud = hud;
    this.input = input;
    this.onZone = onZone;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 220);
    this.rig = new CameraRig(this.camera);
    this.world = new World(this.scene, assets, { lowFx });
    this.particles = new Particles(this.scene);
    this.flyers = new Flyers(this.scene);
    this.tweens = new Tweens();
    this.time = 0;
    this.boostUntil = 0;
    this.zone = null;
    this.fullHintCooldown = 0;
    this.guideTimer = 0;

    const flowerMat = makeFlowerMaterial({ side: THREE.DoubleSide });
    for (const type of FLOWER_TYPES) {
      this.flyers.addKind(`bunch-${type}`, bunchGeometry(type), flowerMat, { max: 60, color: TYPE_COLOR[type] });
      this.flyers.addKind(`bouquet-${type}`, bouquetGeometry(type), flowerMat, { max: 20, color: TYPE_COLOR[type] });
    }
    const coin = meshParts(assets.gltf.coin.scene);
    this.flyers.addKind('coin', coin.geometry, coin.material, { max: 90, scale: 0.34 });

    this.flowers = new Flowers(this.scene, slotsFromFields(FIELDS, state.unlocked));
    this.player = new Player(this.scene, assets);
    this.stack = new Stack(this.scene);
    this.stack.load(state.stack);
    this.applyUpgrades();

    // Everything the stations and pads need, in one place.
    this.game = {
      state,
      sfx,
      hud,
      floaters,
      platform,
      particles: this.particles,
      flyers: this.flyers,
      tweens: this.tweens,
      player: this.player,
      stack: this.stack,
      save,
      boosted: () => this.time < this.boostUntil,
      addCash: (n, at) => this.addCash(n, at),
      shake: (a) => { this.rig.shake = Math.max(this.rig.shake, a); },
      onUnlock: (id, at) => this.onUnlock(id, at),
    };
    this.stations = new Stations(this.scene, assets, this.game);
    this.unlocks = new Unlocks(this.scene, assets, this.game);
    this.guide = new Guide(this.scene);
    this.buildTowerStand(assets);

    this.rig.snap(this.player.pos);
    this.lastStackCount = -1;
    hud.setCash(state.cash, true);
  }

  buildTowerStand(assets) {
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.35, 16), new THREE.MeshLambertMaterial({ color: 0xc8643c }));
    plinth.position.y = 0.17;
    plinth.castShadow = true;
    g.add(plinth);
    const colors = [0xff5c9a, 0xe0233a, 0xf08ad8, 0xb17bff, 0xffa55c, 0xffd23f];
    colors.forEach((c, i) => {
      const s = 0.95 - i * 0.04;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(s, 0.2, s), new THREE.MeshLambertMaterial({ color: c }));
      slab.position.set((i % 2 ? 0.05 : -0.04), 0.45 + i * 0.2, (i % 3 ? 0.03 : -0.05));
      slab.castShadow = true;
      g.add(slab);
    });
    const sign = signBoard('FLOWER TOWER', { width: 2.4, height: 0.55, bg: '#b8327a' });
    sign.position.set(0, 0.4, -0.45);
    sign.scale.setScalar(0.9);
    g.add(sign);
    const lantern = assets.prop('lantern', 0.8);
    lantern.position.set(1.1, 0, 0.2);
    g.add(lantern);
    g.position.set(TOWER_STAND.x, 0, TOWER_STAND.z);
    this.scene.add(g);
    this.towerStand = g;
    const mat = groundMat('star', { size: 2.3, color: '#ffe3f2', fill: 'rgba(255,120,190,0.25)' });
    mat.position.set(TOWER_STAND.zone.x, 0.03, TOWER_STAND.zone.z);
    this.scene.add(mat);
  }

  applyUpgrades() {
    const u = this.state.upgrades;
    this.stack.capacity = upgradeValue('capacity', u.capacity);
    this.speed = upgradeValue('speed', u.speed);
    this.reach = upgradeValue('reach', u.reach);
  }

  /** @returns {'ok' | 'max' | 'poor'} */
  buyUpgrade(key) {
    const s = this.state;
    const cost = upgradeCost(key, s.upgrades[key]);
    if (cost === null) return 'max';
    if (s.cash < cost) {
      this.sfx.error();
      return 'poor';
    }
    s.cash -= cost;
    s.upgrades[key]++;
    this.applyUpgrades();
    this.hud.setCash(s.cash);
    this.sfx.buy();
    this.particles.burst(this.player.pos.clone().setY(1.2), { count: 24, palette: PALETTES.confetti, speed: 3, up: 5, size: 0.12, life: 0.9 });
    this.game.save(true);
    return 'ok';
  }

  startBoost() {
    this.boostUntil = this.time + BOOST.seconds;
    this.sfx.unlockFanfare();
    this.particles.burst(this.player.pos.clone().setY(1.5), { count: 30, palette: PALETTES.cash, speed: 3, up: 5, size: 0.14, life: 1 });
  }

  boostRemaining() {
    return Math.max(0, this.boostUntil - this.time);
  }

  addCash(n, at) {
    this.state.cash += n;
    this.hud.setCash(this.state.cash);
    if (at) this.game.floaters.spawn(`+$${n}`, at, 'cash big');
    this.game.save();
  }

  onUnlock(id, at) {
    const field = FIELD_FOR_UNLOCK[id];
    if (field) this.flowers.unlockField(field, at);
    if (id === 'rose' || id === 'peony') this.hud.toast(`${id === 'rose' ? 'Roses' : 'Peonies'} unlocked! Worth ${id === 'rose' ? 3 : 6}× tulips`, 3);
    if (id === 'upgrades') this.hud.toast('Upgrade stand open! Stand on the green mat', 3);
  }

  harvest() {
    const p = this.player;
    if (p.vel.lengthSq() < 0.25 || p.locked) return;
    const space = this.stack.space;
    const cut = p.cutPoint();
    const from = new THREE.Vector3();
    const n = this.flowers.harvest(cut.x, cut.z, this.reach, space, (type, x, z) => {
      from.set(x, 0.6, z);
      this.stack.push(type, from);
      if (Math.random() < 0.5) this.particles.burst(from, { count: 3, palette: PALETTES[type], speed: 1.6, up: 2.5, size: 0.09, life: 0.6 });
    });
    if (n > 0) {
      this.sfx.snip();
      p.swing();
    } else if (space === 0 && this.fullHintCooldown <= 0) {
      // Walking through flowers with a full stack: tell them where to go.
      const near = this.flowers.nearestGrown(cut.x, cut.z, FLOWER_TYPES);
      if (near && near.dist < this.reach + 0.5) {
        this.hud.toast(t('full'), 2);
        this.fullHintCooldown = 6;
      }
    }
  }

  updateZone() {
    const p = this.player.pos;
    const near = (z) => Math.hypot(p.x - z.x, p.z - z.z) < z.r;
    let zone = null;
    if (this.unlocks.has('upgrades') && near(UPGRADE_STAND.zone)) zone = 'upgrades';
    else if (near(TOWER_STAND.zone)) zone = 'tower';
    if (zone !== this.zone) {
      this.zone = zone;
      this.onZone(zone);
    }
  }

  updateGuide(dt) {
    this.guideTimer -= dt;
    if (this.guideTimer > 0) return;
    this.guideTimer = 0.25;
    const s = this.state;
    const st = this.stack;
    const p = this.player.pos;
    const drop = { x: STATION.dropZone.x, z: STATION.dropZone.z, r: 1.2 };
    let target = null;
    const pad = this.unlocks.nextPad();
    if (st.full || st.count >= st.capacity * 0.6) target = drop;
    else if (s.pile > 0 && st.count === 0) target = { x: COUNTER.pile.x, z: COUNTER.pile.z, r: 1.2 };
    else if (pad && st.count === 0 && s.cash >= this.unlocks.remaining(pad.id)) target = { x: pad.x, z: pad.z, r: pad.size * 0.55 };
    else {
      const near = this.flowers.nearestGrown(p.x, p.z, flowerTypesFor(s.unlocked));
      if (st.count > 0 && (!near || near.dist > 5)) target = drop;
      else if (st.count === 0 && near && near.dist > 2.5) target = { x: near.x, z: near.z, r: 0.8 };
    }
    this.guide.set(target);
  }

  update(dt, active) {
    this.time += dt;
    this.fullHintCooldown -= dt;
    const p = this.player;
    p.update(dt, active ? this.input.move : { x: 0, z: 0 }, this.speed);
    if (active) this.harvest();
    this.stack.update(dt, p);
    this.flowers.update(dt);
    this.stations.update(dt, this.time);
    if (active) {
      this.unlocks.update(dt);
      this.updateZone();
      this.updateGuide(dt);
    }
    this.guide.update(dt, p.pos);
    this.particles.update(dt);
    this.flyers.update(dt);
    this.tweens.update(dt);

    // Keep the saved stack and the HUD counters in sync when the stack or the unlocks change.
    const syncKey = this.stack.count * 10 + this.state.unlocked.length;
    if (syncKey !== this.lastStackCount) {
      this.lastStackCount = syncKey;
      this.state.stack = this.stack.types();
      const counts = Object.fromEntries(FLOWER_TYPES.map((ty) => [ty, this.stack.countOf(ty)]));
      this.hud.setCarried(counts, flowerTypesFor(this.state.unlocked));
      this.game.save();
    }

    this.world.update(this.rig.focus);
    // Lead the camera a little in the walking direction, and lift it as the stack grows tall.
    const lead = new THREE.Vector3(p.vel.x * 0.25, 0, p.vel.z * 0.25 - Math.min(this.stack.count, 60) * 0.012);
    this.rig.update(dt, p.pos, lead);
  }
}
