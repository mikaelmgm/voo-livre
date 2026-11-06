// Voo Livre — servidor do host.
// Sem dependências: basta ter Node.js instalado e rodar `node server.js [porta]`.
// Serve os arquivos do jogo e repassa o estado dos jogadores via WebSocket.

const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const dns = require('dns');
const { loadCert } = require('./cert.js');

const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
// "Última atualização" do menu: dá pra servir o jogo guardado em versoes/anterior no lugar do atual, pra todo mundo.
const OLD = path.join(__dirname, 'versoes', 'anterior');
const OLD_PUBLIC = path.join(OLD, 'public');
const ACTIVE_FILE = path.join(__dirname, 'versoes', 'ativa.txt');
let version = 'nova';
try { if (fs.readFileSync(ACTIVE_FILE, 'utf8').trim() === 'anterior' && fs.existsSync(OLD_PUBLIC)) version = 'anterior'; } catch { /* ainda não existe */ }
const webRoot = () => (version === 'anterior' ? OLD_PUBLIC : PUBLIC);
function oldDate() {
  try { return fs.readFileSync(path.join(OLD, 'quando.txt'), 'utf8').trim(); } catch { return null; }
}
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

// Semente do mundo: todos os jogadores conectados geram exatamente o mesmo percurso.
const SEED = crypto.randomBytes(4).readUInt32LE(0);
const SKINS = ['scarf', 'spider', 'miles'];
const SKINS3 = ['spider', 'miles', 'simb', 'gummy', 'scarf'];

// Configurações da party, iguais pra todo mundo: PVP, mapa, música do YouTube, vídeo do telão do cinema (3D),
// rádio da laje (YouTube ou Spotify) e o horário do dia (3D).
const party = { pvp: false, mode: 'course', music: null, cinema: null, radio: null, time: { locked: false, hour: 15, at: Date.now() }, god: { grav: 1, sea: 0, bend: 0, pace: 1, map: 'ilha' } };
// prédios comidos ou destruídos no 3D, pra quem chegar depois ver a cidade do mesmo jeito
const eaten = new Set();
// blocos quebrados e colocados no modo Minecraft
const voxels = new Map();
const VOX_MAX = 40000;
// Estado dos jogos da laje (sinuca, ping pong, basquete), pra quem chegar depois ver a mesa como está.
const shared = {};
const GAMES = ['sinuca', 'pong', 'pad', 'bola', 'cesta'];
// Quadro branco: lista de traços; quando enche, os mais antigos somem.
const board = [];
const BOARD_MAX = 150000;
let boardPts = 0;
const ytState = (v, by) => {
  const id = v && v.id;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, at: Date.now(), by } : null;
};

function radioState(v, by) {
  if (!v) return null;
  const at = Date.now();
  if (v.src === 'sp' && /^spotify:(track|album|playlist|episode|show|artist):[A-Za-z0-9]{10,40}$/.test(v.uri)) return { src: 'sp', uri: v.uri, at, by };
  if (v.src === 'yt') {
    const list = typeof v.list === 'string' && /^[A-Za-z0-9_-]{10,64}$/.test(v.list) ? v.list : null;
    const id = typeof v.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.id) ? v.id : null;
    if (id || list) return { src: 'yt', id, list, at, by };
  }
  return null;
}

// O YouTube recusa a maioria dos vídeos (erro 150) em páginas abertas por IP puro. O sslip.io é um DNS público que
// devolve o IP escrito no próprio nome: 26-61-51-51.sslip.io cai em 26.61.51.51, sem instalar nem cadastrar nada.
const hostOf = ip => ip.replace(/\./g, '-') + '.sslip.io';
const namesOk = new Set();   // só redireciona se o nome resolveu mesmo: sem internet, o IP continua funcionando

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal) continue;
      out.push({ name, address: a.address, host: hostOf(a.address), radmin: /radmin/i.test(name) || a.address.startsWith('26.') });
    }
  }
  return out.sort((a, b) => b.radmin - a.radmin);
}

// ---------------------------------------------------------------- HTTP

