# DESIGN.md — Guia do Professor · Claude: Edição de Vídeos (12 aulas)

Static site: plain HTML + CSS + vanilla JS, no build step. Works opened from disk (`file://`) and from any static server. All links are relative.

```
site/
  index.html                 home (hero, números, intro, linha do tempo das 12 aulas, guia, CTA, rodapé)
  aulas/_template.html       template da página de aula (o builder gera aula-01.html … aula-12.html a partir dele)
  assets/css/tokens.css      custom properties (cores, tipo, espaço, raios, sombras, motion)
  assets/css/site.css        todos os componentes
  assets/js/site.js          canvas do hero, nav, abas, progresso, seletor de aulas, copiar, sumário, reveal
  content/aulas.json         (de outro agente — não editar aqui)
  content/alunos.json        conteúdo da versão do aluno (§9)
  aluno/index.html, aluno/aula-NN.html   versão do aluno (gerada)
  build/build.mjs            gera as duas versões · build/check-links.mjs confere todas as páginas
  _screens/                  screenshots de verificação
```

---

## 1. Direção

**Ilha de edição à noite.** A tela é quase preta, como uma sala de montagem escura. A tipografia vem da família visual do Claude: uma serifa editorial quente para títulos e uma grotesca geométrica limpa para a interface. A cor de destaque é argila/laranja (clay). Um ciano neon aparece só em brilhos e em estados de "feito/dica".

- **Hero:** marca-palavra gigante e espaçada (`E D I Ç Ã O`), que aparece "revelada" por uma agulha de reprodução (playhead) cor de argila. Ela fica sobre um campo de partículas em onda desenhado em canvas e é abraçada por uma órbita elíptica com marcações de jog dial. Por cima do canvas: nav em pílula de vidro, timecode REC ao vivo e abas numeradas 01/02/03 com barras de progresso finas (os três módulos).
- **Ideia central:** a *linha do tempo* do editor de vídeo vira a estrutura do curso. As 12 aulas são clipes em três trilhas (V1, V2, V3 = módulos), e o playhead marca o progresso do aluno.
- **Parte interativa:** o progresso por aula fica salvo em `localStorage`. "Marcar como concluída" na aula move o playhead e acende o clipe na home.
- **Motivos de vídeo:** timecode, REC, perfurações de filme nos clipes, forma de onda (tile da intro), régua com timecodes, playhead, jog dial.
- **Independente:** sem logo da Claude/Anthropic. A marca é um quadrado argila com um triângulo de "play" e o texto "Edição·Claude". O rodapé traz a nota de não afiliação.

## 2. Fontes (Google Fonts, um único `<link>`)

| Papel | Fonte escolhida | Referência da marca Claude | Por quê |
|---|---|---|---|
| Títulos, números, citações | **Newsreader** (opsz 6–72, 400/500/600, itálico 400) | Copernicus / Tiempos | Serifa editorial com eixo óptico: fica fina e elegante nos tamanhos de display e robusta nos menores. Tem o mesmo calor de "jornal literário" das serifas do Claude. |
| UI, texto corrido, rótulos, marca-palavra | **Hanken Grotesk** (400–700) | Styrene | Grotesca geométrica de aberturas largas e formas circulares, próxima da Styrene. Em caixa alta espaçada ela dá o ar cinematográfico das referências. |
| Prompts e código | **JetBrains Mono** (400/500) | — | Alta legibilidade, distingue bem 0/O e l/1, ótima para comandos copiáveis. |

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap" rel="stylesheet">
```
Se não houver internet, os fallbacks são Georgia / system-ui / Consolas.

## 3. Tokens (assets/css/tokens.css)

### Cores (contraste medido sobre `--c-ground` #0c0b0a)
| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--c-ground` | #0c0b0a | fundo da página | — |
| `--c-ground-2` | #131110 | faixa/seção | — |
| `--c-surface` / `-2` / `-3` | #1a1715 / #231f1c / #2e2925 | cartões, hover, trilhas | — |
| `--c-ink` | #f2ede4 | texto principal (marfim) | ~17:1 |
| `--c-ink-soft` | #bdb5a8 | texto secundário | ~9.6:1 |
| `--c-ink-mute` | #8f877b | só ≥14px / decorativo | ~5.4:1 |
| `--c-clay` | #d97757 | destaque, botões, playhead | ~6.3:1 |
| `--c-clay-hi` | #e8916f | links/texto argila em superfícies | ~7.8:1 |
| `--c-clay-ink` | #1b0e08 | texto sobre argila | 6.0:1 sobre clay · 7.8 sobre clay-hi · 4.6 sobre clay-deep |
| `--c-clay-deep` | #bb6644 | botão argila pressionado | — |
| `--c-neon` | #5fd4c7 | brilho secundário, "dica", concluída | ~11:1 |
| `--c-amber` | #e9b44c | "atenção" | ~10:1 |
| `--c-ivory` / `--c-ivory-ink` | #f4efe6 / #1a1613 | campo claro invertido | ~16:1 |

