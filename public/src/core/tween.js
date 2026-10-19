// Tiny tween runner: tweens.to(seconds, (t) => ..., { ease, delay, onDone }).

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export class Tweens {
  constructor() {
    this.list = [];
  }

  to(duration, onUpdate, { ease: e = ease.outCubic, delay = 0, onDone = null } = {}) {
    const tw = { duration: Math.max(1e-4, duration), elapsed: -delay, onUpdate, ease: e, onDone, dead: false };
    this.list.push(tw);
    return tw;
  }

  update(dt) {
    for (const tw of this.list) {
      if (tw.dead) continue;
      tw.elapsed += dt;
      if (tw.elapsed < 0) continue;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.onUpdate(tw.ease(t), t);
      if (t >= 1) {
        tw.dead = true;
        tw.onDone?.();
      }
    }
    if (this.list.some((tw) => tw.dead)) this.list = this.list.filter((tw) => !tw.dead);
  }

  clear() {
    this.list.length = 0;
  }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent smoothing factor for exponential approach. */
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);
