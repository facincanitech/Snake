# ClickOn — Snake Escape

Jogo de puzzle no estilo "Snake Escape": cobras deslizam por trilhos e precisam escapar pela borda da grade. O jogador clica numa cobra e ela desliza sozinha até sair ou bater em outra.

## Stack

- **Frontend (produção/GitHub Pages):** `index.html` — tudo num único arquivo HTML+JS+CSS, sem dependências
- **Backend (local/dev):** Flask (`app.py`) + gerador Python (`generator.py`) + templates/static separados
- O GitHub Pages serve apenas `index.html` e `assets/`; o backend é ignorado em produção

## Arquitetura do jogo (`index.html`)

### Mecânica principal
- Clique numa cobra → ela desliza célula por célula até sair da grade ou ser bloqueada por outra
- Se bloqueada: para e pisca em vermelho
- Enquanto uma cobra está em movimento, nenhum outro input é aceito (`G.sliding`)
- Objetivo: fazer todas as cobras escaparem antes do tempo acabar (2 minutos) 

### Gerador de níveis (JS, client-side)
- `buildSnake()`: cria uma cobra com um trilho (rail) que vai do interior da grade até a borda
- `randomWalk()`: caminhada aleatória a partir da saída, evitando células já ocupadas
- `solvable()`: BFS para verificar se o nível tem solução; para >8 cobras assume solucionável (BFS inviável)
- `generateLevel()`: 60 tentativas; fallback para `generateSimple()` se falhar
- Rail estendido com células virtuais fora da grade para a cobra "sair" completamente

### Sistema de fases
```
Fases 1-15:  grade quadrada, 2 → 20 cobras
Fases 16-30: grade hexagonal (6 direções), 14 → 50 cobras
Fases 31+:   hex dinâmico, até 120 cobras
```

Configuração em `PHASE_CFG[]` — cada entrada tem `{rows, cols, n, bl:[min,max], fl:[min,max], type}`:
- `bl`: range do comprimento do corpo da cobra (células)
- `fl`: range do caminho futuro (células entre a cabeça e a saída)
- `type`: `'square'` ou `'hex'`

### Tipos de grade
- `square`: 4 vizinhos, grade retangular simples
- `hex`: 6 vizinhos (inclui diagonais), offset em linhas pares/ímpares

### Renderização (canvas 2D puro, sem sprites)
- Fundo: `#12111e`
- Rail: linha fina na cor da cobra com 13% de opacidade
- Corpo: stroke arredondado com outline preto para profundidade
- Cabeça: círculo maior com 2 olhos orientados na direção de movimento
- Flash de bloqueio: cor vira `#ff4444` por alguns frames

### Tamanho de célula
- Base: 68px, escala para caber na tela
- Mínimo: 16px (`MIN_CS`) — garante legibilidade mesmo com grades grandes

### Animação
- `FRAMES = 12` frames por passo (~200ms a 60fps)
- Easing: `1 - (1-t)^3` (ease-out cubico)

## Estrutura de arquivos

```
index.html          <- jogo completo (GitHub Pages)
app.py              <- servidor Flask (dev)
generator.py        <- gerador de níveis Python (dev)
templates/
  index.html        <- versão Flask com módulos ES6 separados
static/
  css/style.css
  js/game.js        <- lógica do jogo (versão modular)
  js/grid.js        <- implementações de grade (square/hex/tri)
assets/             <- (sprites removidos, não usados mais)
```

## Decisões de design

- **Sprites removidos**: o projeto usava PNGs de cobras (Verde/azul/laranja), substituídos por canvas puro para simplicidade
- **Gerador client-side**: toda a lógica de geração está no browser, sem chamada de API em produção
- **BFS limitado**: para fases com muitas cobras (>8), o solver é desativado e o gerador assume solucionabilidade estrutural
- **Auto-slide**: uma cobra desliza completamente com um clique (não passo a passo)
- **Sem dependências**: zero bibliotecas externas, zero build step

## Bugs corrigidos

- `S.animating` era declarado mas nunca usado; substituído por `G.sliding` (boolean)
- `start_state` e `body_cells_set` em `generator.py` eram variáveis mortas
- `loadLevel()` sem try/catch causava falha silenciosa na API Flask
- `.shake` CSS nunca era aplicado (flash feito via canvas, não DOM)
- `grid-lbl` referenciado em JS mas sem elemento correspondente no HTML
- Renderer de sprites no `index.html` tentava carregar PNGs deletados; trocado por canvas puro
