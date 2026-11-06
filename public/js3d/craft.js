// A tela de fabricação do modo Minecraft: grade 3x3 na mesa de trabalho (2x2 no E), a seta, o resultado e a mochila embaixo.
// Clique esquerdo pega/solta a pilha inteira, direito pega metade ou solta um só, Shift manda direto pra mochila.
import { B } from './mine.js';

const MAX = 64;
const counts = s => !!s && typeof s.n === 'number';
const same = (a, b) => !!a && !!b && counts(a) && counts(b) && a.t === b.t && a.b === b.b && a.k === b.k && a.f === b.f;
const ing = s => (!s ? '' : s.t === 'block' ? 'b' + s.b : s.t === 'thing' ? s.k : s.t === 'food' ? 'f' + s.f : '?');

// sem forma: só importa o que está na grade. Com forma: o desenho, em qualquer canto da grade.
const RECIPES = [
  { need: ['perola', 'po'], out: () => ({ t: 'thing', k: 'olho', n: 1 }) },
  { need: ['vara'], out: () => ({ t: 'thing', k: 'po', n: 2 }) },
  { need: ['b' + B.LOG], out: () => ({ t: 'block', b: B.PLANK, n: 4 }) },
  { shape: [['b' + B.PLANK, 'b' + B.PLANK], ['b' + B.PLANK, 'b' + B.PLANK]], out: () => ({ t: 'block', b: B.TABLE, n: 1 }) },
];

const CSS = `
  #mc-gui { position: fixed; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.55); font-family: 'Press Start 2P', monospace; user-select: none; }
  body.mc-gui #mc-gui { display: flex; }
  body.mc-gui #start3 { display: none !important; }
  #mc-gui .panel { background: #c6c6c6; padding: 14px 14px 12px; border: 3px solid; border-color: #fff #555 #555 #fff; box-shadow: 0 0 0 3px #000; color: #3f3f3f; font-size: 10px; }
  #mc-gui .title { margin: 2px 0 8px; }
  #mc-gui .craft { display: flex; align-items: center; gap: 22px; margin: 0 0 14px 40px; }
  #mc-gui .grid { display: grid; gap: 0; }
  #mc-gui .arrow { width: 44px; height: 30px; position: relative; }
  #mc-gui .arrow::before { content: ''; position: absolute; left: 0; top: 11px; width: 28px; height: 8px; background: #8b8b8b; }
  #mc-gui .arrow::after { content: ''; position: absolute; left: 26px; top: 3px; border: 12px solid transparent; border-left: 16px solid #8b8b8b; border-right: 0; }
  #mc-gui .inv { display: grid; grid-template-columns: repeat(9, 40px); }
  #mc-gui .hot { display: grid; grid-template-columns: repeat(9, 40px); margin-top: 10px; }
  #mc-gui .mslot { width: 40px; height: 40px; background: #8b8b8b; border: 2px solid; border-color: #373737 #fff #fff #373737; cursor: pointer; border-radius: 0; box-shadow: none; }
  #mc-gui .mslot:hover { background: #a8a8a8; }
  #mc-gui .mslot.big { width: 56px; height: 56px; }
  #mc-gui .mslot canvas { width: 32px; height: 32px; }
  #mc-gui .tip { margin-top: 10px; font-size: 7px; line-height: 1.6; color: #555; }
  #mc-hand { position: fixed; z-index: 41; pointer-events: none; width: 32px; height: 32px; margin: -16px 0 0 -16px; display: none; }
  #mc-hand canvas { width: 32px; height: 32px; image-rendering: pixelated; }
  #mc-hand span { position: absolute; right: -4px; bottom: -3px; font-family: 'Press Start 2P', monospace; font-size: 9px; color: #fff; text-shadow: 1px 1px 0 #000; }
  #mc-name { position: fixed; z-index: 42; pointer-events: none; display: none; padding: 4px 6px; background: rgba(16, 0, 16, 0.92); border: 2px solid #2a0a5e; color: #fff; font-family: 'Press Start 2P', monospace; font-size: 9px; }`;

