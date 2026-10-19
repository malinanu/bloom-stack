// Pure maths for the Flower Tower (Stack-style) mode, unit tested in Node.
// A layer is { x, z, w, d }: centre on the ground plane and its size along x (w) and z (d).

export const PERFECT_TOLERANCE = 0.12;
export const GROW_AFTER_PERFECTS = 3;
export const GROW_AMOUNT = 0.15;
export const BASE_SIZE = 3;

/** Slide speed in units per second for a tower of this height (levels scale it with `mul`). */
export function slideSpeed(height, mul = 1) {
  return Math.min(3.2 + height * 0.08, 7) * mul;
}

/** Wind twist: speed pulses between (1 − amp) and (1 + amp). */
export function windFactor(t, amp) {
  return 1 + amp * Math.sin(t * 2.4) * Math.sin(t * 0.9 + 1);
}

/**
 * Drop `moving` onto `top` along `axis` ('x' or 'z'). The moving slab may be smaller than the top (shrink twist).
 * @returns {{ result: 'miss' } |
 *   { result: 'perfect' | 'cut', layer: object, cut: object | null, combo: number }}
 *   `layer` is what stays on the tower, `cut` the slice that falls off (null on a perfect).
 */
export function dropLayer(top, moving, axis, combo = 0, { maxSize = BASE_SIZE } = {}) {
  const sizeKey = axis === 'x' ? 'w' : 'd';
  const delta = moving[axis] - top[axis];
  const tMin = top[axis] - top[sizeKey] / 2;
  const tMax = top[axis] + top[sizeKey] / 2;
  const mMin = moving[axis] - moving[sizeKey] / 2;
  const mMax = moving[axis] + moving[sizeKey] / 2;
  const lo = Math.max(tMin, mMin);
  const hi = Math.min(tMax, mMax);
  const overlap = hi - lo;
  if (overlap <= 0) return { result: 'miss' };

  if (Math.abs(delta) <= PERFECT_TOLERANCE) {
    const nextCombo = combo + 1;
    // Snap onto the layer below.
    const layer = { ...moving, [axis]: top[axis] };
    // A streak of perfects grows the layer back a little, up to the level's base size.
    if (nextCombo >= GROW_AFTER_PERFECTS) layer[sizeKey] = Math.min(maxSize, moving[sizeKey] + GROW_AMOUNT);
    return { result: 'perfect', layer, cut: null, combo: nextCombo };
  }

  const layer = { ...moving, [sizeKey]: overlap, [axis]: (lo + hi) / 2 };
  // The part of the moving slab that hangs over the edge falls off.
  const [c0, c1] = delta > 0 ? [hi, mMax] : [mMin, lo];
  const cutSize = Math.max(0, c1 - c0);
  const cut = cutSize > 1e-6 ? { ...moving, [sizeKey]: cutSize, [axis]: (c0 + c1) / 2 } : null;
  return { result: 'cut', layer, cut, combo: 0 };
}

/** Ping-pong position along an axis: starts at -range, travels to +range and back. */
export function slidePosition(center, range, travelled) {
  const span = range * 2;
  const p = ((travelled % (span * 2)) + span * 2) % (span * 2);
  return center - range + (p <= span ? p : span * 2 - p);
}
