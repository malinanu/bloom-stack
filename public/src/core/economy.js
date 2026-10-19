// Game balance in one place. Pure data + functions (no three.js) so it can be unit tested in Node.
// Numbers are starting values: tune them by playtesting (first unlock should land in about a minute).

export const FLOWER_TYPES = ['tulip', 'rose', 'peony'];

export const FLOWERS = {
  tulip: { perBouquet: 5, bouquetPrice: 10, regrow: 9 },
  rose: { perBouquet: 5, bouquetPrice: 30, regrow: 11 },
  peony: { perBouquet: 5, bouquetPrice: 60, regrow: 13 },
};

// Level 0 is the starting value; `cost[i]` buys level i + 1.
export const UPGRADES = {
  capacity: { values: [30, 50, 80, 120], cost: [60, 250, 700] },
  speed: { values: [4.2, 5.0, 5.8, 6.6], cost: [60, 200, 600] },
  reach: { values: [1.0, 1.35, 1.7, 2.1], cost: [80, 250, 700] },
};
export const UPGRADE_KEYS = Object.keys(UPGRADES);

// Unlock pads, revealed in order once the previous one is bought.
export const UNLOCKS = [
  { id: 'upgrades', price: 50, requires: null },
  { id: 'field2', price: 200, requires: 'upgrades' },
  { id: 'rose', price: 1500, requires: 'field2' },
  { id: 'peony', price: 2000, requires: 'rose' },
];

export const BOOST = { multiplier: 2, seconds: 120 };
export const AD_COOLDOWN_SECONDS = 180;

export function upgradeValue(key, level) {
  const { values } = UPGRADES[key];
  return values[Math.max(0, Math.min(values.length - 1, level))];
}

/** Cost of the next level, or null at max level. */
export function upgradeCost(key, level) {
  const { cost } = UPGRADES[key];
  return level < cost.length ? cost[level] : null;
}

export function unlockPrice(id) {
  const u = UNLOCKS.find((x) => x.id === id);
  if (!u) throw new Error(`Unknown unlock ${id}`);
  return u.price;
}

/** Unlock pads currently on the map: not yet bought, and their prerequisite is bought. */
export function availableUnlocks(unlocked) {
  const have = new Set(unlocked);
  return UNLOCKS.filter((u) => !have.has(u.id) && (u.requires === null || have.has(u.requires)));
}

/** Flower types the player can harvest with this set of unlocks. */
export function flowerTypesFor(unlocked) {
  const have = new Set(unlocked);
  return FLOWER_TYPES.filter((t) => t === 'tulip' || have.has(t));
}

/** Price a customer pays for one bouquet. */
export function bouquetPrice(type, boosted = false) {
  return FLOWERS[type].bouquetPrice * (boosted ? BOOST.multiplier : 1);
}

/**
 * Wrap as many bouquets as the table allows.
 * @param {Record<string, number>} table flowers waiting per type
 * @returns {{ table: Record<string, number>, bouquets: Record<string, number> }}
 */
export function wrapBouquets(table) {
  const next = { ...table };
  const bouquets = {};
  for (const type of FLOWER_TYPES) {
    const n = Math.floor((next[type] || 0) / FLOWERS[type].perBouquet);
    if (n > 0) {
      bouquets[type] = n;
      next[type] -= n * FLOWERS[type].perBouquet;
    }
  }
  return { table: next, bouquets };
}

/** Pick the most valuable bouquet the table can wrap next, or null. */
export function nextBouquetType(table) {
  for (let i = FLOWER_TYPES.length - 1; i >= 0; i--) {
    const type = FLOWER_TYPES[i];
    if ((table[type] || 0) >= FLOWERS[type].perBouquet) return type;
  }
  return null;
}

/** Cash per Flower Tower layer grows with the greenhouses you own, tying the two modes together. */
export function towerRate(unlocked) {
  const have = new Set(unlocked);
  return 2 + (have.has('rose') ? 3 : 0) + (have.has('peony') ? 5 : 0);
}

export function towerReward(height, unlocked, doubled = false) {
  return Math.max(0, Math.floor(height)) * towerRate(unlocked) * (doubled ? 2 : 1);
}

/** How fast an unlock pad drains cash: the whole price in about 1.5 s, but never slower than 20/s. */
export function padDrainRate(price) {
  return Math.max(price / 1.5, 20);
}