export class CraftGui {
  constructor(mine, o = {}) {
    this.mine = mine;
    this.o = o;
    this.open = false;
    this.size = 3;
    this.grid = [];
    this.hand = null;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.id = 'mc-gui';
    this.el.innerHTML = `<div class="panel"><div class="title t1"></div><div class="craft"><div class="grid"></div><div class="arrow"></div><div class="out"></div></div>
      <div class="title">Inventário</div><div class="inv"></div><div class="hot"></div>
      <div class="tip">esquerdo pega/solta · direito pega metade ou solta 1 · shift+clique manda direto · E ou Esc fecha</div></div>`;
    this.handEl = document.createElement('div');
    this.handEl.id = 'mc-hand';
    this.nameEl = document.createElement('div');
    this.nameEl.id = 'mc-name';
    document.body.append(this.el, this.handEl, this.nameEl);
    this.el.addEventListener('contextmenu', e => e.preventDefault());
    this.el.addEventListener('mousedown', e => {
      const s = e.target.closest('.mslot');
      if (s) { e.preventDefault(); this.click(s.dataset.k, Number(s.dataset.i), e.button, e.shiftKey); return; }
      if (!e.target.closest('.panel')) this.hide();        // clique fora fecha, igual no jogo
    });
    addEventListener('mousemove', e => {
      if (!this.open) return;
      this.handEl.style.left = this.nameEl.style.left = e.clientX + 'px';
      this.handEl.style.top = e.clientY + 'px';
      this.nameEl.style.top = e.clientY - 34 + 'px';
      const s = e.target.closest?.('.mslot'), st = s && !this.hand ? this.at(s.dataset.k, Number(s.dataset.i)) : null;
      this.nameEl.style.display = st ? 'block' : 'none';
      if (st) { this.nameEl.textContent = s.title; this.nameEl.style.left = e.clientX + 14 + 'px'; }
    });
  }

  show(size) {
    if (this.open) return;
    this.open = true;
    this.size = size;
    this.grid = Array(size * size).fill(null);
    this.hand = null;
    this.el.querySelector('.t1').textContent = size === 3 ? 'Mesa de trabalho' : 'Fabricação';
    this.el.querySelector('.craft').style.marginLeft = size === 3 ? '40px' : '120px';
    document.body.classList.add('mc-gui');
    this.draw();
  }
  hide(how) {
    if (!this.open) return;
    // o que ficou na grade e na mão volta pra mochila
    for (const s of this.grid) this.stow(s);
    this.stow(this.hand);
    this.grid = [];
    this.hand = null;
    this.open = false;
    document.body.classList.remove('mc-gui');
    this.handEl.style.display = this.nameEl.style.display = 'none';
    this.mine.drawHud();
    this.o.onClose?.(how);
  }

  at(k, i) { return k === 'inv' ? this.mine.stacks[i] : k === 'grid' ? this.grid[i] : k === 'out' ? this.result() : null; }
  put(k, i, s) { if (k === 'inv') this.mine.stacks[i] = s; else if (k === 'grid') this.grid[i] = s; }

  // guarda na mochila: junta com o que já tem e depois ocupa casa vazia (primeiro a barra, depois o resto)
  stow(s, from = 0, to = 36) {
    if (!s) return true;
    const st = this.mine.stacks;
    if (counts(s)) for (let i = from; i < to && s.n > 0; i++) {
      if (!same(st[i], s) || st[i].n >= MAX) continue;
      const m = Math.min(MAX - st[i].n, s.n);
      st[i].n += m;
      s.n -= m;
    }
    if (counts(s) && s.n <= 0) return true;
    for (let i = from; i < to; i++) if (!st[i]) { st[i] = s; return true; }
    return false;
  }

