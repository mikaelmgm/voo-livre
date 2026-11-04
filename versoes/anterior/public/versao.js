// Painel "Última atualização": volta o jogo pra versão guardada em versoes/anterior.
// Fica fora do jogo de propósito: mesmo com o jogo quebrado, este arquivo roda e o botão aparece no menu.
(() => {
  const NOVIDADES = [
    '🤲 Uma teia só: as duas mãos seguram, até você usar a outra teia',
    '🤸 Rolamentos diferentes conforme o movimento, e a primeira pessoa gira junto',
    '💨 Efeitos de velocidade: sutis no começo, exagerados em 460 km/h, e seguindo a direção do movimento',
    '🌬️ Velocidade mais difícil: o ar segura cada vez mais acima de 150 km/h',
    '🏁 Aba Mundo: velocidade máxima, ganho e desaceleração, com botões "Como era antes" e "Novo ajuste"',
    '🎥 Primeira pessoa: tecla G ou aba Ajustes',
    '🌀 Giros e câmera suaves: o boneco não vira de uma vez',
    '✨ Terra e parque sem cintilar, estilos protegidos contra pixels estourados',
    '🧹 Saíram chuva de vacas, meteoro e buraco negro',
    '⏳ Tela de carregamento: cidade, shaders, texturas e mundos ficam prontos antes de entrar',
    '🚀 Sem as travadas no meio do jogo: acabou o engasgo ao se afastar da laje e ao trocar de mundo',
    '🌀 Trocar de arte e abrir portal não engasgam mais na primeira vez: tudo é ensaiado antes de entrar',
    '⛏️ Modo Minecraft: a cidade vira blocos de verdade, com picareta, vida, fome, mochila e zumbis',
    '🎨 Estilos novos: Simpsons, Bob Esponja e Vaporwave (saíram LEGO, Lápis, Vitral, Maquete e Térmica)',
    '🎡 Parque de diversões: roda-gigante, montanha-russa e carrossel, dá pra andar em todos',
    '🏖️ Praia com mar pra nadar, e lojas onde dá pra entrar',
    '🏙️ Prédios redondos, torres gêmeas, casas, igrejas, postos, carros novos e gente mais variada',
    '🔧 Geleia sem tremer, boneco pequeno sem deslizar, rebobinar sem limite, e sons novos',
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
