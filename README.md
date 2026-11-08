# Voo Livre

Jogo de navegador pra jogar com os amigos: gancho, momentum e céu aberto. Você segura o clique perto de um ponto brilhante, balança, solta no momento certo e sai voando.

- **2D:** cabana no penhasco, queda livre pelas nuvens e cenários em sequência (praia e cidade em pixel art; canyon, neve e pôr do sol em vetor). Tem modo Céu de Drones, PVP com laser, skins de aranha com corda de teia e música do YouTube sincronizada pra party.
- **3D (teste):** a mesma mecânica numa cidade numa ilha (grande, mas com fim: uns 2,5 km de lado, praia com calçadão e coqueiros na volta toda e mar depois; a cidade infinita de antes virou opção no menu). Aqui e ali a cidade abre uma praça e no meio sobe do nada uma torre de 300 a 500 m, ou duas torres gêmeas. Do lado leste, uma ponte pênsil com pilares de 160 m atravessa o mar até a ilhota do farol, com lojinhas, pedestres, trânsito e dia, tarde e noite. No meio tem um cinema gigante com telão do YouTube; na laje dele tem piscina, churrasqueira, rádio (YouTube e Spotify), sinuca, ping pong e quadro branco. No prédio do lado, ligado por uma passarela, tem uma quadra de basquete. O personagem é um carinha de gelatina que estica, treme e corre feito desenho animado: dá pra escolher a skin e o quanto ele é mole. Tem duas teias (uma em cada botão), CTRL no ar mirando num telhado ou no chão pra pousar ali, embalado, CTRL no chão pra fincar o pé e puxar andando pra trás, as duas mãos na mesma corda quando só tem uma teia, estilingue humano, pulo na parede e amigo pra pegar e arremessar. As teclas 1 e 2 são a barra de itens: a arma de portais (entre voando num e saia no outro, veja o outro lado pelo buraco e jogue a teia através dele). E tem segredos: olhe fixo pra lua, e procure a porta no fundo do cinema.
- **Brincar de Deus (3D):** onze estilos de arte (pixel art, Minecraft, geleia, gibi, Simpsons, Bob Esponja, neon, vaporwave, ASCII, noir e sonho). Os portais pegam em qualquer chão (até na areia) e o par pode ficar em mundos diferentes, um na Lua e outro na Terra. T leva até um amigo em qualquer mundo. No modo Minecraft a cidade vira blocos de verdade, com picareta, vida (só se morre no fim), fome, inventário, mesa de trabalho (grade 3x3 no botão direito) e zumbis; no inferno e na Lua também (a Lua vira blocos em volta da moldura). A cidade tem lojas com interior, parque de diversões com brinquedos e praia. Poderes: Comilão (coma gente, carro e prédio e fique gigante), voo, fantasma, pouso bomba, tamanho, câmera lenta, rebobinar, clones do passado e parar o mundo. Painel de Deus: gravidade, nível do mar, mundo enrolado e ritmo da cidade. E o espaço é de verdade: solte a teia, pendure nos asteroides e caia na Lua ou na Terra. Na Lua tem uma moldura antiga: no Minecraft, com a obsidiana e o isqueiro da mochila, dá pra abrir um portal pro inferno, pegar o que está no baú do outro lado da lava, fazer pó com as varas e olhos com pó e pérola na mesa de trabalho e abrir a moldura, que leva pro fim e pra única luta com chefe do jogo: um dragão de blocos (o modelo é nosso), derrubado com 5 flechas, e depois os créditos.
- **Voz:** call dentro do jogo, no 2D e no 3D, escolhendo microfone e saída de áudio.

## Como rodar

