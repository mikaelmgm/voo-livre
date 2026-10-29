# Voo Livre

Jogo de navegador pra jogar com os amigos: gancho, momentum e céu aberto. Você segura o clique perto de um ponto brilhante, balança, solta no momento certo e sai voando.

- **2D:** cabana no penhasco, queda livre pelas nuvens e cenários em sequência (praia e cidade em pixel art; canyon, neve e pôr do sol em vetor). Tem modo Céu de Drones, PVP com laser, skins de aranha com corda de teia e música do YouTube sincronizada pra party.
- **3D (teste):** a mesma mecânica numa cidade infinita, com boost no Shift preso na corda e um cinema gigante. Dentro do cinema dá pra sentar nas cadeiras e passar um vídeo do YouTube no telão pra todo mundo.

## Como rodar

Precisa só do [Node.js](https://nodejs.org). Não tem dependências pra instalar.

```bash
node server.js
```

No Windows, dá pra só clicar duas vezes em `JOGAR.bat`. O servidor mostra os endereços:

- você abre `http://localhost:3000`;
- seu amigo abre `http://SEU-IP:3000` (o IP do Radmin VPN começa com `26.`, ou use o IP da rede local).

Se o amigo não conseguir conectar, rode `LIBERAR-FIREWALL.bat` como administrador. Porta ocupada? Use `node server.js 3001`.

Controles e detalhes estão no [LEIA-ME.txt](LEIA-ME.txt).

## Como é feito

- `server.js`: servidor HTTP + WebSocket escrito à mão (sem bibliotecas). Ele repassa o estado dos jogadores e guarda as configurações da party.
- `public/js/`: versão 2D em Canvas, com física da corda, mundo procedural, renderização, rede e áudio procedural.
- `public/js3d/game3d.js`: versão 3D com [Three.js](https://threejs.org) (carregado pela internet). O telão do cinema é um player do YouTube em CSS 3D que aparece por um "buraco" transparente no canvas.