function serve(req, res) {
  const url = new URL(req.url, 'http://localhost');
  // quem entrou pelo IP cai no endereço com nome (e em https, que também libera o microfone)
  const ip = String(req.headers.host || '').split(':')[0];
  if (namesOk.has(ip) && ['/', '/index.html', '/3d.html'].includes(url.pathname)) {
    res.writeHead(302, { Location: `https://${hostOf(ip)}:${PORT}${req.url}`, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ port: PORT, ips: lanAddresses(), https: true, players: [...clients.values()].filter(c => c.joined).length }));
    return;
  }
  if (url.pathname === '/api/versao') {
    if (req.method === 'POST') { pickVersion(req, res); return; }
    sendVersion(res);
    return;
  }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { rel = '/'; }
  if (rel === '/' || rel === '') rel = '/index.html';
  // o painel de versão é sempre o mais novo, porque é ele que traz a versão antiga de volta
  const root = rel === '/versao.js' ? PUBLIC : webRoot();
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('não encontrado'); return; }
    // quem foi guardado antes do painel existir recebe ele aqui
    if (path.extname(file) === '.html' && !data.includes('versao.js')) data = String(data).replace('</body>', '<script src="/versao.js"></script></body>');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function sendVersion(res) {
  res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ativa: version, temAnterior: fs.existsSync(OLD_PUBLIC), anteriorDe: oldDate() }));
}

function pickVersion(req, res) {
  let body = '';
  req.on('data', d => { if (body.length < 200) body += d; });
  req.on('end', () => {
    let v = null;
    try { v = JSON.parse(body).v; } catch { /* corpo inválido */ }
    if ((v === 'nova' || (v === 'anterior' && fs.existsSync(OLD_PUBLIC))) && v !== version) {
      version = v;
      try { fs.writeFileSync(ACTIVE_FILE, v); } catch { /* vale até desligar o servidor */ }
      console.log(`  * versão do jogo: ${v}`);
    }
    sendVersion(res);
  });
}

// A mesma porta atende HTTP e HTTPS: olha o primeiro byte da conexão (0x16 = início de TLS).
const plain = http.createServer(serve);
const secure = https.createServer(loadCert(__dirname, lanAddresses().map(i => i.address), lanAddresses().map(i => i.host)), serve);
const server = net.createServer(sock => {
  sock.on('error', () => {});
  sock.once('data', first => {
    sock.pause();
    sock.unshift(first);
    (first[0] === 0x16 ? secure : plain).emit('connection', sock);
    process.nextTick(() => sock.resume());
  });
});

// ---------------------------------------------------------------- WebSocket (RFC 6455, só o necessário)

let nextId = 1;
const clients = new Map();

class Client {
  constructor(socket) {
    this.socket = socket;
    this.id = nextId++;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.alive = true;
    this.joined = false;
    this.name = 'Jogador';
    this.color = '#ffcf5a';
    this.skin = 'scarf';
    this.skin3 = 'spider';
    this.slime = 60;
    this.portals = [null, null];
    this.voice = false;
    this.muted = false;
    socket.setNoDelay(true);
    socket.on('data', d => this.onData(d));
    socket.on('close', () => this.onClose());
    socket.on('error', () => this.onClose());
    clients.set(this.id, this);
    this.send({
      t: 'welcome', id: this.id, seed: SEED, party, shared, now: Date.now(), eaten: [...eaten], vox: [...voxels.values()],
      players: [...clients.values()].filter(c => c.joined && c !== this).map(c => c.info()),
    });
  }

  info() { return { id: this.id, name: this.name, color: this.color, skin: this.skin, skin3: this.skin3, slime: this.slime }; }
  voiceInfo() { return { id: this.id, name: this.name, color: this.color, muted: this.muted }; }

  onData(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) { this.socket.destroy(); return; }
      const maskAt = off;
      if (masked) off += 4;
      if (b.length < off + len) return;
      let payload = Buffer.from(b.subarray(off, off + len));
      if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= b[maskAt + (i & 3)];
      this.buf = b.subarray(off + len);