Precisa só do [Node.js](https://nodejs.org). Não tem dependências pra instalar.

```bash
node server.js
```

No Windows, dá pra só clicar duas vezes em `JOGAR.bat`. O servidor mostra os endereços:

- você abre `http://localhost:3000`;
- seu amigo abre o link que aparece na tela inicial, no formato `https://26-61-51-51.sslip.io:3000` (o IP do Radmin VPN começa com `26.`).

O link usa o nome no lugar do IP porque o YouTube bloqueia a maioria dos vídeos em páginas abertas por IP puro. O [sslip.io](https://sslip.io) só traduz esse nome para o próprio IP. Quem abrir o endereço antigo por IP é redirecionado sozinho.

O `https` é o que libera o microfone: o navegador não deixa falar por `http`, a não ser em `localhost`. Como o certificado é gerado pelo próprio jogo, aparece um aviso de conexão: é só clicar em **Avançado > Continuar**, uma vez. Quem entrar por `http` joga e ouve a call, mas não fala.

Se o amigo não conseguir conectar, rode `LIBERAR-FIREWALL.bat` como administrador. Porta ocupada? Use `node server.js 3001`.

Controles e detalhes estão no [LEIA-ME.txt](LEIA-ME.txt).

## Carregamento e desempenho

O 3D abre com uma tela de carregamento: a cidade em volta, as texturas, os shaders de todos os mundos e estilos e alguns quadros de jogo ficam prontos antes de entrar. Mudar a quantidade de luzes recompila todos os materiais, então cada combinação de sombra e lâmpadas é compilada e desenhada ali. No fim, um ensaio: cada estilo desenha um quadro de verdade com um par de portais, e o Minecraft liga por uns quadros. Assim a primeira troca de arte e o primeiro portal não pegam nada por fazer. Na primeira vez demora mais; depois o navegador guarda os shaders.

Pra PC fraco tem o **modo leve**: o link "Versão 3D leve" na tela inicial (ou `3d.html?leve=1`, e `?leve=0` desliga), ou o botão em Ajustes. A imagem sai em 40% da resolução, sem antialias, sombra, nuvens, luzes da laje, estilos de arte, portais com vista e rastro de velocidade, com pouca gente e carro, e o carregamento pula a Lua, o Minecraft e os estilos.

A aba Mundo tem os ajustes de velocidade de cada jogador (máxima, ganho e desaceleração), com o ajuste anterior e o novo a um clique. Primeira pessoa fica na tecla G ou em Ajustes.

Cada jogador manda os números reais a cada 15 s (FPS, pior quadro, qualidade, placa de vídeo, total de shaders e os quadros acima de 50 ms, com o que tinha acabado de acontecer), e o servidor anota tudo em `desempenho.log`.

## Última atualização

A aba **Última atualização** do menu do 3D (e o fim do menu do 2D) troca o jogo inteiro pela versão guardada em `versoes/anterior`, pra todo mundo, e dá pra voltar pra nova do mesmo jeito. Antes de começar uma atualização nova, guarde a versão atual:

```bash
node versoes/guardar.js
```

## Como é feito

- `server.js`: servidor HTTP/HTTPS + WebSocket escrito à mão (sem bibliotecas), os dois na mesma porta. Ele repassa o estado dos jogadores e guarda as configurações da party, o quadro branco e os jogos da laje.
- `cert.js`: gera o certificado do `https` sem dependências e guarda em `.cert/`.
- `public/js/voice.js`: voz por WebRTC, direto entre os jogadores; o servidor só faz a sinalização.
- `public/js/`: versão 2D em Canvas, com física da corda, mundo procedural, renderização, rede e áudio procedural.
- `public/js3d/game3d.js`: versão 3D com [Three.js](https://threejs.org) (carregado pela internet). O telão do cinema é um player do YouTube em CSS 3D que aparece por um "buraco" transparente no canvas.
- `public/js3d/`: `daycycle.js` (céu, sol, lua e luz), `street.js` (lotes, lojinhas, pedestres e trânsito), `skyline.js` (horizonte simulado: milhares de prédios numa chamada de desenho), `textures.js` (fachadas e chão em canvas), `roof.js` (laje e quadra), `games.js` (sinuca, ping pong, basquete), `board.js` (quadro branco), `slime.js` (o boneco de gelatina: forma em SDF, esqueleto elástico, molas por vértice e a casca que refrata a cena), `space.js` (Terra, Lua, asteroides e a gravidade dos astros), `backrooms.js` (o labirinto amarelo), `portals.js` (portais que mostram o outro lado), `art.js` (os estilos de arte: a cena vai pra uma textura com a profundidade e um shader por estilo refaz a imagem), `mine.js` (o modo Minecraft: blocos gerados a partir dos lotes da cidade), `places.js` (lojas, parque e praia) e `god.js` (o que voa pela cidade, buraco negro, meteoro e mar).
