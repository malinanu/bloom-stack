// Floating "+$40" style labels that rise from a point in the 3D world and fade out.
import * as THREE from 'three';

const LIFE = 1.1;
const _v = new THREE.Vector3();

export class Floaters {
  constructor(container) {
    this.container = container;
    this.list = [];
    this.pool = [];
  }

  spawn(text, worldPos, cls = '') {
    const el = this.pool.pop() || document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    this.container.appendChild(el);
    this.list.push({ el, pos: worldPos.clone(), age: 0 });
    if (this.list.length > 24) this.kill(this.list.shift());
  }

  kill(f) {
    f.el.remove();
    this.pool.push(f.el);
  }

  update(dt, camera, width, height) {
    const keep = [];
    for (const f of this.list) {
      f.age += dt;
      if (f.age >= LIFE) { this.kill(f); continue; }
      keep.push(f);
      _v.copy(f.pos);
      _v.y += f.age * 1.4;
      _v.project(camera);
      const x = (_v.x * 0.5 + 0.5) * width;
      const y = (-_v.y * 0.5 + 0.5) * height;
      const k = f.age / LIFE;
      const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - (k - 0.15) * 0.15;
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      f.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }
    this.list = keep;
  }

  clear() {
    for (const f of this.list) this.kill(f);
    this.list = [];
  }
}
