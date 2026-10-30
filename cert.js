// Certificado autoassinado, sem dependências. O navegador só libera o microfone em HTTPS (ou localhost),
// então quem entra por http://26.x não conseguiria falar na call. Gera uma chave EC e monta o X.509 à mão.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---- DER (só o necessário)
function der(tag, ...parts) {
  const body = Buffer.concat(parts);
  const n = body.length;
  const len = n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255];
  return Buffer.concat([Buffer.from([tag, ...len]), body]);
}
const seq = (...p) => der(0x30, ...p);
const set = (...p) => der(0x31, ...p);
const utf8 = s => der(0x0c, Buffer.from(s));
function oid(text) {
  const [a, b, ...rest] = text.split('.').map(Number);
  const out = [a * 40 + b];
  for (let v of rest) {
    const bytes = [v & 127];
    while (v >= 128) { v = Math.floor(v / 128); bytes.unshift((v & 127) | 128); }
    out.push(...bytes);
  }
  return der(0x06, Buffer.from(out));
}
function utcTime(d) {
  const s = d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
  return der(0x17, Buffer.from(s));
}
const pem = (label, data) => `-----BEGIN ${label}-----\n${data.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;

function generate(ips) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const sigAlg = seq(oid('1.2.840.10045.4.3.2'));   // ecdsa-with-SHA256
  const name = seq(set(seq(oid('2.5.4.3'), utf8('Voo Livre'))));
  const now = Date.now();
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f;
  serial[0] |= 0x40;
  const san = seq(
    der(0x82, Buffer.from('localhost')),
    der(0x87, Buffer.from([127, 0, 0, 1])),
    ...ips.map(ip => der(0x87, Buffer.from(ip.split('.').map(Number)))),
  );
  const tbs = seq(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    sigAlg,
    name,
    seq(utcTime(new Date(now - 864e5)), utcTime(new Date(now + 5 * 365 * 864e5))),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, seq(seq(oid('2.5.29.17'), der(0x04, san)))),
  );
  const sig = crypto.sign('sha256', tbs, privateKey);
  const cert = seq(tbs, sigAlg, der(0x03, Buffer.from([0]), sig));
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: pem('CERTIFICATE', cert), ips };
}

// Fica salvo em .cert/ pra exceção que o amigo aceitou no navegador continuar valendo; só refaz se o IP mudar.
function loadCert(dir, ips) {
  const file = path.join(dir, '.cert', 'voo-livre.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    new crypto.X509Certificate(saved.cert);
    if (ips.every(ip => saved.ips.includes(ip))) return saved;
  } catch { /* ainda não existe */ }
  const fresh = generate(ips);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(fresh));
  } catch { /* sem permissão: vale só nesta sessão */ }
  return fresh;
}

module.exports = { loadCert };
