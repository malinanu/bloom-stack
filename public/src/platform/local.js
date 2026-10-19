// Development / plain-web adapter: localStorage saves and a fake ad overlay so ad flows can be tested.
// Every platform adapter exposes the same interface (see README "Platform layer").

const SAVE_KEY = 'bloomstack-save';

function fakeAd(doc, label, ms, rewarded) {
  if (!doc) return new Promise((resolve) => setTimeout(() => resolve(true), ms));
  return new Promise((resolve) => {
    const el = doc.createElement('div');
    el.className = 'fake-ad';
    el.innerHTML = `<div class="fake-ad-box"><b>${label}</b><span>Dev preview: a real ad shows here</span><em></em>${
      rewarded ? '<button type="button">Close (no reward)</button>' : ''}</div>`;
    doc.body.appendChild(el);
    const counter = el.querySelector('em');
    const end = Date.now() + ms;
    const tick = setInterval(() => { counter.textContent = `${Math.max(0, Math.ceil((end - Date.now()) / 1000))}`; }, 100);
    const done = (ok) => {
      clearInterval(tick);
      clearTimeout(timer);
      el.remove();
      resolve(ok);
    };
    const timer = setTimeout(() => done(true), ms);
    el.querySelector('button')?.addEventListener('click', () => done(false));
  });
}

export function createLocalPlatform({
  storage = globalThis.localStorage,
  doc = globalThis.document,
  adMs = 1500,
  language = globalThis.navigator?.language || 'en',
} = {}) {
  const pauseCbs = [];
  const resumeCbs = [];
  if (doc) {
    doc.addEventListener('visibilitychange', () => {
      for (const cb of doc.hidden ? pauseCbs : resumeCbs) cb();
    });
  }
  return {
    name: 'local',
    async init() {},
    firstFrameReady() {},
    gameReady() {},
    async load() {
      try { return storage?.getItem(SAVE_KEY) ?? null; } catch { return null; }
    },
    async save(str) {
      try { storage?.setItem(SAVE_KEY, str); } catch { /* storage full or blocked */ }
    },
    async getLanguage() { return language; },
    isAudioEnabled() { return true; },
    onAudioChange() {},
    onPause(cb) { pauseCbs.push(cb); },
    onResume(cb) { resumeCbs.push(cb); },
    gameplayStart() {},
    gameplayStop() {},
    celebrate() {},
    async showInterstitial() { return fakeAd(doc, 'Ad break', adMs, false); },
    async showRewarded() { return fakeAd(doc, 'Rewarded ad', adMs, true); },
    submitScore(n) { console.info('[local] score', n); },
  };
}

export default createLocalPlatform();