### Tipo (fluido 360 → 1440px)
`--t-wordmark` clamp(2.6rem, 9.6vw, 9.5rem) (o hero usa 12.2vw local) · `--t-display` · `--t-h1` clamp(2.1rem, 4.4vw, 4rem) · `--t-h2` clamp(1.6rem, 2.6vw, 2.35rem) · `--t-h3` · `--t-lead` · `--t-body` 17px · `--t-small` 14px · `--t-micro` 13px (mínimo).
Espaçamento entre letras: `--tr-wordmark` .42em (hero), `--tr-caps` .16em (rótulos em caixa alta pequenos), `--tr-display` -.02em.

### Espaço, raios, sombras, motion
- Espaço base de 4px: `--s-1`…`--s-10` (4 → 144). `--gutter` clamp(16px, 4vw, 48px); `--section-gap` clamp(88px, 12vw, 176px); `--content-max` 1320px.
- Raios: `--r-xs` 4 · `--r-sm` 8 · `--r-md` 14 · `--r-lg` 22 · `--r-pill` 999. Botões e nav são pílulas.
- Sombras: `--sh-float` (só para menus/painéis flutuantes). Brilhos: `--glow-clay`, `--glow-neon` (playhead, número da aula, hover do botão).
- Motion: `--ease-out`, `--ease-io`, `--d-fast` 160ms, `--d-med` 320ms, `--d-slow` 900ms.

## 4. Componentes globais (classes)

| Componente | Classes |
|---|---|
| Pular link | `.skip-link` |
| Nav de vidro | `header.site-nav[data-nav] > .site-nav__bar` · `.brand > .brand__mark + .brand__text` · `.site-nav__links` · `.site-nav__cta` · `.site-nav__toggle[data-nav-toggle]` · `#menu-mobile.site-nav__mobile` |
| Botões | `.btn` + `.btn--clay` / `.btn--ghost` / `.btn--dark` / `.btn--sm`; seta `.btn__arrow`; `.link-btn` |
| Hero | `.hero` · `canvas.hero__canvas[data-hero-canvas]` · `.hero__meta` (`.rec`, `[data-timecode]`) · `h1.hero__title > .wordmark[data-wordmark] + .sr-only` · `.hero__lead` · `.hero__actions` · `.hero__rail[data-hero-tabs]` com `.hero-tab` (role=tab) e `#mod-panel[data-panel-texts='[…]']` |
| Números | `.stats > dl.stats__list > .stat > dt + dd[data-count][data-suffix]` |
| Intro mosaico | `.mosaic > .tile.tile--slogan / --figure / --wave` (`canvas[data-wave]`) · `.intro__text` |
| Linha do tempo | `.timeline[data-timeline]` · `.timeline__ruler` · `.timeline__playhead[data-playhead]` (usa `--progress`) · `.track-group > h3.track__label + ol.track > li > a.clip[data-aula="NN"]` |
| Progresso | `[data-progress-summary]`, `[data-progress-count]`, `[data-progress-fill]`, `[data-progress-reset]` |
| Guia | `.guide__grid`, `.guide__intro`, `.guide__kit > ul.kit`, `figure.flow > svg[data-flow]` (desenhado pelo JS), `ol.guide__steps` |
| CTA | `.cta-band > .cta-band__inner > h2.cta-band__title + .btn--dark` |
| Rodapé | `.site-footer` (`--compact` nas aulas) · `.site-footer__name` · `__row` · `__nav` · `__note` · `__legal` |
| Reveal | adicione `.reveal` a qualquer elemento; o JS aplica `.is-in` ao entrar na tela (sem JS, tudo fica visível) |

### Card de aula na home (uma por aula)
```html
<li><a class="clip reveal" href="aulas/aula-NN.html" data-aula="NN">
  <span class="clip__no">NN</span>
  <span class="clip__title">{titulo}</span>
  <span class="clip__meta">{tema_curto} · {duracao}</span>
  <span class="clip__done" aria-hidden="true"></span><span class="sr-only" data-done-label></span>
</a></li>
```
Um `ol.track` por módulo (4 aulas cada; `start="5"`/`start="9"` nas trilhas 2 e 3). `data-aula` tem sempre 2 dígitos.

## 5. Página de aula (aulas/_template.html)

Placeholders `{{…}}` e comentários `<!-- BUILDER: … -->` marcam o que deve ser preenchido.

