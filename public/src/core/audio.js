// WebAudio synth: a gentle garden loop plus every sound effect, generated at runtime (no audio files).
// Adapted from the Christmas Runner's Sfx. Sound is on only when the platform allows it and the player hasn't muted.

const NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0 };
const PENTA = [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5];

// Marimba-ish loop as [note, beats]; null is a rest.
const MELODY = [
  ['E4', 1], ['G4', 1], ['A4', 1], ['G4', 1], ['E4', 1], ['D4', 1], ['C4', 2],
  ['D4', 1], ['E4', 1], ['G4', 1], ['E4', 1], ['D4', 2], [null, 2],
  ['E4', 1], ['G4', 1], ['A4', 1], ['C5', 1], ['A4', 1], ['G4', 1], ['E4', 2],
  ['D4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 2], [null, 2],
];
const BASS = ['C4', 'A4', 'D4', 'G4'];
const BEAT = 0.26;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicTimer = null;
    this.platformAudio = true;
    this.muted = false;
    this.paused = false;
    this.snipCombo = 0;
    this.lastSnip = 0;
    this.lastTick = 0;
  }

  get enabled() {
    return this.platformAudio && !this.muted && !this.paused;
  }

  /** Must be called from a user gesture (browsers block autoplay). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended' && this.enabled) this.ctx.resume();
  }

  apply() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.enabled ? 0.5 : 0, this.ctx.currentTime, 0.05);
    if (this.enabled && this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.enabled && this.paused && this.ctx.state === 'running') this.ctx.suspend();
  }

  setPlatformAudio(on) { this.platformAudio = on; this.apply(); }
  setMuted(m) { this.muted = m; this.apply(); }
  setPaused(p) { this.paused = p; this.apply(); }

  get live() { return this.ctx && this.enabled; }

  tone(freq, start, dur, { type = 'triangle', gain = 0.3, dest = this.master, slideTo = null } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  noise(start, dur, { gain = 0.2, type = 'highpass', freq = 3000 } = {}) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(filter).connect(g).connect(this.master);
    src.start(start);
  }

  marimba(freq, start, dur, dest) {
    this.tone(freq, start, dur, { type: 'sine', gain: 0.22, dest });
    this.tone(freq * 4, start, dur * 0.25, { type: 'sine', gain: 0.04, dest });
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const total = MELODY.reduce((s, [, b]) => s + b, 0) * BEAT;
    const schedule = () => {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + 0.05;
      let t = t0;
      for (const [n, beats] of MELODY) {
        if (n) this.marimba(NOTE[n], t, beats * BEAT * 1.4, this.musicGain);
        t += beats * BEAT;
      }
      const bars = Math.round(total / (BEAT * 8));
      for (let b = 0; b < bars; b++) {
        this.tone(NOTE[BASS[b % BASS.length]] / 2, t0 + b * BEAT * 8, BEAT * 7, { type: 'sine', gain: 0.1, dest: this.musicGain });
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, total * 1000);
  }

  // Cutting a flower: a crisp snip whose pitch climbs while the player keeps mowing.
  snip() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    if (t - this.lastSnip < 0.035) return; // many cuts in one frame play as one
    this.snipCombo = t - this.lastSnip < 0.6 ? Math.min(this.snipCombo + 1, PENTA.length * 2 - 1) : 0;
    this.lastSnip = t;
    this.noise(t, 0.05, { gain: 0.12, freq: 5000 });
    const f = PENTA[this.snipCombo % PENTA.length] * (this.snipCombo >= PENTA.length ? 2 : 1);
    this.tone(f, t, 0.09, { type: 'sine', gain: 0.07 });
  }

  /** Short tick for items landing (drop-off, pad payments). Rate-limited. */
  tick(pitch = 1) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    if (t - this.lastTick < 0.045) return;
    this.lastTick = t;
    this.tone(700 * pitch, t, 0.05, { type: 'triangle', gain: 0.07, slideTo: 500 * pitch });
  }

  pop() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.tone(320, t, 0.14, { type: 'sine', gain: 0.18, slideTo: 900 });
  }

  cash() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.tone(NOTE.E5 * 2, t, 0.08, { type: 'square', gain: 0.05 });
    this.tone(NOTE.A5 * 2, t + 0.06, 0.18, { type: 'square', gain: 0.05 });
  }

  unlockFanfare() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C5 * 2].forEach((f, i) => this.tone(f, t + i * 0.09, 0.3, { type: 'triangle', gain: 0.16 }));
    this.noise(t + 0.3, 0.4, { gain: 0.08, freq: 6000 });
  }

  buy() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    [NOTE.G4, NOTE.C5, NOTE.E5].forEach((f, i) => this.tone(f, t + i * 0.06, 0.18, { type: 'triangle', gain: 0.14 }));
  }

  error() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.tone(220, t, 0.18, { type: 'square', gain: 0.07, slideTo: 160 });
  }

  // Flower Tower
  place(n) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.tone(180 + Math.min(n, 30) * 6, t, 0.12, { type: 'sine', gain: 0.22, slideTo: 90 });
    this.noise(t, 0.06, { gain: 0.06, type: 'lowpass', freq: 1200 });
  }

  perfect(combo) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    const i = Math.min(combo - 1, PENTA.length - 1);
    this.tone(PENTA[i] * 2, t, 0.35, { type: 'sine', gain: 0.18 });
    this.tone(PENTA[i] * 4, t, 0.2, { type: 'sine', gain: 0.05 });
  }

  slice() {
    if (!this.live) return;
    this.noise(this.ctx.currentTime, 0.12, { gain: 0.14, freq: 2000 });
  }

  gameOver() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.tone(392, t, 0.25, { type: 'triangle', gain: 0.16, slideTo: 196 });
    this.tone(262, t + 0.2, 0.45, { type: 'triangle', gain: 0.16, slideTo: 110 });
  }
}
