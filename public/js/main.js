// Voo Livre — laço principal: entrada, câmera, rede, PVP, música, HUD.
import { World, INTRO, CLOUD0, CLOUD1, ROPE_MAX, DRONE, UNIT_M, biomeOf, droneSeg, droneBiome, dronePos } from './world.js';
import { LocalPlayer, Avatar, hexA, drawRope, roundRect, SKINS, MAX_HP } from './player.js';
import { Renderer, BIOMES, mixHex, makeBuffers } from './render.js';
import { Net, Remote } from './net.js';
import { Sound } from './audio.js';
import { Music, parseYouTube } from './music.js';

const COLORS = ['#ffcf3f', '#ff5d7c', '#4fd8ff', '#7dff8a', '#b77dff', '#ff9a3c', '#3dffd0', '#ffffff'];
const CAM_MODES = ['center', 'dynamic', 'friend'];
const CAM_NAMES = { center: 'centralizada em você', dynamic: 'dinâmica', friend: 'sempre ver o amigo' };
const MODE_NAMES = { course: 'Percurso', drones: 'Céu de Drones' };
const LASER_SPEED = 7600;
const FIRE_RATE = 0.6;               // recarga do laser (segundos entre tiros)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const $ = s => document.querySelector(s);

const canvas = $('#c');
const ctx = canvas.getContext('2d');
const pipCanvas = $('#pip');
const pipCtx = pipCanvas.getContext('2d');
const renderer = new Renderer();
const sound = new Sound();
const mainBuf = makeBuffers(), pipBuf = makeBuffers();
mainBuf.pix = document.createElement('canvas');
pipBuf.pix = document.createElement('canvas');

let W = 0, H = 0, dpr = 1;
let world = new World(1, 'course');
const me = new LocalPlayer(world);
const myAvatar = new Avatar();
const remotes = new Map();
let phase = 'lobby';
let myId = null;
let netStatus = 'connecting';
let party = { pvp: false, mode: 'course', music: null };
let clockOffset = 0;
const netNow = () => Date.now() + clockOffset;

const prefs = loadPrefs();
const cam = { x: -420, y: -200, zoom: 1, px: -420, py: -200, vx: 0, vy: 0, fitW: 0 };
const pipCam = { x: 0, y: 0, zoom: 0.2, id: null };
const inp = { left: false, right: false, up: false, down: false, jump: false, mouse: false, pressed: false, fire: false, mx: 0, my: 0 };
let clock = 0, timeScale = 1, slowAmt = 0, flash = 0, shake = 0, hurt = 0, cabinFront = 1;
let target = null, missLine = null, fxQ = [];
let lasers = [], fireCD = 0, myKills = 0;
let lastSend = 0, lastHud = 0, lastSave = 0, firstHookAt = -1, menuOpen = false, frameNo = 0;

const music = new Music($('#music'), onMusicState);
music.clock = netNow;
music.volume = prefs.volume;

// ------------------------------------------------------------------ preferências

function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('voolivre') || '{}'); } catch { /* sem storage */ }
  return {
    name: p.name || '',
    color: COLORS.includes(p.color) ? p.color : COLORS[(Math.random() * 6) | 0],
    best: p.best || 0,
    skin: SKINS[p.skin] ? p.skin : 'scarf',
    camMode: CAM_MODES.includes(p.camMode) ? p.camMode : 'dynamic',
    pip: p.pip !== false,
    volume: Number.isFinite(p.volume) ? p.volume : 60,
    rope: p.rope === 'takeup' ? 'takeup' : 'free',
  };
}
function savePrefs() {
  try { localStorage.setItem('voolivre', JSON.stringify(prefs)); } catch { /* ok */ }
}

// ------------------------------------------------------------------ rede

const net = new Net(onNet, s => { netStatus = s; renderStatus(); });

function onNet(m) {
  switch (m.t) {
    case 'welcome': {
      myId = m.id;
      clockOffset = m.now - Date.now();
      if (world.seed !== m.seed >>> 0 || world.mode !== m.party.mode) setWorld(m.seed, m.party.mode);
      applyParty(m.party, null, []);
      for (const p of m.players) upsertRemote(p);
      if (phase === 'play') sendJoin();
      renderStatus();
      break;
    }
    case 'party': clockOffset = m.now - Date.now(); applyParty(m.party, m.by, m.changed); break;
    case 'join': upsertRemote(m); renderStatus(); break;
    case 'players': for (const p of m.players) upsertRemote(p); renderStatus(); break;
    case 'leave': remotes.delete(m.id); renderStatus(); break;
    case 's': {
      let r = remotes.get(m.id);
      if (!r) {
        // chegou movimento de alguém que ainda não conhecemos: pede nome/cor pro host
        r = upsertRemote({ id: m.id, name: '…', color: '#ffffff' });
        net.send({ t: 'who' });
      }
      r.push(m);
      break;
    }
    case 'ev': onEvent(m); break;
  }
}

function onEvent(m) {
  const r = remotes.get(m.id);
  switch (m.k) {
    case 'die':
      if (m.by) renderer.spawn('spark', m.x, m.y, r ? r.color : '#ffffff', 40);
      else splash(m.x, m.y, m.st, 0.6);
      break;
    case 'aj': renderer.spawn('ring', m.x, m.y, r ? r.color : '#ffffff', 18); break;
    case 'shot':
      lasers.push({ x: m.x, y: m.y, vx: m.vx, vy: m.vy, life: 0.34, mine: false, color: r ? r.color : '#ffffff' });
      sound.laser(true);
      break;
    case 'hit': if (m.to === myId) takeHit(m.id); break;
    case 'kill': {
      const killer = m.by === myId ? prefs.name : remotes.get(m.by)?.name || '?';
      const victim = m.victim === myId ? prefs.name : remotes.get(m.victim)?.name || '?';
      if (m.by === myId) { myKills++; sound.kill(); }
      else { const k = remotes.get(m.by); if (k) k.kills++; }
      feed(`💥 ${killer} eliminou ${victim}`);
      break;
    }
  }
}

function sendJoin() { net.send({ t: 'join', name: prefs.name, color: prefs.color, skin: prefs.skin }); }

function upsertRemote(p) {
  let r = remotes.get(p.id);
  if (!r) { r = new Remote(p.id, p.name, p.color, p.skin); remotes.set(p.id, r); }
  else { r.name = p.name; r.color = p.color; if (p.skin) r.skin = p.skin; }
  return r;
}

function setWorld(seed, mode) {
  world = new World(seed, mode);
  me.world = world;
  me.toCabin();
  cam.x = me.x; cam.y = me.y - 200;
}

// Muda uma configuração da party (PVP, mapa, música). Sem host, vale só pra você.
function setParty(changes) {
  if (net.connected) net.send({ t: 'party', ...changes });
  else {
    const p = { ...party, ...changes };
    if ('music' in changes) p.music = changes.music ? { id: changes.music.id, at: Date.now(), by: prefs.name } : null;
    applyParty(p, prefs.name, Object.keys(changes));
  }
}

