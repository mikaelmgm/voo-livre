// Guarda o jogo como está em versoes/anterior: é pra lá que o botão "Última atualização" do menu volta.
// Rode ANTES de começar uma atualização nova: node versoes/guardar.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(__dirname, 'anterior');
const FILES = ['public', 'server.js', 'cert.js', 'README.md', 'LEIA-ME.txt'];

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const f of FILES) fs.cpSync(path.join(ROOT, f), path.join(DEST, f), { recursive: true });
fs.writeFileSync(path.join(DEST, 'quando.txt'), new Date().toISOString() + '\n');
console.log('Versão guardada em', DEST);
