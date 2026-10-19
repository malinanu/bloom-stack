import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES, upgradeValue, upgradeCost, availableUnlocks, flowerTypesFor, bouquetPrice,
  wrapBouquets, nextBouquetType, towerRate, towerReward, padDrainRate, unlockPrice,
} from '../public/src/core/economy.js';

test('upgrade values clamp and costs end at max level', () => {
  assert.equal(upgradeValue('capacity', 0), UPGRADES.capacity.values[0]);
  assert.equal(upgradeValue('capacity', 99), UPGRADES.capacity.values.at(-1));
  assert.equal(upgradeCost('speed', 0), UPGRADES.speed.cost[0]);
  assert.equal(upgradeCost('speed', UPGRADES.speed.cost.length), null);
});

test('every upgrade has one more value than costs, and values increase', () => {
  for (const [key, u] of Object.entries(UPGRADES)) {
    assert.equal(u.values.length, u.cost.length + 1, key);
    for (let i = 1; i < u.values.length; i++) assert.ok(u.values[i] > u.values[i - 1], key);
  }
});

test('unlock pads appear in order', () => {
  assert.deepEqual(availableUnlocks([]).map((u) => u.id), ['upgrades']);
  assert.deepEqual(availableUnlocks(['upgrades']).map((u) => u.id), ['field2']);
  assert.deepEqual(availableUnlocks(['upgrades', 'field2', 'rose', 'peony']), []);
  assert.equal(unlockPrice('rose'), 1500);
  assert.equal(unlockPrice('peony'), 2000);
  assert.throws(() => unlockPrice('nope'));
});

test('flower types follow greenhouse unlocks', () => {
  assert.deepEqual(flowerTypesFor([]), ['tulip']);
  assert.deepEqual(flowerTypesFor(['rose']), ['tulip', 'rose']);
  assert.deepEqual(flowerTypesFor(['rose', 'peony']), ['tulip', 'rose', 'peony']);
});

test('bouquets: 5 flowers each, leftovers stay on the table', () => {
  const { table, bouquets } = wrapBouquets({ tulip: 12, rose: 5, peony: 4 });
  assert.deepEqual(bouquets, { tulip: 2, rose: 1 });
  assert.deepEqual(table, { tulip: 2, rose: 0, peony: 4 });
  assert.equal(nextBouquetType({ tulip: 7, rose: 5, peony: 0 }), 'rose');
  assert.equal(nextBouquetType({ tulip: 4, rose: 0, peony: 0 }), null);
});

test('boost doubles the sale price', () => {
  assert.equal(bouquetPrice('tulip'), 10);
  assert.equal(bouquetPrice('tulip', true), 20);
  assert.ok(bouquetPrice('peony') > bouquetPrice('rose'));
  assert.ok(bouquetPrice('rose') > bouquetPrice('tulip'));
});

test('tower reward grows with greenhouses and doubles with the ad', () => {
  assert.equal(towerRate([]), 2);
  assert.equal(towerRate(['rose', 'peony']), 10);
  assert.equal(towerReward(14, []), 28);
  assert.equal(towerReward(14, [], true), 56);
  assert.equal(towerReward(-3, []), 0);
});

test('pads drain a price in about 1.5 s but never slower than 20/s', () => {
  assert.equal(padDrainRate(1500), 1000);
  assert.equal(padDrainRate(10), 20);
});