function applyParty(p, by, changed) {
  const old = party;
  party = { pvp: !!p.pvp, mode: p.mode === 'drones' ? 'drones' : 'course', music: p.music || null };
  if (world.mode !== party.mode) {
    setWorld(world.seed, party.mode);
    if (by) feed(`🗺️ ${by} mudou o mapa para ${MODE_NAMES[party.mode]}`);
  }
  if (old.pvp !== party.pvp) {
    me.hp = MAX_HP;
    if (by) feed(party.pvp ? `⚔️ ${by} ligou o PVP — botão direito atira!` : `🕊️ ${by} desligou o PVP`);
  }
  if (changed.includes('music') && by) feed(party.music ? `♫ ${by} colocou uma música` : `♫ ${by} parou a música`);
  music.sync(party.music ? { id: party.music.id, at: party.music.at, by: party.music.by } : null);
  sound.duck(!!party.music);
  syncMenu();
}

function friends() {
  const out = [];
  for (const r of remotes.values()) if (r.view && !r.stale) out.push(r);
  return out;
}

function nearestFriend() {
  let best = null, bd = Infinity;
  for (const r of friends()) {
    if (r.view.dead) continue;
    const d = Math.hypot(r.view.x - me.x, r.view.y - me.y);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

// "Mesmo cenário": mesma fase no Percurso, mesmo trecho no Céu de Drones.
function sameScene(v) {
  return world.mode === 'drones' ? droneSeg(v.x) === droneSeg(me.x) : v.stage === me.stage;
}

// ------------------------------------------------------------------ entrada

addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) {
    if (e.code === 'Enter' && e.target.id === 'name') startPlaying();
    if (e.code === 'Enter' && e.target.id === 'yt-url') playMusicFromInput();
    if (e.code === 'Escape') e.target.blur();
    return;
  }
  if (e.code === 'Escape') { if (phase === 'play') toggleMenu(); return; }
  if (menuOpen || phase !== 'play') return;
  switch (e.code) {
    case 'KeyA': case 'ArrowLeft': inp.left = true; break;
    case 'KeyD': case 'ArrowRight': inp.right = true; break;
    case 'KeyW': case 'ArrowUp': inp.up = true; if (!e.repeat && me.onGround) inp.jump = true; break;
    case 'Space': if (!e.repeat) inp.jump = true; e.preventDefault(); break;
    case 'KeyS': case 'ArrowDown': inp.down = true; break;
    case 'KeyT': goToFriend(); break;
    case 'KeyR': backToCabin(); break;
    case 'KeyM': toggleMute(); break;
    case 'KeyF': showFps = !showFps; break;
    case 'KeyC': setCamMode(CAM_MODES[(CAM_MODES.indexOf(prefs.camMode) + 1) % CAM_MODES.length]); feed(`🎥 câmera: ${CAM_NAMES[prefs.camMode]}`); break;
  }
});
addEventListener('keyup', e => {
  switch (e.code) {
    case 'KeyA': case 'ArrowLeft': inp.left = false; break;
    case 'KeyD': case 'ArrowRight': inp.right = false; break;
    case 'KeyW': case 'ArrowUp': inp.up = false; break;
    case 'KeyS': case 'ArrowDown': inp.down = false; break;
  }
});
addEventListener('blur', () => { inp.left = inp.right = inp.up = inp.down = inp.mouse = inp.fire = false; });
canvas.addEventListener('mousemove', e => { inp.mx = e.clientX; inp.my = e.clientY; });
canvas.addEventListener('mousedown', e => {
  if (phase !== 'play' || menuOpen) return;
  inp.mx = e.clientX; inp.my = e.clientY;
  if (e.button === 0) { inp.mouse = true; inp.pressed = true; }
  if (e.button === 2) inp.fire = true;
});
addEventListener('mouseup', e => {
  if (e.button === 0) inp.mouse = false;
  if (e.button === 2) inp.fire = false;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Resolução adaptativa: se o PC não segura ~50 fps, renderiza em resolução menor.
let renderScale = 1, showFps = false, fps = 60, goodWindows = 0;
const perf = { acc: 0, n: 0 };
function adaptQuality(raw) {
  if (document.visibilityState !== 'visible' || raw > 0.2) return;
  perf.acc += raw; perf.n++;
  if (perf.acc < 2) return;
  fps = perf.n / perf.acc;
  perf.acc = 0; perf.n = 0;
  if (fps < 48 && renderScale > 0.55) { renderScale = Math.max(0.55, renderScale - 0.15); goodWindows = 0; resize(); }
  else if (fps > 58 && renderScale < 1 && ++goodWindows >= 3) { renderScale = Math.min(1, renderScale + 0.1); goodWindows = 0; resize(); }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5) * renderScale;
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const pr = pipCanvas.getBoundingClientRect();
  pipCanvas.width = Math.max(2, Math.round((pr.width || 360) * Math.min(dpr, 1)));
  pipCanvas.height = Math.max(2, Math.round((pr.height || 203) * Math.min(dpr, 1)));
  renderer.resize(W, H);
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ ações

function hookTo(a, auto = false) {
  me.attach(a, auto);
  if (a.d) me.hook.ref = a.d;
  sound.hook();
  renderer.spawn('spark', a.x, a.y, a.pid ? remotes.get(a.pid)?.color || '#fff' : accentAt(me.x), 10);
  if (firstHookAt < 0) firstHookAt = clock;
}

function teleportTo(r) {
  const v = r.view;
  me.respawnAt(v.x - 70 * (v.facing || 1), v.y - 40, v.vx, v.vy, v.stage);
  if (me.lastAnchor && me.lastAnchor.stage !== v.stage) me.lastAnchor = null;
  if (v.hook && !v.hook.pid) {
    me.attach({ x: v.hook.x, y: v.hook.y, id: -1 }, true);
    if (world.mode === 'drones') {
      const d = world.dronesIn(v.hook.x - 80, v.hook.x + 80, v.hook.y - 80, v.hook.y + 80)[0];
      if (d) { me.hook.ref = d; me.hook.drone = true; me.hook.id = d.id; }
    }
  }
  renderer.spawn('spark', me.x, me.y, r.color, 26);
  flash = 0.35;
  sound.ring();
}

function goToFriend() {
  const f = friends().find(r => !r.view.dead) || null;
  if (f) teleportTo(f);
}

function backToCabin() {
  me.toCabin();
  flash = 0.4;
}

function respawn(byPvp) {
  const f = nearestFriend();
  if (!byPvp && f && (world.mode === 'drones' ? f.view.x > INTRO.edge : f.view.stage > 0) && !f.view.funnel) { teleportTo(f); return; }
  const la = me.lastAnchor;
  if (world.mode === 'drones') {
    let d = la && la.drone ? world.droneById(la.id) : null;
    if (!d) {
      const list = world.dronesIn(me.x - 2500, me.x + 2500, 0, 4500);
      d = list.sort((a, b) => Math.hypot(a.x - me.x, a.y - 2000) - Math.hypot(b.x - me.x, b.y - 2000))[0];
    }
    if (d) {
      const p = dronePos(d, netNow() / 1000);
      me.respawnAtAnchor({ x: p.x, y: p.y, id: d.id, drone: true, stage: 0 });
      me.hook.ref = d;
    } else me.toCabin();
  } else if (la && la.stage === me.stage) me.respawnAtAnchor(la);
  else me.respawnAtStageStart(me.stage);
  flash = Math.max(flash, 0.35);
}

function biomeAt(x, k) { return world.mode === 'drones' ? droneBiome(droneSeg(x)) : biomeOf(k); }
function accentAt(x) { return BIOMES[biomeAt(x, me.stage)].accent; }

function splash(x, y, k, vol = 1) {
  const B = BIOMES[biomeAt(x, k)];
  if (world.mode === 'drones') renderer.spawn('puff', x, y, '#ffffff', 18);
  else if (B.floor === 'sea' || B.floor === 'lake') {
    renderer.spawn('drop', x, y, B.water[0], 34);
    renderer.spawn('puff', x, y, '#ffffff', 8);
  } else if (B.floor === 'snow') renderer.spawn('puff', x, y, '#f2f6ff', 18);
  else if (B.floor === 'street') renderer.spawn('spark', x, y, '#ffd27a', 24);
  else renderer.spawn('puff', x, y, '#d08a5e', 16);
  if (vol > 0.8) sound.splash();
}

function takeHit(fromId) {
  if (!party.pvp || phase !== 'play' || me.dead > 0 || me.invuln > 0) return;
  me.hp--;
  hurt = 1;
  shake = Math.max(shake, 0.25);
  sound.hurt();
  if (me.hp <= 0) {
    me.die(fxQ, fromId);
    net.send({ t: 'ev', k: 'kill', by: fromId, victim: myId });
    onEvent({ k: 'kill', by: fromId, victim: myId });
  }
}

function toggleMute() {
  const m = sound.toggleMute();
  syncMenu();
  return m;
}

function setCamMode(m) { prefs.camMode = m; savePrefs(); syncMenu(); }

// ------------------------------------------------------------------ mira assistida

function mouseWorld() {
  return { x: (inp.mx - W / 2) / cam.zoom + cam.x, y: (inp.my - H / 2) / cam.zoom + cam.y };
}

// Tudo em que dá pra prender o gancho perto de você: pontos brilhantes, drones e o seu amigo.
function hookables() {
  const R = ROPE_MAX + 50, out = [];
  if (world.mode === 'drones') {
    const t = netNow() / 1000;
    for (const d of world.dronesIn(me.x - R, me.x + R, me.y - R, me.y + R)) { const p = dronePos(d, t); out.push({ x: p.x, y: p.y, id: d.id, drone: true, d }); }
  } else {
    for (const a of world.anchorsIn(me.stage, me.x - R, me.x + R)) out.push(a);
  }
  for (const r of friends()) {
    const v = r.view;
    if (v.dead || v.funnel || !sameScene(v)) continue;
    out.push({ x: v.x, y: v.y - 10, pid: r.id, id: -100 - r.id });
  }
  return out;
}

function findTarget() {
  if (me.dead > 0 || (me.stage === 0 && me.x < INTRO.edge && me.onGround)) return null;
  const mw = mouseWorld();
  const ax = mw.x - me.x, ay = mw.y - me.y, al = Math.hypot(ax, ay) || 1;
  let best = null, bs = Infinity;
  for (const a of hookables()) {
    const dx = a.x - me.x, dy = a.y - me.y, d = Math.hypot(dx, dy);
    if (d > ROPE_MAX || d < 50) continue;
    // no Percurso só pega pontos acima (ou quase na mesma altura); drones e amigo valem de qualquer lado
    if (dy > 150 && !a.first && !a.drone && !a.pid) continue;
    const sd = Math.hypot(a.x - mw.x, a.y - mw.y) * cam.zoom;
    const ang = Math.acos(clamp((dx * ax + dy * ay) / (d * al), -1, 1));
    if (sd > 260 && ang > 0.5) continue;
    const score = sd + ang * 260;
    if (score < bs) { bs = score; best = a; }
  }
  return best;
}

const sameTarget = (a, h) => h && (a.pid ? h.pid === a.pid : !h.pid && h.id === a.id && !!h.drone === !!a.drone);

// ------------------------------------------------------------------ atualização

function update(rdt) {
  clock += rdt;
  frameNo++;
  const course = world.mode === 'course';
  const st = world.stage(me.stage);

  // câmera lenta ao chegar no primeiro pauzinho de cada cenário (Percurso)
  let wantSlow = false;
  if (course && phase === 'play' && me.entering && !me.hook && me.stage > 0 && me.dead <= 0) {
    const f = st.anchors[0];
    if (me.y > f.y - 900 && me.y < f.y + 500) wantSlow = true;
    else if (me.y >= f.y + 500) me.entering = false;
  }
  timeScale += ((wantSlow ? 0.14 : 1) - timeScale) * Math.min(1, rdt * (wantSlow ? 8 : 3));
  slowAmt += ((wantSlow ? 1 : 0) - slowAmt) * Math.min(1, rdt * 5);
  const dt = rdt * timeScale;

  // âncoras que se mexem (drones e amigos)
  if (me.hook) {
    const h = me.hook;
    if (h.pid) {
      const r = remotes.get(h.pid);
      if (!r || !r.view || r.view.dead || r.stale) me.hook = null;
      else { h.x = r.view.x; h.y = r.view.y - 10; }
    } else if (h.ref) {
      const p = dronePos(h.ref, netNow() / 1000);
      h.x = p.x; h.y = p.y;
    }
  }

  if (phase === 'play' && !menuOpen) {
    target = findTarget();
    if (inp.pressed) {
      inp.pressed = false;
      if (me.hook && me.hook.auto) {
        me.hook.auto = false;
        if (target && !sameTarget(target, me.hook)) hookTo(target);
      } else if (!me.hook && me.dead <= 0) {
        if (target) hookTo(target);
        else if (!me.onGround) {
          const mw = mouseWorld();
          const dx = mw.x - me.x, dy = mw.y - me.y, d = Math.hypot(dx, dy) || 1, L = Math.min(d, ROPE_MAX);
          missLine = { x: me.x + (dx / d) * L, y: me.y + (dy / d) * L, t: 0.18 };
          sound.miss();
        }
      }
    }
    if (inp.mouse && !me.hook && target && me.dead <= 0) hookTo(target);
    if (!inp.mouse && me.hook && !me.hook.auto) me.release(fxQ);

    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n; i++) me.step(dt / n, inp, fxQ);
    inp.jump = false;

    if (me.dead > 0) {
      me.dead -= rdt;
      if (me.dead <= 0) respawn(me.hp <= 0);
    }

    // PVP: botão direito atira um laser bem rápido onde você mira
    fireCD -= dt;
    if (party.pvp && inp.fire && fireCD <= 0 && me.dead <= 0) {
      fireCD = FIRE_RATE;
      const mw = mouseWorld();
      const ox = me.x, oy = me.y - 16;
      const dx = mw.x - ox, dy = mw.y - oy, d = Math.hypot(dx, dy) || 1;
      const L = { x: ox + (dx / d) * 40, y: oy + (dy / d) * 40, vx: (dx / d) * LASER_SPEED + me.vx * 0.25, vy: (dy / d) * LASER_SPEED + me.vy * 0.25, life: 0.34, mine: true, color: prefs.color };
      lasers.push(L);
      net.send({ t: 'ev', k: 'shot', x: Math.round(L.x), y: Math.round(L.y), vx: Math.round(L.vx), vy: Math.round(L.vy) });
      sound.laser();
    }
  } else target = null;
  updateLasers(dt);

  for (const ev of fxQ) {
    switch (ev.type) {
      case 'die':
        if (ev.by) { renderer.spawn('spark', ev.x, ev.y, prefs.color, 40); sound.splash(); }
        else splash(ev.x, ev.y, ev.stage);
        shake = 0.5;
        net.send({ t: 'ev', k: 'die', x: Math.round(ev.x), y: Math.round(ev.y), st: ev.stage, by: ev.by || 0 });
        break;
      case 'airjump':
        renderer.spawn('ring', ev.x, ev.y, prefs.color, 18);
        sound.airJump();
        net.send({ t: 'ev', k: 'aj', x: Math.round(ev.x), y: Math.round(ev.y) });
        break;
      case 'stage': showTitle(biomeOf(me.stage), `cenário ${me.stage}`); sound.whoosh(); break;
      case 'release': sound.release(); break;
      case 'jump': sound.jump(); break;
    }
  }
  fxQ = [];

  // título ao trocar de cenário no Céu de Drones
  if (world.mode === 'drones' && phase === 'play') {
    const s = droneSeg(me.x);
    if (s !== update.lastSeg) { if (update.lastSeg !== undefined && s >= 0) showTitle(droneBiome(s), `céu de drones · trecho ${s + 1}`); update.lastSeg = s; }
  }

  const insideCabin = phase === 'play' && me.stage === 0 && me.x > INTRO.cabin0 - 10 && me.x < INTRO.cabin1 + 10 && me.y > -260;
  cabinFront += ((insideCabin ? 0.12 : 1) - cabinFront) * Math.min(1, rdt * 6);

  myAvatar.update(dt, me.view());
  for (const r of remotes.values()) {
    const v = r.sample();
    if (v) r.avatar.update(rdt, v);
  }
  renderer.updateFx(dt);
  if (missLine) { missLine.t -= rdt; if (missLine.t <= 0) missLine = null; }
  flash = Math.max(0, flash - rdt * 1.6);
  shake = Math.max(0, shake - rdt * 1.8);
  hurt = Math.max(0, hurt - rdt * 2.5);

  updateCamera(rdt);
  updatePipCamera(rdt);

  if (phase === 'play' && net.connected && clock - lastSend > 0.05) {
    lastSend = clock;
    net.send(me.netState());
  }
  if (clock - lastHud > 0.1) { lastHud = clock; updateHud(); music.tick(); }
  const bl = blendFor(cam.x, cam.y, phase === 'play' ? me.stage : 0);
  sound.update(phase === 'play' ? me.speed : 0, slowAmt, whiteoutOf(bl), (bl.t < 0.5 ? bl.a : bl.b).biome);
}

function updateLasers(dt) {
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    const nx = l.x + l.vx * dt, ny = l.y + l.vy * dt;
    let hit = false;
    if (l.mine && party.pvp) {
      for (const r of friends()) {
        const v = r.view;
        if (v.dead) continue;
        // distância do segmento do laser até o centro do amigo
        const sx = nx - l.x, sy = ny - l.y, s2 = sx * sx + sy * sy || 1;
        const k = clamp(((v.x - l.x) * sx + (v.y - l.y) * sy) / s2, 0, 1);
        if (Math.hypot(l.x + sx * k - v.x, l.y + sy * k - v.y) < 58) {
          net.send({ t: 'ev', k: 'hit', to: r.id });
          renderer.spawn('spark', v.x, v.y, l.color, 14);
          sound.hitMark();
          hit = true;
          break;
        }
      }
    }
    l.x = nx; l.y = ny;
    l.life -= dt;
    if (hit || l.life <= 0) lasers.splice(i, 1);
  }
}

