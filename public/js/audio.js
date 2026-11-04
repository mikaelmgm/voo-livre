// Sons 100% procedurais (WebAudio): vento, gancho, anéis, respingo e uma trilha ambiente bem discreta.

const CHORDS = {
  sunset: [[220, 277.2, 329.6, 415.3], [196, 246.9, 293.7, 370], [174.6, 220, 261.6, 329.6], [196, 246.9, 329.6, 392]],
  beach: [[261.6, 329.6, 392, 493.9], [220, 277.2, 329.6, 440], [293.7, 349.2, 440, 523.3], [246.9, 311.1, 370, 493.9]],
  canyon: [[146.8, 220, 293.7, 349.2], [130.8, 196, 261.6, 329.6], [116.5, 174.6, 233.1, 293.7], [130.8, 196, 246.9, 311.1]],
  snow: [[164.8, 246.9, 311.1, 392], [146.8, 220, 293.7, 370], [130.8, 196, 261.6, 329.6], [123.5, 185, 246.9, 311.1]],
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.biome = 'sunset';
    this.chordIdx = 0;
    this.nextChord = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(c.destination);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // vento contínuo que cresce com a velocidade: ruído marrom (grave e macio) em vez de chiado
    const windLen = c.sampleRate * 8, fade = c.sampleRate;
    const windBuf = c.createBuffer(1, windLen + fade, c.sampleRate);
    const w = windBuf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < w.length; i++) { prev = (prev + 0.02 * (Math.random() * 2 - 1)) / 1.02; w[i] = prev * 3.5; }
    for (let i = 0; i < fade; i++) { const k = i / fade; w[i] = w[i] * k + w[windLen + i] * (1 - k); }   // emenda sem clique
    const src = c.createBufferSource();
    src.buffer = windBuf;
    src.loop = true;
    src.loopEnd = windLen / c.sampleRate;
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 220;
    this.windFilter.Q.value = 0.2;
    const highpass = c.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 70;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0;
    // rajadas lentas pra não soar como um chiado parado
    const gust = c.createOscillator(), gustDepth = c.createGain();
    gust.frequency.value = 0.17;
    gustDepth.gain.value = 260;
    gust.connect(gustDepth).connect(this.windFilter.detune);
    gust.start();
    src.connect(highpass).connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    this.musicGain = c.createGain();
    this.musicGain.gain.value = 0.05;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    this.musicGain.connect(lp).connect(this.master);
    this.nextChord = c.currentTime + 0.5;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  update(speed, slow, inCloud, biome) {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    const s = Math.min(1, speed / 2600);
    const vol = Math.min(0.11, s * s * 0.1 + inCloud * 0.04) * (1 - slow * 0.6);
    this.windGain.gain.setTargetAtTime(vol, now, 0.35);
    this.windFilter.frequency.setTargetAtTime((200 + s * 500 + inCloud * 120) * (1 - slow * 0.6), now, 0.35);
    this.biome = biome;
    if (now > this.nextChord - 0.1) this.playChord();
  }

  playChord() {
    const c = this.ctx;
    const set = CHORDS[this.biome] || CHORDS.sunset;
    const chord = set[this.chordIdx++ % set.length];
    const t0 = Math.max(c.currentTime, this.nextChord);
    const dur = 9;
    chord.forEach((f, i) => {
      for (const det of [-4, 4]) {
        const o = c.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = f;
        o.detune.value = det;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.18 / chord.length, t0 + 3);
        g.gain.linearRampToValueAtTime(0, t0 + dur + 2);
        o.connect(g).connect(this.musicGain);
        o.start(t0);
        o.stop(t0 + dur + 2.2);
      }
    });
    this.nextChord = t0 + dur;
  }

  burst(dur, f0, f1, q, vol, type = 'bandpass') {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, vol, type = 'sine', when = 0, slideTo) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hook() { this.burst(0.14, 4200, 900, 2.5, 0.5); this.tone(1400, 0.06, 0.06, 'square', 0, 500); }
  release() { this.burst(0.25, 600, 1800, 1, 0.18); }
  miss() { this.burst(0.12, 2500, 1500, 3, 0.15); }
  ring() { [880, 1318.5, 1760, 2637].forEach((f, i) => this.tone(f, 0.35, 0.09, 'sine', i * 0.05)); }
  jump() { this.tone(300, 0.12, 0.08, 'triangle', 0, 520); }
  airJump() { this.burst(0.3, 400, 2600, 1.2, 0.3); this.tone(420, 0.18, 0.07, 'triangle', 0, 900); }
  // gota: a bolha sobe de tom bem rápido, e a água fecha logo depois
  drop(k = 1) {
    const f = 240 + Math.random() * 120;
    this.tone(f, 0.12, 0.22 * k, 'sine', 0, f * 3.6);
    this.tone(f * 1.9, 0.09, 0.09 * k, 'sine', 0.075, f * 5.2);
    this.burst(0.34, 700, 240, 0.7, 0.05 * k, 'lowpass');
  }
  dig() { this.burst(0.09, 900, 300, 1.2, 0.16, 'lowpass'); }
  place() { this.tone(170, 0.06, 0.14, 'triangle', 0, 110); this.burst(0.07, 700, 240, 1, 0.14, 'lowpass'); }
  splash() { this.drop(1); this.tone(330, 0.1, 0.1, 'sine', 0.13, 1250); this.burst(0.55, 1000, 320, 0.6, 0.09, 'lowpass'); }
  whoosh() { this.burst(1.4, 220, 800, 0.6, 0.1); }
  twang(k = 1) { this.tone(180 + 240 * k, 0.32, 0.14, 'sawtooth', 0, 900 + 900 * k); this.burst(0.4, 500, 2400, 1, 0.18 * k); }
  liftoff() { this.burst(5, 180, 900, 0.7, 0.3, 'lowpass'); this.tone(70, 4, 0.16, 'sawtooth', 0, 340); }
  heart() { this.tone(58, 0.16, 0.2); this.tone(50, 0.2, 0.15, 'sine', 0.2); }
  // zumbido de lâmpada fluorescente das backrooms
  hum(on) {
    const c = this.ctx;
    if (!c) return;
    if (!this.humGain) {
      this.humGain = c.createGain();
      this.humGain.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      for (const [f, v] of [[60, 0.5], [120, 0.32], [240, 0.12], [481, 0.05]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        g.gain.value = v;
        o.connect(g).connect(lp);
        o.start();
      }
      lp.connect(this.humGain).connect(this.master);
    }
    this.humGain.gain.setTargetAtTime(on ? 0.05 : 0, c.currentTime, 0.4);
  }
  portal(color = 0) { this.tone(color ? 620 : 880, 0.22, 0.09, 'sine', 0, color ? 240 : 320); this.burst(0.22, 2600, 500, 2, 0.12); }
  warp() { this.tone(180, 0.28, 0.12, 'sine', 0, 900); this.burst(0.3, 400, 3000, 1, 0.14); }
  gulp(k = 1) { this.tone(320 - 120 * k, 0.09, 0.14, 'sine', 0, 110); this.tone(150, 0.12, 0.12, 'sine', 0.08, 70); }
  boom(k = 1) { this.tone(70, 0.9 + k * 0.5, 0.3, 'sine', 0, 28); this.burst(1.1, 900, 70, 0.7, 0.55 * Math.min(1, k), 'lowpass'); }
  // batida de gelatina: um tum mole, sem estalo nenhum
  splat(k = 1) { this.tone(105 + 40 * k, 0.2, 0.2 * k, 'sine', 0, 46); this.burst(0.17, 380, 110, 0.7, 0.13 * k, 'lowpass'); }
  stage() { [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 1.2, 0.05, 'triangle', i * 0.12)); }
  laser(far = false) { this.tone(far ? 1500 : 2200, 0.11, far ? 0.025 : 0.06, 'sawtooth', 0, 240); }
  hitMark() { this.tone(1900, 0.06, 0.09, 'square'); this.tone(2500, 0.05, 0.06, 'square', 0.04); }
  hurt() { this.tone(220, 0.18, 0.12, 'sawtooth', 0, 90); this.burst(0.15, 900, 300, 1, 0.25, 'lowpass'); }
  kill() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 0.07, 'square', i * 0.07)); }

  // trilha procedural abaixa quando a música do YouTube está tocando
  duck(on) { if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0 : 0.05, this.ctx.currentTime, 0.5); }
}