  result() {
    const n = this.size, cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this.grid[r * n + c]) cells.push({ r, c, k: ing(this.grid[r * n + c]) });
    if (!cells.length) return null;
    for (const rec of RECIPES) {
      if (rec.need) {
        if (cells.length !== rec.need.length) continue;
        const a = cells.map(x => x.k).sort().join(), b = [...rec.need].sort().join();
        if (a === b) return rec.out();
        continue;
      }
      const h = rec.shape.length, w = rec.shape[0].length;
      if (h > n || w > n) continue;
      const r0 = Math.min(...cells.map(x => x.r)), c0 = Math.min(...cells.map(x => x.c));
      let ok = cells.every(x => x.r - r0 < h && x.c - c0 < w && rec.shape[x.r - r0][x.c - c0] === x.k);
      if (ok) for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (rec.shape[r][c] && !this.grid[(r0 + r) * n + c0 + c]) ok = false;
      if (ok && r0 + h <= n && c0 + w <= n) return rec.out();
    }
    return null;
  }
  use() { this.grid = this.grid.map(s => (s && counts(s) && --s.n > 0 ? s : null)); }

  click(k, i, button, shift) {
    const snd = this.o.sound;
    if (k === 'out') {
      let r = this.result();
      if (!r) return;
      if (shift) {
        // fabrica tudo o que der, direto pra mochila
        for (let guard = 0; r && guard < 64; guard++, r = this.result()) { if (!this.stow({ ...r })) break; this.use(); }
      } else {
        if (this.hand && !(same(this.hand, r) && this.hand.n + r.n <= MAX)) return;
        this.use();
        if (this.hand) this.hand.n += r.n; else this.hand = r;
      }
      snd?.place?.();
      if (r?.t === 'thing' && r.k === 'olho') this.o.onEye?.();
      this.draw();
      return;
    }
    const s = this.at(k, i);
    if (shift && s) {
      // shift: da grade vai pra mochila; da barra vai pro resto da mochila e vice-versa
      this.put(k, i, null);
      const ok = k === 'grid' ? this.stow(s) : i < 9 ? this.stow(s, 9, 36) : this.stow(s, 0, 9);
      if (!ok) this.put(k, i, s);
    } else if (button === 2) {
      if (!this.hand) {
        if (!s) return;
        if (counts(s) && s.n > 1) { const m = Math.ceil(s.n / 2); this.hand = { ...s, n: m }; s.n -= m; } else { this.hand = s; this.put(k, i, null); }
      } else if (!counts(this.hand)) {
        this.put(k, i, this.hand); this.hand = s;
      } else if (!s) {
        this.put(k, i, { ...this.hand, n: 1 }); if (--this.hand.n <= 0) this.hand = null;
      } else if (same(s, this.hand) && s.n < MAX) {
        s.n++; if (--this.hand.n <= 0) this.hand = null;
      }
    } else if (!this.hand) {
      if (!s) return;
      this.hand = s; this.put(k, i, null);
    } else if (!s) {
      this.put(k, i, this.hand); this.hand = null;
    } else if (same(s, this.hand)) {
      const m = Math.min(MAX - s.n, this.hand.n);
      s.n += m; this.hand.n -= m;
      if (this.hand.n <= 0) this.hand = null;
    } else {
      this.put(k, i, this.hand); this.hand = s;
    }
    this.draw();
  }

  slot(s, k, i, big) {
    const d = this.mine.slotEl(s, i, false);
    d.dataset.k = k;
    if (big) d.classList.add('big');
    return d;
  }
  draw() {
    const g = this.el.querySelector('.grid'), out = this.el.querySelector('.out'), inv = this.el.querySelector('.inv'), hot = this.el.querySelector('.hot');
    g.style.gridTemplateColumns = `repeat(${this.size}, 40px)`;
    g.textContent = out.textContent = inv.textContent = hot.textContent = '';
    this.grid.forEach((s, i) => g.appendChild(this.slot(s, 'grid', i)));
    out.appendChild(this.slot(this.result(), 'out', 0, true));
    for (let i = 9; i < 36; i++) inv.appendChild(this.slot(this.mine.stacks[i], 'inv', i));
    for (let i = 0; i < 9; i++) hot.appendChild(this.slot(this.mine.stacks[i], 'inv', i));
    this.handEl.textContent = '';
    this.handEl.style.display = this.hand ? 'block' : 'none';
    if (this.hand) {
      this.handEl.appendChild(this.mine.iconOf(this.hand));
      if (this.hand.n > 1) { const n = document.createElement('span'); n.textContent = this.hand.n; this.handEl.appendChild(n); }
    }
    this.mine.drawHud();
  }
}