function updateCamera(rdt) {
  cam.px = cam.x; cam.py = cam.y;
  if (phase !== 'play') {
    cam.x += (-380 + Math.sin(clock * 0.12) * 140 - cam.x) * (1 - Math.exp(-rdt * 2));
    cam.y += (-230 - cam.y) * (1 - Math.exp(-rdt * 2));
    cam.zoom += (H / 1050 - cam.zoom) * (1 - Math.exp(-rdt * 2));
    return;
  }
  // velocidade suavizada: o "olhar pra frente" não dá trancos quando você solta ou prende a corda
  const kv = 1 - Math.exp(-rdt * 2.5);
  cam.vx += (me.vx - cam.vx) * kv;
  cam.vy += (me.vy - cam.vy) * kv;
  const spd = Math.hypot(cam.vx, cam.vy);
  const mode = prefs.camMode;
  let visH = 1650 + Math.min(900, spd * 0.28);
  let tx = me.x, ty = me.y;
  if (me.onGround) { visH = 1150; if (mode !== 'center') { tx += 160 * me.facing; ty -= 200; } }
  else if (mode !== 'center') {
    tx += clamp(cam.vx * 0.16, -420, 520);
    ty += clamp(cam.vy * 0.12, -300, 420);
    if (me.funnel) ty += 300;
  }
  if (me.funnel) visH += 400;
  visH -= 380 * slowAmt;

  // enquadrar o amigo: "sempre" no modo amigo, só quando perto no modo dinâmico — sempre com transição suave
  const f = nearestFriend();
  let want = 0, need = 0;
  if (f && me.dead <= 0 && sameScene(f.view)) {
    need = Math.max(Math.abs(f.view.y - me.y) + 800, (Math.abs(f.view.x - me.x) + 900) * (H / W));
    if (mode === 'friend') want = 1;
    else if (mode === 'dynamic') want = 1 - smoothstep(3400, 4600, need);
  }
  cam.fitW += (want - cam.fitW) * (1 - Math.exp(-rdt * 2.5));
  if (cam.fitW > 0.001 && f) {
    const w = cam.fitW;
    visH = lerp(visH, Math.max(visH, Math.min(need, 16000)), w);
    tx = lerp(tx, (me.x + f.view.x) / 2, w);
    ty = lerp(ty, (me.y + f.view.y) / 2, w);
  }
  if (mode === 'center' && cam.fitW < 0.01) { cam.x = tx; cam.y = ty; }
  else {
    const k = 1 - Math.exp(-rdt * 5);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }
  // zoom suave em escala logarítmica (sem "teleporte")
  const zt = H / visH;
  cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(zt) - Math.log(cam.zoom)) * (1 - Math.exp(-rdt * 1.8)));
}

