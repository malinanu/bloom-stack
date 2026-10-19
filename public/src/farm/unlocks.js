// Unlock pads: stand on one and your cash streams in while the price counts down; at zero the building
// pops in with confetti. Also builds the bought buildings (upgrade stand, greenhouses).
import * as THREE from 'three';
import { UNLOCKS, availableUnlocks, padDrainRate } from '../core/economy.js';
import { PADS, GREENHOUSES, UPGRADE_STAND } from './layout.js';
import { greenhouse, signBoard, groundMat } from './models.js';
import { ease } from '../core/tween.js';
import { PALETTES } from '../fx/particles.js';

const NAMES = { upgrades: 'Upgrades', field2: 'New field', rose: 'Roses', peony: 'Peonies' };

class Pad {
  constructor(id, price, { x, z, size }) {
    this.id = id;
    this.price = price;
    this.x = x;
    this.z = z;
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }),
    );
    this.mesh.position.set(x, 0.04, z);
    this.mesh.renderOrder = 2;
    this.shown = -1;
    this.draw(price);
  }

  draw(remaining) {
    const r = Math.ceil(remaining);
    if (r === this.shown) return;
    this.shown = r;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.roundRect(12, 12, 232, 232, 34);
    ctx.fill();
    // Progress fill from the bottom.
    const k = 1 - remaining / this.price;
    if (k > 0) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(120,230,110,0.45)';
      ctx.fillRect(0, 256 - 256 * k, 256, 256 * k);
      ctx.restore();
    }
    ctx.setLineDash([24, 14]);
    ctx.lineWidth = 11;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `${r >= 1000 ? 74 : 86}px "Lilita One", system-ui, sans-serif`;
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(40,60,20,0.55)';
    ctx.strokeText(String(r), 128, 116);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(r), 128, 116);
    ctx.font = '38px "Lilita One", system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeText(NAMES[this.id] || '', 128, 190);
    ctx.fillStyle = '#fff6b0';
    ctx.fillText(NAMES[this.id] || '', 128, 190);
    this.tex.needsUpdate = true;
  }

  contains(p) {
    const h = this.size / 2;
    return Math.abs(p.x - this.x) < h && Math.abs(p.z - this.z) < h;
  }
}

function ghostify(group) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
  group.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
  return group;
}

export class Unlocks {
  constructor(scene, assets, game) {
    this.game = game;
    this.scene = scene;
    this.pads = new Map();
    this.buildings = {};
    this.ghosts = {};
    this.payAcc = 0;
    this.coinTimer = 0;
    this.time = 0;

    for (const u of UNLOCKS) {
      const pad = new Pad(u.id, u.price, PADS[u.id]);
      pad.mesh.visible = false;
      scene.add(pad.mesh);
      this.pads.set(u.id, pad);
    }

    // Upgrade stand: counter, sign, crates and a mat to stand on.
    const stand = new THREE.Group();
    const counter = assets.prop('counter');
    stand.add(counter);
    const sign = signBoard('UPGRADES', { width: 2.2, height: 0.55, bg: '#2f7d32' });
    sign.position.z = -0.5;
    stand.add(sign);
    const crate = assets.prop('crate', 0.35);
    crate.position.set(1.3, 0, 0.2);
    stand.add(crate);
    stand.position.set(UPGRADE_STAND.x, 0, UPGRADE_STAND.z);
    this.buildings.upgrades = stand;
    const mat = groundMat('up', { size: 2.3, color: '#d8ffcf', fill: 'rgba(120,230,110,0.25)' });
    mat.position.set(UPGRADE_STAND.zone.x, 0.03, UPGRADE_STAND.zone.z);
    this.upgradeMat = mat;
    stand.userData.extra = [mat];

    for (const id of ['rose', 'peony']) {
      const gh = GREENHOUSES[id];
      const real = greenhouse({ w: gh.w, d: gh.d, frame: gh.frame, trim: gh.trim });
      real.position.set(gh.x, 0, gh.z);
      this.buildings[id] = real;
      const ghost = ghostify(greenhouse({ w: gh.w, d: gh.d }));
      ghost.position.set(gh.x, 0, gh.z);
      this.ghosts[id] = ghost;
      scene.add(ghost);
      ghost.visible = false;
    }
    for (const b of Object.values(this.buildings)) {
      b.visible = false;
      scene.add(b);
      for (const e of b.userData.extra || []) { e.visible = false; scene.add(e); }
    }
    this.refresh();
  }