1. `<body class="page-lesson" data-aula="NN">`: obrigatório (marca a aula atual no seletor e controla "concluída").
2. `<title>`: `Aula NN · {titulo} — Edição de Vídeos com Claude`; `meta description` vem do tema.
3. **Seletor de aulas** na nav: `.switcher` com 12 `<a href="aula-NN.html" data-aula="NN">`, cada um com `.switcher__no` + `.switcher__t`. `.switcher__current` mostra NN. O JS marca `aria-current` e ✓ nas concluídas.
4. **Hero da aula:** `.lesson-hero__crumb` (módulo), `.lesson-hero__no` (NN grande, aria-hidden), `h1.lesson-hero__title` (com `<span class="sr-only">Aula NN: </span>`), `.lesson-hero__theme`, `dl.lesson-meta` (Duração, Tema, Nível opcional; cada item é um `<div><dt/><dd/></div>`), `button.done-toggle[data-done-toggle]`, `section.objectives > ol.objectives__list > li` (um por objetivo).
5. **Sumário:** `aside.toc > nav.toc__inner[data-toc] > ol.toc__list`, com um `<li><a href="#id">` por bloco `titulo`. Se o `<ol>` ficar vazio, o JS monta o sumário a partir dos `h2[id]` do conteúdo. O link ativo recebe `aria-current="true"`.
6. **Conteúdo:** `<article class="lesson-body" data-lesson-body>` com os blocos da §6, na ordem do JSON.
7. **Anterior/próxima:** `nav.pager > a.pager__link--prev / --next` (`.pager__dir`, `.pager__no`, `.pager__title`). Na aula 01, troque o link "prev" por `<span class="pager__spacer"></span>`; na aula 12, faça o mesmo com "next".
8. Assets com `../assets/…`; links para a home `../index.html#aulas`.

## 6. Contrato dos blocos (JSON `tipo` → HTML exato)

Escape o texto como HTML (`& < > "`). Os `id` devem ser slugs únicos dentro da página (`a-z0-9-`, sem acentos).

**titulo**
```html
<h2 class="b-titulo" id="{slug}">{texto}</h2>
```
(Subtítulo, se existir: `<h3 class="b-titulo" id="{slug}">`; não entra no sumário.)

**paragrafo**: inline permitido: `<strong> <em> <a> <code>`
```html
<p class="b-paragrafo">{texto}</p>
```

**lista**
```html
<ul class="b-lista"><li>{item}</li>…</ul>
```

**lista_numerada**
```html
<ol class="b-lista-num"><li>{item}</li>…</ol>
```

**prompt**: copiável, em formato de conversa. Texto puro escapado, quebras de linha preservadas (`white-space: pre-wrap`). Não indente o texto dentro do `<p>`.
```html
<figure class="b-prompt">
  <figcaption class="b-prompt__head">
    <span class="b-prompt__avatar" aria-hidden="true">Você</span>
    <span class="b-prompt__label">{rotulo ou "Prompt para o Claude"}</span>
    <button class="copy-btn" type="button" data-copy><span class="copy-btn__text">Copiar</span></button>
  </figcaption>
  <div class="b-prompt__bubble">
    <p class="b-prompt__text" data-copy-source>{texto}</p>
  </div>
  <div class="b-prompt__composer" aria-hidden="true"><span>Responder ao Claude…</span><span class="b-prompt__send"></span></div>
</figure>
```

**codigo**: `{lang}` opcional (se não houver, use "código").
```html
<figure class="b-codigo">
  <figcaption class="b-codigo__head">
    <span class="b-codigo__lang">{lang}</span>
    <button class="copy-btn" type="button" data-copy><span class="copy-btn__text">Copiar</span></button>
  </figcaption>
  <pre class="b-codigo__pre"><code data-copy-source>{codigo}</code></pre>
</figure>
```

**dica**
```html
<aside class="b-callout b-callout--dica" role="note" aria-label="Dica">
  <p class="b-callout__title">Dica</p>
  <div class="b-callout__body"><p>{texto}</p></div>
</aside>
```

**atencao**
```html
<aside class="b-callout b-callout--atencao" role="note" aria-label="Atenção">
  <p class="b-callout__title">Atenção</p>
  <div class="b-callout__body"><p>{texto}</p></div>
</aside>
```
(O corpo aceita vários `<p>`, `<ul>` ou `<ol>`.)

**exercicio**: `ex-N` sequencial na página. Se não houver título, use "Exercício N".
```html
<section class="b-exercicio" aria-labelledby="ex-{n}">
  <div class="b-exercicio__head">
    <span class="b-exercicio__tag">Exercício</span>
    <h3 class="b-exercicio__title" id="ex-{n}">{titulo}</h3>
  </div>
  <div class="b-exercicio__body">
    <p>{enunciado}</p>
    <ol><li>{passo}</li>…</ol>   <!-- opcional -->
  </div>
</section>
```

