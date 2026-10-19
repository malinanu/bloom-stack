import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropLayer, slidePosition, slideSpeed, windFactor, PERFECT_TOLERANCE, GROW_AFTER_PERFECTS, GROW_AMOUNT, BASE_SIZE } from '../public/src/tower/stackMath.js';

const top = { x: 0, z: 0, w: 3, d: 3 };
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('a perfect drop keeps the full size and counts the combo', () => {
  const r = dropLayer(top, { ...top, x: PERFECT_TOLERANCE * 0.9 }, 'x', 0);
  assert.equal(r.result, 'perfect');
  assert.equal(r.combo, 1);
  assert.equal(r.cut, null);
  assert.deepEqual(r.layer, top);
});

test('a streak of perfects grows the layer back, capped at the base size', () => {
  const small = { x: 0, z: 0, w: 2, d: 3 };
  const r = dropLayer(small, { ...small }, 'x', GROW_AFTER_PERFECTS - 1);
  assert.equal(r.result, 'perfect');
  assert.ok(close(r.layer.w, 2 + GROW_AMOUNT));
  const full = dropLayer(top, { ...top }, 'x', 10);
  assert.equal(full.layer.w, BASE_SIZE);
});

test('an offset drop slices the overhang off on the right side', () => {
  const r = dropLayer(top, { ...top, x: 1 }, 'x', 4);
  assert.equal(r.result, 'cut');
  assert.equal(r.combo, 0);
  assert.ok(close(r.layer.w, 2));
  assert.ok(close(r.layer.x, 0.5));
  assert.ok(close(r.cut.w, 1));
  assert.ok(close(r.cut.x, 2)); // the falling piece sits beyond the kept part
  assert.equal(r.layer.d, 3); // the other axis is untouched
});

test('slicing works along z and to the negative side', () => {
  const r = dropLayer(top, { ...top, z: -0.5 }, 'z');
  assert.ok(close(r.layer.d, 2.5));
  assert.ok(close(r.layer.z, -0.25));
  assert.ok(close(r.cut.z, -1.75)); // the slab spans −2.0..1.0, so the overhang is −2.0..−1.5
  // kept + cut cover exactly the moving slab
  assert.ok(close(r.layer.d + r.cut.d, 3));
});

test('no overlap is a miss', () => {
  assert.equal(dropLayer(top, { ...top, x: 3 }, 'x').result, 'miss');
  assert.equal(dropLayer(top, { ...top, x: -3.2 }, 'x').result, 'miss');
});

test('the slab ping-pongs between -range and +range', () => {
  assert.equal(slidePosition(0, 4, 0), -4);
  assert.equal(slidePosition(0, 4, 4), 0);
  assert.equal(slidePosition(0, 4, 8), 4);
  assert.equal(slidePosition(0, 4, 12), 0);
  assert.equal(slidePosition(0, 4, 16), -4);
  assert.equal(slidePosition(1, 4, 0), -3);
});

test('speed rises with height but is capped, and levels can scale it', () => {
  assert.ok(slideSpeed(20) > slideSpeed(0));
  assert.equal(slideSpeed(1000), 7);
  assert.equal(slideSpeed(1000, 1.5), 10.5);
});

test('a smaller (shrunk) slab keeps its own size and slices against the layer below', () => {
  const small = { x: 0.8, z: 0, w: 2, d: 2.9 };
  const r = dropLayer(top, small, 'x');
  // moving spans −0.2..1.8, top spans −1.5..1.5 → kept −0.2..1.5, cut 1.5..1.8
  assert.equal(r.result, 'cut');
  assert.ok(close(r.layer.w, 1.7));
  assert.ok(close(r.layer.x, 0.65));
  assert.ok(close(r.cut.w, 0.3));
  assert.ok(close(r.cut.x, 1.65));
  assert.equal(r.layer.d, 2.9);
  // fully inside but off-centre: nothing hangs over, so nothing falls
  const inside = dropLayer(top, { x: 0.5, z: 0, w: 1.5, d: 3 }, 'x');
  assert.equal(inside.result, 'cut');
  assert.equal(inside.cut, null);
  assert.ok(close(inside.layer.w, 1.5));
});

test('a perfect drop snaps a smaller slab onto the centre and growth respects maxSize', () => {
  const r = dropLayer(top, { x: 0.05, z: 0, w: 2.2, d: 2.2 }, 'x', 5, { maxSize: 2.3 });
  assert.equal(r.result, 'perfect');
  assert.equal(r.layer.x, 0);
  assert.ok(close(r.layer.w, 2.3));
});

test('wind keeps the speed within the gust range', () => {
  for (let t = 0; t < 20; t += 0.1) {
    const f = windFactor(t, 0.5);
    assert.ok(f >= 0.5 - 1e-9 && f <= 1.5 + 1e-9);
  }
});
