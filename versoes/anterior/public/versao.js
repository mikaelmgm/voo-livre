// Painel "Última atualização": volta o jogo pra versão guardada em versoes/anterior.
// Fica fora do jogo de propósito: mesmo com o jogo quebrado, este arquivo roda e o botão aparece no menu.
(() => {
  const NOVIDADES = [
    '🕸️ A teia agora é um pêndulo: lá do alto ela fica do tamanho que saiu e não te puxa mais de repente pro prédio',
    '⌨️ Aba Jogar nova, com o desenho de cada tecla e o que ela faz do lado',
    '🎨 Saíram os estilos Geleia, Gibi, Simpsons e Bob Esponja',
  ];
  const css = `
    .ver-box { display: flex; flex-direction: column; gap: 8px; }
    .ver-box ul { margin: 0; padding-left: 4px; list-style: none; font-size: 13.5px; line-height: 1.5; }
    .ver-box p { margin: 0; font-size: 13px; opacity: 0.8; }
    .ver-box button { font: inherit; font-weight: 700; font-size: 14px; padding: 10px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.3); color: #fff; background: rgba(255, 255, 255, 0.1); cursor: pointer; }
    .ver-box button.sure { background: #c0392b; border-color: #ff8a7a; }`;

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
      if (seen === null) { seen = st.ativa; fill(box, st); }
      else if (st.ativa !== seen) location.reload();      // alguém trocou a versão: todo mundo acompanha
    }).catch(() => { /* servidor fora do ar: o jogo já avisa */ });
    check();
    setInterval(check, 4000);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount);
  else mount();
})();
