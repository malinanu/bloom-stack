import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, migrate, serialize, deserialize, SaveManager, SAVE_VERSION } from '../public/src/core/save.js';

test('round trip keeps progress', () => {
  const s = defaultSave();
  s.cash = 1234;
  s.stack = ['tulip', 'rose'];
  s.table.tulip = 3;
  s.unlocked = ['upgrades', 'field2'];
  s.paid = { rose: 400 };
  s.upgrades.capacity = 2;
  s.towerBest = 31;
  const back = deserialize(serialize(s));
  assert.equal(back.cash, 1234);
  assert.deepEqual(back.stack, ['tulip', 'rose']);
  assert.equal(back.table.tulip, 3);
  assert.deepEqual(back.unlocked, ['upgrades', 'field2']);
  assert.deepEqual(back.paid, { rose: 400 });
  assert.equal(back.upgrades.capacity, 2);
  assert.equal(back.towerBest, 31);
  assert.equal(back.v, SAVE_VERSION);
});

test('garbage and corrupted data fall back to a fresh save', () => {
  assert.deepEqual(deserialize(''), defaultSave());
  assert.deepEqual(deserialize('{not json'), defaultSave());
  assert.deepEqual(deserialize('null'), defaultSave());
  const m = migrate({ cash: -5, stack: ['tulip', 'weed', 7], unlocked: ['rose', 'hack', 'rose'], upgrades: { speed: 99 }, paid: { rose: 99999, field2: 'x' } });
  assert.equal(m.cash, 0);
  assert.deepEqual(m.stack, ['tulip']);
  assert.deepEqual(m.unlocked, ['rose']);
  assert.equal(m.upgrades.speed, 3); // clamped to max level
  assert.deepEqual(m.paid, {}); // rose already unlocked, field2 not a number
});

test('v0 prototype saves are migrated', () => {
  assert.equal(migrate({ money: 77 }).cash, 77);
});

test('a big late-game save stays far below the 500 KiB target (3 MiB hard limit)', () => {
  const s = defaultSave();
  s.cash = 9_999_999;
  s.stack = Array(120).fill('peony');
  s.unlocked = ['upgrades', 'field2', 'rose', 'peony'];
  const bytes = Buffer.byteLength(serialize(s));
  assert.ok(bytes < 500 * 1024, `${bytes} bytes`);
  assert.ok(bytes < 4096, `${bytes} bytes`);
});

test('SaveManager waits for ready(), debounces, and skips identical writes', async () => {
  const writes = [];
  const timers = [];
  const state = defaultSave();
  const mgr = new SaveManager((json) => { writes.push(json); }, () => state, {
    now: () => 1,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
  });
  mgr.request();
  assert.equal(timers.length, 0, 'no timer before ready');
  mgr.ready();
  assert.equal(timers.length, 1);
  mgr.request(); // already scheduled
  assert.equal(timers.length, 1);
  await timers[0]();
  assert.equal(writes.length, 1);
  await mgr.flush(); // nothing changed
  assert.equal(writes.length, 1);
  state.cash = 10;
  await mgr.flush();
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(writes[1]).cash, 10);
});
