# Claude – Edição de Vídeos

Site de um curso independente sobre edição de vídeos com o Claude. Este material **não é oficial da Anthropic** e não tem vínculo com a empresa.

## Ver localmente

Abra o arquivo `index.html` no navegador. Não precisa de servidor.

## Reconstruir as páginas

As aulas são geradas a partir de `content/aulas.json`. Com o Node.js instalado, rode na raiz do projeto:

```sh
node build/build.mjs
node build/check-links.mjs
```

O primeiro comando gera as páginas em `aulas/`, o `index.html` e o `guia.html`; o segundo confere se todos os links internos funcionam.

## Publicação

O site é publicado pelo GitHub Pages a partir da branch `main`. O arquivo `.nojekyll` faz o Pages servir os arquivos como estão.
