// Boot and main loop. Order matters for YouTube Playables: SDK script (in index.html) → firstFrameReady
// once the loading screen shows → loadData before any saveData → gameReady once the title is interactive.
import * as THREE from 'three';
import platform from 'platform';
import { Assets } from './core/assets.js';
import { Input } from './core/input.js';
import { Sfx } from './core/audio.js';
import { setLanguage, applyToDom, t } from './core/i18n.js';
import { deserialize, SaveManager } from './core/save.js';
import { UPGRADE_KEYS, UPGRADES, upgradeValue, upgradeCost, towerReward, AD_COOLDOWN_SECONDS } from './core/economy.js';
import { Tweens } from './core/tween.js';
import { Farm } from './farm/farm.js';
import { Tower } from './tower/tower.js';
import { Particles } from './fx/particles.js';
import { Hud, formatCash } from './ui/hud.js';
import { Floaters } from './ui/floaters.js';
import { Arena } from './levels/arena.js';
import { LevelFlow } from './levels/flow.js';
import { LevelMap } from './ui/levelMap.js';
import { LEVEL_COUNT, levelFor } from './levels/levels.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let lowFx = params.has('lowfx');

const UPGRADE_LABEL = { capacity: 'capacity', speed: 'speed', reach: 'reach' };
const UPGRADE_FMT = { capacity: (v) => `${v} flowers`, speed: (v) => `${v.toFixed(1)} m/s`, reach: (v) => `${v.toFixed(2)} m` };

