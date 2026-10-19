import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_COUNT, RHYTHM, TOWER_TWISTS, FARM_TWISTS, levelFor, levelInfo, difficulty, chapterFor, estimateFarmTime,
  rewardFor, starsForFarm, starsForTower, starsOf, withStars, farmShape,
} from '../public/src/levels/levels.js';
import { SHAPES, SHAPE_NAMES, PATTERN_NAMES, fieldSlots } from '../public/src/levels/shapes.js';
import { mulberry32 } from '../public/src/levels/levels.js';
import { STACK_LIMIT } from '../public/src/core/economy.js';

const ALL = Array.from({ length: LEVEL_COUNT }, (_, i) => levelFor(i + 1));

test('levels are deterministic', () => {
  assert.deepEqual(levelFor(37), levelFor(37));
  assert.deepEqual(levelFor(100), levelFor(100));
  assert.notDeepEqual(levelFor(36), levelFor(37));
});

test('every block of 10 follows the rhythm, bosses alternate farm and tower', () => {
  for (const l of ALL) {
    const slot = RHYTHM[(l.n - 1) % 10];
    if (slot === 'boss') {
      assert.ok(l.boss, `level ${l.n} is a boss`);
      assert.equal(l.kind, l.chapter.index % 2 === 0 ? 'farm' : 'tower');
    } else {
      assert.equal(l.kind, slot, `level ${l.n}`);
    }
  }
  assert.equal(levelFor(10).kind, 'farm');
  assert.equal(levelFor(20).kind, 'tower');
  const towers = ALL.filter((l) => l.kind === 'tower').length;
  assert.ok(towers >= 40 && towers <= 60, `${towers} tower levels`);
});

test('level 1 is the iconic heart with no twists, level 2 a gentle tower', () => {
  const l1 = levelFor(1);
  assert.equal(l1.kind, 'farm');
  assert.equal(l1.farm.shape, 'heart');
  assert.deepEqual(l1.twists, []);
  const l2 = levelFor(2);
  assert.equal(l2.kind, 'tower');
  assert.equal(l2.tower.hearts, 3);
  assert.deepEqual(l2.twists, []);
});

test('each twist first appears alone, never before its intro level', () => {
  for (const [kind, list] of [['tower', TOWER_TWISTS], ['farm', FARM_TWISTS]]) {
    for (const tw of list) {
      const first = ALL.find((l) => l.kind === kind && l.twists.includes(tw.id));
      assert.ok(first, `${tw.id} appears`);
      assert.ok(first.n >= tw.from, `${tw.id} not before ${tw.from}`);
      assert.deepEqual(first.twists, [tw.id], `${tw.id} is introduced alone on level ${first.n}`);
      assert.equal(first.fresh?.id, tw.id);
    }
  }
});

test('difficulty climbs overall and dips after each boss', () => {
  assert.ok(difficulty(1) < 0.05);
  assert.ok(difficulty(100) > 0.85);
  assert.ok(difficulty(50) > difficulty(10));
  assert.ok(difficulty(11) < difficulty(10), 'easier right after a boss');
  for (let n = 1; n <= 300; n++) assert.ok(difficulty(n) >= 0 && difficulty(n) <= 1);
});

test('farm levels are solvable: the time limit leaves enough slack, and field sizes stay sane', () => {
  for (let n = 1; n <= 300; n++) {
    const l = levelFor(n);
    if (l.kind !== 'farm') continue;
    const f = l.farm;
    assert.ok(f.timeLimit >= f.estimate * 1.3, `level ${n}: ${f.timeLimit}s for ~${f.estimate.toFixed(0)}s`);
    assert.ok(f.count >= 60 && f.count <= 1400, `level ${n}: ${f.count} flowers`);
    assert.ok(f.capacity >= 25 && f.capacity <= STACK_LIMIT, `level ${n}: capacity ${f.capacity}`);
    // Levels before the cart twist must fit in one stack, so they never need the cart.
    if (n < 5) assert.ok(f.capacity >= f.count, `level ${n} fits one stack`);
    assert.equal(f.field.slots.length, f.count);
    assert.ok(f.field.slots.every((s) => f.types.includes(s.type)));
  }
});

