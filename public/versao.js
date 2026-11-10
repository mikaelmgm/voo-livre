// Painel "Última atualização": volta o jogo pra versão guardada em versoes/anterior.
// Fica fora do jogo de propósito: mesmo com o jogo quebrado, este arquivo roda e o botão aparece no menu.
(() => {
  const NOVIDADES = [
    '✨ Visual novo: luz de cinema. Vidro que reflete o céu, janelas e postes que brilham de noite, sombra nos cantos e raios de sol entre os prédios',
    '🌅 Céu refeito: sol e lua de verdade, nuvens com luz e sombra, via láctea, e o mar com ondas, espuma e o caminho de luz do sol',
    '🧑‍🚀 Seis personagens novos na aba Boneco: Astronauta, Robô, Neon, Magma, Ouro e Esqueleto',
    '🟢 O boneco agora fica na sombra dos prédios, reflete o céu e brilha de verdade',
    '🌀 Portais com anel de energia e luz na parede em volta. Lua com relevo e um terço a menos de asteroides',
    '🧱 Não dá mais pra atravessar parede voando rápido, nem as coisas em cima dos prédios',
    '🦖 Gigante, o chão não some mais na neblina',
    '🎥 A câmera não dá mais aquele pulo pra cima do nada',
  ];
  const css = `
    .ver-box { display: flex; flex-direction: column; gap: 8px; }
    .ver-box ul { margin: 0; padding-left: 4px; list-style: none; font-size: 13.5px; line-height: 1.5; }
    .ver-box p { margin: 0; font-size: 13px; opacity: 0.8; }
    .ver-box button { font: inherit; font-weight: 700; font-size: 14px; padding: 10px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.3); color: #fff; background: rgba(255, 255, 255, 0.1); cursor: pointer; }
    .ver-box button.sure { background: #c0392b; border-color: #ff8a7a; }
    .ver-top { padding: 10px 12px; border-radius: 12px; border: 1px solid #ffcf3f; background: rgba(255, 207, 63, 0.14); }
    .ver-top p { opacity: 1; font-weight: 700; }
    .ver-top button { background: linear-gradient(180deg, #ffe08a, #ff9f5a); color: #2a1020; border-color: transparent; }`;

  const send = v => fetch('/api/versao', { method: 'POST', body: JSON.stringify({ v }) }).then(r => r.json());
  const day = iso => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };

  // o botão pede confirmação porque troca o jogo de todo mundo que está na partida
  function button(text, sure, v) {
    const b = document.createElement('button');
    b.textContent = text;
    let armed = false;
    b.onclick = () => {
      if (!armed) { armed = true; b.textContent = sure; b.classList.add('sure'); return; }
      b.disabled = true;
      send(v).then(() => location.reload());
    };
    return b;
  }

  function fill(box, st) {
    box.textContent = '';
    if (st.ativa === 'anterior') {
      const p = document.createElement('p');
      p.textContent = 'Você está na versão anterior. A atualização nova continua guardada.';
      box.append(p, button('Ir pra atualização nova', 'Clique de novo: troca pra todo mundo', 'nova'));
      return;
    }
    const ul = document.createElement('ul');
    for (const n of NOVIDADES) { const li = document.createElement('li'); li.textContent = n; ul.appendChild(li); }
    box.appendChild(ul);
    if (!st.temAnterior) { const p = document.createElement('p'); p.textContent = 'Nenhuma versão anterior guardada.'; box.appendChild(p); return; }
    const p = document.createElement('p');
    p.textContent = `Não gostou ou quebrou? Dá pra voltar pra versão de ${day(st.anteriorDe)}. Nada se perde, e dá pra voltar pra esta depois.`;
    box.append(p, button('Voltar pra versão anterior', 'Clique de novo: troca pra todo mundo', 'anterior'));
  }

  // Na versão anterior, o caminho de volta fica à vista no topo do menu. Antes ele só existia dentro da aba, e ninguém achava.
  function banner(st) {
    if (st.ativa !== 'anterior' || document.querySelector('.ver-top')) return;
    const panel = document.querySelector('#start3 .panel') || document.querySelector('#lobby .panel');
    if (!panel) return;
    const top = document.createElement('div');
    top.className = 'ver-box ver-top';
    const p = document.createElement('p');
    p.textContent = '⏪ Você está jogando a versão anterior.';
    top.append(p, button('✨ Voltar pra atualização nova', 'Clique de novo: troca pra todo mundo', 'nova'));
    const anchor = panel.querySelector('#go3') || panel.querySelector('.tag');
    if (anchor) anchor.after(top); else panel.prepend(top);
  }

  function mount() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const box = document.createElement('div');
    box.className = 'ver-box';
    const slot = document.querySelector('#ver-slot');
    if (slot) slot.appendChild(box);
    else {
      // versão guardada ou tela sem aba própria: entra no fim do menu que estiver na página
      const wrap = document.createElement('div');
      wrap.className = 'box';
      wrap.innerHTML = '<div class="box-h">🔄 Última atualização</div>';
      wrap.appendChild(box);
      (document.querySelector('#start3 .panel') || document.querySelector('#lobby .panel') || document.body).appendChild(wrap);
    }
    let seen = null;
    const check = () => fetch('/api/versao').then(r => r.json()).then(st => {
      if (seen === null) { seen = st.ativa; fill(box, st); banner(st); }
      else if (st.ativa !== seen) location.reload();      // alguém trocou a versão: todo mundo acompanha
    }).catch(() => { /* servidor fora do ar: o jogo já avisa */ });
    check();
    setInterval(check, 4000);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount);
  else mount();
})();