  has(id) {
    return this.game.state.unlocked.includes(id);
  }

  refresh() {
    const { state } = this.game;
    const avail = new Set(availableUnlocks(state.unlocked).map((u) => u.id));
    for (const [id, pad] of this.pads) {
      pad.mesh.visible = avail.has(id);
      pad.draw(pad.price - (state.paid[id] || 0));
      const b = this.buildings[id];
      if (b && !b.userData.popping) {
        b.visible = this.has(id);
        for (const e of b.userData.extra || []) e.visible = this.has(id);
      }
      if (this.ghosts[id]) this.ghosts[id].visible = avail.has(id);
    }
  }

  /** The pad the player should aim for next (cheapest available), or null. */
  nextPad() {
    const avail = availableUnlocks(this.game.state.unlocked);
    if (!avail.length) return null;
    return this.pads.get(avail[0].id);
  }

  remaining(id) {
    const pad = this.pads.get(id);
    return pad.price - (this.game.state.paid[id] || 0);
  }

  update(dt) {
    this.time += dt;
    const g = this.game;
    const { state, player } = g;
    let paying = null;
    for (const [id, pad] of this.pads) {
      if (!pad.mesh.visible) continue;
      pad.mesh.material.opacity = 0.85 + Math.sin(this.time * 3) * 0.15;
      if (pad.contains(player.pos)) paying = { id, pad };
    }
    if (!paying || state.cash <= 0) {
      this.payAcc = 0;
      return;
    }
    const { id, pad } = paying;
    const paid = state.paid[id] || 0;
    this.payAcc += padDrainRate(pad.price) * dt;
    const amount = Math.min(Math.floor(this.payAcc), state.cash, pad.price - paid);
    if (amount <= 0) return;
    this.payAcc -= amount;
    state.cash -= amount;
    state.paid[id] = paid + amount;
    pad.draw(pad.price - state.paid[id]);
    g.hud.setCash(state.cash, true);

    this.coinTimer -= dt;
    if (this.coinTimer <= 0) {
      this.coinTimer = 0.06;
      g.flyers.launch('coin', player.pos.clone().setY(1.2), new THREE.Vector3(pad.x, 0.1, pad.z), { dur: 0.3, arc: 1, spin: 2 });
      g.sfx.tick(1 + (state.paid[id] / pad.price) * 1.5);
    }
    g.save();
    if (state.paid[id] >= pad.price) this.unlock(id, true);
  }

  unlock(id, animate) {
    const g = this.game;
    const { state } = g;
    if (!state.unlocked.includes(id)) state.unlocked.push(id);
    delete state.paid[id];
    const pad = this.pads.get(id);
    pad.mesh.visible = false;
    if (this.ghosts[id]) this.ghosts[id].visible = false;
    const b = this.buildings[id];
    if (b && animate) {
      b.visible = true;
      b.userData.popping = true;
      for (const e of b.userData.extra || []) e.visible = true;
      b.scale.setScalar(0.01);
      g.tweens.to(0.7, (t) => b.scale.setScalar(Math.max(0.01, t)), {
        ease: ease.outBack,
        onDone: () => { b.userData.popping = false; },
      });
    }
    if (animate) {
      const at = new THREE.Vector3(pad.x, 0.5, pad.z);
      g.particles.burst(at, { count: 70, palette: PALETTES.confetti, speed: 6, up: 9, size: 0.18, life: 1.6, spread: 1.5 });
      g.sfx.unlockFanfare();
      g.player.cheer();
      g.shake(0.6);
      if (id === 'rose' || id === 'peony') g.platform.celebrate();
      g.onUnlock(id, at);
      g.save(true);
    }
    this.refresh();
  }
}