test('back-to-back farm levels never repeat a shape', () => {
  let prev = null;
  for (const l of ALL) {
    if (l.kind !== 'farm') continue;
    assert.notEqual(l.farm.shape, prev, `level ${l.n}`);
    prev = l.farm.shape;
    assert.equal(farmShape(l.n), l.farm.shape);
  }
});

test('tower targets, hearts and star thresholds stay in range', () => {
  for (let n = 1; n <= 300; n++) {
    const l = levelFor(n);
    if (l.kind !== 'tower') continue;
    const tw = l.tower;
    assert.ok(tw.target >= 6 && tw.target <= 46, `level ${n} target ${tw.target}`);
    assert.ok(tw.hearts >= 1 && tw.hearts <= 4);
    assert.ok(tw.baseSize >= 2.2 && tw.baseSize <= 3);
    assert.ok(tw.speedMul >= 1 && tw.speedMul <= 1.6);
    assert.ok(tw.star2 <= tw.star3 && tw.star3 <= tw.target);
  }
  assert.ok(levelFor(20).tower.target > levelFor(19).tower.target, 'bosses build higher');
});

test('levels beyond the map generate too (raise LEVEL_COUNT to add more)', () => {
  for (const n of [101, 150, 250, 300, 999]) {
    const l = levelFor(n);
    assert.ok(l.kind === 'farm' || l.kind === 'tower');
    assert.ok(l.baseReward > 0);
  }
  assert.equal(chapterFor(101).name, 'Tulip Meadow II');
  assert.throws(() => levelFor(0));
});

test('map info matches the full definition', () => {
  for (const l of ALL) {
    const info = levelInfo(l.n);
    assert.equal(info.kind, l.kind);
    assert.equal(info.boss, l.boss);
  }
});

test('rewards scale with level, stars and bosses', () => {
  assert.equal(rewardFor(1, 1, false), 24);
  assert.equal(rewardFor(1, 3, false), 48);
  assert.equal(rewardFor(10, 1, true), 180);
  assert.equal(rewardFor(5, 0, false), 0);
  assert.ok(rewardFor(50, 2) > rewardFor(49, 2));
});

test('stars: farm by time left, tower by perfect drops', () => {
  assert.equal(starsForFarm(30, 60), 3);
  assert.equal(starsForFarm(20, 60), 2);
  assert.equal(starsForFarm(1, 60), 1);
  const tw = { star2: 3, star3: 6 };
  assert.equal(starsForTower(0, tw), 1);
  assert.equal(starsForTower(3, tw), 2);
  assert.equal(starsForTower(9, tw), 3);
});

test('star string keeps the best result per level', () => {
  let s = '';
  s = withStars(s, 3, 2);
  assert.equal(s, '002');
  s = withStars(s, 3, 1);
  assert.equal(starsOf(s, 3), 2);
  s = withStars(s, 1, 3);
  assert.equal(s, '302');
  assert.equal(starsOf(s, 50), 0);
});

test('every shape and pattern produces a usable field', () => {
  const rand = mulberry32(5);
  for (const shape of SHAPE_NAMES) {
    for (const pattern of PATTERN_NAMES) {
      const f = fieldSlots({ shape, radius: 5, pattern, types: ['tulip', 'rose', 'peony'], obstacles: 3 }, rand);
      assert.ok(f.slots.length > 60, `${shape}/${pattern}: ${f.slots.length}`);
      assert.ok(f.cart.z > f.bounds.minZ && f.cart.z < f.bounds.maxZ);
      for (const o of f.obstacles) assert.ok(SHAPES[shape](o.x / 5, o.z / 5));
    }
  }
});

test('the time estimate grows with field size and cart trips', () => {
  const a = estimateFarmTime({ area: 50, count: 200, capacity: 200, radius: 4 });
  const b = estimateFarmTime({ area: 100, count: 400, capacity: 400, radius: 6 });
  const c = estimateFarmTime({ area: 100, count: 400, capacity: 100, radius: 6 });
  assert.ok(b > a && c > b);
});
