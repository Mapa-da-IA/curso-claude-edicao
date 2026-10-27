#!/usr/bin/env node
/*
  build.mjs — gera o site estático: dois NÍVEIS × duas VERSÕES, a partir dos mesmos templates.

    nível       versão      conteúdo                          saída
    avançado    professor   content/avancado/aulas.json    →  avancado.html · aulas/aula-NN.html · guia.html
    avançado    aluno       content/avancado/alunos.json   →  aluno/index.html · aluno/aula-NN.html
    iniciante   professor   content/iniciante/aulas.json   →  iniciante/index.html · iniciante/aulas/aula-NN.html · iniciante/guia.html
    iniciante   aluno       content/iniciante/alunos.json  →  iniciante/aluno/index.html · iniciante/aluno/aula-NN.html
    (raiz)                                                 →  index.html (escolha do nível, build/chooser.template.html)

    node build/build.mjs

  Os níveis estão em LEVELS e as versões em VERSIONS (abaixo). Cada combinação vira um objeto
  "variante" (V) passado às mesmas funções buildLesson/buildGuide/buildHome. Todos os links
  internos são calculados com rel(página, destino), então a profundidade da pasta não importa.

  Sem dependências. Contrato de marcação: DESIGN.md §5 e §6; níveis e versões: §9 e §10.
*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const write = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s, "utf8"); console.log("  escrito", p); };

/* ------------------------------------------------------------ níveis × versões */
const CHOOSER = "index.html"; // raiz: escolha do nível
const LEVELS = [
  { key: "avancado", nome: "Avançado", ferramenta: "Claude Code", content: "content/avancado", base: "", profHome: "avancado.html",
    nomeCompleto: "Edição de Vídeos com Claude — Avançado (Claude Code)" },
  { key: "iniciante", nome: "Iniciante", ferramenta: "Claude Cowork", content: "content/iniciante", base: "iniciante/", profHome: "iniciante/index.html",
    nomeCompleto: "Edição de Vídeos com Claude — Iniciante (Claude Cowork)" },
];
const VERSIONS = {
  professor: { file: "aulas.json", dir: "aulas", label: "Professor", longo: "Guia do professor", guide: true },
  aluno: { file: "alunos.json", dir: "aluno", label: "Aluno", longo: "Versão do aluno", guide: false },
};

/* Contrato dos JSON (DESIGN §9): falha cedo, com a lista do que falta. */
function loadContent(path, versionKey) {
  if (!existsSync(join(ROOT, path))) throw new Error(`Conteúdo não encontrado: ${path}`);
  const d = JSON.parse(read(path));
  const bad = [];
  if (!d.curso || typeof d.curso.titulo !== "string") bad.push("curso.titulo");
  if (!d.curso || typeof d.curso.subtitulo !== "string") bad.push("curso.subtitulo");
  if (!d.curso || !Array.isArray(d.curso.introducao)) bad.push("curso.introducao");
  if (versionKey === "professor" && !Array.isArray(d.curso?.secoes_extras)) bad.push("curso.secoes_extras");
  if (!Array.isArray(d.aulas) || !d.aulas.length) bad.push("aulas[]");
  for (const a of d.aulas || []) {
    for (const k of ["numero", "slug", "titulo", "subtitulo_ou_tema", "objetivos", "blocos"]) if (a[k] == null) bad.push(`aula ${a.numero}: ${k}`);
    if (a.slug && a.slug !== `aula-${String(a.numero).padStart(2, "0")}`) bad.push(`aula ${a.numero}: slug "${a.slug}"`);
  }
  if (bad.length) throw new Error(`${path} fora do contrato (DESIGN.md §9): ` + bad.join(", "));
  return d;
}

/* Caminho relativo de uma página (from) para outro arquivo do site (to), ambos a partir da raiz. */
function rel(from, to) {
  const [p, h] = to.split("#");
  const r = posix.relative(posix.dirname(from), p) || posix.basename(p);
  return h != null ? `${r}#${h}` : r;
}
const rootPrefix = (page) => "../".repeat(page.split("/").length - 1);

const LESSON_TPL = read("aulas/_template.html");
const HOME_TPL = read("build/index.template.html");
const CHOOSER_TPL = read("build/chooser.template.html");

/* ------------------------------------------------------------ helpers */
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escAttrSingle = (s) => esc(s).replace(/'/g, "&#39;");
// quebras de linha como entidade: o texto pode ser recuado no HTML sem alterar prompts/código
const escPre = (s) => esc(s).replace(/\r?\n/g, "&#10;");
const nn = (n) => String(n).padStart(2, "0");

function slugify(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "secao";
}
function idMaker() {
  const used = new Set();
  return (text) => {
    const base = slugify(text); let id = base, i = 2;
    while (used.has(id)) id = `${base}-${i++}`;
    used.add(id); return id;
  };
}

/* Texto inline: escapa, transforma URLs em links e destaca rótulos "ROTULO:" iniciais. */
function linkify(escaped) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const m = url.match(/[.,;:)]+$/); const tail = m ? m[0] : "";
    const href = tail ? url.slice(0, -tail.length) : url;
    return `<a href="${href}" rel="noopener">${href}</a>${tail}`;
  });
}
function inline(text, { label = false } = {}) {
  let s = String(text ?? "");
  if (label) {
    // "NOTA DE COMPATIBILIDADE E VERIFICAÇÃO: …", "Papel do professor: …", "Remotion: …"
    const m = s.match(/^([^:]{2,48}?):\s+(.+)$/s);
    if (m && !/https?$/i.test(m[1]) && !/[.;]/.test(m[1])) {
      return `<strong>${esc(m[1])}:</strong> ${linkify(esc(m[2]))}`;
    }
  }
  return linkify(esc(s));
}

function replaceOnce(src, re, repl, name) {
  let n = 0;
  const out = src.replace(re, (...a) => { n++; return typeof repl === "function" ? repl(...a) : repl; });
  if (n !== 1) throw new Error(`Template: esperado 1 trecho para "${name}", achei ${n}`);
  return out;
}

