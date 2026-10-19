// Versioned save data. Pure (no DOM / three.js) so it is unit tested in Node.
// The platform adapter stores the serialized string (YouTube cloud save, CrazyGames data, or localStorage).
import { FLOWER_TYPES, UNLOCKS, UPGRADES, UPGRADE_KEYS } from './economy.js';

export const SAVE_VERSION = 1;
const MAX_STACK = 200;
const MAX_LEVELS = 10000;

const perType = (v = 0) => Object.fromEntries(FLOWER_TYPES.map((t) => [t, v]));

export function defaultSave() {
  return {
    v: SAVE_VERSION,
    cash: 0,
    pile: 0, // cash waiting at the sell counter
    stack: [], // flower types carried, bottom first
    table: perType(), // flowers on the bouquet table
    shelf: perType(), // wrapped bouquets at the sell counter
    unlocked: [],
    paid: {}, // cash already paid into unlock pads that aren't finished
    upgrades: Object.fromEntries(UPGRADE_KEYS.map((k) => [k, 0])),
    towerBest: 0,
    towerRuns: 0,
    level: 1, // highest level unlocked
    stars: '', // one digit per level: '0'–'3'
    levelWins: 0, // levels won (paces interstitial ads)
    muted: false,
    t: 0,
  };
}

const num = (v, fallback = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);

/** Accept anything (old versions, corrupted or hand-edited data) and return a valid current save. */
export function migrate(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  // v0 (pre-release prototype) stored money as `money`.
  if (raw.v === undefined && raw.money !== undefined) raw = { ...raw, cash: raw.money };

  d.cash = num(raw.cash);
  d.pile = num(raw.pile);
  if (Array.isArray(raw.stack)) d.stack = raw.stack.filter((t) => FLOWER_TYPES.includes(t)).slice(0, MAX_STACK);
  for (const key of ['table', 'shelf']) {
    if (raw[key] && typeof raw[key] === 'object') for (const t of FLOWER_TYPES) d[key][t] = num(raw[key][t]);
  }
  const ids = new Set(UNLOCKS.map((u) => u.id));
  if (Array.isArray(raw.unlocked)) d.unlocked = [...new Set(raw.unlocked.filter((id) => ids.has(id)))];
  if (raw.paid && typeof raw.paid === 'object') {
    for (const u of UNLOCKS) {
      const v = num(raw.paid[u.id]);
      if (v > 0 && !d.unlocked.includes(u.id)) d.paid[u.id] = Math.min(v, u.price);
    }
  }
  if (raw.upgrades && typeof raw.upgrades === 'object') {
    for (const k of UPGRADE_KEYS) d.upgrades[k] = Math.min(num(raw.upgrades[k]), UPGRADES[k].cost.length);
  }
  d.towerBest = num(raw.towerBest);
  d.towerRuns = num(raw.towerRuns);
  if (typeof raw.stars === 'string') d.stars = raw.stars.replace(/[^0-3]/g, '0').slice(0, MAX_LEVELS);
  // The unlocked level is at least one past the last level with stars.
  const lastWon = d.stars.replace(/0+$/, '').length;
  d.level = Math.min(MAX_LEVELS, Math.max(1, num(raw.level, 1), lastWon + 1));
  d.levelWins = num(raw.levelWins);
  d.muted = raw.muted === true;
  d.t = num(raw.t);
  return d;
}

export function serialize(state) {
  return JSON.stringify({ ...migrate(state), v: SAVE_VERSION });
}

export function deserialize(str) {
  if (!str) return defaultSave();
  try {
    return migrate(JSON.parse(str));
  } catch {
    return defaultSave();
  }
}

/**
 * Debounced writer. `request()` marks the save dirty; `flush()` writes now.
 * Never overlaps writes, and never writes before `ready()` (YouTube requires loadData before saveData).
 */
export class SaveManager {
  constructor(write, getState, { delayMs = 1500, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.write = write;
    this.getState = getState;
    this.delayMs = delayMs;
    this.now = now;
    // Wrapped so the browser's timers aren't called as methods of this object ("Illegal invocation").
    this.setTimer = (fn, ms) => setTimer(fn, ms);
    this.clearTimer = (id) => clearTimer(id);
    this.isReady = false;
    this.dirty = false;
    this.writing = null;
    this.timer = null;
    this.lastJson = '';
  }

  ready() {
    this.isReady = true;
    if (this.dirty) this.request();
  }

  request() {
    this.dirty = true;
    if (!this.isReady || this.timer) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.flush();
    }, this.delayMs);
  }

  async flush() {
    if (!this.isReady) return;
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (this.writing) await this.writing;
    const json = serialize({ ...this.getState(), t: this.now() });
    this.dirty = false;
    // Skip identical writes (the timestamp is excluded from the comparison).
    const key = json.replace(/"t":\d+/, '');
    if (key === this.lastJson) return;
    this.lastJson = key;
    this.writing = Promise.resolve()
      .then(() => this.write(json))
      .catch((err) => console.warn('Save failed', err))
      .finally(() => { this.writing = null; });
    await this.writing;
  }
}
