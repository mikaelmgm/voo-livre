// Voo Livre — servidor do host.
// Sem dependências: basta ter Node.js instalado e rodar `node server.js [porta]`.
// Serve os arquivos do jogo e repassa o estado dos jogadores via WebSocket.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
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

// Configurações da party, iguais pra todo mundo: PVP, mapa, música do YouTube e o vídeo do telão do cinema (3D).
const party = { pvp: false, mode: 'course', music: null, cinema: null };
const ytState = (v, by) => {
  const id = v && v.id;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, at: Date.now(), by } : null;
};

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal) continue;
      out.push({ name, address: a.address, radmin: /radmin/i.test(name) || a.address.startsWith('26.') });
    }
  }
  return out.sort((a, b) => b.radmin - a.radmin);
}

// ---------------------------------------------------------------- HTTP

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ port: PORT, ips: lanAddresses(), players: [...clients.values()].filter(c => c.joined).length }));
    return;
  }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { rel = '/'; }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
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
    socket.setNoDelay(true);
    socket.on('data', d => this.onData(d));
    socket.on('close', () => this.onClose());
    socket.on('error', () => this.onClose());
    clients.set(this.id, this);
    this.send({
      t: 'welcome', id: this.id, seed: SEED, party, now: Date.now(),
      players: [...clients.values()].filter(c => c.joined && c !== this).map(c => c.info()),
    });
  }

  info() { return { id: this.id, name: this.name, color: this.color, skin: this.skin }; }

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
        const first = !this.joined;
        this.joined = true;
        broadcast({ t: 'join', ...this.info() }, this);
        if (first) console.log(`  + ${this.name} entrou (${[...clients.values()].filter(c => c.joined).length} jogando)`);
        break;
      }
      case 's':
      case 'ev':
      case 's3':   // versão 3D
        if (this.joined) broadcast({ ...m, id: this.id }, this);
        break;
      case 'who':
        this.send({ t: 'players', players: [...clients.values()].filter(c => c.joined && c !== this).map(c => c.info()) });
        break;
      case 'party': {
        const changed = [];
        if (typeof m.pvp === 'boolean') { party.pvp = m.pvp; changed.push('pvp'); }
        if (m.mode === 'course' || m.mode === 'drones') { party.mode = m.mode; changed.push('mode'); }
        if ('music' in m) { party.music = ytState(m.music, this.name); changed.push('music'); }
        if ('cinema' in m) { party.cinema = ytState(m.cinema, this.name); changed.push('cinema'); }
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

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  new Client(socket);
});

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
  const line = '  ' + '─'.repeat(54);
  console.log('\n' + line);
  console.log('   VOO LIVRE — servidor ligado');
  console.log(line);
  console.log(`   Você (host):     http://localhost:${PORT}`);
  for (const ip of ips) {
    const tag = ip.radmin ? '  <-- mande este pro seu amigo (Radmin)' : `  (${ip.name})`;
    console.log(`   Amigo:           http://${ip.address}:${PORT}${tag}`);
  }
  console.log(line);
  console.log('   Deixe esta janela aberta enquanto jogam. Ctrl+C para desligar.\n');
});
