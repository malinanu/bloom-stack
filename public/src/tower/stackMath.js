// Pure maths for the Flower Tower (Stack-style) mode, unit tested in Node.
// A layer is { x, z, w, d }: centre on the ground plane and its size along x (w) and z (d).

export const PERFECT_TOLERANCE = 0.12;
export const GROW_AFTER_PERFECTS = 3;
export const GROW_AMOUNT = 0.15;
export const BASE_SIZE = 3;

/** Slide speed in units per second for a tower of this height. */
export function slideSpeed(height) {
  return Math.min(3.2 + height * 0.08, 7);
}

/**
 * Drop `moving` onto `top` along `axis` ('x' or 'z').
 * @returns {{ result: 'miss' } |
 *   { result: 'perfect' | 'cut', layer: object, cut: object | null, combo: number }}
 *   `layer` is what stays on the tower, `cut` the slice that falls off (null on a perfect).
 */
export function dropLayer(top, moving, axis, combo = 0) {
  const sizeKey = axis === 'x' ? 'w' : 'd';
  const delta = moving[axis] - top[axis];
  const size = top[sizeKey];
  const overlap = size - Math.abs(delta);
  if (overlap <= 0) return { result: 'miss' };

  if (Math.abs(delta) <= PERFECT_TOLERANCE) {
    const nextCombo = combo + 1;
    const layer = { ...top };
    // A streak of perfects grows the layer back a little, up to the base size.
    if (nextCombo >= GROW_AFTER_PERFECTS) layer[sizeKey] = Math.min(BASE_SIZE, size + GROW_AMOUNT);
    return { result: 'perfect', layer, cut: null, combo: nextCombo };
  }

  const layer = { ...top, [sizeKey]: overlap, [axis]: top[axis] + delta / 2 };
  const sign = Math.sign(delta);
  const cutSize = Math.abs(delta);
  const cut = { ...top, [sizeKey]: cutSize, [axis]: layer[axis] + sign * (overlap / 2 + cutSize / 2) };
  return { result: 'cut', layer, cut, combo: 0 };
}

/** Ping-pong position along an axis: starts at -range, travels to +range and back. */
export function slidePosition(center, range, travelled) {
  const span = range * 2;
  const p = ((travelled % (span * 2)) + span * 2) % (span * 2);
  return center - range + (p <= span ? p : span * 2 - p);
}
