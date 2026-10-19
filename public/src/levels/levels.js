// Procedural levels. levelFor(n) always returns the same level for the same n (seeded), so any level is
// replayable and shareable ("Level 37 is impossible!"). Raise LEVEL_COUNT to add more: nothing else to do.
// Pure (no three.js) so the whole curve is unit tested.
import { SHAPE_NAMES, PATTERN_NAMES, fieldSlots } from './shapes.js';
import { STACK_LIMIT } from '../core/economy.js';

export const LEVEL_COUNT = 100;

/** Every block of 10: farm (F), tower (T), boss last. */
export const RHYTHM = ['farm', 'tower', 'farm', 'tower', 'farm', 'tower', 'tower', 'farm', 'tower', 'boss'];

export const CHAPTERS = [
  { name: 'Tulip Meadow', color: '#ff5c9a', sky: ['#ffe3ec', '#ffc9dd'] },
  { name: 'Rose Garden', color: '#e0233a', sky: ['#ffe1e1', '#ffb9bf'] },
  { name: 'Peony Park', color: '#e06fd0', sky: ['#fbe3ff', '#f2c4f7'] },
  { name: 'Sunny Hills', color: '#f2a200', sky: ['#fff6cf', '#ffe08a'] },
  { name: 'Lavender Lane', color: '#8f6cf0', sky: ['#ece6ff', '#d4c6ff'] },
  { name: 'Cherry Grove', color: '#ff6f91', sky: ['#ffe9ef', '#ffc2d1'] },
  { name: 'Lotus Lake', color: '#22a6c8', sky: ['#dff6ff', '#b5e8fb'] },
  { name: 'Orchid Valley', color: '#b04fd6', sky: ['#f6e5ff', '#e2c0f5'] },
  { name: 'Starlight', color: '#4a5bd8', sky: ['#dfe4ff', '#b8c2ff'] },
  { name: 'Rainbow Summit', color: '#ff7a3d', sky: ['#fff0e3', '#ffd0b0'] },
];

/** Tower twists, introduced on the first tower level at or after `from`, alone, then mixed in. */
export const TOWER_TWISTS = [
  { id: 'gold', from: 9, label: 'Gold layers', hint: 'Land a perfect drop on a gold layer for bonus coins' },
  { id: 'wind', from: 14, label: 'Wind', hint: 'Gusts speed the slab up and slow it down' },
  { id: 'shrink', from: 24, label: 'Shrinking', hint: 'Every layer starts a little smaller' },
  { id: 'sides', from: 34, label: 'Both sides', hint: 'Slabs can slide in from either side' },
  { id: 'blink', from: 52, label: 'Blink', hint: 'The slab flickers out of sight mid-slide' },
];

/** Farm twists, same rules. */
export const FARM_TWISTS = [
  { id: 'cart', from: 5, label: 'Cart runs', hint: 'Your stack fills up: unload at the cart to keep mowing' },
  { id: 'rocks', from: 13, label: 'Rocks', hint: 'Mow around the rocks and bushes' },
  { id: 'mixed', from: 21, label: 'Mixed beds', hint: 'Roses and peonies mixed in' },
];

export const FARM_SPEED = 5;
export const FARM_REACH = 1.15;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function chapterFor(n) {
  const index = Math.floor((n - 1) / 10);
  const base = CHAPTERS[index % CHAPTERS.length];
  const cycle = Math.floor(index / CHAPTERS.length);
  return { index, ...base, name: cycle ? `${base.name} ${ROMAN[cycle + 1] || cycle + 1}` : base.name };
}

/** 0..1. Climbs overall, rises through each chapter and eases off after each boss (a sawtooth). */
export function difficulty(n) {
  const trend = 1 - Math.exp(-(n - 1) / 45);
  const pos = ((n - 1) % 10) / 9;
  return clamp(trend * 0.9 + (pos - 0.5) * 0.16 + 0.05, 0, 1);
}

/** Cheap info for the map: no field generation. */
export function levelInfo(n) {
  const slot = (n - 1) % 10;
  const chapter = chapterFor(n);
  const boss = RHYTHM[slot] === 'boss';
  const kind = boss ? (chapter.index % 2 === 0 ? 'farm' : 'tower') : RHYTHM[slot];
  return { n, kind, boss, chapter };
}

const BOSS_SHAPES = ['heart', 'star', 'flower', 'circle'];
const shapeMemo = new Map();

/** Field shape of farm level n: seeded, from a list that grows with n, never the same as the previous farm level. */
export function farmShape(n) {
  if (shapeMemo.has(n)) return shapeMemo.get(n);
  const info = levelInfo(n);
  let shape;
  if (n === 1) shape = 'heart';
  else if (info.boss) shape = BOSS_SHAPES[info.chapter.index % BOSS_SHAPES.length];
  else {
    const list = SHAPE_NAMES.slice(0, Math.min(SHAPE_NAMES.length, 3 + Math.floor(n / 6)));
    let i = Math.floor(mulberry32(n * 31 + 7)() * list.length);
    let prev = n - 1;
    while (prev >= 1 && levelInfo(prev).kind !== 'farm') prev--;
    if (prev >= 1 && list[i] === farmShape(prev)) i = (i + 1) % list.length;
    shape = list[i];
  }
  shapeMemo.set(n, shape);
  return shape;
}

/** First level of `kind` at or after `from`. */
function introLevel(kind, from) {
  for (let n = from; n < from + 20; n++) if (levelInfo(n).kind === kind) return n;
  return from;
}