**tabela**: sempre dentro do wrapper rolável; `tab-N` sequencial.
```html
<div class="b-tabela" role="region" aria-labelledby="tab-{n}" tabindex="0">
  <table>
    <caption id="tab-{n}">{titulo da tabela}</caption>
    <thead><tr><th scope="col">{col}</th>…</tr></thead>
    <tbody><tr><td>{celula}</td>…</tr>…</tbody>
  </table>
</div>
```
(Sem título: use `aria-label="Tabela"` no wrapper e omita o `<caption>`.)

**citacao**: `figcaption` opcional (o travessão vem do CSS).
```html
<figure class="b-citacao">
  <blockquote><p>{texto}</p></blockquote>
  <figcaption>{autor}</figcaption>
</figure>
```

Código inline dentro de parágrafos: `<code>…</code>` (estilizado automaticamente dentro de `.lesson-body`).

## 7. Comportamento do JS (assets/js/site.js)

- `html.js` é adicionado por um script inline no `<head>`. Sem JS, todo o conteúdo continua visível.
- **Progresso:** chave `localStorage` `edicao-claude:progresso` = array de `"NN"`. Todas as leituras e escritas usam try/catch.
- **Copiar:** qualquer `[data-copy]` copia o `innerText` do `[data-copy-source]` dentro do mesmo `figure`. Usa a Clipboard API e, se ela não estiver disponível (file://), recorre a `execCommand`. Anuncia "Copiado" numa região `aria-live`.
- **Hero:** canvas de onda + órbita (pausa fora da tela ou com a aba oculta; DPR máximo 2); abas avançam sozinhas a cada 6,5s, param com hover/foco e aceitam ←/→.
- **`prefers-reduced-motion`:** canvas estático, sem avanço automático, sem animações de entrada, contadores e timecode fixos.

## 8. Responsivo e acessibilidade

- **≤1080px:** o sumário vira um bloco no topo do conteúdo (não fixo); as trilhas da linha do tempo ficam com 2 clipes por linha.
- **≤900px:** os links da nav vão para o menu hambúrguer; números em 2×2; a intro e o guia ficam em uma coluna.
- **≤760px:** a linha do tempo vira uma lista (sem régua nem playhead); mosaico em 2 colunas; o diagrama de fluxo fica vertical; o seletor de aulas vira painel fixo em uma coluna; anterior/próxima empilham.
- **≤420px:** botões do hero em largura total; nav compacta.
- Verificado sem rolagem horizontal em 1440, 375 e 360px. Tabelas e código rolam dentro do próprio bloco.
- Foco visível: contorno argila de 2px (`:focus-visible`). Um único `h1` por página, landmarks semânticos, `lang="pt-BR"`, alvos de toque ≥44px nos controles principais, menor texto 13px.

## 9. Versão do aluno (/aluno/)

- **Geração:** `build.mjs` monta um objeto variante `V` (`professor` ← `content/aulas.json`, `aluno` ← `content/alunos.json`) e chama as mesmas `buildLesson(a, i, V)` / `buildHome(V)` com os mesmos templates. O professor continua em `index.html`, `aulas/` e `guia.html`. O aluno sai em `aluno/index.html` e `aluno/aula-NN.html` (assets `../assets/…`, home `index.html`). Sem `alunos.json`, só a versão do professor é gerada.
- **Diferenças no aluno:** `body[data-versao="aluno"].page-aluno`; selo `.brand__badge` "Versão do aluno" (só "aluno" ≤560px; ≤420px a aula esconde `.brand__text`); a nav não tem guia nem referência (o build falha se uma página do aluno linkar `guia.html`/`#guia`). A home do aluno mostra só Aulas, Módulos e Prompts prontos (+ Exercícios, se houver), com colunas via `--stat-cols`. A seção `#preparo` "O que você precisa" usa o parágrafo `O que você precisa: …` de `curso.introducao` (ou o pré-requisito do curso) e traz passos fixos de estudo.
- **Alternância:** `a.version-toggle[data-version-toggle]` ("⇄ Ver versão do aluno/professor") é o último item de `.site-nav__links` (com um fio à esquerda e cor mute) e do `#menu-mobile`. Aula ⇄ aula correspondente; home ⇄ home; `guia.html` → `aluno/index.html`.
- **Progresso:** o aluno usa a chave `edicao-claude:aluno:progresso`, separada da `edicao-claude:progresso` do professor.
- **Contrato de `content/alunos.json`:**
```json
{ "curso": { "titulo": "…", "subtitulo": "…", "introducao": ["…"] },
  "aulas": [ { "numero": 1, "slug": "aula-01", "titulo": "…",
               "subtitulo_ou_tema": "<igual ao da aula do professor; agrupa os módulos>",
               "duracao": "…", "objetivos": ["…"],
               "blocos": [ /* mesmos tipos e campos da §6 */ ] } ] }
```
