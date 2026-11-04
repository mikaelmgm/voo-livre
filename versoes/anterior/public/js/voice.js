// Voz dentro do jogo: WebRTC direto entre os jogadores (o host só repassa a sinalização).
// Funciona igual no 2D e no 3D. Microfone e saída de áudio são escolhidos no painel.

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const TALK_LEVEL = 0.018;

export class Voice {
  constructor(send, prefs, savePrefs) {
    this.send = send;
    this.prefs = prefs;
    this.savePrefs = savePrefs;
    this.on = false;
    this.muted = !!prefs.voiceMuted;
    this.stream = null;
    this.track = null;
    this.micError = '';
    this.peers = new Map();       // id -> { name, color, muted, pc?, audio, level, state, queue }
    this.volume = Number.isFinite(prefs.voiceVol) ? prefs.voiceVol : 100;
    this.output = prefs.voiceOut || '';
    this.level = 0;
    this.ui = null;
    this.audioCtx = null;
    setInterval(() => this.meter(), 100);
    navigator.mediaDevices?.addEventListener?.('devicechange', () => this.listDevices());
  }

  get secure() { return !!navigator.mediaDevices?.getUserMedia; }
  get canPickOutput() { return 'setSinkId' in HTMLMediaElement.prototype; }

  // ---------------------------------------------------------------- mensagens da rede

  handle(m) {
    switch (m.t) {
      case 'vc-list':
        // quem entra na call é quem chama todo mundo que já está nela
        for (const p of m.peers) { this.peer(p); this.connect(p.id); }
        this.render();
        return true;
      case 'vc':
        if (m.on) this.peer(m);
        else this.dropPeer(m.id);
        this.render();
        return true;
      case 'rtc':
        this.onRtc(m.from, m.d);
        return true;
    }
    return false;
  }

  // Reconectou no host: o id mudou, então volta pra call do zero.
  onWelcome() {
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
    if (this.on) this.announce();
  }

  // Trocou entre 2D e 3D no meio da call: entra de novo sozinho. Vale só pra esta aba, pra nunca abrir o
  // jogo outro dia com o microfone ligado sem a pessoa pedir.
  autoJoin() {
    let was = false;
    try { was = sessionStorage.getItem('voolivre-call') === '1'; } catch { /* sem storage */ }
    if (was && !this.on) this.join();
  }
  remember(on) {
    try { if (on) sessionStorage.setItem('voolivre-call', '1'); else sessionStorage.removeItem('voolivre-call'); } catch { /* sem storage */ }
  }

  announce() { this.send({ t: 'vc', on: this.on, muted: this.muted }); }

  peer(info) {
    let p = this.peers.get(info.id);
    if (!p) { p = { id: info.id, level: 0, state: 'chamando', queue: [], tries: 0 }; this.peers.set(info.id, p); }
    p.name = info.name;
    p.color = info.color;
    p.muted = !!info.muted;
    return p;
  }

  dropPeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.closePeer(p);
    this.peers.delete(id);
  }

  closePeer(p) {
    p.pc?.close();
    p.pc = null;
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); p.audio = null; }
    try { p.source?.disconnect(); } catch { /* ok */ }
    p.analyser = null;
  }

  // ---------------------------------------------------------------- WebRTC

  makePc(p) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    p.pc = pc;
    pc.onicecandidate = e => { if (e.candidate) this.send({ t: 'rtc', to: p.id, d: { c: e.candidate } }); };
    pc.ontrack = e => this.attach(p, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (pc !== p.pc) return;
      p.state = s === 'connected' ? 'conectado' : s === 'failed' ? 'não conectou' : s === 'disconnected' ? 'instável' : 'chamando';
      if (s === 'connected') p.tries = 0;
      if (s === 'failed' && p.caller && p.tries < 3) {
        p.tries++;
        setTimeout(() => { if (this.peers.get(p.id) === p && this.on) this.connect(p.id); }, 1500);
      }
      this.render();
    };
    return pc;
  }

  async connect(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.closePeer(p);
    p.caller = true;
    p.queue = [];
    p.state = 'chamando';
    const pc = this.makePc(p);
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (this.track) await tr.sender.replaceTrack(this.track);
    await pc.setLocalDescription(await pc.createOffer());
    this.send({ t: 'rtc', to: id, d: { sdp: pc.localDescription } });
  }

  async onRtc(from, d) {
    if (!this.on) return;
    const p = this.peers.get(from) || this.peer({ id: from, name: '…', color: '#ffffff' });
    try {
      if (d.sdp) {
        if (d.sdp.type === 'offer') {
          this.closePeer(p);
          p.caller = false;
          p.queue = [];
          this.makePc(p);
        }
        const pc = p.pc;
        if (!pc) return;
        await pc.setRemoteDescription(d.sdp);
        for (const c of p.queue.splice(0)) await pc.addIceCandidate(c);
        if (d.sdp.type === 'offer') {
          const tr = pc.getTransceivers()[0];
          tr.direction = 'sendrecv';
          if (this.track) await tr.sender.replaceTrack(this.track);
          await pc.setLocalDescription(await pc.createAnswer());
          this.send({ t: 'rtc', to: from, d: { sdp: pc.localDescription } });
        }
      } else if (d.c) {
        if (p.pc?.remoteDescription) await p.pc.addIceCandidate(d.c);
        else p.queue.push(d.c);
      }
    } catch (e) { console.warn('voz:', e); }
  }

  attach(p, stream) {
    if (!p.audio) {
      p.audio = document.createElement('audio');
      p.audio.autoplay = true;
      p.audio.style.display = 'none';
      document.body.appendChild(p.audio);
    }
    p.audio.srcObject = stream;
    p.audio.volume = this.volume / 100;
    this.applyOutput(p);
    p.audio.play().catch(() => { p.blocked = true; this.render(); });
    p.stream = stream;
    const ctx = this.ctx();
    if (ctx) {
      try {
        p.source = ctx.createMediaStreamSource(stream);
        p.analyser = ctx.createAnalyser();
        p.analyser.fftSize = 512;
        p.source.connect(p.analyser);
      } catch { /* sem medidor */ }
    }
  }

  ctx() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.audioCtx = new AC();
    }
    if (this.audioCtx?.state === 'suspended') this.audioCtx.resume();
    return this.audioCtx;
  }

  rms(an) {
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  meter() {
    if (!this.on) return;
    this.level = this.micAnalyser ? this.rms(this.micAnalyser) : 0;
    for (const p of this.peers.values()) p.level = p.analyser ? this.rms(p.analyser) : 0;
    if (this.ui) this.ui.bar.style.width = `${Math.min(100, this.level * 900)}%`;
    if (this.ui && performance.now() - (this.lastPeers || 0) > 300) { this.lastPeers = performance.now(); this.renderPeers(); }
  }

  // ---------------------------------------------------------------- microfone

  async openMic() {
    this.micError = '';
    if (!this.secure) { this.micError = 'insecure'; return; }
    const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const want = this.prefs.voiceIn;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: want ? { ...base, deviceId: { exact: want } } : base });
    } catch (e) {
      if (want && e.name === 'OverconstrainedError') {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: base }); } catch (e2) { e = e2; }
      }
      if (!stream) {
        this.micError = e.name === 'NotAllowedError' ? 'denied' : e.name === 'NotFoundError' ? 'none' : 'error';
        return;
      }
    }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = stream;
    this.track = stream.getAudioTracks()[0];
    this.track.enabled = !this.muted;
    for (const p of this.peers.values()) {
      const tr = p.pc?.getTransceivers()[0];
      if (tr) await tr.sender.replaceTrack(this.track);
    }
    const ctx = this.ctx();
    if (ctx) {
      try { this.micSource?.disconnect(); } catch { /* ok */ }
      this.micSource = ctx.createMediaStreamSource(stream);
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 512;
      this.micSource.connect(this.micAnalyser);
    }
  }

  closeMic() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.track = null;
    this.micAnalyser = null;
  }

  // ---------------------------------------------------------------- ações do painel

  async join() {
    if (this.on) return;
    this.on = true;
    this.render();
    await this.openMic();
    await this.listDevices();
    this.announce();
    this.remember(true);
    this.render();
  }

  leave() {
    if (!this.on) return;
    this.on = false;
    this.closeMic();
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
    this.announce();
    this.remember(false);
    this.render();
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(v) {
    this.muted = v;
    if (this.track) this.track.enabled = !v;
    this.prefs.voiceMuted = v;
    this.savePrefs();
    if (this.on) this.announce();
    this.render();
  }

  async setInput(id) {
    this.prefs.voiceIn = id;
    this.savePrefs();
    if (this.on) { await this.openMic(); this.render(); }
  }

  setOutput(id) {
    this.output = id;
    this.prefs.voiceOut = id;
    this.savePrefs();
    for (const p of this.peers.values()) this.applyOutput(p);
  }

  applyOutput(p) {
    if (this.canPickOutput && p.audio) p.audio.setSinkId(this.output || '').catch(() => {});
  }

  setVolume(v) {
    this.volume = v;
    this.prefs.voiceVol = v;
    this.savePrefs();
    for (const p of this.peers.values()) if (p.audio) p.audio.volume = v / 100;
  }

  // Tem alguém falando? O jogo usa isso pra mostrar o ícone na lista de jogadores.
  talking(id) {
    const p = this.peers.get(id);
    return !!p && !p.muted && p.level > TALK_LEVEL;
  }
  meTalking() { return this.on && !this.muted && this.level > TALK_LEVEL; }

  // Ícone pra lista de jogadores: vazio se a pessoa não está na call.
  badge(id, isMe) {
    if (isMe) return this.on ? (this.muted ? '🔇' : this.meTalking() ? '🔊' : '🎙️') : '';
    const p = this.peers.get(id);
    if (!p) return '';
    return p.muted ? '🔇' : p.level > TALK_LEVEL ? '🔊' : '🎙️';
  }

  // ---------------------------------------------------------------- painel

  mount(el) {
    el.innerHTML = `
      <div class="box-h">🎙️ Voz <small>(todo mundo no servidor, no 2D e no 3D)</small></div>
      <div class="musicrow">
        <button class="vc-join primary small"></button>
        <button class="vc-mute small"></button>
        <span class="vc-status"></span>
      </div>
      <div class="vc-warn hidden"></div>
      <div class="vc-devices">
        <label class="vc-row"><span>Microfone</span><select class="vc-in"></select></label>
        <div class="vc-meter"><i></i></div>
        <label class="vc-row vc-outrow"><span>Saída de áudio</span><select class="vc-out"></select></label>
        <label class="vol">volume das vozes <input type="range" class="vc-vol" min="0" max="100"></label>
      </div>
      <div class="vc-peers"></div>`;
    const q = s => el.querySelector(s);
    this.ui = { join: q('.vc-join'), mute: q('.vc-mute'), status: q('.vc-status'), warn: q('.vc-warn'), devices: q('.vc-devices'), input: q('.vc-in'), output: q('.vc-out'), outRow: q('.vc-outrow'), vol: q('.vc-vol'), bar: q('.vc-meter i'), peers: q('.vc-peers') };
    this.ui.join.onclick = () => (this.on ? this.leave() : this.join());
    this.ui.mute.onclick = () => this.toggleMute();
    this.ui.input.onchange = () => this.setInput(this.ui.input.value);
    this.ui.output.onchange = () => this.setOutput(this.ui.output.value);
    this.ui.vol.value = this.volume;
    this.ui.vol.oninput = () => this.setVolume(Number(this.ui.vol.value));
    this.render();
  }

  async listDevices() {
    if (!this.ui || !this.secure) return;
    let list = [];
    try { list = await navigator.mediaDevices.enumerateDevices(); } catch { return; }
    const fill = (sel, kind, label, current) => {
      const items = list.filter(d => d.kind === kind && d.deviceId !== 'communications');
      sel.innerHTML = '';
      for (const d of items) {
        const o = document.createElement('option');
        o.value = d.deviceId === 'default' ? '' : d.deviceId;
        o.textContent = d.label || `${label} ${sel.length + 1}`;
        sel.appendChild(o);
      }
      sel.value = current || '';
      if (sel.selectedIndex < 0) sel.selectedIndex = 0;
    };
    fill(this.ui.input, 'audioinput', 'Microfone', this.prefs.voiceIn);
    fill(this.ui.output, 'audiooutput', 'Saída', this.output);
  }

  render() {
    const u = this.ui;
    if (!u) return;
    u.join.textContent = this.on ? 'Sair da call' : 'Entrar na call';
    u.mute.textContent = this.muted ? 'Desmutar (V)' : 'Mutar (V)';
    u.mute.classList.toggle('hidden', !this.on || !this.track);
    u.devices.classList.toggle('hidden', !this.on || !this.secure);
    u.outRow.classList.toggle('hidden', !this.canPickOutput);
    const n = [...this.peers.values()].length;
    u.status.textContent = !this.on ? '' : !this.track ? 'só ouvindo' : this.muted ? 'mutado' : n ? `na call com ${n}` : 'na call, sozinho por enquanto';
    const notes = {
      insecure: `Só ouvindo: o navegador só libera o microfone na versão segura. <a href="https://${location.host}${location.pathname}">Abrir com https</a> e, no aviso, clique em Avançado &gt; Continuar.`,
      denied: 'Só ouvindo: o navegador bloqueou o microfone. Libere no cadeado ao lado do endereço e entre de novo.',
      none: 'Só ouvindo: nenhum microfone encontrado.',
      error: 'Só ouvindo: não deu pra abrir o microfone (outro programa pode estar usando).',
    };
    const warn = this.on ? notes[this.micError] : !this.secure ? notes.insecure.replace('Só ouvindo: o', 'O') : '';
    u.warn.innerHTML = warn || (this.on && !this.canPickOutput ? 'Este navegador não deixa escolher a saída de áudio (no Chrome e no Edge dá).' : '');
    u.warn.classList.toggle('hidden', !u.warn.innerHTML);
    this.renderPeers();
  }

  renderPeers() {
    const u = this.ui;
    if (!u) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    u.peers.innerHTML = [...this.peers.values()].map(p =>
      `<div class="vc-peer"><i style="background:${esc(p.color)}"></i><b>${esc(p.name)}</b><span>${this.badge(p.id)} ${p.state}</span></div>`).join('');
  }
}