/** Twists active on level n: none before their intro, only the new one on its intro level, then a seeded mix. */
function pickTwists(list, kind, n, d, rand, boss) {
  const available = list.filter((t) => n >= introLevel(kind, t.from));
  const fresh = available.find((t) => introLevel(kind, t.from) === n);
  if (fresh) return { twists: [fresh.id], fresh };
  const max = boss ? 3 : d < 0.4 ? 1 : d < 0.7 ? 2 : 3;
  const pool = [...available];
  const out = [];
  while (pool.length && out.length < max) {
    const i = Math.floor(rand() * pool.length);
    const [t] = pool.splice(i, 1);
    // Positive twists are common; the rest come in with growing odds.
    if (t.id === 'gold' || t.id === 'mixed' || rand() < 0.45 + d * 0.5 || boss) out.push(t.id);
  }
  return { twists: out, fresh: null };
}

/** Rough seconds a decent player needs; the time limit adds slack on top. */
export function estimateFarmTime({ area, count, capacity, radius }) {
  const mowRate = 2 * FARM_REACH * FARM_SPEED * 0.62; // m² per second, with turns and overlap
  const trips = Math.max(0, Math.ceil(count / capacity) - 1);
  const trip = (2 * (radius + 2)) / FARM_SPEED + capacity * 0.035;
  return area / mowRate + trips * trip + 2;
}

function towerLevel(n, info, d, rand) {
  const { twists, fresh } = pickTwists(TOWER_TWISTS, 'tower', n, d, rand, info.boss);
  const target = Math.round(6 + d * 26 + (info.boss ? 12 : 0));
  return {
    twists,
    fresh,
    tower: {
      target,
      baseSize: +(3 - d * 0.8).toFixed(2),
      speedMul: +(1 + d * 0.6).toFixed(2),
      hearts: (d < 0.3 ? 3 : d < 0.65 ? 2 : 1) + (info.boss ? 1 : 0),
      star2: Math.ceil(target * 0.25),
      star3: Math.ceil(target * 0.5),
      twists,
      goldEvery: 4 + Math.floor(rand() * 3),
      wind: 0.35 + d * 0.25,
      seed: n * 7919,
    },
    intro: info.boss ? `Build ${target} high!` : `Build ${target} high`,
  };
}

function farmLevel(n, info, d, rand) {
  const { twists, fresh } = pickTwists(FARM_TWISTS, 'farm', n, d, rand, info.boss);
  const has = (id) => twists.includes(id);
  const shape = farmShape(n);
  const radius = +Math.min(10, (3.6 + d * 5.4) * (info.boss ? 1.25 : 1)).toFixed(2);

  // Flower types follow the chapters (roses from Rose Garden, peonies from Peony Park); bosses get a teaser.
  const types = ['tulip'];
  if (n >= 11 || info.boss) types.push('rose');
  if (n >= 21 || (info.boss && n >= 20)) types.push('peony');
  let pattern = 'solid';
  if (info.boss) pattern = 'center';
  else if (types.length > 1 && (has('mixed') || rand() < 0.5)) pattern = PATTERN_NAMES[1 + Math.floor(rand() * (PATTERN_NAMES.length - 1))];
  if (pattern === 'solid' && types.length > 1) types.splice(1);
  else if (pattern === 'halves' || pattern === 'center') types.splice(2);

  const field = fieldSlots({ shape, radius, pattern, types, obstacles: has('rocks') ? Math.round(2 + d * 8) : 0 }, rand);
  const count = field.slots.length;
  // The cart twist shrinks the stack on purpose; any field bigger than the stack can hold needs cart runs anyway.
  const wanted = has('cart') ? Math.max(25, Math.round(count * (0.55 - 0.3 * d))) : Math.max(count, 30);
  const capacity = Math.min(wanted, STACK_LIMIT);
  const slack = 2.2 - 0.85 * d + (info.boss ? 0.1 : 0);
  const estimate = estimateFarmTime({ area: field.area, count, capacity, radius });
  const timeLimit = Math.max(20, Math.ceil((estimate * slack) / 5) * 5);
  return {
    twists,
    fresh,
    farm: { shape, pattern, radius, types, count, capacity, timeLimit, estimate, slack, field, speed: FARM_SPEED, reach: FARM_REACH },
    intro: info.boss ? `Mow the giant ${shape}!` : `Mow the ${shape}!`,
  };
}

/** The full level definition. Deterministic for a given n. */
export function levelFor(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Bad level ${n}`);
  const info = levelInfo(n);
  const d = difficulty(n);
  const rand = mulberry32(n * 2654435761);
  const body = info.kind === 'tower' ? towerLevel(n, info, d, rand) : farmLevel(n, info, d, rand);
  return { ...info, d: +d.toFixed(3), ...body, baseReward: rewardFor(n, 1, info.boss) };
}

export const STAR_MULTIPLIER = [0, 1, 1.5, 2];

export function rewardFor(n, stars, boss = levelInfo(n).boss) {
  return Math.round((20 + 4 * n) * (boss ? 3 : 1) * STAR_MULTIPLIER[clamp(stars, 0, 3)]);
}

export function starsForFarm(timeLeft, timeLimit) {
  const k = timeLeft / timeLimit;
  return k >= 0.5 ? 3 : k >= 0.25 ? 2 : 1;
}

export function starsForTower(perfects, tower) {
  return perfects >= tower.star3 ? 3 : perfects >= tower.star2 ? 2 : 1;
}

/** Stars per level live in a compact digit string: "3321…" ('0' = not completed). */
export function starsOf(stars, n) {
  return Number(stars[n - 1] || 0);
}

export function withStars(stars, n, value) {
  const s = stars.padEnd(n, '0').split('');
  s[n - 1] = String(Math.max(Number(s[n - 1]) || 0, clamp(value, 0, 3)));
  return s.join('');
}
