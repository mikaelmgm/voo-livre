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
    if (this.cur && this.cur.id === state.id && this.cur.startedAt === state.at) return;
    this.cur = { id: state.id, startedAt: state.at, by: state.by };
    this.box.classList.remove('hidden');
    this.onState({ status: 'loading', by: state.by });
    try { await this.loadApi(); } catch { this.onState({ status: 'error', msg: 'não deu pra carregar o YouTube (sem internet?)' }); return; }
    if (!this.cur || this.cur.id !== state.id) return;
    if (!this.player) {
      const o = this.opts;
      this.player = new window.YT.Player(o.el, {
        width: o.width, height: o.height, videoId: state.id,
        playerVars: { autoplay: 1, controls: o.controls, disablekb: o.controls ? 0 : 1, iv_load_policy: 3, playsinline: 1, rel: 0, start: Math.floor(this.elapsed()) },
        events: {
          onReady: e => { e.target.setVolume(this.volume); e.target.seekTo(this.elapsed(), true); e.target.playVideo(); this.report(); },
          onStateChange: e => this.onPlayerState(e.data),
          onError: e => this.onState({ status: 'error', msg: [101, 150].includes(e.data) ? 'esse vídeo não deixa tocar fora do YouTube' : 'erro ao tocar esse vídeo' }),
        },
      });
    } else {
      this.player.loadVideoById({ videoId: state.id, startSeconds: this.elapsed() });
    }
  }

  onPlayerState(s) {
    const YT = window.YT;
    if (s === YT.PlayerState.ENDED && this.cur) {
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
    if (st === 1 && Math.abs(this.player.getCurrentTime() - want) > 2.5) this.player.seekTo(want, true);
    this.report();
  }

  resume() { if (this.player?.seekTo && this.cur) { this.player.unMute?.(); this.player.seekTo(this.elapsed(), true); this.player.playVideo(); } }

  setVolume(v) { this.volume = v; this.player?.setVolume?.(v); }

  stop() {
    this.cur = null;
    try { this.player?.stopVideo?.(); } catch { /* ok */ }
    this.box.classList.add('hidden');
    this.onState({ status: 'stopped' });
  }

  get playing() { return !!this.cur; }
}
