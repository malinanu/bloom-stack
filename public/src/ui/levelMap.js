// Candy Crush-style level map: a winding path from level 1 (bottom) up to LEVEL_COUNT, chapter bands,
// stars under each node, the gardener's hat on the current level, and a level card on tap.
import { LEVEL_COUNT, TOWER_TWISTS, FARM_TWISTS, levelInfo, levelFor, chapterFor, starsOf, rewardFor } from '../levels/levels.js';
import { formatCash } from './hud.js';
import { t } from '../core/i18n.js';

const STEP = 112; // px between levels
const PAD_BOTTOM = 260; // room for the floating Play button under level 1
const PAD_TOP = 240;
const $ = (id) => document.getElementById(id);

const ICONS = {
  farm: '<svg viewBox="0 0 24 24"><path d="M12 22v-9" stroke="#3f9b3a" stroke-width="2.4" stroke-linecap="round"/><path d="M6 4l3 3 3-4 3 4 3-3v5c0 4-3 6-6 6s-6-2-6-6z" fill="#ff5c9a"/></svg>',
  tower: '<svg viewBox="0 0 24 24"><rect x="4" y="16" width="16" height="4" rx="1" fill="#ff5c9a"/><rect x="5" y="11" width="14" height="4" rx="1" fill="#f08ad8"/><rect x="6.5" y="6" width="11" height="4" rx="1" fill="#ffd23f"/></svg>',
  boss: '<svg viewBox="0 0 24 24"><path d="M3 18l2-10 5 5 2-7 2 7 5-5 2 10z" fill="#ffd23f" stroke="#b07a00" stroke-width="1.2" stroke-linejoin="round"/></svg>',
};
const HAT = '<svg viewBox="0 0 64 40"><ellipse cx="32" cy="30" rx="30" ry="8" fill="#f2cf6b" stroke="#c99a2e" stroke-width="2"/><path d="M16 29c0-14 6-24 16-24s16 10 16 24z" fill="#f2cf6b" stroke="#c99a2e" stroke-width="2"/><path d="M16.5 24h31" stroke="#e0457b" stroke-width="5"/></svg>';