function updatePipCamera(rdt) {
  const f = pipFriend();
  if (!f) { pipCam.id = null; return; }
  const v = f.view;
  const ph = pipCanvas.height || 200;
  const visH = 1650 + Math.min(900, Math.hypot(v.vx, v.vy) * 0.28);
  const tx = v.x + clamp(v.vx * 0.16, -420, 520), ty = v.y + clamp(v.vy * 0.12, -300, 420);
  if (pipCam.id !== f.id || Math.hypot(tx - pipCam.x, ty - pipCam.y) > 4000) { pipCam.x = tx; pipCam.y = ty; pipCam.zoom = ph / visH; pipCam.id = f.id; }
  const k = 1 - Math.exp(-rdt * 5);
  pipCam.x += (tx - pipCam.x) * k;
  pipCam.y += (ty - pipCam.y) * k;
  pipCam.zoom += (ph / visH - pipCam.zoom) * (1 - Math.exp(-rdt * 2));
}

function pipFriend() {
  if (phase !== 'play' || !prefs.pip) return null;
  return nearestFriend() || friends()[0] || null;
}

// Qual cenário está no fundo e quanto da travessia de nuvens já foi.
function blendFor(cx, cy, s) {
  if (world.mode === 'drones') {
    const p = (cx - DRONE.first) / DRONE.seg;
    const b = Math.round(p), d = cx - (DRONE.first + b * DRONE.seg);
    if (b >= 0 && Math.abs(d) < DRONE.blend) {
      return { a: { biome: droneBiome(b - 1), A: 0 }, b: { biome: droneBiome(b), A: 0 }, t: 0.5 + d / (2 * DRONE.blend) };
    }
    return { a: { biome: droneBiome(Math.floor(p)), A: 0 }, b: null, t: 0 };
  }
  const ref = k => ({ biome: biomeOf(k), A: world.stage(k).A });
  if (s > 0) {
    const prev = world.stage(s - 1);
    if (cy < prev.A + CLOUD1 + 200 && cx < world.stage(s).anchors[0].x + 1600) {
      return { a: ref(s - 1), b: ref(s), t: clamp((cy - (prev.A + CLOUD0)) / (CLOUD1 - CLOUD0), 0, 1) };
    }
  }
  const st = world.stage(s);
  return { a: ref(s), b: ref(s + 1), t: clamp((cy - (st.A + CLOUD0)) / (CLOUD1 - CLOUD0), 0, 1) };
}
const whiteoutOf = bl => (bl.b ? Math.pow(Math.sin(Math.PI * bl.t), 1.3) : 0);

