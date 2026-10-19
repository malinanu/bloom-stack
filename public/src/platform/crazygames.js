// CrazyGames HTML5 SDK v3 adapter. The SDK (<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js">)
// is added to index.html by `npm run build`. Off CrazyGames domains the SDK is "disabled", so we fall back.
import { createLocalPlatform } from './local.js';

const SAVE_KEY = 'bloomstack-save';

export function createCrazyGamesPlatform({
  getSdk = () => globalThis.CrazyGames?.SDK,
  fallback = createLocalPlatform(),
} = {}) {
  let sdk = null;
  const audioCbs = [];
  const pauseCbs = [];
  const resumeCbs = [];
  let settingsMuted = false;
  let adPlaying = false;

  const audioOn = () => !settingsMuted && !adPlaying;
  const emitAudio = () => { for (const cb of audioCbs) cb(audioOn()); };

  // Pause and mute the game while an ad plays, as CrazyGames requires.
  const requestAd = (type) => new Promise((resolve) => {
    if (!sdk) { resolve(false); return; }
    let started = false;
    const end = (ok) => {
      if (started) {
        adPlaying = false;
        emitAudio();
        for (const cb of resumeCbs) cb();
      }
      resolve(ok);
    };
    sdk.ad.requestAd(type, {
      adStarted: () => {
        started = true;
        adPlaying = true;
        emitAudio();
        for (const cb of pauseCbs) cb();
      },
      adFinished: () => end(true),
      adError: () => end(false),
    });
  });

  return {
    name: 'crazygames',
    async init() {
      const candidate = getSdk();
      if (!candidate) return;
      try {
        await candidate.init();
        if (candidate.environment === 'disabled') return;
        sdk = candidate;
        sdk.game.loadingStart();
        settingsMuted = !!sdk.game.settings?.muteAudio;
        sdk.game.addSettingsChangeListener((s) => {
          settingsMuted = !!s.muteAudio;
          emitAudio();
        });
      } catch (err) {
        console.warn('CrazyGames SDK unavailable, using local fallback', err);
        sdk = null;
      }
    },
    firstFrameReady() {},
    gameReady() { sdk?.game.loadingStop(); },
    async load() {
      if (!sdk) return fallback.load();
      try { return sdk.data.getItem(SAVE_KEY); } catch { return null; }
    },
    async save(str) {
      if (!sdk) return fallback.save(str);
      try { sdk.data.setItem(SAVE_KEY, str); } catch (err) { console.warn('CrazyGames save failed', err); }
    },
    async getLanguage() { return globalThis.navigator?.language || 'en'; },
    isAudioEnabled() { return audioOn(); },
    onAudioChange(cb) { audioCbs.push(cb); },
    onPause(cb) { pauseCbs.push(cb); fallback.onPause(cb); },
    onResume(cb) { resumeCbs.push(cb); fallback.onResume(cb); },
    gameplayStart() { sdk?.game.gameplayStart(); },
    gameplayStop() { sdk?.game.gameplayStop(); },
    celebrate() { sdk?.game.happytime(); },
    async showInterstitial() { return sdk ? requestAd('midgame') : fallback.showInterstitial(); },
    async showRewarded(id) { return sdk ? requestAd('rewarded') : fallback.showRewarded(id); },
    submitScore() {},
  };
}

export default createCrazyGamesPlatform();
