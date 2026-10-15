# Áudio do PFL

Todo o áudio é **sintetizado em código** com Web Audio. Não há arquivos de áudio, nem de terceiros, no repositório.

## Créditos e licença

Os efeitos (`apps/client/src/audio/recipes.ts`) e as músicas (`apps/client/src/audio/scores/`) são obras originais deste projeto. Valem sob a licença que o repositório adotar. O repositório ainda não tem arquivo `LICENSE`; definir a licença é uma decisão do responsável e independe do áudio.

## Como funciona

- `cues.ts` traduz os passos da animação da jogada em nomes de som (`tackle`, `td`, `clash-super`...).
- `recipes.ts` descreve cada som como uma lista de vozes (onda quadrada, triangular ou ruído). Para ajustar um efeito, edite frequências, durações e volumes.
- `scores/*.ts` guardam as duas faixas (menu e partida) e os jingles de vitória e derrota. Cada compasso tem 16 posições (semicolcheias): nota (`C4`, `F#3`, `Bb2`), `.` pausa, `-` sustenta; no canal `noise`, `k` bumbo, `s` caixa e `h` chimbal. Um compasso com número errado de posições faz o parser apontar o canal e o compasso.
- `engine.ts` junta tudo e só inicia o áudio depois do primeiro gesto do usuário (política dos navegadores).
- Volume de música, volume de efeitos e mudo ficam em `localStorage` (`pfl.audio.v1`).

## Como testar

- `npm test` cobre cues, receitas, partituras, mixer, sequenciador, motor e controle.
- Se os sons e melodias soam bem só se descobre ouvindo: `npm run dev:client`, abrir o jogo, clicar em qualquer lugar e usar o botão de som no canto inferior direito.