// ------------------------------------------------------------------ desenho

function players() {
  const out = [];
  for (const r of remotes.values()) if (r.view && !r.stale) out.push({ v: r.view, a: r.avatar, color: r.color, skin: r.skin, name: r.name, id: r.id });
  if (phase === 'play') out.push({ v: me.view(), a: myAvatar, color: prefs.color, skin: prefs.skin, name: prefs.name || 'você', id: myId, me: true });
  return out;
}

function ropeEnd(p) {
  const h = p.v.hook;
  if (!h.pid || p.me) return h;
  if (h.pid === myId) return { x: me.x, y: me.y - 10 };
  const r = remotes.get(h.pid);
  return r && r.view ? { x: r.view.x, y: r.view.y - 10 } : h;
}

// Desenha o jogo inteiro a partir de uma câmera (tela principal ou a mini-tela do amigo).
function renderView(V) {
  const { out, W: vw, H: vh, dpr: vd, cam: c, main } = V;
  const bl = blendFor(c.x, c.y, V.stage);
  const dom = bl.t < 0.5 || !bl.b ? bl.a : bl.b;
  const pixel = !!BIOMES[dom.biome].pixel;
  const P = pixel ? Math.max(2, Math.round(vh / (main ? 300 : 140))) : 1;
  let g, pw = 0, ph = 0;
  if (pixel) {
    pw = Math.ceil(vw / P); ph = Math.ceil(vh / P);
    if (V.buf.pix.width !== pw || V.buf.pix.height !== ph) { V.buf.pix.width = pw; V.buf.pix.height = ph; }
    g = V.buf.pix.getContext('2d');
    g.setTransform(1 / P, 0, 0, 1 / P, 0, 0);
  } else {
    g = out;
    g.setTransform(vd, 0, 0, vd, 0, 0);
  }
  g.imageSmoothingEnabled = true;
  const e = { W: vw, H: vh, camX: c.x, camY: c.y, zoom: c.zoom, t: clock, dt: Math.max(1e-3, lastDt), bg: vh / 1600, P };
  renderer.background(g, e, bl, V.buf);

  const z = c.zoom;
  const sh = main && shake > 0 ? shake * 26 : 0;
  const ox = vw / 2 + (Math.random() - 0.5) * sh, oy = vh / 2 + (Math.random() - 0.5) * sh;
  const view = { x0: c.x - vw / 2 / z, x1: c.x + vw / 2 / z, y0: c.y - vh / 2 / z, y1: c.y + vh / 2 / z };
  const worldTf = t => { t.translate(ox, oy); t.scale(z, z); t.translate(-c.x, -c.y); };
  g.save();
  worldTf(g);
  drawScenery(g, e, view, V, dom);
  g.restore();

  // Pixel art vale só pro cenário: personagens, cordas, lasers e efeitos vêm por cima em resolução cheia,
  // senão o boneco fica borrado ("miopia").
  if (pixel) {
    if (main) renderer.ambientParticles(g, e, BIOMES[dom.biome].particles, cam.x - cam.px, cam.y - cam.py);
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.imageSmoothingEnabled = false;
    out.drawImage(V.buf.pix, 0, 0, pw * P * vd, ph * P * vd);
    out.imageSmoothingEnabled = true;
  }
  out.setTransform(vd, 0, 0, vd, 0, 0);
  const ef = { ...e, P: 1 };
  out.save();
  worldTf(out);
  drawActors(out, ef, view, V);
  out.restore();
  if (!pixel && main) renderer.ambientParticles(out, ef, BIOMES[dom.biome].particles, cam.x - cam.px, cam.y - cam.py);

  const c0 = BIOMES[bl.a.biome].cloud, c1 = bl.b ? BIOMES[bl.b.biome].cloud : c0;
  renderer.overlays(out, ef, {
    // no Céu de Drones você atravessa a fronteira balançando: névoa bem mais leve
    whiteout: whiteoutOf(bl) * (world.mode === 'drones' ? 0.3 : 0.9), whiteColor: mixHex(c0, c1, bl.t),
    speed: main && phase === 'play' ? me.speed : 0, vel: { x: me.vx, y: me.vy },
    slow: main ? slowAmt : 0, flash: main ? flash : 0, hurt: main ? hurt : 0,
  });

  // nomes e barras de vida por cima
  out.save();
  worldTf(out);
  drawLabels(out, z, main);
  out.restore();
}

