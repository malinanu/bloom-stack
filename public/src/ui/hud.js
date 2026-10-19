// Top bar like the ad: cash plus a counter per flower type, sound/pause buttons, the 2× cash boost button,
// and a toast line for hints.
import { t } from '../core/i18n.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.cashEl = $('cash');
    this.counts = { tulip: $('c-tulip'), rose: $('c-rose'), peony: $('c-peony') };
    this.boostBtn = $('btn-boost');
    this.boostLabel = this.boostBtn.querySelector('span');
    this.toastEl = $('toast');
    this.cashShown = 0;
    this.cashTarget = 0;
    this.toastTimer = 0;
    this.lastCounts = '';
  }

  show(on) {
    this.root.hidden = !on;
  }

  /** Count up (or down) to the new value; `instant` skips the roll. */
  setCash(value, instant = false) {
    this.cashTarget = value;
    if (instant) {
      this.cashShown = value;
      this.cashEl.textContent = formatCash(value);
    }
    if (value > this.cashShown) {
      this.cashEl.parentElement.classList.remove('bump');
      void this.cashEl.offsetWidth;
      this.cashEl.parentElement.classList.add('bump');
    }
  }

  setCarried(counts, unlockedTypes) {
    const key = JSON.stringify(counts) + unlockedTypes.join();
    if (key === this.lastCounts) return;
    this.lastCounts = key;
    for (const [type, el] of Object.entries(this.counts)) {
      el.textContent = counts[type] || 0;
      el.parentElement.classList.toggle('locked', !unlockedTypes.includes(type));
    }
  }

  /** @param {number} remaining seconds of boost left (0 = inactive) */
  setBoost(remaining) {
    const active = remaining > 0;
    this.boostBtn.classList.toggle('active', active);
    this.boostBtn.disabled = active;
    const text = active ? `${t('boostActive')} ${Math.ceil(remaining)}s` : t('boost');
    if (this.boostLabel.textContent !== text) this.boostLabel.textContent = text;
  }

  toast(text, seconds = 2) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastTimer = seconds;
  }

  update(dt) {
    if (this.cashShown !== this.cashTarget) {
      const diff = this.cashTarget - this.cashShown;
      const step = Math.max(1, Math.abs(diff) * Math.min(1, dt * 10));
      this.cashShown = Math.abs(diff) <= step ? this.cashTarget : this.cashShown + Math.sign(diff) * step;
      this.cashEl.textContent = formatCash(Math.round(this.cashShown));
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('on');
    }
  }
}

export function formatCash(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return String(n);
}