      if (op === 0x8) { this.frame(0x8, Buffer.alloc(0)); this.socket.end(); return; }
      if (op === 0x9) { this.frame(0xA, payload); continue; }
      if (op === 0xA) { this.alive = true; continue; }
      this.frags.push(payload);
      if (fin) {
        const text = Buffer.concat(this.frags).toString('utf8');
        this.frags = [];
        this.onMessage(text);
      }
    }
  }

  frame(op, payload) {
    if (!this.socket.writable) return;
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }

  send(obj) { this.frame(0x1, Buffer.from(JSON.stringify(obj))); }

  onMessage(text) {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'join': {
        this.name = String(m.name || 'Jogador').replace(/[<>]/g, '').trim().slice(0, 16) || 'Jogador';
        if (/^#[0-9a-f]{6}$/i.test(m.color)) this.color = m.color;
        if (SKINS.includes(m.skin)) this.skin = m.skin;
        if (SKINS3.includes(m.skin3)) this.skin3 = m.skin3;
        if (Number.isFinite(m.slime)) this.slime = Math.max(0, Math.min(100, Math.round(m.slime)));
        const first = !this.joined;
        this.joined = true;
        broadcast({ t: 'join', ...this.info() }, this);
        if (first) for (const c of clients.values()) for (const p of c.portals) if (p) this.send(p);
        if (first) console.log(`  + ${this.name} entrou (${[...clients.values()].filter(c => c.joined).length} jogando)`);
        break;
      }
      case 's':
      case 'ev':
      case 's3':   // versão 3D
        if (this.joined) broadcast({ ...m, id: this.id }, this);
        break;
      case 'g':    // jogos da laje; `keep` guarda o último estado pra quem entrar depois
        if (!this.joined || !GAMES.includes(m.k)) break;
        m.id = this.id;
        if (m.keep) shared[m.k] = m;
        broadcast(m, this);
        break;
      case 'wb': {  // pedaço de traço do quadro branco
        if (!this.joined || !Array.isArray(m.p) || m.p.length < 4 || m.p.length > 2000 || !m.p.every(Number.isFinite)) break;
        if (!/^#[0-9a-f]{6}$/i.test(m.c)) break;
        const stroke = { c: m.c, w: Math.min(120, Math.max(1, Number(m.w) || 4)), p: m.p };
        board.push(stroke);
        boardPts += stroke.p.length;
        while (boardPts > BOARD_MAX) boardPts -= board.shift().p.length;
        broadcast({ t: 'wb', ...stroke }, this);
        break;
      }
      case 'wb-clear':
        if (!this.joined) break;
        board.length = 0;
        boardPts = 0;
        broadcast({ t: 'wb-clear', by: this.name }, this);
        break;
      case 'wb-get':
        this.send({ t: 'wb-all', strokes: board });
        break;
      case 'vc': { // entrou/saiu da call ou mutou
        const was = this.voice;
        this.voice = !!m.on;
        this.muted = !!m.muted;
        if (this.voice && !was) {
          this.send({ t: 'vc-list', peers: [...clients.values()].filter(c => c.voice && c !== this).map(c => c.voiceInfo()) });
          console.log(`  ~ ${this.name} entrou na call`);
        }
        if (this.voice || was) broadcast({ t: 'vc', ...this.voiceInfo(), on: this.voice }, this);
        break;
      }
      case 'rtc': { // sinalização do WebRTC: só repassa de um pro outro
        const to = clients.get(m.to);
        if (to && this.voice) to.send({ t: 'rtc', from: this.id, d: m.d });
        break;
      }
      case 'e3': { // acontecimentos do 3D: buraco negro, chuva, meteoro, prédio comido
        if (!this.joined) break;
        if (m.k === 'lot' && Number.isInteger(m.i) && Number.isInteger(m.j)) eaten.add(m.i + ',' + m.j);
        if (m.k === 'city') { eaten.clear(); voxels.clear(); }
        if (m.k === 'vox' && [m.x, m.y, m.z, m.b].every(Number.isInteger)) {
          const key = m.x + ',' + m.y + ',' + m.z;
          voxels.delete(key);
          voxels.set(key, [m.x, m.y, m.z, m.b]);
          if (voxels.size > VOX_MAX) voxels.delete(voxels.keys().next().value);
        }
        broadcast({ ...m, id: this.id }, this);
        break;
      }
      case 'perf': { // números de verdade de quem está jogando, num arquivo pra olhar depois
        if (!this.joined) break;
        const line = [new Date().toISOString(), this.name, `${m.fps} fps`, `pior ${m.worst} ms`, m.q, m.art, m.where, `${m.w}x${m.h}`, `tela ${m.hz} Hz`, m.gpu, `${m.prog} shaders`, m.spikes ? `engasgos: ${m.spikes}` : ''].map(v => String(v).replace(/[\r\n]/g, ' ').slice(0, 240)).join(' | ');
        fs.appendFile(path.join(__dirname, 'desempenho.log'), line + '\n', () => {});
        break;
      }
      case 'p3': { // toques entre jogadores no 3D (puxar, pegar, jogar): vai só pra quem foi tocado
        const to = clients.get(m.to);
        if (to && this.joined) to.send({ ...m, from: this.id });
        break;
      }
      case 'pt': { // portal: fica guardado pra quem entrar depois
        if (!this.joined || (m.c !== 0 && m.c !== 1)) break;
        m.id = this.id;
        this.portals[m.c] = m;
        broadcast(m, this);
        break;
      }
      case 'who':
        this.send({ t: 'players', players: [...clients.values()].filter(c => c.joined && c !== this).map(c => c.info()) });
        break;
      case 'party': {
        const changed = [];
        if (typeof m.pvp === 'boolean') { party.pvp = m.pvp; changed.push('pvp'); }
        if (m.mode === 'course' || m.mode === 'drones') { party.mode = m.mode; changed.push('mode'); }
        if ('music' in m) { party.music = ytState(m.music, this.name); changed.push('music'); }
        if ('cinema' in m) { party.cinema = ytState(m.cinema, this.name); changed.push('cinema'); }
        if ('radio' in m) { party.radio = radioState(m.radio, this.name); changed.push('radio'); }
        if (m.god && typeof m.god === 'object') {
          const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
          party.god = { grav: num(m.god.grav, -1, 3, 1), sea: num(m.god.sea, 0, 220, 0), bend: num(m.god.bend, -100, 100, 0), pace: num(m.god.pace, 0, 4, 1), map: m.god.map === 'inf' ? 'inf' : 'ilha' };
          changed.push('god');
        }
        if (m.time && typeof m.time === 'object' && Number.isFinite(m.time.hour)) {
          party.time = { locked: !!m.time.locked, hour: ((m.time.hour % 24) + 24) % 24, at: Date.now() };
          changed.push('time');
        }
        if (changed.length) {
          broadcast({ t: 'party', party, now: Date.now(), by: this.name, changed });
          console.log(`  * ${this.name} mudou: ${changed.join(', ')}`);
        }
        break;
      }
    }
  }

  onClose() {
    if (!clients.has(this.id)) return;
    clients.delete(this.id);
    if (this.voice) broadcast({ t: 'vc', ...this.voiceInfo(), on: false });
    if (this.joined) {
      broadcast({ t: 'leave', id: this.id });
      console.log(`  - ${this.name} saiu`);
    }
    this.socket.destroy();
  }
}