/* ------------------------------------------------------------ módulos */
// Os módulos são as faixas do "Mapa do curso": aulas agrupadas por subtitulo_ou_tema, na ordem.
const SHORT = {
  "Fundamentos, instalações e Skills": "Fundamentos",
  "Composição, arquivos, cortes e tipografia": "Composição",
  "Áudio, cor, revisão e exportação": "Acabamento",
  "Projeto integrado independente": "Projeto final",
  "Primeiros passos": "Primeiros passos",
  "Criação e edição": "Criação",
  "Finalização": "Finalização",
};
// tabela "Mapa do curso" do guia do professor do nível (dá a "Entrega" de cada módulo)
const mapaOf = (curso) => (curso.secoes_extras?.find((s) => /mapa do curso/i.test(s.titulo))?.blocos || [])
  .find((b) => b.tipo === "tabela")?.linhas || [];
function groupModules(list, mapa) {
  const mods = [];
  for (const a of list) {
    let m = mods[mods.length - 1];
    if (!m || m.tema !== a.subtitulo_ou_tema) {
      const row = mapa.find((r) => r[1] === a.subtitulo_ou_tema);
      m = { idx: mods.length + 1, tema: a.subtitulo_ou_tema, curto: SHORT[a.subtitulo_ou_tema] || a.subtitulo_ou_tema.split(/[ ,]/)[0], entrega: row ? row[2] : "", aulas: [] };
      mods.push(m);
    }
    m.aulas.push(a); a._mod = m;
  }
  return mods;
}
const rangeLabel = (m) => {
  const f = nn(m.aulas[0].numero), l = nn(m.aulas[m.aulas.length - 1].numero);
  return f === l ? `Aula ${f}` : `Aulas ${f}–${l}`;
};

/* Duração: "7 a 10 min" (avançado) ou "≈ 7–10 min" (iniciante) viram "7–10 min". */
const durShort = (a) => {
  const m = String(a.duracao || "").match(/(\d+)\s*(?:a|–|-)\s*(\d+)\s*min/i);
  return m ? `${m[1]}–${m[2]} min` : "";
};
const afterLabel = (p) => p.replace(/^[^:]+:\s*/, "");

/* ------------------------------------------------------------ blocos (DESIGN §6) */
function listItems(itens, ctx) {
  const numbered = itens.length > 0 && itens.every((t) => /^\d{2}\s/.test(t));
  return itens.map((t) => {
    // Índice pedagógico: "01 | Título" vira link para a aula
    const idx = t.match(/^(\d{2})\s*\|\s*(.+)$/);
    if (idx && (ctx.lessons || []).some((a) => nn(a.numero) === idx[1])) {
      return `<li><a href="${ctx.lessonPrefix ?? `${ctx.root}aulas/`}aula-${idx[1]}.html">Aula ${idx[1]} · ${esc(idx[2])}</a></li>`;
    }
    const body = numbered ? t.replace(/^\d{2}\s+/, "") : t; // o <ol> já numera
    return `<li>${inline(body, { label: true })}</li>`;
  }).join("");
}

