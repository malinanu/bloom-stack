import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalPlatform } from '../public/src/platform/local.js';
import { createYouTubePlatform } from '../public/src/platform/youtube.js';
import { createCrazyGamesPlatform } from '../public/src/platform/crazygames.js';

const METHODS = ['init', 'firstFrameReady', 'gameReady', 'load', 'save', 'getLanguage', 'isAudioEnabled', 'onAudioChange',
  'onPause', 'onResume', 'gameplayStart', 'gameplayStop', 'celebrate', 'showInterstitial', 'showRewarded', 'submitScore'];

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function fakeYtgame({ inEnv = true, rewarded = true, failSave = false } = {}) {
  const calls = [];
  let data = '';
  const listeners = {};
  return {
    calls,
    listeners,
    IN_PLAYABLES_ENV: inEnv,
    SDK_VERSION: 'test',
    game: {
      firstFrameReady: () => calls.push('firstFrameReady'),
      gameReady: () => calls.push('gameReady'),
      loadData: async () => { calls.push('loadData'); return data; },
      saveData: async (d) => { calls.push('saveData'); if (failSave) throw new Error('quota'); data = d; },
    },
    system: {
      getLanguage: async () => 'de-DE',
      isAudioEnabled: () => false,
      onAudioEnabledChange: (cb) => { listeners.audio = cb; return () => {}; },
      onPause: (cb) => { listeners.pause = cb; return () => {}; },
      onResume: (cb) => { listeners.resume = cb; return () => {}; },
    },
    engagement: { sendScore: async (s) => { calls.push(`sendScore:${s.value}`); } },
    ads: {
      requestInterstitialAd: async () => { calls.push('interstitial'); },
      requestRewardedAd: async (id) => { calls.push(`rewarded:${id}`); return rewarded; },
    },
    health: { logError: () => {}, logWarning: () => calls.push('logWarning') },
  };
}

test('every adapter implements the whole interface', () => {
  const adapters = [
    createLocalPlatform({ storage: memoryStorage(), doc: null }),
    createYouTubePlatform({ yt: fakeYtgame() }),
    createYouTubePlatform({ yt: undefined, fallback: createLocalPlatform({ storage: memoryStorage(), doc: null }) }),
    createCrazyGamesPlatform({ getSdk: () => undefined, fallback: createLocalPlatform({ storage: memoryStorage(), doc: null }) }),
  ];
  for (const a of adapters) for (const m of METHODS) assert.equal(typeof a[m], 'function', `${a.name}.${m}`);
});

test('local adapter saves to storage and grants fake rewarded ads', async () => {
  const p = createLocalPlatform({ storage: memoryStorage(), doc: null, adMs: 1 });
  assert.equal(await p.load(), null);
  await p.save('{"cash":5}');
  assert.equal(await p.load(), '{"cash":5}');
  assert.equal(await p.showRewarded('x'), true);
});

test('YouTube: saveData is ignored until loadData has finished', async () => {
  const yt = fakeYtgame();
  const p = createYouTubePlatform({ yt });
  await p.save('early');
  assert.ok(!yt.calls.includes('saveData'));
  p.firstFrameReady();
  await p.load();
  p.gameReady();
  await p.save('{"cash":1}');
  assert.deepEqual(yt.calls, ['firstFrameReady', 'loadData', 'gameReady', 'saveData']);
  assert.equal(await p.load(), '{"cash":1}');
});

test('YouTube: language, audio, pause and score go through the SDK', async () => {
  const yt = fakeYtgame();
  const p = createYouTubePlatform({ yt });
  assert.equal(await p.getLanguage(), 'de-DE');
  assert.equal(p.isAudioEnabled(), false);
  let audio = null;
  p.onAudioChange((on) => { audio = on; });
  yt.listeners.audio(true);
  assert.equal(audio, true);
  let paused = false;
  p.onPause(() => { paused = true; });
  yt.listeners.pause();
  assert.equal(paused, true);
  p.submitScore(41.7);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(yt.calls.includes('sendScore:41'));
});

test('YouTube: ads report success and failure as booleans', async () => {
  const yes = createYouTubePlatform({ yt: fakeYtgame({ rewarded: true }) });
  const no = createYouTubePlatform({ yt: fakeYtgame({ rewarded: false }) });
  assert.equal(await yes.showRewarded('tower-revive'), true);
  assert.equal(await no.showRewarded('tower-revive'), false);
  const broken = fakeYtgame();
  broken.ads.requestInterstitialAd = async () => { throw new Error('no fill'); };
  assert.equal(await createYouTubePlatform({ yt: broken }).showInterstitial(), false);
});

test('YouTube: a failed cloud save is logged, not thrown', async () => {
  const yt = fakeYtgame({ failSave: true });
  const p = createYouTubePlatform({ yt });
  await p.load();
  const warn = console.warn;
  console.warn = () => {};
  try {
    await p.save('x');
  } finally {
    console.warn = warn;
  }
  assert.ok(yt.calls.includes('logWarning'));
});

test('YouTube: outside Playables everything falls back to the local adapter', async () => {
  const storage = memoryStorage();
  const p = createYouTubePlatform({ yt: fakeYtgame({ inEnv: false }), fallback: createLocalPlatform({ storage, doc: null }) });
  assert.equal(p.name, 'youtube-preview');
  await p.save('local');
  assert.equal(storage.getItem('bloomstack-save'), 'local');
});

test('CrazyGames: rewarded ads pause and mute the game, and resolve on finish or error', async () => {
  const events = [];
  let next = 'finish';
  const sdk = {
    environment: 'crazygames',
    init: async () => {},
    game: {
      settings: { muteAudio: false },
      loadingStart: () => events.push('loadingStart'),
      loadingStop: () => events.push('loadingStop'),
      gameplayStart: () => events.push('gameplayStart'),
      gameplayStop: () => events.push('gameplayStop'),
      happytime: () => events.push('happytime'),
      addSettingsChangeListener: () => {},
    },
    ad: {
      requestAd: (type, cb) => {
        events.push(`ad:${type}`);
        cb.adStarted();
        if (next === 'finish') cb.adFinished();
        else cb.adError({ code: 'unfilled' });
      },
    },
    data: { getItem: () => null, setItem: () => {} },
  };
  const p = createCrazyGamesPlatform({ getSdk: () => sdk, fallback: createLocalPlatform({ storage: memoryStorage(), doc: null }) });
  await p.init();
  const audio = [];
  p.onAudioChange((on) => audio.push(on));
  let pauses = 0;
  let resumes = 0;
  p.onPause(() => pauses++);
  p.onResume(() => resumes++);
  assert.equal(await p.showRewarded('boost'), true);
  next = 'error';
  assert.equal(await p.showRewarded('boost'), false);
  assert.deepEqual(audio, [false, true, false, true]);
  assert.equal(pauses, 2);
  assert.equal(resumes, 2);
  p.gameReady();
  assert.ok(events.includes('loadingStart') && events.includes('loadingStop'));
});
