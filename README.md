# Voo Livre

Jogo de navegador pra jogar com os amigos: gancho, momentum e céu aberto. Você segura o clique perto de um ponto brilhante, balança, solta no momento certo e sai voando.

- **2D:** cabana no penhasco, queda livre pelas nuvens e cenários em sequência (praia e cidade em pixel art; canyon, neve e pôr do sol em vetor). Tem modo Céu de Drones, PVP com laser, skins de aranha com corda de teia e música do YouTube sincronizada pra party.
- **3D (teste):** a mesma mecânica numa cidade infinita, com lojinhas, pedestres, trânsito e dia, tarde e noite. No meio tem um cinema gigante com telão do YouTube; na laje dele tem piscina, churrasqueira, rádio (YouTube e Spotify), sinuca, ping pong e quadro branco. No prédio do lado, ligado por uma passarela, tem uma quadra de basquete. O personagem é um carinha de gelatina que estica, treme e corre feito desenho animado: dá pra escolher a skin e o quanto ele é mole. Tem duas teias (uma em cada botão), CTRL pra puxar em vez de ser puxado, estilingue humano, pulo na parede e amigo pra pegar e arremessar. E tem segredos: olhe fixo pra lua, e procure a porta no fundo do cinema.
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

## Como é feito

- `server.js`: servidor HTTP/HTTPS + WebSocket escrito à mão (sem bibliotecas), os dois na mesma porta. Ele repassa o estado dos jogadores e guarda as configurações da party, o quadro branco e os jogos da laje.
- `cert.js`: gera o certificado do `https` sem dependências e guarda em `.cert/`.
- `public/js/voice.js`: voz por WebRTC, direto entre os jogadores; o servidor só faz a sinalização.
- `public/js/`: versão 2D em Canvas, com física da corda, mundo procedural, renderização, rede e áudio procedural.
- `public/js3d/game3d.js`: versão 3D com [Three.js](https://threejs.org) (carregado pela internet). O telão do cinema é um player do YouTube em CSS 3D que aparece por um "buraco" transparente no canvas.
- `public/js3d/`: `daycycle.js` (céu, sol, lua e luz), `street.js` (lotes, lojinhas, pedestres e trânsito), `skyline.js` (horizonte simulado: milhares de prédios numa chamada de desenho), `textures.js` (fachadas e chão em canvas), `roof.js` (laje e quadra), `games.js` (sinuca, ping pong, basquete), `board.js` (quadro branco), `slime.js` (o boneco de gelatina: forma em SDF, esqueleto elástico, molas por vértice e a casca que refrata a cena), `space.js` (Terra, Lua e a viagem) e `backrooms.js` (o labirinto amarelo).