async function boot() {
  await platform.init();
  platform.firstFrameReady(); // the HTML loading screen is already on screen
  setLanguage(await platform.getLanguage());
  applyToDom();

  const raw = await platform.load();
  // ?reset starts a fresh game (dev builds only).
  const state = deserialize(params.has('reset') && platform.name === 'local' ? null : raw);
  const isNewPlayer = state.t === 0;
  const saver = new SaveManager((json) => platform.save(json), () => state);
  saver.ready();
  const save = (now = false) => (now ? saver.flush() : saver.request());

  const sfx = new Sfx();
  sfx.setMuted(state.muted);
  sfx.setPlatformAudio(platform.isAudioEnabled());
  platform.onAudioChange((on) => sfx.setPlatformAudio(on));

  // Canvas text (signs, price pads) needs the font loaded first.
  await Promise.race([document.fonts.load('40px "Lilita One"'), new Promise((r) => setTimeout(r, 1500))]);

  const assets = new Assets();
  await assets.load((k) => { $('load-bar').style.width = `${Math.round(k * 100)}%`; });

  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowFx, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowFx ? 1 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const hud = new Hud();
  const floaters = new Floaters($('floaters'));
  const input = new Input($('touch'), $('stick'));

  // title | map | farm (garden) | tower (endless) | arena (farm level) | tlevel (tower level)
  let mode = 'title';
  let paused = false; // player pressed pause
  let sysPaused = false; // platform paused us (tab hidden, ad, YouTube pause)
  let lastInterstitial = -Infinity;
  let currentZone = null;

  const farm = new Farm({
    assets, state, sfx, hud, floaters, platform, input, save, lowFx,
    onZone: (zone) => { currentZone = zone; showZone(zone); },
  });

  // ---------------------------------------------------------------- Flower Tower
  const towerTweens = new Tweens();
  let tower = null;
  const run = { reward: 0, doubled: false, collected: true, height: 0 };
  tower = new Tower({
    sfx,
    particles: null,
    tweens: towerTweens,
    onScore: (n) => {
      const el = $('tower-score');
      el.textContent = n;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
      if (n === 1) $('tower-hint').hidden = true;
    },
    onPerfect: (combo) => {
      const el = $('tower-combo');
      el.textContent = combo > 1 ? `${t('perfect')} ×${combo}` : t('perfect');
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
    },
    // Endless runs end with the old result card; tower levels go through the level flow.
    onGameOver: (height) => (mode === 'tlevel' ? flow.fail() : towerOver(height)),
    onWin: (r) => flow.onTowerWin(r),
    onHeart: () => flow.onHeartLost(),
    onGold: () => flow.onGold(),
  });
  tower.particles = new Particles(tower.scene);

  // ---------------------------------------------------------------- levels
  const arena = new Arena({
    assets, sfx, input, lowFx,
    onWin: (r) => flow.onFarmWin(r),
    onFail: () => flow.fail(),
  });

  /** Switch the renderer and HUD to a level's scene. */
  function setMode(m) {
    showZone(null);
    mode = m;
    $('title').hidden = true;
    levelMap.hide();
    hud.show(false);
    $('tower-over').hidden = true;
    if (m === 'arena') {
      $('tower-hud').hidden = true;
      input.setJoystick(true);
    } else {
      $('tower-hud').hidden = false;
      $('btn-tower-exit').hidden = true; // the level HUD has its own exit
      $('tower-hint').hidden = true; // the level banner already says "Tap to start"
      $('tower-score').textContent = '0';
      input.setJoystick(false);
      tower.particles.clear();
    }
  }

  function openMap() {
    if (flow.active) flow.stop();
    showZone(null);
    mode = 'map';
    $('title').hidden = true;
    $('tower-hud').hidden = true;
    $('tower-over').hidden = true;
    hud.show(false);
    input.setJoystick(false);
    platform.gameplayStop();
    levelMap.show(state);
  }

  function showTitle() {
    mode = 'title';
    levelMap.hide();
    hud.show(false);
    $('title').hidden = false;
  }

  const flow = new LevelFlow({
    state, save, platform, sfx, hud, arena, tower, setMode, openMap,
    rewarded: (id) => rewarded(id),
    maybeInterstitial: (eligible) => maybeInterstitial(eligible),
  });

  const levelMap = new LevelMap({
    onPick: (n) => { sfx.unlock(); sfx.startMusic(); flow.start(n); },
    onBack: () => showTitle(),
    onGarden: () => { levelMap.hide(); startFarm(); },
  });

  function startLevel(n) {
    $('title').hidden = true;
    flow.start(n);
  }

  function enterTower() {
    showZone(null);
    mode = 'tower';
    input.setJoystick(false);
    hud.show(false);
    $('title').hidden = true;
    $('tower-hud').hidden = false;
    $('btn-tower-exit').hidden = false;
    $('tower-over').hidden = true;
    $('tower-hint').hidden = false;
    run.doubled = false;
    run.collected = false;
    tower.particles.clear();
    tower.start();
    state.towerRuns++;
    save();
    platform.gameplayStart();
  }

  function towerOver(height) {
    run.height = height;
    const isBest = height > state.towerBest;
    if (isBest) state.towerBest = height;
    platform.submitScore(state.towerBest);
    platform.gameplayStop();
    run.reward = towerReward(height, state.unlocked, run.doubled);
    $('over-height').textContent = height;
    $('over-best').textContent = state.towerBest;
    $('over-newbest').hidden = !isBest || height === 0;
    $('over-reward').textContent = `$${formatCash(run.reward)}`;
    $('btn-revive').disabled = tower.revived;
    $('btn-double').disabled = run.doubled || run.reward === 0;
    $('tower-over').hidden = false;
    save(true);
  }

  function collectTower() {
    if (run.collected) return 0;
    run.collected = true;
    const reward = towerReward(tower.height, state.unlocked, run.doubled);
    if (reward > 0) {
      state.cash += reward;
      hud.setCash(state.cash);
    }
    save(true);
    return reward;
  }

  async function maybeInterstitial(eligible = state.towerRuns >= 2) {
    const now = performance.now() / 1000;
    if (!eligible || now - lastInterstitial < AD_COOLDOWN_SECONDS) return;
    lastInterstitial = now;
    await withAd(() => platform.showInterstitial());
  }

  function exitTower() {
    const reward = collectTower();
    mode = 'farm';
    $('tower-hud').hidden = true;
    $('tower-over').hidden = true;
    hud.show(true);
    input.setJoystick(true);
    platform.gameplayStart();
    if (reward > 0) hud.toast(`+$${formatCash(reward)} from the Flower Tower!`, 2.5);
    showZone(currentZone);
  }

  // ---------------------------------------------------------------- ads
  async function withAd(show) {
    sfx.setPaused(true);
    platform.gameplayStop();
    try {
      return await show();
    } catch {
      return false;
    } finally {
      sfx.setPaused(false);
      const playing = mode === 'farm' || (mode === 'arena' && arena.state === 'playing')
        || ((mode === 'tower' || mode === 'tlevel') && tower.state === 'playing');
      if (playing) platform.gameplayStart();
    }
  }

  async function rewarded(id) {
    const ok = await withAd(() => platform.showRewarded(id));
    if (!ok) hud.toast(t('noAd'), 2);
    return ok;
  }

  $('btn-boost').addEventListener('click', async () => {
    if (farm.boostRemaining() > 0) return;
    if (await rewarded('boost-2x-cash')) farm.startBoost();
  });
  $('btn-revive').addEventListener('click', async () => {
    if (tower.revived) return;
    if (await rewarded('tower-revive')) {
      $('tower-over').hidden = true;
      tower.revive();
      platform.gameplayStart();
    }
  });
  $('btn-double').addEventListener('click', async () => {
    if (run.doubled) return;
    if (await rewarded('tower-double-reward')) {
      run.doubled = true;
      run.reward = towerReward(run.height, state.unlocked, true);
      $('over-reward').textContent = `$${formatCash(run.reward)}`;
      $('btn-double').disabled = true;
    }
  });
  $('btn-again').addEventListener('click', async () => {
    collectTower();
    await maybeInterstitial();
    enterTower();
  });
  $('btn-farm').addEventListener('click', async () => {
    await maybeInterstitial();
    exitTower();
  });
  $('btn-tower-exit').addEventListener('click', () => {
    if (tower.state === 'playing') exitTower();
  });
  input.onTap(() => {
    sfx.unlock();
    sfx.startMusic();
    if (paused) return;
    // The first tap of a level only dismisses its banner (it must not also drop a slab).
    if (flow.bannerOpen) { flow.dismissBanner(); return; }
    if (mode === 'tower' && $('tower-over').hidden) tower.tap();
    if (mode === 'tlevel' && $('lv-fail').hidden && $('lv-win').hidden) tower.tap();
  });

  // ---------------------------------------------------------------- zones: upgrade stand & tower stand
  function showZone(zone) {
    $('panel-upgrades').hidden = zone !== 'upgrades' || mode !== 'farm';
    $('panel-tower').hidden = zone !== 'tower' || mode !== 'farm';
    if (zone === 'upgrades') renderUpgrades();
    if (zone === 'tower') $('tower-best-farm').textContent = state.towerBest ? `${t('best')}: ${state.towerBest}` : '';
  }

  function renderUpgrades() {
    const box = $('upgrade-cards');
    box.innerHTML = '';
    for (const key of UPGRADE_KEYS) {
      const level = state.upgrades[key];
      const cost = upgradeCost(key, level);
      const max = UPGRADES[key].cost.length;
      const card = document.createElement('div');
      card.className = 'card-up';
      const next = cost === null ? '' : ` → ${UPGRADE_FMT[key](upgradeValue(key, level + 1))}`;
      card.innerHTML = `<div class="name">${t(UPGRADE_LABEL[key])}</div>
        <div class="lvl">${Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</div>
        <div class="val">${UPGRADE_FMT[key](upgradeValue(key, level))}${next}</div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-green${cost !== null && state.cash < cost ? ' poor' : ''}`;
      btn.textContent = cost === null ? t('maxed') : `$${formatCash(cost)}`;
      btn.disabled = cost === null;
      btn.addEventListener('click', () => {
        const res = farm.buyUpgrade(key);
        if (res === 'poor') hud.toast('Not enough cash yet', 1.5);
        renderUpgrades();
      });
      card.appendChild(btn);
      box.appendChild(card);
    }
  }
  let upgradeKey = '';

  $('btn-tower-go').addEventListener('click', () => enterTower());

  // ---------------------------------------------------------------- title, pause, sound
  function startFarm() {
    $('title').hidden = true;
    mode = 'farm';
    hud.show(true);
    input.setJoystick(true);
    platform.gameplayStart();
    if (isNewPlayer) hud.toast('Drag anywhere to walk. Mow the tulips!', 3.5);
  }
  $('btn-play').addEventListener('click', () => { sfx.unlock(); sfx.startMusic(); openMap(); });
  $('btn-garden').addEventListener('click', () => { sfx.unlock(); sfx.startMusic(); startFarm(); });
  $('btn-levels').addEventListener('click', () => openMap());

  function setPaused(p) {
    if (mode === 'title' || mode === 'map') return;
    paused = p;
    $('pause').hidden = !p;
    sfx.setPaused(p || sysPaused);
    if (p) { platform.gameplayStop(); save(true); } else platform.gameplayStart();
  }
  $('btn-pause').addEventListener('click', () => setPaused(true));
  $('btn-resume').addEventListener('click', () => setPaused(false));

  const soundBtn = $('btn-sound');
  const syncSoundBtn = () => {
    soundBtn.classList.toggle('muted', state.muted);
    soundBtn.setAttribute('aria-label', state.muted ? 'Sound off' : 'Sound on');
  };
  soundBtn.addEventListener('click', () => {
    state.muted = !state.muted;
    sfx.unlock();
    sfx.setMuted(state.muted);
    syncSoundBtn();
    save();
  });
  syncSoundBtn();

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'm') soundBtn.click();
    if (k === 'p' || k === 'escape') setPaused(!paused);
  });

  platform.onPause(() => {
    sysPaused = true;
    sfx.setPaused(true);
    save(true);
  });
  platform.onResume(() => {
    sysPaused = false;
    sfx.setPaused(paused);
    last = performance.now();
  });

  // ---------------------------------------------------------------- resize & loop
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    farm.rig.resize(w / h);
    tower.resize(w / h);
    arena.resize(w / h);
  }
  window.addEventListener('resize', resize);
  resize();

  // Drop resolution if the device struggles (like the runner's ?lowfx).
  let fpsTime = 0;
  let fpsFrames = 0;
  let lowered = lowFx;
  function adapt(dt) {
    fpsTime += dt;
    fpsFrames++;
    if (fpsTime < 3) return;
    const fps = fpsFrames / fpsTime;
    fpsTime = 0;
    fpsFrames = 0;
    if (fps < 40 && !lowered) {
      lowered = true;
      renderer.setPixelRatio(1);
      resize();
    }
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (paused || sysPaused) return;
    tick(dt);
  }

  function tick(dt) {
    input.update();
    hud.update(dt);
    if (mode === 'tower' || mode === 'tlevel') {
      tower.update(dt);
      tower.particles.update(dt);
      towerTweens.update(dt);
      if (mode === 'tlevel') flow.update(dt);
      renderer.render(tower.scene, tower.camera);
      floaters.update(dt, tower.camera, window.innerWidth, window.innerHeight);
    } else if (mode === 'arena') {
      arena.update(dt, true);
      flow.update(dt);
      renderer.render(arena.scene, arena.camera);
      floaters.update(dt, arena.camera, window.innerWidth, window.innerHeight);
    } else if (mode === 'map') {
      // The map is a DOM screen over the canvas: nothing to render.
    } else {
      farm.update(dt, mode === 'farm');
      hud.setBoost(farm.boostRemaining());
      if (currentZone === 'upgrades') {
        // Re-render only when affordability changes, so buttons aren't replaced mid-click.
        const key = UPGRADE_KEYS.map((k) => `${state.upgrades[k]}:${state.cash >= (upgradeCost(k, state.upgrades[k]) ?? Infinity)}`).join();
        if (key !== upgradeKey) { upgradeKey = key; renderUpgrades(); }
      }
      renderer.render(farm.scene, farm.camera);
      floaters.update(dt, farm.camera, window.innerWidth, window.innerHeight);
    }
    adapt(dt);
  }

  // Dev builds only: a handle for debugging and automated play tests.
  if (platform.name === 'local') {
    // step(seconds) advances the game at 60 fps even when the tab is in the background.
    const step = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) tick(1 / 60); };
    window.__bloom = { farm, tower, arena, flow, levelMap, state, input, startFarm, enterTower, exitTower, openMap, startLevel, levelFor, LEVEL_COUNT, step, THREE };
  }

  // First frame behind the title, then hand control to the player.
  renderer.render(farm.scene, farm.camera);
  $('loading').hidden = true;
  $('title').hidden = false;
  hud.setCash(state.cash, true);
  requestAnimationFrame(frame);
  platform.gameReady();

  // ?level=N opens a level directly (dev builds only).
  const jump = Number(params.get('level'));
  if (platform.name === 'local' && Number.isInteger(jump) && jump >= 1) startLevel(jump);

  // Safety net: write any pending change every 30 s.
  setInterval(() => save(), 30000);
  window.addEventListener('pagehide', () => save(true));
}

boot().catch((err) => {
  console.error(err);
  const p = document.querySelector('#loading p');
  if (p) p.textContent = 'Something went wrong. Please reload.';
});
