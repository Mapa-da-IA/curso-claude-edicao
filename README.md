# Claude – Edição de Vídeos

Site de um curso independente sobre edição de vídeos com o Claude. Este material **não é oficial da Anthropic** e não tem vínculo com a empresa.

## Ver localmente

Abra o arquivo `index.html` no navegador (é a escolha do nível). Não precisa de servidor.

## Reconstruir as páginas

O curso tem dois níveis, cada um com versão do professor e do aluno. As páginas são geradas a partir de `content/avancado/` e `content/iniciante/` (`aulas.json` = professor, `alunos.json` = aluno). Com o Node.js instalado, rode na raiz do projeto:

```sh
node build/build.mjs
node build/check-links.mjs
```

O primeiro comando gera a escolha de nível (`index.html`), o nível avançado (`avancado.html`, `aulas/`, `guia.html`, `aluno/`) e o iniciante (`iniciante/`); o segundo confere se todos os links internos funcionam. Detalhes em `DESIGN.md` §10.

## Publicação

O site é publicado pelo GitHub Pages a partir da branch `main`. O arquivo `.nojekyll` faz o Pages servir os arquivos como estão.