// Cenário (pode ir pro buffer de pixel art).
function drawScenery(g, e, view, V, dom) {
  const main = V.main;
  if (world.mode === 'course') {
    const s = V.stage, k0 = Math.max(0, s - 1), k1 = s + 1;
    for (let k = k0; k <= k1; k++) renderer.transitionClouds(g, e, world.stage(k), biomeOf(k + 1), view, false);
    for (let k = k0; k <= k1; k++) {
      if (k === 0) renderer.intro(g, e, cabinFront);
      else renderer.stage(g, e, world.stage(k), view, main && k === me.stage ? target : null);
    }
  } else {
    renderer.intro(g, e, cabinFront);
    boundaryClouds(g, e, view, false);
    renderer.fog(g, view, 3800, DRONE.floor - 300, BIOMES[dom.biome].fog, 0.85, INTRO.edge - 200);
    renderer.cloudFloor(g, e, view, DRONE.floor, BIOMES[dom.biome].cloud);
    const t = netNow() / 1000;
    for (const d of world.dronesIn(view.x0 - 160, view.x1 + 160, view.y0 - 160, view.y1 + 160)) {
      renderer.drone(g, e, d, dronePos(d, t), BIOMES[droneBiome(droneSeg(d.x))], main && target && target.drone && target.id === d.id);
    }
  }

  if (main && phase === 'play' && target && !me.hook && me.dead <= 0) {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 2 / e.zoom;
    g.setLineDash([8 / e.zoom, 10 / e.zoom]);
    g.beginPath(); g.moveTo(me.x, me.y); g.lineTo(target.x, target.y); g.stroke();
    g.restore();
    if (target.pid) {
      g.save();
      g.strokeStyle = remotes.get(target.pid)?.color || '#fff';
      g.lineWidth = 3 / e.zoom;
      g.setLineDash([10 / e.zoom, 8 / e.zoom]);
      g.lineDashOffset = -clock * 40;
      g.beginPath(); g.arc(target.x, target.y, 70, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  }
  if (main && missLine) {
    g.save();
    g.globalAlpha = missLine.t / 0.18;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(me.x, me.y); g.lineTo(missLine.x, missLine.y); g.stroke();
    g.restore();
  }
}

// Personagens e efeitos (sempre em resolução cheia) + nuvens da frente.
function drawActors(g, e, view, V) {
  const ps = players();
  for (const p of ps) if (!p.v.dead) p.a.drawTrail(g, p.color);
  for (const p of ps) if (p.v.hook && !p.v.dead) drawRope(g, p.a.hand, ropeEnd(p), p.v.hook.L, p.color, p.skin, clock);
  for (const p of ps) p.a.draw(g, p.v, p.color, p.skin);
  renderer.drawFx(g);
  renderer.lasers(g, lasers);

  if (world.mode === 'course') {
    const s = V.stage;
    for (let k = Math.max(0, s - 1); k <= s + 1; k++) renderer.transitionClouds(g, e, world.stage(k), biomeOf(k + 1), view, true);
  } else boundaryClouds(g, e, view, true);
}

function boundaryClouds(g, e, view, front) {
  const b0 = Math.floor((view.x0 - DRONE.first) / DRONE.seg), b1 = Math.ceil((view.x1 - DRONE.first) / DRONE.seg);
  for (let b = Math.max(0, b0); b <= b1; b++) {
    const x = DRONE.first + b * DRONE.seg;
    if (x < view.x0 - 3000 || x > view.x1 + 3000) continue;
    const c = mixHex(BIOMES[droneBiome(b - 1)].cloud, BIOMES[droneBiome(b)].cloud, 0.5);
    renderer.cloudColumn(g, e, world.boundaryClouds(b), view, front, c, c, 0, 1, 0.35);
  }
}

function drawLabels(g, z, main) {
  for (const p of players()) {
    if (p.v.dead || (p.me && main)) continue;
    const head = p.a.headPos || { x: p.v.x, y: p.v.y - 35 };
    const fs = 13 / z;
    g.font = `600 ${fs}px Outfit, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    const ny = Math.min(p.v.y, head.y) - 28;
    const w = g.measureText(p.name).width + 12 / z;
    g.fillStyle = 'rgba(10,8,20,0.5)';
    roundRect(g, p.v.x - w / 2, ny - fs * 1.25, w, fs * 1.45, 6 / z);
    g.fill();
    g.fillStyle = p.color;
    g.fillText(p.name, p.v.x, ny);
    if (party.pvp) {
      const bw = 64 / z, bh = 6 / z, by = ny - fs * 1.25 - bh - 4 / z;
      const hp = clamp((p.v.hp ?? MAX_HP) / MAX_HP, 0, 1);
      g.fillStyle = 'rgba(10,8,20,0.6)';
      g.fillRect(p.v.x - bw / 2, by, bw, bh);
      g.fillStyle = hp > 0.5 ? '#7dff8a' : hp > 0.25 ? '#ffcf3f' : '#ff4f5e';
      g.fillRect(p.v.x - bw / 2, by, bw * hp, bh);
    }
  }
  if (main && party.pvp && me.dead <= 0 && phase === 'play') {
    // sua própria vida, discreta, acima da cabeça
    const head = myAvatar.headPos || { x: me.x, y: me.y - 35 };
    const bw = 64 / z, bh = 6 / z, by = Math.min(me.y, head.y) - 34;
    g.fillStyle = 'rgba(10,8,20,0.6)';
    g.fillRect(me.x - bw / 2, by, bw, bh);
    g.fillStyle = me.hp > 5 ? '#7dff8a' : me.hp > 2 ? '#ffcf3f' : '#ff4f5e';
    g.fillRect(me.x - bw / 2, by, bw * me.hp / MAX_HP, bh);
  }
}

function render() {
  renderView({ out: ctx, W, H, dpr, cam, main: true, stage: phase === 'play' ? me.stage : 0, buf: mainBuf });
  if (phase === 'play') {
    drawFriendMarkers();
    if (!menuOpen) drawCrosshair();
  }
  const f = pipFriend();
  $('#pip-wrap').classList.toggle('hidden', !f);
  if (f && frameNo % 2 === 0) {
    const pw = pipCanvas.width, ph = pipCanvas.height;
    renderView({ out: pipCtx, W: pw, H: ph, dpr: 1, cam: pipCam, main: false, stage: f.view.stage, buf: pipBuf });
    $('#pip-label').textContent = `visão de ${f.name}`;
  }
}

function drawFriendMarkers() {
  for (const r of friends()) {
    const v = r.view;
    const sx = (v.x - cam.x) * cam.zoom + W / 2, sy = (v.y - cam.y) * cam.zoom + H / 2;
    const m = 46;
    if (sx > m && sx < W - m && sy > m && sy < H - m) continue;
    const dx = sx - W / 2, dy = sy - H / 2;
    const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
    const px = W / 2 + dx * k, py = H / 2 + dy * k;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = 'rgba(15,8,30,0.6)';
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(ang);
    ctx.fillStyle = r.color;
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(18, -9); ctx.lineTo(18, 9); ctx.closePath(); ctx.fill();
    ctx.rotate(-ang);
    ctx.fillStyle = r.color;
    ctx.font = '700 11px Outfit, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.name.slice(0, 6), 0, -4);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '600 10px Outfit, system-ui, sans-serif';
    ctx.fillText(fmtDist(Math.hypot(v.x - me.x, v.y - me.y) / UNIT_M), 0, 8);
    ctx.restore();
  }
}

function drawCrosshair() {
  const x = inp.mx, y = inp.my;
  ctx.save();
  ctx.strokeStyle = target ? (target.pid ? remotes.get(target.pid)?.color || '#fff' : accentAt(me.x)) : 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, target ? 13 : 10, 0, Math.PI * 2); ctx.stroke();
  if (party.pvp) {
    const ready = fireCD <= 0;
    ctx.strokeStyle = ready ? '#ff5d7c' : 'rgba(255,93,124,0.35)';
    ctx.beginPath();
    ctx.moveTo(x - 18, y); ctx.lineTo(x - 8, y); ctx.moveTo(x + 8, y); ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 8); ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 18);
    ctx.stroke();
    if (!ready) {
      // anel de recarga do laser
      ctx.strokeStyle = '#ff5d7c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - fireCD / FIRE_RATE));
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ HUD / menus

const hud = { biome: $('#hud-biome'), dist: $('#hud-dist span'), unit: $('#hud-dist small'), speed: $('#hud-speed'), best: $('#hud-best'), hp: $('#hud-hp'), net: $('#hud-net'), players: $('#hud-players'), hint: $('#hint'), title: $('#title') };
let hintText = '';

function fmtDist(m) { return m >= 10000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m).toLocaleString('pt-BR')} m`; }

function updateHud() {
  if (phase !== 'play') return;
  const d = me.dist;
  if (d > prefs.best) {
    prefs.best = d;
    if (clock - lastSave > 3) { lastSave = clock; savePrefs(); }
  }
  const drones = world.mode === 'drones';
  const B = BIOMES[biomeAt(me.x, me.stage)];
  hud.biome.textContent = drones ? `${B.name}  ·  CÉU DE DRONES` : B.name + (me.stage > 0 ? `  ·  ${me.stage}` : '');
  const big = d >= 10000;
  hud.dist.textContent = big ? (d / 1000).toFixed(1).replace('.', ',') : Math.round(d).toLocaleString('pt-BR');
  hud.unit.textContent = big ? 'km' : 'm';
  hud.speed.textContent = `${Math.round((me.speed / UNIT_M) * 3.6)} km/h`;
  hud.best.textContent = `recorde ${fmtDist(prefs.best)}`;
  hud.hp.classList.toggle('hidden', !party.pvp);
  if (party.pvp) hud.hp.innerHTML = `<span class="hearts">${'♥'.repeat(Math.max(0, me.hp))}<i>${'♥'.repeat(Math.max(0, MAX_HP - me.hp))}</i></span> <span class="kills">abates ${myKills}</span>`;

  const n = friends().length;
  const perfTxt = showFps ? ` · ${Math.round(fps)} fps · ${Math.round(renderScale * 100)}%` : '';
  const tags = (party.pvp ? ' · PVP' : '') + (drones ? ' · drones' : '');
  hud.net.innerHTML = (net.connected ? `<span class="dot"></span>online · ${n + 1} jogando${tags}` : `<span class="dot"></span>sem conexão com o host${tags}`) + perfTxt;
  hud.net.classList.toggle('off', !net.connected);
  const row = (color, name, dist, extra) => `<div class="pl"><i style="background:${color}"></i><b>${esc(name)}</b><span>${dist}</span>${extra || ''}</div>`;
  hud.players.innerHTML = [row(prefs.color, prefs.name, fmtDist(d), party.pvp ? `<em>${myKills}</em>` : '')]
    .concat(friends().map(r => row(r.color, r.name, r.view.dead ? 'caiu!' : fmtDist(Math.max(0, r.view.x - INTRO.spawn) / UNIT_M), party.pvp ? `<em>${r.kills}</em>` : '')))
    .join('');

  let h = '', bigHint = false;
  if (me.dead > 0) h = me.hp <= 0 && party.pvp ? 'Eliminado! Voltando…' : 'Caiu! Voltando…';
  else if (me.stage === 0 && me.onGround) h = me.x < INTRO.cabin1 + 20 ? 'A / D para andar  ·  saia da casinha →' : 'Corra e pule do penhasco! (W ou Espaço)';
  else if (slowAmt > 0.3) { h = 'SEGURE O CLIQUE NO PONTO BRILHANTE!'; bigHint = true; }
  else if (me.funnel) h = 'Queda livre! Prepare o gancho…';
  else if (drones && firstHookAt < 0) h = 'Segure o clique num drone  ·  se cair, pegue um mais embaixo';
  else if (firstHookAt >= 0 && clock - firstHookAt < 9) h = 'Solte o clique pra se lançar  ·  Espaço = pulo duplo  ·  W encurta / S alonga a corda';
  if (h !== hintText) { hintText = h; hud.hint.textContent = h; }
  hud.hint.classList.toggle('on', !!h);
  hud.hint.classList.toggle('big', bigHint);
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

function showTitle(biome, sub) {
  const B = BIOMES[biome];
  hud.title.querySelector('.t1').textContent = B.name;
  hud.title.querySelector('.t2').textContent = sub ? `${sub}  ·  ${B.sub}` : B.sub;
  hud.title.classList.remove('show');
  void hud.title.offsetWidth;
  hud.title.classList.add('show');
}

function feed(text) {
  const box = $('#feed');
  const el = document.createElement('div');
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 5000);
  while (box.children.length > 5) box.firstChild.remove();
}

function renderStatus() {
  const el = $('#status');
  const n = remotes.size;
  const txt = {
    connecting: ['conectando ao host…', ''],
    online: [n ? `conectado · ${n} amigo${n > 1 ? 's' : ''} na casinha` : 'conectado · esperando seu amigo', 'ok'],
    lost: ['conexão perdida — tentando de novo…', 'bad'],
    offline: ['sem servidor — dá pra jogar sozinho', 'bad'],
  }[netStatus] || ['', ''];
  el.textContent = txt[0];
  el.className = 'status ' + txt[1];
}

function onMusicState(s) {
  const t = $('#music-title'), st = $('#music-status'), play = $('#music-play');
  const txt = {
    loading: '♫ carregando…',
    playing: `♫ ${s.title || 'tocando'}`,
    paused: `♫ ${s.title || 'pausado'}`,
    error: `♫ ${s.msg}`,
    stopped: '',
  }[s.status] || '';
  t.textContent = txt + (s.by && s.status !== 'error' ? `  ·  por ${s.by}` : '');
  st.textContent = s.status === 'stopped' ? 'nada tocando' : txt;
  // se o navegador bloquear o som automático, aparece um botão pra liberar
  play.classList.toggle('hidden', s.status !== 'paused');
}

function playMusicFromInput() {
  const id = parseYouTube($('#yt-url').value);
  if (!id) { $('#music-status').textContent = 'link do YouTube inválido'; return; }
  sound.init();
  setParty({ music: { id } });
  $('#yt-url').value = '';
}

// ---- menu (Esc)
function toggleMenu(force) {
  menuOpen = force ?? !menuOpen;
  $('#menu').classList.toggle('hidden', !menuOpen);
  document.body.classList.toggle('playing', !menuOpen && phase === 'play');
  inp.left = inp.right = inp.up = inp.down = inp.mouse = inp.fire = false;
  if (menuOpen) syncMenu();
}

function syncMenu() {
  const set = (opt, v) => document.querySelectorAll(`[data-opt="${opt}"] button`).forEach(b => b.classList.toggle('on', b.dataset.v === v));
  set('cam', prefs.camMode);
  set('mode', party.mode);
  set('pvp', party.pvp ? 'on' : 'off');
  set('pip', prefs.pip ? 'on' : 'off');
  set('skin', prefs.skin);
  set('sound', sound.muted ? 'off' : 'on');
  set('rope', prefs.rope);
  me.takeUp = prefs.rope === 'takeup';
  $('#yt-vol').value = prefs.volume;
}

$('#menu').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'resume') toggleMenu(false);
  if (act === 'friend') { goToFriend(); toggleMenu(false); }
  if (act === 'cabin') { backToCabin(); toggleMenu(false); }
  if (act === 'play-music') playMusicFromInput();
  if (act === 'stop-music') setParty({ music: null });
  const opt = b.closest('[data-opt]')?.dataset.opt, v = b.dataset.v;
  if (!opt) return;
  if (opt === 'cam') setCamMode(v);
  if (opt === 'mode' && v !== party.mode) setParty({ mode: v });
  if (opt === 'pvp') setParty({ pvp: v === 'on' });
  if (opt === 'pip') { prefs.pip = v === 'on'; savePrefs(); }
  if (opt === 'skin') { prefs.skin = v; savePrefs(); sendJoin(); }
  if (opt === 'sound' && (v === 'off') !== sound.muted) toggleMute();
  if (opt === 'rope') { prefs.rope = v; savePrefs(); }
  syncMenu();
});
$('#yt-vol').addEventListener('input', e => { prefs.volume = +e.target.value; music.setVolume(prefs.volume); savePrefs(); });
$('#music-play').addEventListener('click', () => music.resume());
$('#music-stop').addEventListener('click', () => setParty({ music: null }));