function seeded(n) {
  let s = n * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export class LevelMap {
  /** @param {{ onPick: (n: number) => void, onBack: () => void, onGarden: () => void }} o */
  constructor({ onPick, onBack, onGarden }) {
    this.root = $('map');
    this.scroll = $('map-scroll');
    this.path = $('map-path');
    this.onPick = onPick;
    this.width = 0;
    this.nodes = [];
    this.state = null;

    this.path.addEventListener('click', (e) => {
      const node = e.target.closest('.node');
      if (!node || node.classList.contains('locked')) return;
      this.openCard(Number(node.dataset.n));
    });
    $('map-play').addEventListener('click', () => this.onPick(this.current()));
    $('map-back').addEventListener('click', onBack);
    $('map-garden').addEventListener('click', onGarden);
    $('lc-play').addEventListener('click', () => {
      const n = Number($('level-card').dataset.n);
      $('level-card').hidden = true;
      this.onPick(n);
    });
    $('lc-close').addEventListener('click', () => { $('level-card').hidden = true; });
    window.addEventListener('resize', () => { if (!this.root.hidden) this.show(this.state); });
  }

  current() {
    return Math.min(this.state.level, LEVEL_COUNT);
  }

  pos(n, w) {
    const H = PAD_BOTTOM + (LEVEL_COUNT - 1) * STEP + PAD_TOP;
    const y = H - (PAD_BOTTOM + (n - 1) * STEP);
    const swing = Math.min(w * 0.3, 150);
    const x = w / 2 + Math.sin((n - 1) * 0.78) * swing;
    return { x, y, H };
  }

  build() {
    const w = this.scroll.clientWidth || window.innerWidth;
    this.width = w;
    const { H } = this.pos(1, w);
    this.path.style.height = `${H}px`;
    const parts = [];

    // Chapter bands (bottom to top), each with its own sky and a banner where it starts.
    const chapters = Math.ceil(LEVEL_COUNT / 10);
    for (let c = 0; c < chapters; c++) {
      const first = c * 10 + 1;
      const last = Math.min(LEVEL_COUNT, first + 9);
      const bottom = c === 0 ? H : this.pos(first, w).y + STEP / 2;
      const top = last === LEVEL_COUNT ? 0 : this.pos(last, w).y - STEP / 2;
      const ch = chapterFor(first);
      parts.push(`<div class="band" style="top:${top}px;height:${bottom - top}px;background:linear-gradient(${ch.sky[1]},${ch.sky[0]})"></div>`);
      const labelTop = c === 0 ? this.pos(1, w).y + 62 : bottom - 46;
      parts.push(`<div class="chapter" style="top:${labelTop}px;--c:${ch.color}"><span>${t('chapter')} ${c + 1}</span><b>${ch.name}</b></div>`);
      // A few flowers dotted around the band.
      const r = seeded(c + 1);
      for (let i = 0; i < 7; i++) {
        const fx = r() < 0.5 ? 6 + r() * 16 : 78 + r() * 16;
        const fy = top + 30 + r() * (bottom - top - 80);
        const hue = Math.floor(r() * 360);
        parts.push(`<i class="deco" style="left:${fx}%;top:${fy}px;--h:${hue}deg;transform:scale(${0.7 + r() * 0.6})"></i>`);
      }
    }

    // The winding path through every node.
    let d = '';
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const p = this.pos(n, w);
      if (n === 1) d += `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      else {
        const q = this.pos(n - 1, w);
        d += ` C${q.x.toFixed(1)} ${(q.y - STEP / 2).toFixed(1)} ${p.x.toFixed(1)} ${(p.y + STEP / 2).toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }
    }
    parts.push(`<svg class="road" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}"><path d="${d}" class="road-base"/><path d="${d}" class="road-dash"/></svg>`);

    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const p = this.pos(n, w);
      const info = levelInfo(n);
      const icon = info.boss ? ICONS.boss : ICONS[info.kind];
      parts.push(`<button type="button" class="node kind-${info.kind}${info.boss ? ' boss' : ''}" data-n="${n}" style="left:${p.x}px;top:${p.y}px" aria-label="Level ${n}">
        <span class="num">${n}</span><span class="kind-ico">${icon}</span><span class="stars"><i></i><i></i><i></i></span></button>`);
    }
    parts.push(`<div class="map-avatar" id="map-avatar">${HAT}</div>`);
    if (LEVEL_COUNT) {
      const top = this.pos(LEVEL_COUNT, w);
      parts.push(`<div class="more-soon" style="top:${top.y - 150}px">${t('moreSoon')}</div>`);
    }
    this.path.innerHTML = parts.join('');
    this.nodes = [...this.path.querySelectorAll('.node')];
  }

  refresh() {
    const s = this.state;
    const cur = this.current();
    this.nodes.forEach((el, i) => {
      const n = i + 1;
      const stars = starsOf(s.stars, n);
      el.classList.toggle('locked', n > s.level);
      el.classList.toggle('done', stars > 0);
      el.classList.toggle('current', n === cur && n <= s.level);
      el.querySelectorAll('.stars i').forEach((st, k) => st.classList.toggle('on', k < stars));
    });
    const p = this.pos(cur, this.width);
    const avatar = $('map-avatar');
    avatar.style.left = `${p.x}px`;
    avatar.style.top = `${p.y - 58}px`;
    $('map-cash').textContent = formatCash(s.cash);
    $('map-play').textContent = s.level > LEVEL_COUNT ? t('allDone') : `${t('playLevel')} ${cur}`;
    $('map-play').disabled = s.level > LEVEL_COUNT;
  }

  show(state) {
    this.state = state;
    this.root.hidden = false;
    const w = this.scroll.clientWidth || window.innerWidth;
    if (!this.nodes.length || Math.abs(w - this.width) > 2) this.build();
    this.refresh();
    // Centre the current level.
    const p = this.pos(this.current(), this.width);
    this.scroll.scrollTop = Math.max(0, p.y - this.scroll.clientHeight * 0.6);
  }

  hide() {
    this.root.hidden = true;
    $('level-card').hidden = true;
  }

  openCard(n) {
    const def = levelFor(n);
    const card = $('level-card');
    card.dataset.n = String(n);
    card.querySelector('.level-card').classList.toggle('boss', def.boss);
    $('lc-chapter').textContent = def.chapter.name;
    $('lc-title').textContent = def.boss ? `${t('bossLevel')} · ${n}` : `${t('level')} ${n}`;
    $('lc-icon').innerHTML = def.boss ? ICONS.boss : ICONS[def.kind];
    $('lc-goal').textContent = def.intro;
    const rules = def.kind === 'farm'
      ? `${def.farm.timeLimit}s on the clock. ★★★ with half the time left.`
      : `${def.tower.hearts} ${def.tower.hearts === 1 ? 'heart' : 'hearts'}. ★★ at ${def.tower.star2} perfects, ★★★ at ${def.tower.star3}.`;
    $('lc-rules').textContent = rules;
    const label = (id) => [...TOWER_TWISTS, ...FARM_TWISTS].find((tw) => tw.id === id)?.label || id;
    const twistText = def.twists.length ? `Twists: ${def.twists.map(label).join(', ')}` : '';
    $('lc-twists').textContent = def.fresh ? `NEW: ${def.fresh.label}! ${def.fresh.hint}` : twistText;
    $('lc-reward').textContent = `Up to $${formatCash(rewardFor(n, 3, def.boss))}`;
    const stars = starsOf(this.state.stars, n);
    $('lc-stars').innerHTML = [0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : ''}"></i>`).join('');
    card.hidden = false;
  }
}
