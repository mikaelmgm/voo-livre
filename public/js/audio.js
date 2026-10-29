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

    // vento contínuo que cresce com a velocidade
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.7;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
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
    const vol = Math.min(0.55, s * s * 0.5 + inCloud * 0.25) * (1 - slow * 0.6);
    this.windGain.gain.setTargetAtTime(vol, now, 0.12);
    this.windFilter.frequency.setTargetAtTime((300 + s * 2400 + inCloud * 600) * (1 - slow * 0.75), now, 0.12);
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
  splash() { this.burst(0.7, 1800, 200, 0.8, 0.5, 'lowpass'); }
  whoosh() { this.burst(1.4, 300, 2200, 0.8, 0.35); }
  stage() { [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 1.2, 0.05, 'triangle', i * 0.12)); }
  laser(far = false) { this.tone(far ? 1500 : 2200, 0.11, far ? 0.025 : 0.06, 'sawtooth', 0, 240); }
  hitMark() { this.tone(1900, 0.06, 0.09, 'square'); this.tone(2500, 0.05, 0.06, 'square', 0.04); }
  hurt() { this.tone(220, 0.18, 0.12, 'sawtooth', 0, 90); this.burst(0.15, 900, 300, 1, 0.25, 'lowpass'); }
  kill() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 0.07, 'square', i * 0.07)); }

  // trilha procedural abaixa quando a música do YouTube está tocando
  duck(on) { if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0 : 0.05, this.ctx.currentTime, 0.5); }
}
