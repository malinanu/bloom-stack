// Floating joystick (drag anywhere on the play area) + WASD/arrows, and taps for the Flower Tower.

const RADIUS = 56; // px the thumb can travel from where the drag started

export class Input {
  constructor(surface, stickEl) {
    this.surface = surface;
    this.stick = stickEl;
    this.knob = stickEl.querySelector('.stick-knob');
    this.move = { x: 0, z: 0 }; // x right, z toward the camera (screen down); length ≤ 1
    this.pointer = null; // { id, ox, oy, x, y }
    this.keys = new Set();
    this.tapHandlers = new Set();
    this.joystickEnabled = false;

    surface.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.drag(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.release(); });
  }

  onTap(fn) {
    this.tapHandlers.add(fn);
    return () => this.tapHandlers.delete(fn);
  }

  setJoystick(enabled) {
    this.joystickEnabled = enabled;
    if (!enabled) this.release();
  }

  down(e) {
    for (const fn of this.tapHandlers) fn();
    if (!this.joystickEnabled || this.pointer) return;
    this.pointer = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    this.stick.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.stick.classList.add('on');
  }

  drag(e) {
    const p = this.pointer;
    if (!p || e.pointerId !== p.id) return;
    p.x = e.clientX;
    p.y = e.clientY;
    let dx = p.x - p.ox;
    let dy = p.y - p.oy;
    const len = Math.hypot(dx, dy);
    // Drag past the rim and the stick follows the finger, so direction changes stay responsive.
    if (len > RADIUS) {
      p.ox += (dx / len) * (len - RADIUS);
      p.oy += (dy / len) * (len - RADIUS);
      dx = p.x - p.ox;
      dy = p.y - p.oy;
      this.stick.style.transform = `translate(${p.ox}px, ${p.oy}px)`;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  up(e) {
    if (this.pointer && e.pointerId === this.pointer.id) this.release();
  }

  release() {
    this.pointer = null;
    this.stick.classList.remove('on');
  }

  key(e, isDown) {
    if (e.repeat && isDown) return;
    const k = e.key.toLowerCase();
    if (isDown && (k === ' ' || k === 'enter')) {
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      for (const fn of this.tapHandlers) fn();
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      e.preventDefault();
      if (isDown) this.keys.add(k);
      else this.keys.delete(k);
    }
  }

  /** Call once per frame. */
  update() {
    let x = 0;
    let z = 0;
    if (this.joystickEnabled) {
      if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
      if (this.keys.has('w') || this.keys.has('arrowup')) z -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) z += 1;
      const p = this.pointer;
      if (p) {
        const dx = p.x - p.ox;
        const dy = p.y - p.oy;
        const len = Math.hypot(dx, dy);
        if (len > 6) {
          const m = Math.min(1, len / RADIUS);
          x += (dx / len) * m;
          z += (dy / len) * m;
        }
      }
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    this.move.x = x;
    this.move.z = z;
  }
}