// Quem ainda está no lobby também recebe, para já ver o amigo na casinha.
// Sem `except`, vai pra todo mundo (inclusive quem mandou).
function broadcast(obj, except) {
  const payload = Buffer.from(JSON.stringify(obj));
  for (const c of clients.values()) if (c !== except) c.frame(0x1, payload);
}

function upgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  new Client(socket);
}
plain.on('upgrade', upgrade);
secure.on('upgrade', upgrade);

// Derruba conexões mortas (amigo fechou o notebook, Radmin caiu, etc.).
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) { c.onClose(); continue; }
    c.alive = false;
    c.frame(0x9, Buffer.alloc(0));
  }
}, 15000);

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${PORT} já está em uso. Feche o outro servidor ou rode: node server.js 3001\n`);
  } else console.error(err);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  for (const ip of ips) dns.lookup(ip.host, { family: 4 }, (err, address) => { if (!err && address === ip.address) namesOk.add(ip.address); });
  const line = '  ' + '─'.repeat(54);
  console.log('\n' + line);
  console.log('   VOO LIVRE — servidor ligado');
  console.log(line);
  console.log(`   Você (host):     http://localhost:${PORT}`);
  for (const ip of ips) {
    const tag = ip.radmin ? '  <-- mande este pro seu amigo (Radmin)' : `  (${ip.name})`;
    console.log(`   Amigo:           https://${ip.host}:${PORT}${tag}`);
  }
  console.log(line);
  console.log('   Com https dá pra falar na call. O navegador avisa que a conexão "não é');
  console.log('   particular": é só clicar em Avançado > Continuar (uma vez só).');
  console.log(line);
  console.log('   Deixe esta janela aberta enquanto jogam. Ctrl+C para desligar.\n');
});
