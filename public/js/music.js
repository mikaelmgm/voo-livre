// Música da party via YouTube: qualquer um cola um link, o host repassa e todo mundo toca sincronizado.
// Usa a IFrame API oficial do YouTube num mini player no canto da tela.

export function parseYouTube(text) {
  const s = String(text || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s.startsWith('http') ? s : 'https://' + s); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1, 12);
  else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    id = u.searchParams.get('v');
    const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
    if (!id && m) id = m[1];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

// Playlist do YouTube: o id que vem em ?list= (o rádio da laje aceita).
export function parseYouTubeList(text) {
  try {
    const s = String(text || '').trim();
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    if (!/youtu\.?be/.test(u.hostname)) return null;
    const list = u.searchParams.get('list');
    return list && /^[A-Za-z0-9_-]{10,64}$/.test(list) ? list : null;
  } catch { return null; }
}

// Link ou URI do Spotify (música, álbum, playlist, podcast) -> "spotify:tipo:id".
export function parseSpotify(text) {
  const s = String(text || '').trim();
  const m = s.match(/^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,40})$/)
    || s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,40})/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}

// Player oficial do Spotify. A API não mexe no volume e, sem login Premium no navegador, toca só 30 s de prévia.
// Ele precisa ficar visível: dependendo do navegador, cada um tem que dar play no próprio player.
export class SpotifyPlayer {
  constructor(box, el, onState) {
    this.box = box;
    this.el = el;
    this.onState = onState;
    this.ctrl = null;
    this.api = null;
    this.cur = null;
    this.clock = () => Date.now();
  }

  loadApi() {
    if (!this.api) {
      this.api = new Promise((res, rej) => {
        window.onSpotifyIframeApiReady = res;
        const s = document.createElement('script');
        s.src = 'https://open.spotify.com/embed/iframe-api/v1';
        s.async = true;
        s.onerror = () => { this.api = null; rej(new Error('sem internet')); };
        document.head.appendChild(s);
      });
    }
    return this.api;
  }

  get single() { return /^spotify:(track|episode):/.test(this.cur?.uri || ''); }
  elapsed() { return this.cur ? Math.max(0, (this.clock() - this.cur.startedAt) / 1000) : 0; }

  async sync(state) {
    if (!state) { this.stop(); return; }
    if (this.cur && this.cur.uri === state.uri && this.cur.startedAt === state.at) return;
    this.cur = { uri: state.uri, startedAt: state.at, by: state.by };
    this.synced = false;
    this.box.classList.remove('hidden');
    this.onState({ status: 'loading', by: state.by });
    let api;
    try { api = await this.loadApi(); } catch { this.onState({ status: 'error', msg: 'não deu pra carregar o Spotify (sem internet?)' }); return; }
    if (!this.cur || this.cur.uri !== state.uri) return;
    if (this.ctrl) { this.ctrl.loadUri(state.uri); this.ctrl.play(); return; }
    await new Promise(done => api.createController(this.el, { uri: state.uri, width: '100%', height: 152 }, ctrl => {
      this.ctrl = ctrl;
      ctrl.addListener('ready', () => ctrl.play());
      ctrl.addListener('playback_update', e => this.onUpdate(e.data));
      done();
    }));
  }

  onUpdate(d) {
    if (!this.cur) return;
    // música única: entra no mesmo ponto dos outros. Em playlist a API não escolhe a faixa, então só começa junto.
    if (!this.synced && !d.isPaused && d.duration > 0) {
      this.synced = true;
      if (this.single) {
        const want = this.elapsed() % (d.duration / 1000);
        if (Math.abs(want - d.position / 1000) > 3) this.ctrl.seek(want);
      }
    }
    this.onState({ status: d.isPaused ? 'paused' : 'playing', by: this.cur.by, short: d.duration > 0 && d.duration <= 31000 });
  }

  stop() {
    this.cur = null;
    try { this.ctrl?.pause(); } catch { /* ok */ }
    this.box.classList.add('hidden');
    this.onState({ status: 'stopped' });
  }

  get playing() { return !!this.cur; }
}

export class Music {
  constructor(box, onState, opts = {}) {
    this.box = box;               // div do mini player
    this.onState = onState;
    // onde o player nasce (id ou elemento) e o tamanho; o telão do cinema 3D usa outro
    this.opts = { el: 'yt-frame', width: 320, height: 180, controls: 1, ...opts };
    this.player = null;
    this.api = null;
    this.cur = null;              // { id, startedAt (ms, relógio do host), by }
    this.volume = 60;
    this.clock = () => Date.now();
    this.lastCheck = 0;
  }

  loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!this.api) {
      this.api = new Promise((res, rej) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.onerror = () => { this.api = null; rej(new Error('sem internet')); };
        document.head.appendChild(s);
      });
    }
    return this.api;
  }

  elapsed() { return this.cur ? Math.max(0, (this.clock() - this.cur.startedAt) / 1000) : 0; }

  // Estado vindo do host (ou null para parar).
  async sync(state) {
    if (!state) { this.stop(); return; }
    if (this.cur && this.cur.id === state.id && this.cur.list === state.list && this.cur.startedAt === state.at) return;
    this.cur = { id: state.id, list: state.list, startedAt: state.at, by: state.by };
    this.box.classList.remove('hidden');
    this.onState({ status: 'loading', by: state.by });
    try { await this.loadApi(); } catch { this.onState({ status: 'error', msg: 'não deu pra carregar o YouTube (sem internet?)' }); return; }
    if (!this.cur || this.cur.id !== state.id || this.cur.list !== state.list) return;
    if (!this.player) {
      const o = this.opts;
      this.player = new window.YT.Player(o.el, {
        width: o.width, height: o.height, ...(state.id ? { videoId: state.id } : {}),
        playerVars: { ...(state.list ? { listType: 'playlist', list: state.list, loop: 1 } : {}), autoplay: 1, controls: o.controls, disablekb: o.controls ? 0 : 1, iv_load_policy: 3, playsinline: 1, rel: 0, start: Math.floor(this.elapsed()) },
        events: {
          onReady: e => { e.target.setVolume(this.volume); if (!this.cur?.list) e.target.seekTo(this.elapsed(), true); e.target.playVideo(); this.report(); },
          onStateChange: e => this.onPlayerState(e.data),
          onError: e => this.onState({ status: 'error', msg: [101, 150].includes(e.data) ? 'esse vídeo não deixa tocar fora do YouTube' : 'erro ao tocar esse vídeo' }),
        },
      });
    } else if (state.list) {
      this.player.loadPlaylist({ listType: 'playlist', list: state.list, index: 0 });
    } else {
      this.player.loadVideoById({ videoId: state.id, startSeconds: this.elapsed() });
    }
  }

  onPlayerState(s) {
    const YT = window.YT;
    if (s === YT.PlayerState.ENDED && this.cur && !this.cur.list) {
      // repete a música; cada um volta pro início ao mesmo tempo (relógio do host)
      const dur = this.player.getDuration() || 0;
      if (dur > 0) this.cur.startedAt += Math.floor(this.elapsed() / dur) * dur * 1000;
      this.player.seekTo(0, true);
      this.player.playVideo();
    }
    this.report();
  }

  report() {
    if (!this.player || !this.cur) return;
    const st = this.player.getPlayerState?.();
    const title = this.player.getVideoData?.()?.title || '';
    this.onState({ status: st === 1 ? 'playing' : st === 3 ? 'loading' : 'paused', title, by: this.cur.by });
  }

  // Corrige desvio de sincronia de vez em quando e detecta autoplay bloqueado.
  tick() {
    if (!this.player || !this.cur || !this.player.getCurrentTime) return;
    const now = performance.now();
    if (now - this.lastCheck < 4000) return;
    this.lastCheck = now;
    const dur = this.player.getDuration() || 0;
    let want = this.elapsed();
    if (dur > 0) want %= dur;
    const st = this.player.getPlayerState();
    if (st === 1 && !this.cur.list && Math.abs(this.player.getCurrentTime() - want) > 2.5) this.player.seekTo(want, true);
    this.report();
  }

  resume() { if (this.player?.seekTo && this.cur) { this.player.unMute?.(); if (!this.cur.list) this.player.seekTo(this.elapsed(), true); this.player.playVideo(); } }

  setVolume(v) { this.volume = v; this.player?.setVolume?.(v); }

  stop() {
    this.cur = null;
    try { this.player?.stopVideo?.(); } catch { /* ok */ }
    this.box.classList.add('hidden');
    this.onState({ status: 'stopped' });
  }

  get playing() { return !!this.cur; }
}
