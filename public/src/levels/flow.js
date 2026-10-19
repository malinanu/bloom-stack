// Level flow: intro banner → play (farm arena or tower) → win card with stars, or fail card → next / retry.
// Owns the level HUD and result cards; main.js owns rendering and modes.
import { LEVEL_COUNT, levelFor, rewardFor, starsForFarm, starsForTower, withStars } from './levels.js';
import { formatCash } from '../ui/hud.js';
import { t } from '../core/i18n.js';

const $ = (id) => document.getElementById(id);
const CONTINUE_SECONDS = 15;
const BANNER_SECONDS = 1.8;

function restartAnimation(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export class LevelFlow {
  /**
   * @param {{ state: object, save: (now?: boolean) => void, platform: object, sfx: object, hud: object,
   *   arena: import('./arena.js').Arena, tower: import('../tower/tower.js').Tower,
   *   setMode: (m: 'arena' | 'tlevel') => void, openMap: () => void,
   *   rewarded: (id: string) => Promise<boolean>, maybeInterstitial: (eligible: boolean) => Promise<void> }} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.def = null;
    this.active = false;
    this.bannerOpen = false;
    this.bannerTime = 0;
    this.result = null;

    $('lv-next').addEventListener('click', () => this.next());
    $('lv-win-map').addEventListener('click', () => this.toMap());
    $('lv-double').addEventListener('click', () => this.double());
    $('lv-retry').addEventListener('click', () => this.start(this.def.n));
    $('lv-fail-map').addEventListener('click', () => this.toMap());
    $('lv-continue').addEventListener('click', () => this.continueRun());
    $('lv-exit').addEventListener('click', () => this.toMap());
  }

  get kind() {
    return this.def?.kind;
  }

  start(n) {
    const { arena, tower, setMode, platform } = this.ctx;
    const def = levelFor(n);
    this.def = def;
    this.active = true;
    this.result = null;
    this.continued = false;
    this.goldBonus = 0;
    $('lv-win').hidden = true;
    $('lv-fail').hidden = true;
    $('level-hud').hidden = false;
    $('lv-tag').textContent = `${t('level')} ${n}`;
    $('level-hud').classList.toggle('boss', def.boss);
    $('level-hud').dataset.kind = def.kind;
    $('lv-fill').style.width = '0%';

    if (def.kind === 'farm') {
      arena.start(def);
      setMode('arena');
    } else {
      tower.start(def.tower);
      tower.state = 'ready'; // the slab waits under the banner
      setMode('tlevel');
    }
    this.renderHearts();
    this.showBanner();
    platform.gameplayStart();
  }

  showBanner() {
    const d = this.def;
    const el = $('lv-banner');
    $('lv-boss').hidden = !d.boss;
    $('lv-num').textContent = `${t('level')} ${d.n}`;
    $('lv-goal').textContent = d.intro;
    const fresh = d.fresh;
    $('lv-new').hidden = !fresh;
    if (fresh) $('lv-new').textContent = `${t('newTwist')}: ${fresh.label}! ${fresh.hint}`;
    el.hidden = false;
    el.classList.toggle('boss', d.boss);
    restartAnimation(el, 'in');
    this.bannerOpen = true;
    this.bannerTime = fresh ? BANNER_SECONDS + 1.4 : BANNER_SECONDS;
    this.ctx.sfx.pop();
  }

  /** First tap (or the banner timing out) starts the level. */
  dismissBanner() {
    if (!this.bannerOpen) return;
    this.bannerOpen = false;
    $('lv-banner').hidden = true;
    if (this.kind === 'farm') this.ctx.arena.begin();
    else this.ctx.tower.state = 'playing';
  }

  renderHearts() {
    const el = $('lv-hearts');
    if (this.kind !== 'tower') { el.innerHTML = ''; return; }
    const { tower } = this.ctx;
    const total = this.def.tower.hearts;
    el.innerHTML = Array.from({ length: Math.max(total, tower.hearts) }, (_, i) => `<i class="${i < tower.hearts ? 'on' : ''}"></i>`).join('');
  }

  onHeartLost() {
    this.renderHearts();
    restartAnimation($('lv-hearts'), 'hit');
  }

  onGold() {
    const bonus = 10 + this.def.n;
    this.goldBonus += bonus;
    const el = $('tower-combo');
    el.textContent = `GOLD +$${bonus}`;
    restartAnimation(el, 'on');
  }

  update(dt) {
    if (!this.active) return;
    if (this.bannerOpen) {
      this.bannerTime -= dt;
      if (this.bannerTime <= 0) this.dismissBanner();
    }
    const d = this.def;
    if (d.kind === 'farm') {
      const { arena } = this.ctx;
      const pct = Math.floor(arena.progress * 100);
      $('lv-fill').style.width = `${pct}%`;
      $('lv-text').textContent = `${pct}%`;
      const s = Math.ceil(arena.timeLeft);
      const timer = $('lv-timer');
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (timer.textContent !== text) timer.textContent = text;
      timer.classList.toggle('low', s <= 10 && arena.state === 'playing');
    } else {
      const { tower } = this.ctx;
      const k = Math.min(1, tower.height / d.tower.target);
      $('lv-fill').style.width = `${Math.round(k * 100)}%`;
      $('lv-text').textContent = `${tower.height} / ${d.tower.target}`;
      $('lv-timer').textContent = '';
    }
  }

  // ------------------------------------------------------------------ results

  onFarmWin({ timeLeft }) {
    this.complete(starsForFarm(timeLeft, this.def.farm.timeLimit));
  }

  onTowerWin({ perfects }) {
    this.complete(starsForTower(perfects, this.def.tower));
  }

  complete(stars) {
    const { state, save, platform, hud, sfx } = this.ctx;
    const d = this.def;
    const reward = rewardFor(d.n, stars, d.boss) + this.goldBonus;
    state.stars = withStars(state.stars, d.n, stars);
    if (state.level <= d.n) state.level = d.n + 1;
    state.levelWins++;
    state.cash += reward;
    hud.setCash(state.cash, true);
    save(true);
    platform.gameplayStop();
    if (d.boss) platform.celebrate();
    this.result = { stars, reward, doubled: false };

    $('lv-win-title').textContent = d.boss ? t('bossDefeated') : t('levelComplete');
    $('lv-win-level').textContent = `Level ${d.n}`;
    $('lv-reward').textContent = `+$${formatCash(reward)}`;
    $('lv-double').disabled = false;
    $('lv-next').textContent = d.n >= LEVEL_COUNT ? t('moreSoon') : `${t('level')} ${d.n + 1} ▶`;
    $('lv-next').disabled = d.n >= LEVEL_COUNT;
    const starEls = [...document.querySelectorAll('#lv-stars i')];
    starEls.forEach((el) => el.classList.remove('on', 'pop'));
    $('lv-win').hidden = false;
    // Stars pop in one by one with a rising chime.
    starEls.forEach((el, i) => {
      if (i >= stars) return;
      setTimeout(() => {
        el.classList.add('on', 'pop');
        sfx.perfect(i + 3);
      }, 350 + i * 320);
    });
  }

  fail() {
    const { platform } = this.ctx;
    const d = this.def;
    platform.gameplayStop();
    $('lv-fail-title').textContent = d.kind === 'farm' ? t('outOfTime') : t('towerToppled');
    $('lv-fail-text').textContent = d.kind === 'farm'
      ? `${Math.floor(this.ctx.arena.progress * 100)}${t('mowedSoClose')}`
      : `${this.ctx.tower.height} / ${d.tower.target} ${t('layersOf')}`;
    $('lv-continue').disabled = this.continued;
    $('lv-continue-label').textContent = d.kind === 'farm' ? `+${CONTINUE_SECONDS}s` : '+1 heart';
    $('lv-fail').hidden = false;
  }

  async continueRun() {
    if (this.continued) return;
    if (!(await this.ctx.rewarded('level-continue'))) return;
    this.continued = true;
    $('lv-fail').hidden = true;
    if (this.kind === 'farm') this.ctx.arena.addTime(CONTINUE_SECONDS);
    else {
      this.ctx.tower.revive();
      this.renderHearts();
    }
    this.ctx.platform.gameplayStart();
  }

  async double() {
    const r = this.result;
    if (!r || r.doubled) return;
    if (!(await this.ctx.rewarded('level-double-coins'))) return;
    r.doubled = true;
    const { state, save, hud } = this.ctx;
    state.cash += r.reward;
    hud.setCash(state.cash, true);
    save(true);
    $('lv-reward').textContent = `+$${formatCash(r.reward * 2)}`;
    $('lv-double').disabled = true;
  }

  async next() {
    const n = this.def.n + 1;
    if (n > LEVEL_COUNT) { this.toMap(); return; }
    // Interstitial at a natural break: every third win from level 4 on (the platform cooldown still applies).
    await this.ctx.maybeInterstitial(this.def.n >= 4 && this.ctx.state.levelWins % 3 === 0);
    this.start(n);
  }

  toMap() {
    this.stop();
    this.ctx.openMap();
  }

  stop() {
    this.active = false;
    this.bannerOpen = false;
    for (const id of ['level-hud', 'lv-banner', 'lv-win', 'lv-fail']) $(id).hidden = true;
    this.ctx.platform.gameplayStop();
  }
}
