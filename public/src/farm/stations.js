// The money machine: drop flowers at the florist table → bouquets ride the belt → customers buy at the
// counter → coins pile up → the player walks over them to collect.
import * as THREE from 'three';
import { STATION, BELT, COUNTER } from './layout.js';
import { FLOWER_TYPES, FLOWERS, nextBouquetType, bouquetPrice } from '../core/economy.js';
import { bouquetGeometry, bunchGeometry, makeFlowerMaterial, conveyor, groundMat, meshParts, bakeTint } from './models.js';
import { TYPE_COLOR } from './flowers.js';
import { PALETTES } from '../fx/particles.js';

const WRAP_TIME = 0.42;
const BELT_SPEED = 1.9;
const DROP_INTERVAL = 0.05;
const TABLE_Y = 0.75;
const COUNTER_Y = 0.75;
const COIN_VALUE = 5;
const MAX_COINS = 72;
const CUSTOMER_SPEED = 2.3;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function instancedSet(scene, geoFor, material, max) {
  const out = {};
  for (const type of FLOWER_TYPES) {
    const mesh = new THREE.InstancedMesh(geoFor(type), material, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    for (let i = 0; i < max; i++) mesh.setColorAt(i, _c.setHex(TYPE_COLOR[type]));
    mesh.count = 0;
    scene.add(mesh);
    out[type] = mesh;
  }
  return out;
}

class Customer {
  constructor(scene, assets, key) {
    this.char = assets.character(key, { hide: /Cape|Quiver|HelmetVisor/ });
    this.root = this.char.model;
    this.root.visible = false;
    scene.add(this.root);
    this.active = false;
    this.mode = 'idle'; // walk-in | wait | buy | cheer | leave
    this.target = new THREE.Vector3();
    this.want = 1;
    this.bought = 0;
    this.timer = 0;
    this.yaw = 0;
    this.carry = null;
    this.hand = this.root.getObjectByName('handslot.l') || this.root;
  }

  spawn(x, z) {
    this.active = true;
    this.root.visible = true;
    this.root.position.set(x, 0, z);
    this.mode = 'walk-in';
    this.want = 1 + ((Math.random() * 3) | 0);
    this.bought = 0;
    this.char.play('Walking_A');
    if (this.carry) { this.hand.remove(this.carry); this.carry = null; }
  }

  walk(dt) {
    const p = this.root.position;
    const dx = this.target.x - p.x;
    const dz = this.target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, CUSTOMER_SPEED * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    const want = Math.atan2(dx, dz);
    let delta = want - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.yaw += delta * Math.min(1, dt * 10);
    this.root.rotation.y = this.yaw;
    return false;
  }

  face(yaw, dt) {
    let delta = yaw - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.yaw += delta * Math.min(1, dt * 8);
    this.root.rotation.y = this.yaw;
  }
}

export class Stations {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/assets.js').Assets} assets
   * @param {object} game shared farm context (state, sfx, particles, flyers, floaters, save, boosted, addCash)
   */
  constructor(scene, assets, game) {
    this.game = game;
    this.scene = scene;

    // Florist table, scissors and the florist herself.
    // Wooden counters (same look as the sell counter) make the florist's workbench.
    for (const dx of [-0.75, 0.75]) {
      const bench = assets.prop('counter');
      bench.position.set(STATION.table.x + dx, 0, STATION.table.z);
      scene.add(bench);
    }
    const scissors = assets.prop('scissors', 0.5);
    scissors.position.set(STATION.table.x + 0.85, TABLE_Y + 0.02, STATION.table.z + 0.35);
    scissors.rotation.set(-Math.PI / 2, 0, 0.6);
    scene.add(scissors);
    this.florist = assets.character('ranger', { hide: /Quiver|Cape/ });
    this.florist.model.position.set(STATION.florist.x, 0, STATION.florist.z);
    this.florist.model.rotation.y = Math.PI;
    scene.add(this.florist.model);
    this.florist.play('Idle_A');
    this.floristBusy = false;

    const drop = groundMat('drop', { size: 2.3 });
    drop.position.set(STATION.dropZone.x, 0.03, STATION.dropZone.z);
    scene.add(drop);
    this.dropMat = drop;

    // Belt and counter.
    this.belt = conveyor(BELT.x1 - BELT.x0);
    this.belt.position.set((BELT.x0 + BELT.x1) / 2, 0, BELT.z);
    scene.add(this.belt);
    for (const dx of [-0.75, 0.75]) {
      const c = assets.prop('counter');
      c.position.set(COUNTER.x + dx, 0, COUNTER.z);
      scene.add(c);
    }
    const cashMat = groundMat('cash', { size: 2.3, color: '#fff3a8', fill: 'rgba(255,230,120,0.22)' });
    cashMat.position.set(COUNTER.pile.x, 0.03, COUNTER.pile.z);
    scene.add(cashMat);

    // Instanced visuals.
    const flowerMat = makeFlowerMaterial({ side: THREE.DoubleSide });
    this.tableBunches = instancedSet(scene, (t) => bunchGeometry(t), flowerMat, 40);
    this.beltBouquets = instancedSet(scene, (t) => bouquetGeometry(t), flowerMat, 30);
    this.shelfBouquets = instancedSet(scene, (t) => bouquetGeometry(t), flowerMat, 14);
    this.carryGeo = Object.fromEntries(FLOWER_TYPES.map((t) => [t, bakeTint(bouquetGeometry(t), TYPE_COLOR[t])]));
    this.carryMat = makeFlowerMaterial({ side: THREE.DoubleSide });

    const coin = meshParts(assets.gltf.coin.scene);
    this.coins = new THREE.InstancedMesh(coin.geometry, coin.material, MAX_COINS);
    this.coins.castShadow = true;
    this.coins.frustumCulled = false;
    this.coins.count = 0;
    scene.add(this.coins);
    this.coinScale = 0.34;

    this.beltItems = []; // { type, x }
    this.wrapTimer = 0;
    this.dropTimer = 0;
    this.customers = ['barbarian', 'mage', 'knight', 'barbarian', 'mage'].map((k) => new Customer(scene, assets, k));
    this.line = []; // customers queued at the counter, front first
    this.spawnTimer = 1;
    this.sellTimer = 0;
    this.collecting = false;
  }

  /** Bouquets that exist or will soon (shelf, belt, wrappable on the table). */
  pendingBouquets() {
    const s = this.game.state;
    let n = this.beltItems.length;
    for (const t of FLOWER_TYPES) n += s.shelf[t] + Math.floor(s.table[t] / FLOWERS[t].perBouquet);
    return n;
  }

  shelfTotal() {
    const s = this.game.state.shelf;
    return FLOWER_TYPES.reduce((n, t) => n + s[t], 0);
  }

  inZone(pos, zone) {
    return Math.hypot(pos.x - zone.x, pos.z - zone.z) < zone.r;
  }

  update(dt, time) {
    const g = this.game;
    const { state, player, stack } = g;

    // 1) Unload the stack onto the table, one bunch at a time.
    this.dropTimer -= dt;
    if (this.inZone(player.pos, STATION.dropZone) && stack.count > 0) {
      while (this.dropTimer <= 0) {
        const item = stack.pop();
        if (!item) break;
        state.table[item.type]++;
        const to = this.tableSlot(this.tableCount() - 1, new THREE.Vector3());
        g.flyers.launch(`bunch-${item.type}`, item.pos, to, { dur: 0.28, arc: 1, onArrive: () => g.sfx.tick(1.2) });
        this.dropTimer += DROP_INTERVAL;
        g.save();
      }
    }
    if (this.dropTimer < 0) this.dropTimer = 0;

    // 2) The florist wraps bouquets and puts them on the belt.
    const next = nextBouquetType(state.table);
    if (next) {
      this.wrapTimer += dt;
      if (this.wrapTimer >= WRAP_TIME) {
        this.wrapTimer = 0;
        state.table[next] -= FLOWERS[next].perBouquet;
        this.beltItems.push({ type: next, x: BELT.x0 + 0.2 });
        g.particles.burst(_p.set(BELT.x0 + 0.2, 0.9, BELT.z), { count: 6, palette: PALETTES[next], speed: 1.5, up: 2.5, size: 0.08, life: 0.5 });
        g.sfx.pop();
        g.save();
      }
    } else {
      this.wrapTimer = Math.min(this.wrapTimer, WRAP_TIME * 0.5);
    }
    const busy = !!next;
    if (busy !== this.floristBusy) {
      this.floristBusy = busy;
      this.florist.play(busy ? 'Working_A' : 'Idle_A', { fade: 0.25 });
    }
    this.florist.mixer.update(dt);

    // 3) Belt moves bouquets to the counter shelf.
    this.belt.userData.update(dt, this.beltItems.length ? BELT_SPEED : BELT_SPEED * 0.3);
    for (const it of this.beltItems) it.x += BELT_SPEED * dt;
    const arrived = this.beltItems.filter((it) => it.x >= BELT.x1 - 0.1);
    if (arrived.length) {
      this.beltItems = this.beltItems.filter((it) => it.x < BELT.x1 - 0.1);
      for (const it of arrived) state.shelf[it.type]++;
      g.save();
    }

    // 4) Customers.
    this.updateCustomers(dt);

    // 5) Collect cash from the pile.
    if (state.pile > 0 && this.inZone(player.pos, COUNTER.pile)) this.collect();

    this.render(time);
  }

  tableCount() {
    const t = this.game.state.table;
    return FLOWER_TYPES.reduce((n, k) => n + t[k], 0);
  }

  tableSlot(i, out) {
    const k = Math.min(i, 39);
    const col = k % 5;
    const row = Math.floor(k / 5) % 2;
    const layer = Math.floor(k / 10);
    return out.set(STATION.table.x - 0.8 + col * 0.4, TABLE_Y + 0.02 + layer * 0.1, STATION.table.z - 0.25 + row * 0.5);
  }

  updateCustomers(dt) {
    const g = this.game;
    const { state } = g;

    // Spawn while there is something to sell.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.4 + Math.random() * 1.2;
      const free = this.customers.find((c) => !c.active);
      if (free && this.line.length < COUNTER.queue.length && this.pendingBouquets() > this.line.length) {
        free.spawn(COUNTER.spawn[0] + (Math.random() - 0.5), COUNTER.spawn[1]);
        this.line.push(free);
      }
    }

    // Queue positions.
    this.line.forEach((c, i) => {
      const [qx, qz] = COUNTER.queue[i];
      if (c.mode === 'walk-in' || c.mode === 'wait') {
        c.target.set(qx, 0, qz);
        const there = c.walk(dt);
        if (there) {
          c.face(Math.PI, dt); // face the counter (−z)
          if (c.mode === 'walk-in') { c.mode = 'wait'; c.char.play('Idle_A'); }
          if (i === 0) { c.mode = 'buy'; c.timer = 0.35; c.char.play('Idle_A'); }
        } else if (c.mode === 'wait') {
          c.mode = 'walk-in';
          c.char.play('Walking_A');
        }
      }
    });

    for (const c of this.customers) {
      if (!c.active) continue;
      c.char.mixer.update(dt);
      if (c.mode === 'buy') {
        c.face(Math.PI, dt);
        if (this.shelfTotal() === 0) {
          // Nothing to buy: give up if nothing is on its way either.
          if (this.pendingBouquets() === 0) this.leave(c);
          continue;
        }
        c.timer -= dt;
        if (c.timer <= 0) {
          c.timer = 0.3;
          this.sellOne(c);
          if (c.bought >= c.want) {
            c.mode = 'cheer';
            c.timer = 1.1;
            c.char.play(Math.random() < 0.5 ? 'Cheering' : 'Waving', { once: true, fade: 0.15 });
          }
        }
      } else if (c.mode === 'cheer') {
        c.timer -= dt;
        if (c.timer <= 0) this.leave(c);
      } else if (c.mode === 'leave') {
        c.target.set(COUNTER.exit[0], 0, COUNTER.exit[1]);
        if (c.walk(dt)) {
          c.active = false;
          c.root.visible = false;
          c.mode = 'idle';
        }
      }
    }
  }

  leave(c) {
    this.line = this.line.filter((x) => x !== c);
    c.mode = 'leave';
    c.char.play('Walking_A', { fade: 0.2 });
  }

  sellOne(c) {
    const g = this.game;
    const { state } = g;
    // Prefer the most valuable bouquet on the shelf.
    const type = [...FLOWER_TYPES].reverse().find((t) => state.shelf[t] > 0);
    if (!type) return;
    state.shelf[type]--;
    c.bought++;
    const price = bouquetPrice(type, g.boosted());
    state.pile += price;
    const from = new THREE.Vector3(COUNTER.x, COUNTER_Y + 0.2, COUNTER.z);
    g.flyers.launch(`bouquet-${type}`, from, () => c.root.position.clone().setY(1.0), { dur: 0.3, arc: 0.6 });
    if (!c.carry) {
      c.carry = new THREE.Mesh(this.carryGeo[type], this.carryMat);
      c.carry.scale.setScalar(1.6);
      c.carry.rotation.x = -Math.PI / 2;
      c.hand.add(c.carry);
    }
    g.floaters.spawn(`+$${price}`, _p.set(COUNTER.pile.x, 1.2, COUNTER.pile.z), 'cash');
    g.sfx.tick(1.6);
    g.save();
  }

  collect() {
    const g = this.game;
    const { state, player } = g;
    const amount = state.pile;
    const coins = Math.min(14, Math.max(3, this.coins.count));
    state.pile = 0;
    for (let i = 0; i < coins; i++) {
      this.coinPos(i, _p);
      g.flyers.launch('coin', _p, () => player.pos.clone().setY(1.1), {
        dur: 0.35, arc: 1.4, spin: 2, delay: i * 0.03,
        onArrive: () => g.sfx.tick(2),
      });
    }
    g.addCash(amount, player.pos.clone().setY(2.6));
    g.sfx.cash();
    g.particles.burst(_p.set(COUNTER.pile.x, 0.4, COUNTER.pile.z), { count: 10, palette: PALETTES.cash, speed: 2, up: 3, size: 0.1, life: 0.6 });
  }

  coinPos(i, out) {
    const col = i % 9;
    const level = Math.floor(i / 9);
    const cx = (col % 3) - 1;
    const cz = Math.floor(col / 3) - 1;
    return out.set(COUNTER.pile.x + cx * 0.4, 0.04 + level * 0.07, COUNTER.pile.z + cz * 0.4);
  }

  render(time) {
    const { state } = this.game;

    // Flowers waiting on the table.
    const counts = { tulip: 0, rose: 0, peony: 0 };
    let i = 0;
    for (const type of FLOWER_TYPES) {
      for (let k = 0; k < Math.min(state.table[type], 40); k++) {
        if (i >= 40) break;
        this.tableSlot(i, _p);
        _q.setFromAxisAngle(UP, ((i * 37) % 10) * 0.05);
        _m.compose(_p, _q, _s);
        this.tableBunches[type].setMatrixAt(counts[type]++, _m);
        i++;
      }
    }
    for (const type of FLOWER_TYPES) {
      this.tableBunches[type].count = counts[type];
      this.tableBunches[type].instanceMatrix.needsUpdate = true;
    }

    // Bouquets lying on the belt.
    const bc = { tulip: 0, rose: 0, peony: 0 };
    for (const it of this.beltItems) {
      if (bc[it.type] >= 30) continue;
      _q.setFromEuler(_e.set(0, 0, -Math.PI / 2));
      _m.compose(_p.set(it.x, 0.76, BELT.z), _q, _s);
      this.beltBouquets[it.type].setMatrixAt(bc[it.type]++, _m);
    }
    for (const type of FLOWER_TYPES) {
      this.beltBouquets[type].count = bc[type];
      this.beltBouquets[type].instanceMatrix.needsUpdate = true;
    }

    // Bouquets standing on the counter.
    const sc = { tulip: 0, rose: 0, peony: 0 };
    let j = 0;
    for (const type of FLOWER_TYPES) {
      for (let k = 0; k < state.shelf[type] && j < 14; k++, j++) {
        const col = j % 7;
        const row = Math.floor(j / 7);
        _q.setFromAxisAngle(UP, j * 0.7);
        _m.compose(_p.set(COUNTER.x - 1.2 + col * 0.4, COUNTER_Y + 0.02, COUNTER.z - 0.25 + row * 0.5), _q, _s);
        this.shelfBouquets[type].setMatrixAt(sc[type]++, _m);
      }
    }
    for (const type of FLOWER_TYPES) {
      this.shelfBouquets[type].count = sc[type];
      this.shelfBouquets[type].instanceMatrix.needsUpdate = true;
    }

    // Coin pile.
    const n = Math.min(MAX_COINS, Math.ceil(state.pile / COIN_VALUE));
    for (let c = 0; c < n; c++) {
      this.coinPos(c, _p);
      _q.setFromAxisAngle(UP, c * 1.3 + time * 0);
      _m.compose(_p, _q, _s.setScalar(this.coinScale));
      this.coins.setMatrixAt(c, _m);
    }
    _s.set(1, 1, 1);
    this.coins.count = n;
    this.coins.instanceMatrix.needsUpdate = true;
    this.dropMat.material.opacity = 0.75 + Math.sin(time * 4) * 0.25;
  }
}