// ---- lobby
function skinPreview(cv, skin, color) {
  const g = cv.getContext('2d');
  const a = new Avatar();
  const s = { x: 40, y: 52, vx: 0, vy: 0, onGround: true, facing: 1, walk: 0, hook: null };
  for (let i = 0; i < 30; i++) a.update(1 / 60, s);
  g.clearRect(0, 0, cv.width, cv.height);
  g.save();
  g.scale(cv.width / 80, cv.height / 100);
  a.draw(g, s, color, skin);
  g.restore();
}

function buildLobby() {
  const nameEl = $('#name');
  nameEl.value = prefs.name;
  const box = $('#colors');
  for (const c of COLORS) {
    const b = document.createElement('div');
    b.className = 'swatch' + (c === prefs.color ? ' on' : '');
    b.style.background = c;
    b.style.color = c;
    b.onclick = () => {
      prefs.color = c;
      box.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s === b));
      drawSkins();
    };
    box.appendChild(b);
  }
  const skins = $('#skins');
  for (const [k, sk] of Object.entries(SKINS)) {
    const card = document.createElement('button');
    card.className = 'skin' + (k === prefs.skin ? ' on' : '');
    card.dataset.v = k;
    card.innerHTML = `<canvas width="80" height="100"></canvas><span>${sk.label}</span>`;
    card.onclick = () => { prefs.skin = k; skins.querySelectorAll('.skin').forEach(s => s.classList.toggle('on', s === card)); };
    skins.appendChild(card);
  }
  drawSkins();
  $('#play').onclick = startPlaying;

  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    fetch('/api/info').then(r => r.json()).then(info => {
      const ips = info.ips.filter(i => i.radmin).concat(info.ips.filter(i => !i.radmin)).slice(0, 3);
      if (!ips.length) return;
      const wrap = $('#invite-links');
      for (const ip of ips) {
        const url = `http://${ip.address}:${info.port}`;
        const row = document.createElement('div');
        row.className = 'link';
        row.innerHTML = `<code>${url}</code><small>${ip.radmin ? 'Radmin' : esc(ip.name)}</small>`;
        const btn = document.createElement('button');
        btn.className = 'copy';
        btn.textContent = 'copiar';
        btn.onclick = () => { navigator.clipboard?.writeText(url); btn.textContent = 'copiado!'; };
        row.appendChild(btn);
        wrap.appendChild(row);
      }
      $('#invite').classList.remove('hidden');
    }).catch(() => {});
  }
}

