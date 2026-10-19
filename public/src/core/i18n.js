// UI strings. English is required on YouTube Playables; add languages as extra tables keyed by BCP-47 prefix.

const STRINGS = {
  en: {
    title: 'Bloom Stack',
    tagline: 'Mow, stack, sell, grow!',
    playFarm: 'Play',
    playTower: 'Flower Tower',
    loading: 'Growing flowers…',
    max: 'MAX',
    upgrades: 'Upgrades',
    capacity: 'Stack size',
    speed: 'Speed',
    reach: 'Scythe reach',
    maxed: 'Maxed',
    boost: '2× cash',
    boostActive: '2× cash',
    watchAd: 'Watch ad',
    noAd: 'No ad available right now',
    towerHint: 'Tap to drop',
    perfect: 'Perfect!',
    gameOver: 'Tower toppled!',
    height: 'Height',
    best: 'Best',
    reward: 'Reward',
    revive: 'Revive',
    double: '2× reward',
    collect: 'Collect',
    backToFarm: 'Back to farm',
    paused: 'Paused',
    resume: 'Resume',
    newBest: 'New best!',
    towerStand: 'Flower Tower',
    full: 'Stack full! Drop at the florist',
  },
};

let table = STRINGS.en;

export function setLanguage(tag) {
  const lang = String(tag || 'en').toLowerCase().split('-')[0];
  table = STRINGS[lang] || STRINGS.en;
}

export function t(key) {
  return table[key] ?? STRINGS.en[key] ?? key;
}

/** Fill every element marked data-i18n with its string. */
export function applyToDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}