function renderBlocks(blocos, ctx) {
  const out = []; const toc = [];
  blocos.forEach((b, i) => {
    const prev = blocos[i - 1];
    switch (b.tipo) {
      case "titulo": {
        const id = ctx.id(b.texto);
        const sub = ctx.forceSub || (prev && prev.tipo === "titulo");
        if (sub) out.push(`<h3 class="b-titulo" id="${id}">${esc(b.texto)}</h3>`);
        else { out.push(`<h2 class="b-titulo" id="${id}">${esc(b.texto)}</h2>`); toc.push({ id, texto: b.texto }); }
        break;
      }
      case "paragrafo":
        out.push(`<p class="b-paragrafo">${inline(b.texto)}</p>`); break;
      case "lista":
        out.push(`<ul class="b-lista">${listItems(b.itens, ctx)}</ul>`); break;
      case "lista_numerada":
        out.push(`<ol class="b-lista-num">${listItems(b.itens, ctx)}</ol>`); break;
      case "prompt":
        out.push(`<figure class="b-prompt">
  <figcaption class="b-prompt__head">
    <span class="b-prompt__avatar" aria-hidden="true">Você</span>
    <span class="b-prompt__label">${esc(b.rotulo || "Prompt para o Claude")}</span>
    <button class="copy-btn" type="button" data-copy><span class="copy-btn__text">Copiar</span></button>
  </figcaption>
  <div class="b-prompt__bubble">
    <p class="b-prompt__text" data-copy-source>${escPre(b.texto)}</p>
  </div>
  <div class="b-prompt__composer" aria-hidden="true"><span>Responder ao Claude…</span><span class="b-prompt__send"></span></div>
</figure>`); break;
      case "codigo":
        out.push(`<figure class="b-codigo">
  <figcaption class="b-codigo__head">
    <span class="b-codigo__lang">${esc(b.linguagem || "código")}</span>
    <button class="copy-btn" type="button" data-copy><span class="copy-btn__text">Copiar</span></button>
  </figcaption>
  <pre class="b-codigo__pre"><code data-copy-source>${escPre(b.texto)}</code></pre>
</figure>`); break;
      case "dica":
      case "atencao": {
        const t = b.tipo === "dica" ? "Dica" : "Atenção";
        const paras = String(b.texto).split(/\n{2,}/).map((p) => `<p>${inline(p, { label: true })}</p>`).join("");
        out.push(`<aside class="b-callout b-callout--${b.tipo}" role="note" aria-label="${t}">
  <p class="b-callout__title">${t}</p>
  <div class="b-callout__body">${paras}</div>
</aside>`); break;
      }
      case "exercicio": {
        const n = ++ctx.ex;
        const passos = b.passos || b.itens;
        out.push(`<section class="b-exercicio" aria-labelledby="ex-${n}">
  <div class="b-exercicio__head">
    <span class="b-exercicio__tag">Exercício</span>
    <h3 class="b-exercicio__title" id="ex-${n}">${esc(b.titulo || `Exercício ${n}`)}</h3>
  </div>
  <div class="b-exercicio__body">
    ${(b.enunciado || b.texto) ? `<p>${inline(b.enunciado || b.texto)}</p>` : ""}${passos && passos.length ? `\n    <ol>${passos.map((p) => `<li>${inline(p)}</li>`).join("")}</ol>` : ""}
  </div>
</section>`); break;
      }
      case "tabela": {
        const n = ++ctx.tab;
        const [head, ...rows] = b.linhas || [];
        const titulo = b.titulo || "";
        const wrapAttr = titulo ? `aria-labelledby="tab-${n}"` : `aria-label="${esc(ctx.tableLabel ? `Tabela: ${ctx.tableLabel}` : "Tabela")}"`;
        out.push(`<div class="b-tabela" role="region" ${wrapAttr} tabindex="0">
  <table>${titulo ? `\n    <caption id="tab-${n}">${esc(titulo)}</caption>` : ""}
    <thead><tr>${head.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>
${rows.map((r) => `      <tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("\n")}
    </tbody>
  </table>
</div>`); break;
      }
      case "citacao":
        out.push(`<figure class="b-citacao">
  <blockquote><p>${inline(b.texto)}</p></blockquote>${b.autor ? `\n  <figcaption>${esc(b.autor)}</figcaption>` : ""}
</figure>`); break;
      default:
        throw new Error(`Tipo de bloco desconhecido: ${b.tipo}`);
    }
  });
  return { html: out.join("\n\n"), toc };
}

const indent = (s, pad) => s.split("\n").map((l) => (l ? pad + l : l)).join("\n");
const tocHtml = (toc, pad) => toc.map((t) => `${pad}<li><a href="#${t.id}">${esc(t.texto)}</a></li>`).join("\n");

function switcherHtml(prefix, pad, list) {
  return list.map((a) => `${pad}<li><a href="${prefix}aula-${nn(a.numero)}.html" data-aula="${nn(a.numero)}"><span class="switcher__no">${nn(a.numero)}</span><span class="switcher__t">${esc(a.titulo)}</span></a></li>`).join("\n");
}

/* Trechos do template compartilhados por aulas e guia */
const RE = {
  title: /<title>[\s\S]*?<\/title>/,
  desc: /<meta name="description" content="[^"]*">/,
  body: /<body class="page-lesson" data-aula="[^"]*">/,
  switcherGrid: /(<ol class="switcher__grid">)[\s\S]*?(\n\s*<\/ol>)/,
  switcherCur: /<span class="switcher__current">[^<]*<\/span>/,
  hero: /<header class="lesson-hero">[\s\S]*?\n    <\/header>/,
  toc: /(<ol class="toc__list">)[\s\S]*?(\n\s*<\/ol>)/,
  article: /(<article class="lesson-body" data-lesson-body>)[\s\S]*?(\n\s*<\/article>)/,
  pager: /(<nav class="pager container" aria-label="Navegação entre aulas">)[\s\S]*?(\n\s*<\/nav>)/,
  pagerComment: /\s*<!-- BUILDER: na aula 01[^>]*-->/,
};
const stripBuilderComments = (s) => s.replace(/\n?[ \t]*<!-- BUILDER:[\s\S]*?-->/g, "");


/* ------------------------------------------------------------ variantes (DESIGN §9 e §10) */
// Uma variante por nível × versão. Saídas:
//   professor: <base>aulas/aula-NN.html · <base>guia.html · home = level.profHome
//   aluno:     <base>aluno/aula-NN.html · home = <base>aluno/index.html
const VARIANTS = [];
for (const level of LEVELS) {
  for (const [key, ver] of Object.entries(VERSIONS)) {
    const path = `${level.content}/${ver.file}`;
    const d = loadContent(path, key);
    VARIANTS.push({
      key, ver, level, path, curso: d.curso, aulas: d.aulas,
      dir: `${level.base}${ver.dir}`,
      home: key === "professor" ? level.profHome : `${level.base}${ver.dir}/index.html`,
      guide: ver.guide ? `${level.base}guia.html` : null,
    });
  }
}
// módulos: a "Entrega" de cada módulo vem do Mapa do curso do guia do professor do mesmo nível
for (const V of VARIANTS) {
  const prof = VARIANTS.find((o) => o.level === V.level && o.key === "professor");
  V.modules = groupModules(V.aulas, mapaOf(prof.curso));
}
const counterpart = (V) => VARIANTS.find((o) => o.level === V.level && o.key !== V.key);
const hasLesson = (V, N) => !!V && V.aulas.some((a) => nn(a.numero) === N);

/* Link de alternância professor ⇄ aluno (dentro do mesmo nível). href relativo à página atual. */
function versionToggle(toKey, href) {
  const label = toKey === "aluno" ? "versão do aluno" : "versão do professor";
  // "Ver " some na nav larga (DESIGN §9) para caber ao lado do selo de nível
  return `<a class="version-toggle" href="${href}" data-version-toggle="${toKey}"><span class="version-toggle__icon" aria-hidden="true">⇄</span><span><span class="version-toggle__ver">Ver </span>${label}</span></a>`;
}
/* Selo de nível · versão ao lado da marca, em todas as páginas de nível. */
const brandBadge = (V) => `<span class="brand__badge brand__badge--${V.key}"><span class="brand__badge-lvl">${V.level.nome}</span><span class="brand__badge-sep" aria-hidden="true"> · </span><span class="brand__badge-ver">${V.ver.label}</span></span>`;
const brandLabel = (V) => `Edição com Claude, nível ${V.level.nome.toLowerCase()}, ${V.key === "aluno" ? "versão do aluno" : "versão do professor"} — início`;
const legalText = (V) => `© 2026 Edição de Vídeos com Claude · ${V.level.nome} · ${V.ver.longo}`;
const LEVEL_LINK = "Trocar de nível";
const levelLink = (page, pad) => `${pad}<a href="${rel(page, CHOOSER)}" data-level-link>${LEVEL_LINK}</a>`;
const STUDENT_GUARD = /guia\.html|#guia"/;

const RE_NAV = {
  links: /(<nav class="site-nav__links" aria-label="Principal">)([\s\S]*?)(\n\s*<\/nav>)/,
  mobile: /(<nav class="site-nav__mobile" id="menu-mobile" aria-label="Menu" hidden>)([\s\S]*?)(\n\s*<\/nav>)/,
  footer: /(<nav class="site-footer__nav" aria-label="Rodapé">)([\s\S]*?)(\n\s*<\/nav>)/,
};

/* O template da aula fala de "../index.html", "../guia.html" e "../assets/" (como se a aula estivesse
   em aulas/ na raiz). Aqui esses caminhos viram caminhos reais a partir da página gerada. */
function templatePaths(s, page, V) {
  return s.replace(/(href|src)="\.\.\/([^"#]*)(#[^"]*)?"/g, (m, attr, p, hash = "") => {
    let target;
    if (p.startsWith("assets/")) target = p;
    else if (p === "index.html") target = V.home;
    else if (p === "guia.html") target = `${V.level.base}guia.html`;
    else return m;
    return `${attr}="${rel(page, target)}${hash}"`;
  });
}

/* Nav e rodapé das páginas de aula/guia: selo nível · versão, alternância de versão,
   "Trocar de nível" (menu móvel e rodapé) e, no aluno, links sem o guia do professor. */
function lessonChrome(s, V, page, toggleHref) {
  const other = counterpart(V);
  const tg = toggleHref && other ? versionToggle(other.key, toggleHref) : "";
  const home = rel(page, V.home);
  s = replaceOnce(s, /<a class="brand" href="[^"]*" aria-label="[^"]*">([\s\S]*?Claude<\/span>)/,
    (_, inner) => `<a class="brand" href="${home}" aria-label="${brandLabel(V)}">${inner}${brandBadge(V)}`, "brand");
  if (V.key !== "aluno") {
    s = replaceOnce(s, RE_NAV.links, (_, o, inner, c) => `${o}${inner}${tg ? `\n        ${tg}` : ""}${c}`, "nav links");
    s = replaceOnce(s, RE_NAV.mobile, (_, o, inner, c) => `${o}${inner}${tg ? `\n      ${tg}` : ""}\n${levelLink(page, "      ")}${c}`, "menu mobile");
    s = replaceOnce(s, RE_NAV.footer, (_, o, inner, c) => `${o}${inner}\n${levelLink(page, "          ")}${c}`, "footer nav");
  } else {
    s = replaceOnce(s, RE_NAV.links, (_, o, _i, c) => `${o}\n        <a href="${home}#aulas">Todas as aulas</a>${tg ? `\n        ${tg}` : ""}${c}`, "nav links");
    s = replaceOnce(s, RE_NAV.mobile, (_, o, _i, c) => `${o}\n      <a href="${home}">Início</a>\n      <a href="${home}#aulas">Todas as aulas</a>${tg ? `\n      ${tg}` : ""}\n${levelLink(page, "      ")}${c}`, "menu mobile");
    s = replaceOnce(s, RE_NAV.footer, (_, o, _i, c) => `${o}\n          <a href="${home}">Início</a>\n          <a href="${home}#aulas">Todas as aulas</a>\n${levelLink(page, "          ")}${c}`, "footer nav");
  }
  s = replaceOnce(s, /© 2026 Guia do Professor · Edição de Vídeos/, legalText(V), "legal");
  if (V.key === "aluno" && STUDENT_GUARD.test(s)) throw new Error(`Página do aluno com link para o guia do professor: ${page}`);
  return s;
}

const bodyTag = (cls, V, extra = "") => `<body class="${cls}${V.key === "aluno" ? " page-aluno" : ""}"${extra} data-nivel="${V.level.key}" data-versao="${V.key}">`;

/* ------------------------------------------------------------ aulas */
function buildLesson(a, i, V) {
  const N = nn(a.numero);
  const isA = V.key === "aluno";
  const list = V.aulas;
  const page = `${V.dir}/aula-${N}.html`;
  const L = V.level;
  const ctx = { id: idMaker(), ex: 0, tab: 0, root: rootPrefix(page), lessons: list, lessonPrefix: "" };
  ["obj-title", "conteudo", "switcher-panel", "menu-mobile"].forEach((r) => ctx.id(r)); // ids já usados pelo template
  const { html, toc } = renderBlocks(a.blocos, ctx);
  let s = templatePaths(LESSON_TPL, page, V);

  s = replaceOnce(s, RE.title, `<title>Aula ${N} · ${esc(a.titulo)} — ${L.nome} · ${isA ? "Versão do aluno · " : ""}Edição de Vídeos com Claude</title>`, "title");
  s = replaceOnce(s, RE.desc, `<meta name="description" content="${esc(a.subtitulo_ou_tema)} — aula ${N} ${isA ? "da versão do aluno" : "do guia do professor"} do nível ${L.nome.toLowerCase()} (${L.ferramenta}) do curso Edição de Vídeos com Claude: ${esc(a.titulo)}.">`, "description");
  s = replaceOnce(s, RE.body, bodyTag("page-lesson", V, ` data-aula="${N}"`), "body");
  s = replaceOnce(s, RE.switcherGrid, (_, o, c) => `${o}\n${switcherHtml("", "            ", list)}${c}`, "switcher");
  s = replaceOnce(s, RE.switcherCur, `<span class="switcher__current">${N}</span>`, "switcher__current");

  // hero da aula: preenche os placeholders do próprio template
  s = s.replace("Módulo {{MODULO}}", `Módulo ${a._mod.idx} · ${esc(a._mod.curto)}`);
  s = s.replace(`<span class="lesson-hero__no" aria-hidden="true">{{NN}}</span>`, `<span class="lesson-hero__no" aria-hidden="true">${N}</span>`);
  s = s.replace(`<span class="sr-only">Aula {{NN}}: </span>{{TITULO}}`, `<span class="sr-only">Aula ${N}: </span>${esc(a.titulo)}`);
  s = replaceOnce(s, /<p class="lesson-hero__theme">[^<]*<\/p>/, `<p class="lesson-hero__theme">${esc(a.subtitulo_ou_tema)}</p>`, "theme");
  const meta = [
    isA && (durShort(a) || a.duracao) && `<div><dt>Duração</dt><dd>${durShort(a) ? `≈ ${durShort(a)}` : esc(a.duracao)}</dd></div>`,
    !isA && durShort(a) && `<div><dt>Duração de referência</dt><dd>≈ ${durShort(a)} <span class="lesson-meta__note">(estimativa editorial do guia)</span></dd></div>`,
    a._mod.entrega && `<div><dt>Entrega do módulo</dt><dd>${esc(a._mod.entrega)}</dd></div>`,
    `<div><dt>Nível</dt><dd>${esc(L.nome)} · ${esc(L.ferramenta)}</dd></div>`,
  ].filter(Boolean).map((l) => "          " + l).join("\n");
  s = replaceOnce(s, /(<dl class="lesson-meta">)[\s\S]*?(\n\s*<\/dl>)/, (_, o, c) => `${o}\n${meta}${c}`, "lesson-meta");
  s = replaceOnce(s, /(<ol class="objectives__list">)[\s\S]*?(\n\s*<\/ol>)/,
    (_, o, c) => `${o}\n${a.objetivos.map((t) => `            <li>${inline(t)}</li>`).join("\n")}${c}`, "objectives");

  s = replaceOnce(s, RE.toc, (_, o, c) => `${o}\n${tocHtml(toc, "            ")}${c}`, "toc");
  s = replaceOnce(s, RE.article, (_, o, c) => `${o}\n${indent(html, "        ")}${c}`, "article");

  const homeAulas = `${rel(page, V.home)}#aulas`;
  const prev = list[i - 1], next = list[i + 1];
  const prevHtml = prev
    ? `<a class="pager__link pager__link--prev" href="aula-${nn(prev.numero)}.html" rel="prev">
        <span class="pager__dir">← Aula anterior</span>
        <span class="pager__no">${nn(prev.numero)}</span>
        <span class="pager__title">${esc(prev.titulo)}</span>
      </a>`
    : `<a class="pager__link pager__link--prev" href="${homeAulas}">
        <span class="pager__dir">← Início</span>
        <span class="pager__title">Todas as aulas</span>
      </a>`;
  const nextHtml = next
    ? `<a class="pager__link pager__link--next" href="aula-${nn(next.numero)}.html" rel="next">
        <span class="pager__dir">Próxima aula →</span>
        <span class="pager__no">${nn(next.numero)}</span>
        <span class="pager__title">${esc(next.titulo)}</span>
      </a>`
    : `<a class="pager__link pager__link--next" href="${homeAulas}">
        <span class="pager__dir">Fim do nível →</span>
        <span class="pager__title">Voltar a todas as aulas</span>
      </a>`;
  s = replaceOnce(s, RE.pager, (_, o, c) => `${o}\n      ${prevHtml}\n      ${nextHtml}${c}`, "pager");
  const other = counterpart(V);
  const toggleHref = !other ? "" : rel(page, hasLesson(other, N) ? `${other.dir}/aula-${N}.html` : other.home);
  s = lessonChrome(s, V, page, toggleHref);
  s = stripBuilderComments(s);
  if (/\{\{/.test(s)) throw new Error(`Placeholder não preenchido na aula ${N}: ${s.match(/\{\{[^}]*\}\}/)[0]}`);
  write(page, s);
  return { N, toc, ctx };
}

/* ------------------------------------------------------------ guia.html (só professor) */
function buildGuide(V) {
  const page = V.guide, C = V.curso, L = V.level;
  const ctx = { id: idMaker(), ex: 0, tab: 0, root: rootPrefix(page), lessons: V.aulas, lessonPrefix: `${rel(page, V.dir)}/` };
  ["conteudo", "switcher-panel", "menu-mobile"].forEach((r) => ctx.id(r));
  const parts = []; const toc = [];

  // Seção 0: a apresentação do curso (introducao), completa
  const sobreId = ctx.id("Sobre este guia");
  toc.push({ id: sobreId, texto: "Sobre este guia" });
  const sobre = [`<h2 class="b-titulo" id="${sobreId}">Sobre este guia</h2>`];
  for (const p of C.introducao) {
    if (p.startsWith("Método de cada aula")) {
      const steps = [...afterLabel(p).matchAll(/\d+\.\s*([^.]+)\./g)].map((m) => m[1].trim());
      sobre.push(`<p class="b-paragrafo"><strong>Método de cada aula:</strong></p>`);
      sobre.push(`<ol class="b-lista-num">${steps.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`);
    } else {
      sobre.push(`<p class="b-paragrafo">${inline(p, { label: true })}</p>`);
    }
  }
  parts.push(sobre.join("\n\n"));

  for (const sec of C.secoes_extras) {
    const id = ctx.id(sec.titulo);
    toc.push({ id, texto: sec.titulo });
    ctx.forceSub = true; ctx.tableLabel = sec.titulo;
    const { html } = renderBlocks(sec.blocos, ctx);
    parts.push(`<h2 class="b-titulo" id="${id}">${esc(sec.titulo)}</h2>\n\n${html}`);
  }
  const html = parts.join("\n\n");
  const nApendices = C.secoes_extras.filter((s) => /^ap[êe]ndice/i.test(s.titulo)).length;
  const home = rel(page, V.home);
  const lessonsPrefix = `${rel(page, V.dir)}/`;

  let s = templatePaths(LESSON_TPL, page, V);
  s = replaceOnce(s, RE.title, `<title>Guia de referência — ${esc(L.nomeCompleto)}</title>`, "title");
  const secs = C.secoes_extras.map((x) => x.titulo.replace(/^Ap[êe]ndice(?: \d+)? — /, "")).join(", ");
  s = replaceOnce(s, RE.desc, `<meta name="description" content="Referência do guia do professor de ${esc(L.nomeCompleto)}: ${esc(secs)}.">`, "description");
  s = replaceOnce(s, RE.body, bodyTag("page-lesson page-guide", V), "body");
  s = replaceOnce(s, RE.switcherGrid, (_, o, c) => `${o}\n${switcherHtml(lessonsPrefix, "            ", V.aulas)}${c}`, "switcher");
  s = replaceOnce(s, RE.switcherCur, `<span class="switcher__current">—</span>`, "switcher__current");
  s = s.replace(/<a href="guia\.html">Referência<\/a>/g, `<a href="guia.html" aria-current="page">Referência</a>`);

  const hero = `<header class="lesson-hero">
      <canvas class="hero__canvas hero__canvas--quiet" data-hero-canvas aria-hidden="true"></canvas>
      <div class="container lesson-hero__inner">
        <div class="lesson-hero__top">
          <p class="lesson-hero__crumb"><a href="${home}">Início</a> <span aria-hidden="true">/</span> Referência do professor</p>
          <button class="motion-toggle" type="button" data-motion-toggle hidden><span data-motion-text>Pausar animação</span></button>
        </div>
        <div class="lesson-hero__head">
          <span class="lesson-hero__no" aria-hidden="true">§</span>
          <div>
            <h1 class="lesson-hero__title">Guia de referência</h1>
            <p class="lesson-hero__theme">${esc(C.titulo)}: ${esc(C.subtitulo.replace(" | ", " · "))}.</p>
          </div>
        </div>
        <dl class="lesson-meta">
          <div><dt>Seções</dt><dd>${toc.length}</dd></div>
          ${nApendices ? `<div><dt>Apêndices</dt><dd>${nApendices}</dd></div>` : ""}
          <div><dt>Nível</dt><dd>${esc(L.nome)} · ${esc(L.ferramenta)}</dd></div>
        </dl>
      </div>
    </header>`;
  s = replaceOnce(s, RE.hero, hero, "hero");
  s = s.replace(`<aside class="toc" aria-label="Nesta aula">`, `<aside class="toc" aria-label="Nesta página">`);
  s = s.replace(`<p class="toc__title">Nesta aula</p>`, `<p class="toc__title">Nesta página</p>`);
  s = replaceOnce(s, RE.toc, (_, o, c) => `${o}\n${tocHtml(toc, "            ")}${c}`, "toc");
  s = replaceOnce(s, RE.article, (_, o, c) => `${o}\n${indent(html, "        ")}${c}`, "article");
  const first = V.aulas[0];
  s = replaceOnce(s, RE.pager, (_, o, c) => `${o.replace("Navegação entre aulas", "Continuar")}
      <a class="pager__link pager__link--prev" href="${home}#aulas">
        <span class="pager__dir">← Início</span>
        <span class="pager__title">Todas as aulas</span>
      </a>
      <a class="pager__link pager__link--next" href="${lessonsPrefix}aula-${nn(first.numero)}.html">
        <span class="pager__dir">Começar →</span>
        <span class="pager__no">${nn(first.numero)}</span>
        <span class="pager__title">${esc(first.titulo)}</span>
      </a>${c}`, "pager");
  const other = counterpart(V);
  s = lessonChrome(s, V, page, other ? rel(page, other.home) : "");
  s = stripBuilderComments(s);
  if (/\{\{/.test(s)) throw new Error(`Placeholder não preenchido no guia: ${page}`);
  write(page, s);
}

/* ------------------------------------------------------------ home de cada nível × versão */
function sectionAfter(a, titulo) {
  const i = a.blocos.findIndex((b) => b.tipo === "titulo" && b.texto === titulo);
  return i < 0 ? null : a.blocos[i + 1];
}
function computeStats(V) {
  const list = V.aulas;
  const count = (tipo) => list.reduce((n, a) => n + a.blocos.filter((b) => b.tipo === tipo).length, 0);
  const stats = [
    ["Aulas", list.length],
    ["Módulos", V.modules.length],
    ["Prompts prontos", count("prompt")],
  ];
  // checklist do professor: só na versão do professor
  if (V.key !== "aluno") stats.push(["Itens de checklist do professor", list.reduce((n, a) => n + ((sectionAfter(a, "Checklist do professor") || {}).itens || []).length, 0)]);
  stats.push(["Exercícios", count("exercicio")]);
  // contagens zeradas (conteúdo ainda em preparação, ou sem exercícios) não aparecem
  return stats.filter(([l, v], k) => k < 2 || v > 0);
}

/* Passos fixos da seção "O que você precisa" na home do aluno (texto de interface, não de aula). */
const STUDENT_STEPS = [
  "Leia os objetivos antes de começar",
  "Siga os passos e copie os prompts prontos",
  "Pratique e marque a aula como concluída",
];
const DISCLAIMER = "Curso independente sobre o uso do Claude na edição de vídeos. Não é um produto oficial nem afiliado à Anthropic. Claude é uma marca da Anthropic, PBC.";

function fillTemplate(tpl, vals, name) {
  return tpl.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, k) => {
    if (!(k in vals)) throw new Error(`Placeholder sem valor em ${name}: ${k}`);
    return vals[k];
  });
}

function buildHome(V) {
  const isA = V.key === "aluno";
  const C = V.curso, list = V.aulas, mods = V.modules, LV = V.level;
  const page = V.home;
  const R = rootPrefix(page);
  const lessonsRel = posix.relative(posix.dirname(page), V.dir);
  const L = lessonsRel ? `${lessonsRel}/` : "";
  const stats = computeStats(V);
  const by = (prefix) => C.introducao.find((p) => p.startsWith(prefix)) || "";
  const notas = isA ? "" : by("Notas de produção");
  const papel = isA ? "" : by("Papel do professor");
  const metodo = isA ? "" : by("Método de cada aula");
  const prereq = isA ? "" : by("Pré-requisito");
  // aluno: o parágrafo "O que você precisa: …" (ou "Pré-requisito(s): …") alimenta a seção de preparo
  const precisa = isA ? (C.introducao.find((p) => /^(o que voc[eê] precisa|pr[ée]-requisitos?|voc[eê] vai precisar)\s*:/i.test(p)) || "") : "";
  const labelled = [notas, papel, metodo, prereq, precisa].filter(Boolean);
  const plain = C.introducao.filter((p) => !labelled.includes(p));
  const lead = isA ? (plain[0] || "") : (plain.find((p) => /aulas/i.test(p)) || plain[0] || "");
  const identidade = isA ? [] : plain.filter((p) => p !== lead);
  const restAluno = isA ? plain.slice(1) : [];

  const subtitle = esc(C.subtitulo).replace(" | ", " · ").replace(/(\d+ aulas)/, "<em>$1</em>");
  const heroTabs = mods.map((m, k) => `          <button class="hero-tab" role="tab" aria-selected="${k === 0}" aria-controls="mod-panel" id="mod-${k + 1}" data-index="${k}"${k ? ' tabindex="-1"' : ""}>
            <span class="hero-tab__bar"><span class="hero-tab__fill"></span></span>
            <span class="hero-tab__no">${nn(k + 1)}</span><span class="hero-tab__name">${esc(m.curto)}</span>
          </button>`).join("\n");
  const panelTexts = mods.map((m) => `${rangeLabel(m)}: ${m.tema}.${m.entrega ? ` Entrega: ${m.entrega.toLowerCase()}.` : ""}`);

  const tracks = mods.map((m) => `          <div class="track-group">
            <h3 class="track__label"><span class="track__id">V${m.idx}</span> ${esc(m.curto)}</h3>
            <ol class="track"${m.aulas[0].numero > 1 ? ` start="${m.aulas[0].numero}"` : ""}>
${m.aulas.map((a) => `              <li><a class="clip reveal" href="${L}aula-${nn(a.numero)}.html" data-aula="${nn(a.numero)}">
                <span class="clip__no">${nn(a.numero)}</span>
                <span class="clip__title">${esc(a.titulo)}</span>
                <span class="clip__meta">${esc(m.curto)}${durShort(a) ? ` · ≈ ${durShort(a)}` : ""}</span>
                <span class="clip__done" aria-hidden="true"></span><span class="sr-only" data-done-label></span>
              </a></li>`).join("\n")}
            </ol>
          </div>`).join("\n");

  const steps = isA ? STUDENT_STEPS : [...afterLabel(metodo).matchAll(/\d+\.\s*([^.]+)\./g)].map((m) => m[1].trim());
  const guideSteps = steps.map((t, k) => `          <li class="reveal">
            <h3>${esc(t)}</h3>
            <p>Passo ${nn(k + 1)} de ${nn(steps.length)}</p>
          </li>`).join("\n");

  // "Em cada aula": seções h2 presentes em todas as aulas
  const common = list[0].blocos.filter((b, i, arr) => b.tipo === "titulo" && !(arr[i - 1] && arr[i - 1].tipo === "titulo"))
    .map((b) => b.texto.replace(/^AULA \d+ \/ /, ""))
    .filter((t) => list.every((a) => a.blocos.some((b) => b.tipo === "titulo" && b.texto.replace(/^AULA \d+ \/ /, "") === t)));
  const sw = ["clay", "ink", "neon", "amber"];
  const kit = [isA ? "Objetivos da aula" : "Objetivo da aula", ...common.map((t) => (t === "NARRAÇÃO" ? "Texto para narração" : t)),
    ...(isA ? ["Prompts prontos para copiar", "Marcar como concluída"] : [])]
    .filter((t, k, arr) => arr.indexOf(t) === k)
    .map((t, k) => `            <li><span class="kit__swatch kit__swatch--${sw[k % 4]}" aria-hidden="true"></span>${esc(t)}</li>`).join("\n");

  const statsHtml = stats.map(([l, v]) => `        <div class="stat"><dt>${esc(l)}</dt><dd data-count="${v}">${v}</dd></div>`).join("\n");
  const introHtml = [
    `        <p class="lead">${inline(lead)}</p>`,
    prereq && `        <p>${inline(prereq, { label: true })}</p>`,
    ...restAluno.map((p) => `        <p>${inline(p, { label: true })}</p>`),
  ].filter(Boolean).join("\n");

  // nav, rodapé, alternância de versão e troca de nível
  const other = counterpart(V);
  const tg = other ? versionToggle(other.key, rel(page, other.home)) : "";
  const guideHref = V.guide ? rel(page, V.guide) : "";
  const guideId = isA ? "preparo" : "guia";
  const guideTitle = isA ? "O que você precisa" : "Guia do professor";
  const navItems = isA
    ? [["#curso", "Curso"], ["#aulas", "Aulas"], [`#${guideId}`, guideTitle]]
    : [["#curso", "Curso"], ["#aulas", "Aulas"], ["#guia", "Guia do professor"], [guideHref, "Referência"]];
  const navLinks = (pad) => [...navItems.map(([h, t]) => `${pad}<a href="${h}">${t}</a>`), tg && `${pad}${tg}`].filter(Boolean).join("\n");
  const footerItems = isA
    ? [["#curso", "O curso"], ["#aulas", `As ${list.length} aulas`], [`#${guideId}`, guideTitle], [`${L}aula-01.html`, "Começar"]]
    : [["#curso", "O curso"], ["#aulas", `As ${list.length} aulas`], ["#guia", "Guia do professor"], [guideHref, "Referência"], [`${L}aula-01.html`, "Começar"]];
  const guideLead = isA
    ? esc(afterLabel(precisa || by("Pré-requisito"))) // sem texto próprio: usa o pré-requisito do curso
    : esc(afterLabel(papel));
  const versao = isA ? "Versão do aluno" : "Guia do professor";

  const vals = {
    R, L,
    PAGE_TITLE: `${esc(LV.nomeCompleto)} · ${versao}, ${list.length} aulas`,
    HOME: rel(page, page),
    BODY_ATTRS: ` class="page-home${isA ? " page-aluno" : ""}" data-nivel="${LV.key}" data-versao="${V.key}"`,
    BRAND_LABEL: brandLabel(V),
    BRAND_BADGE: brandBadge(V),
    NAV_LINKS: navLinks("        "),
    MOBILE_LINKS: `${navLinks("      ")}\n${levelLink(page, "      ")}`,
    STATS_ATTRS: stats.length === 4 ? "" : ` style="--stat-cols: ${stats.length}"`,
    LESSONS_NOTE: notas ? `<p class="lessons__note">${inline(notas, { label: true })}</p>` : "",
    GUIDE_ID: guideId,
    GUIDE_TITLE: guideTitle,
    GUIDE_LEAD: guideLead,
    GUIDE_BUTTON: isA ? "" : `          <p><a class="btn btn--ghost" href="${guideHref}">${LV.key === "avancado" ? "Mapa, plataformas, Skills e glossário" : "Mapa do curso e índice das aulas"} <span class="btn__arrow" aria-hidden="true">→</span></a></p>\n`,
    GUIDE_STEPS_LABEL: isA ? "Como estudar cada aula" : "Método de cada aula",
    FOOTER_LINKS: [...footerItems.map(([h, t]) => `          <a href="${h}">${t}</a>`), levelLink(page, "          ")].join("\n"),
    LEGAL: legalText(V),
    HERO_KICKER: `Nível ${esc(LV.nome)} · ${esc(LV.ferramenta)} · ${versao}`,
    LEVEL_CAPTION: `aulas · nível ${esc(LV.nome.toLowerCase())}`,
    N_AULAS: String(list.length),
    META_DESC: `${esc(LV.nomeCompleto)}. ${esc(lead)}`,
    H1_SR: `${esc(LV.nomeCompleto)}: ${esc(C.subtitulo.replace(" | ", ", "))}`,
    HERO_LEAD: `${subtitle}${/[.!?]$/.test(C.subtitulo) ? "" : "."}`,
    HERO_TABS: heroTabs,
    PANEL_TEXTS: escAttrSingle(JSON.stringify(panelTexts)),
    PANEL_FIRST: esc(panelTexts[0]),
    STATS: statsHtml,
    INTRO_TEXT: introHtml,
    TRACKS: tracks,
    GUIDE_STEPS: guideSteps,
    KIT: kit,
    CTA_TITLE: `Comece pela aula 01: ${esc(list[0].titulo)}.`,
    FOOTER_NOTE: [...identidade.map(esc), DISCLAIMER].join(" "),
  };
  const s = fillTemplate(HOME_TPL, vals, page);
  if (isA && STUDENT_GUARD.test(s)) throw new Error(`Home do aluno com link para o guia do professor: ${page}`);
  write(page, s);
  return stats;
}

/* ------------------------------------------------------------ index.html (escolha do nível) */
const CHOOSER_LEVELS = {
  iniciante: {
    desc: "Sem terminal nem programação: você edita conversando com o Claude no Claude Desktop, e o Claude Cowork cuida dos arquivos.",
    tags: ["Claude Desktop", "Claude Cowork", "Sem código"],
  },
  avancado: {
    desc: "Para quem topa o terminal: o Claude Code escreve e roda o código do vídeo com Node.js e Remotion.",
    tags: ["Claude Code", "Terminal", "Node.js", "Remotion"],
  },
};
function buildChooser() {
  const page = CHOOSER;
  const order = ["iniciante", "avancado"].map((k) => LEVELS.find((l) => l.key === k));
  const cards = order.map((LV, k) => {
    const prof = VARIANTS.find((v) => v.level === LV && v.key === "professor");
    const aluno = VARIANTS.find((v) => v.level === LV && v.key === "aluno");
    const info = CHOOSER_LEVELS[LV.key];
    return `        <article class="level-card level-card--${LV.key} reveal" id="${LV.key}" aria-labelledby="nivel-${LV.key}">
          <p class="level-card__step"><span class="level-card__no">${nn(k + 1)}</span> Nível ${k + 1} de ${order.length}</p>
          <h2 class="level-card__title" id="nivel-${LV.key}">${esc(LV.nome)}</h2>
          <p class="level-card__tool">com ${esc(LV.ferramenta)}</p>
          <p class="level-card__desc">${esc(info.desc)}</p>
          <ul class="level-card__tags" aria-label="Ferramentas">
${info.tags.map((t) => `            <li>${esc(t)}</li>`).join("\n")}
          </ul>
          <p class="level-card__meta">${prof.aulas.length} aulas · ${prof.modules.length} módulos · ${prof.modules.map((m) => esc(m.curto)).join(", ")}</p>
          <div class="level-card__actions">
            <a class="btn btn--clay" href="${rel(page, prof.home)}">Versão do professor <span class="btn__arrow" aria-hidden="true">→</span></a>
            <a class="btn btn--ghost" href="${rel(page, aluno.home)}">Versão do aluno <span class="btn__arrow" aria-hidden="true">→</span></a>
          </div>
        </article>`;
  }).join("\n");
  const navLinks = (pad) => order.map((LV) => `${pad}<a href="#${LV.key}">${esc(LV.nome)}</a>`).join("\n");
  const s = fillTemplate(CHOOSER_TPL, {
    NAV_LINKS: navLinks("        "),
    MOBILE_LINKS: navLinks("      "),
    LEVEL_CARDS: cards,
    DISCLAIMER,
    FOOTER_LINKS: order.flatMap((LV) => {
      const prof = VARIANTS.find((v) => v.level === LV && v.key === "professor");
      const aluno = VARIANTS.find((v) => v.level === LV && v.key === "aluno");
      return [`          <a href="${rel(page, prof.home)}">${esc(LV.nome)} · Professor</a>`, `          <a href="${rel(page, aluno.home)}">${esc(LV.nome)} · Aluno</a>`];
    }).join("\n"),
  }, page);
  if (/\{\{/.test(s)) throw new Error("Placeholder não preenchido na escolha de nível");
  write(page, s);
}

/* ------------------------------------------------------------ run */
for (const V of VARIANTS) {
  console.log(`Gerando ${V.level.nome} · ${V.ver.label} a partir de ${V.path}…`);
  V.aulas.forEach((a, i) => buildLesson(a, i, V));
  if (V.guide) buildGuide(V);
  const stats = buildHome(V);
  console.log(`  Números da home:`, stats.map(([l, v]) => `${l}=${v}`).join(", "));
  console.log(`  Módulos:`, V.modules.map((m) => `${rangeLabel(m)} ${m.curto}`).join(" | "));
}
console.log("Gerando a escolha de nível…");
buildChooser();