function drawSkins() {
  document.querySelectorAll('#skins .skin').forEach(card => skinPreview(card.querySelector('canvas'), card.dataset.v, prefs.color));
}

function startPlaying() {
  if (phase === 'play') return;
  prefs.name = ($('#name').value || '').trim().slice(0, 16) || `Jogador ${((Math.random() * 90) | 0) + 10}`;
  savePrefs();
  sound.init();
  sound.duck(!!party.music);
  phase = 'play';
  me.toCabin();
  cam.x = me.x; cam.y = me.y - 150;
  sendJoin();
  $('#lobby').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  document.body.classList.add('playing');
  showTitle('sunset', world.mode === 'drones' ? 'céu de drones' : '');
  resize();
}

// ------------------------------------------------------------------ laço

let last = performance.now();
let lastDt = 1 / 60;
function frame(now) {
  const raw = (now - last) / 1000;
  const rdt = Math.min(0.05, raw);
  last = now;
  adaptQuality(raw);
  lastDt = rdt * timeScale;
  update(rdt);
  render();
  requestAnimationFrame(frame);
}

resize();
buildLobby();
renderStatus();
syncMenu();
net.connect();
requestAnimationFrame(frame);

// para depuração no console
window.__voo = {
  me, remotes, cam, inp, prefs,
  world: () => world,
  party: () => party,
  setParty,
  tick(rdt = 1 / 60) { lastDt = rdt * timeScale; update(rdt); render(); },
};
