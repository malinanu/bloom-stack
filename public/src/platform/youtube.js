// YouTube Playables adapter. The SDK (<script src="https://www.youtube.com/game_api/v1">) is added to
// index.html by `npm run build`, before any game code. Outside Playables (local preview of the build)
// the SDK does nothing, so everything falls back to the local adapter.
import { createLocalPlatform } from './local.js';

export function createYouTubePlatform({ yt = globalThis.ytgame, fallback = createLocalPlatform() } = {}) {
  const inPlayables = typeof yt !== 'undefined' && yt !== null && yt.IN_PLAYABLES_ENV === true;
  if (!inPlayables) return { ...fallback, name: 'youtube-preview' };

  let loaded = false;
  return {
    name: 'youtube',
    async init() {},
    firstFrameReady() { yt.game.firstFrameReady(); },
    gameReady() { yt.game.gameReady(); },
    async load() {
      try {
        const data = await yt.game.loadData();
        return data || null;
      } finally {
        loaded = true; // saveData must never run before loadData has finished
      }
    },
    async save(str) {
      if (!loaded) return;
      try { await yt.game.saveData(str); } catch (err) { yt.health?.logWarning?.(); console.warn('saveData failed', err); }
    },
    async getLanguage() {
      try { return await yt.system.getLanguage(); } catch { return 'en'; }
    },
    isAudioEnabled() { return yt.system.isAudioEnabled(); },
    onAudioChange(cb) { yt.system.onAudioEnabledChange(cb); },
    onPause(cb) { yt.system.onPause(cb); },
    onResume(cb) { yt.system.onResume(cb); },
    gameplayStart() {},
    gameplayStop() {},
    celebrate() {},
    async showInterstitial() {
      try {
        await yt.ads.requestInterstitialAd();
        return true;
      } catch {
        return false;
      }
    },
    async showRewarded(id) {
      try { return (await yt.ads.requestRewardedAd(id)) === true; } catch { return false; }
    },
    submitScore(n) {
      const value = Math.max(0, Math.floor(n));
      yt.engagement.sendScore({ value }).catch(() => {});
    },
  };
}

export default createYouTubePlatform();
