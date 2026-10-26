#!/usr/bin/env node
/*
  build.mjs — gera o site estático a partir de content/aulas.json.

    node build/build.mjs

  Entradas:  content/aulas.json · aulas/_template.html · build/index.template.html
  Saídas:    aulas/aula-01.html … aula-12.html · index.html · guia.html

  Sem dependências. Contrato de marcação: DESIGN.md §5 e §6.
*/
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const write = (p, s) => { writeFileSync(join(ROOT, p), s, "utf8"); console.log("  escrito", p); };

const data = JSON.parse(read("content/aulas.json"));
const { curso, aulas } = data;
const LESSON_TPL = read("aulas/_template.html");
const HOME_TPL = read("build/index.template.html");

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
};
const mapa = (curso.secoes_extras.find((s) => /mapa do curso/i.test(s.titulo))?.blocos || [])
  .find((b) => b.tipo === "tabela")?.linhas || [];
const modules = [];
for (const a of aulas) {
  let m = modules[modules.length - 1];
  if (!m || m.tema !== a.subtitulo_ou_tema) {
    const row = mapa.find((r) => r[1] === a.subtitulo_ou_tema);
    m = { idx: modules.length + 1, tema: a.subtitulo_ou_tema, curto: SHORT[a.subtitulo_ou_tema] || a.subtitulo_ou_tema.split(/[ ,]/)[0], entrega: row ? row[2] : "", aulas: [] };
    modules.push(m);
  }
  m.aulas.push(a); a._mod = m;
}
const rangeLabel = (m) => {
  const f = nn(m.aulas[0].numero), l = nn(m.aulas[m.aulas.length - 1].numero);
  return f === l ? `Aula ${f}` : `Aulas ${f}–${l}`;
};

/* Duração: o guia só dá a referência editorial geral ("Notas de produção"). */
const durShort = (a) => {
  const m = String(a.duracao || "").match(/(\d+)\s*a\s*(\d+)\s*min/i);
  return m ? `${m[1]}–${m[2]} min` : "";
};
const nivel = (() => { const m = curso.subtitulo.match(/n[ií]vel\s+([a-zà-ú]+)/i); return m ? m[1][0].toUpperCase() + m[1].slice(1) : ""; })();
const introBy = (prefix) => curso.introducao.find((p) => p.startsWith(prefix)) || "";
const afterLabel = (p) => p.replace(/^[^:]+:\s*/, "");

/* ------------------------------------------------------------ blocos (DESIGN §6) */
function listItems(itens, ctx) {
  const numbered = itens.length > 0 && itens.every((t) => /^\d{2}\s/.test(t));
  return itens.map((t) => {
    // Índice pedagógico: "01 | Título" vira link para a aula
    const idx = t.match(/^(\d{2})\s*\|\s*(.+)$/);
    if (idx && aulas.some((a) => nn(a.numero) === idx[1])) {
      return `<li><a href="${ctx.root}aulas/aula-${idx[1]}.html">Aula ${idx[1]} · ${esc(idx[2])}</a></li>`;
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

function switcherHtml(prefix, pad) {
  return aulas.map((a) => `${pad}<li><a href="${prefix}aula-${nn(a.numero)}.html" data-aula="${nn(a.numero)}"><span class="switcher__no">${nn(a.numero)}</span><span class="switcher__t">${esc(a.titulo)}</span></a></li>`).join("\n");
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

/* ------------------------------------------------------------ aulas */
function buildLesson(a, i) {
  const N = nn(a.numero);
  const ctx = { id: idMaker(), ex: 0, tab: 0, root: "../" };
  ["obj-title", "conteudo", "switcher-panel", "menu-mobile"].forEach((r) => ctx.id(r)); // ids já usados pelo template
  const { html, toc } = renderBlocks(a.blocos, ctx);
  let s = LESSON_TPL;

  s = replaceOnce(s, RE.title, `<title>Aula ${N} · ${esc(a.titulo)} — Edição de Vídeos com Claude</title>`, "title");
  s = replaceOnce(s, RE.desc, `<meta name="description" content="${esc(a.subtitulo_ou_tema)} — aula ${N} do guia do professor Edição de Vídeos com Claude: ${esc(a.titulo)}.">`, "description");
  s = replaceOnce(s, RE.body, `<body class="page-lesson" data-aula="${N}">`, "body");
  s = replaceOnce(s, RE.switcherGrid, (_, o, c) => `${o}\n${switcherHtml("", "            ")}${c}`, "switcher");
  s = replaceOnce(s, RE.switcherCur, `<span class="switcher__current">${N}</span>`, "switcher__current");

  // hero da aula: preenche os placeholders do próprio template
  s = s.replace("Módulo {{MODULO}}", `Módulo ${a._mod.idx} · ${esc(a._mod.curto)}`);
  s = s.replace(`<span class="lesson-hero__no" aria-hidden="true">{{NN}}</span>`, `<span class="lesson-hero__no" aria-hidden="true">${N}</span>`);
  s = s.replace(`<span class="sr-only">Aula {{NN}}: </span>{{TITULO}}`, `<span class="sr-only">Aula ${N}: </span>${esc(a.titulo)}`);
  s = replaceOnce(s, /<p class="lesson-hero__theme">[^<]*<\/p>/, `<p class="lesson-hero__theme">${esc(a.subtitulo_ou_tema)}</p>`, "theme");
  const meta = [
    durShort(a) && `<div><dt>Duração de referência</dt><dd>≈ ${durShort(a)} <span class="lesson-meta__note">(estimativa editorial do guia)</span></dd></div>`,
    a._mod.entrega && `<div><dt>Entrega do módulo</dt><dd>${esc(a._mod.entrega)}</dd></div>`,
    nivel && `<div><dt>Nível</dt><dd>${esc(nivel)}</dd></div>`,
  ].filter(Boolean).map((l) => "          " + l).join("\n");
  s = replaceOnce(s, /(<dl class="lesson-meta">)[\s\S]*?(\n\s*<\/dl>)/, (_, o, c) => `${o}\n${meta}${c}`, "lesson-meta");
  s = replaceOnce(s, /(<ol class="objectives__list">)[\s\S]*?(\n\s*<\/ol>)/,
    (_, o, c) => `${o}\n${a.objetivos.map((t) => `            <li>${inline(t)}</li>`).join("\n")}${c}`, "objectives");

  s = replaceOnce(s, RE.toc, (_, o, c) => `${o}\n${tocHtml(toc, "            ")}${c}`, "toc");
  s = replaceOnce(s, RE.article, (_, o, c) => `${o}\n${indent(html, "        ")}${c}`, "article");

  const prev = aulas[i - 1], next = aulas[i + 1];
  const prevHtml = prev
    ? `<a class="pager__link pager__link--prev" href="aula-${nn(prev.numero)}.html" rel="prev">
        <span class="pager__dir">← Aula anterior</span>
        <span class="pager__no">${nn(prev.numero)}</span>
        <span class="pager__title">${esc(prev.titulo)}</span>
      </a>`
    : `<a class="pager__link pager__link--prev" href="../index.html#aulas">
        <span class="pager__dir">← Início</span>
        <span class="pager__title">Todas as aulas</span>
      </a>`;
  const nextHtml = next
    ? `<a class="pager__link pager__link--next" href="aula-${nn(next.numero)}.html" rel="next">
        <span class="pager__dir">Próxima aula →</span>
        <span class="pager__no">${nn(next.numero)}</span>
        <span class="pager__title">${esc(next.titulo)}</span>
      </a>`
    : `<a class="pager__link pager__link--next" href="../index.html#aulas">
        <span class="pager__dir">Fim do curso →</span>
        <span class="pager__title">Voltar a todas as aulas</span>
      </a>`;
  s = replaceOnce(s, RE.pager, (_, o, c) => `${o}\n      ${prevHtml}\n      ${nextHtml}${c}`, "pager");
  s = stripBuilderComments(s);
  if (/\{\{/.test(s)) throw new Error(`Placeholder não preenchido na aula ${N}: ${s.match(/\{\{[^}]*\}\}/)[0]}`);
  write(`aulas/aula-${N}.html`, s);
  return { N, toc, ctx };
}

/* ------------------------------------------------------------ guia.html */
function buildGuide() {
  const ctx = { id: idMaker(), ex: 0, tab: 0, root: "" };
  ["conteudo", "switcher-panel", "menu-mobile"].forEach((r) => ctx.id(r));
  const parts = []; const toc = [];

  // Seção 0: a apresentação do curso (introducao), completa
  const sobreId = ctx.id("Sobre este guia");
  toc.push({ id: sobreId, texto: "Sobre este guia" });
  const sobre = [`<h2 class="b-titulo" id="${sobreId}">Sobre este guia</h2>`];
  for (const p of curso.introducao) {
    if (p.startsWith("Método de cada aula")) {
      const steps = [...afterLabel(p).matchAll(/\d+\.\s*([^.]+)\./g)].map((m) => m[1].trim());
      sobre.push(`<p class="b-paragrafo"><strong>Método de cada aula:</strong></p>`);
      sobre.push(`<ol class="b-lista-num">${steps.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`);
    } else {
      sobre.push(`<p class="b-paragrafo">${inline(p, { label: true })}</p>`);
    }
  }
  parts.push(sobre.join("\n\n"));

  for (const sec of curso.secoes_extras) {
    const id = ctx.id(sec.titulo);
    toc.push({ id, texto: sec.titulo });
    ctx.forceSub = true; ctx.tableLabel = sec.titulo;
    const { html } = renderBlocks(sec.blocos, ctx);
    parts.push(`<h2 class="b-titulo" id="${id}">${esc(sec.titulo)}</h2>\n\n${html}`);
  }
  const html = parts.join("\n\n");
  const nApendices = curso.secoes_extras.filter((s) => /^ap[êe]ndice/i.test(s.titulo)).length;

  let s = LESSON_TPL;
  s = replaceOnce(s, RE.title, `<title>Guia de referência — Edição de Vídeos com Claude</title>`, "title");
  s = replaceOnce(s, RE.desc, `<meta name="description" content="Mapa do curso, índice pedagógico, guia de plataformas, catálogo de Skills, instalação segura, fluxo técnico e glossário do guia do professor Edição de Vídeos com Claude.">`, "description");
  s = replaceOnce(s, RE.body, `<body class="page-lesson page-guide">`, "body");
  // caminhos: a página fica na raiz do site
  s = s.replace(/(href|src)="\.\.\//g, '$1="');
  s = replaceOnce(s, RE.switcherGrid, (_, o, c) => `${o}\n${switcherHtml("aulas/", "            ")}${c}`, "switcher");
  s = replaceOnce(s, RE.switcherCur, `<span class="switcher__current">—</span>`, "switcher__current");
  s = s.replace(/<a href="guia\.html">Referência<\/a>/g, `<a href="guia.html" aria-current="page">Referência</a>`);

  const hero = `<header class="lesson-hero">
      <canvas class="hero__canvas hero__canvas--quiet" data-hero-canvas aria-hidden="true"></canvas>
      <div class="container lesson-hero__inner">
        <div class="lesson-hero__top">
          <p class="lesson-hero__crumb"><a href="index.html">Início</a> <span aria-hidden="true">/</span> Referência do professor</p>
          <button class="motion-toggle" type="button" data-motion-toggle hidden><span data-motion-text>Pausar animação</span></button>
        </div>
        <div class="lesson-hero__head">
          <span class="lesson-hero__no" aria-hidden="true">§</span>
          <div>
            <h1 class="lesson-hero__title">Guia de referência</h1>
            <p class="lesson-hero__theme">${esc(curso.titulo)}: ${esc(curso.subtitulo.replace(" | ", " · "))}.</p>
          </div>
        </div>
        <dl class="lesson-meta">
          <div><dt>Seções</dt><dd>${toc.length}</dd></div>
          <div><dt>Apêndices</dt><dd>${nApendices}</dd></div>
          ${nivel ? `<div><dt>Nível</dt><dd>${esc(nivel)}</dd></div>` : ""}
        </dl>
      </div>
    </header>`;
  s = replaceOnce(s, RE.hero, hero, "hero");
  s = s.replace(`<aside class="toc" aria-label="Nesta aula">`, `<aside class="toc" aria-label="Nesta página">`);
  s = s.replace(`<p class="toc__title">Nesta aula</p>`, `<p class="toc__title">Nesta página</p>`);
  s = replaceOnce(s, RE.toc, (_, o, c) => `${o}\n${tocHtml(toc, "            ")}${c}`, "toc");
  s = replaceOnce(s, RE.article, (_, o, c) => `${o}\n${indent(html, "        ")}${c}`, "article");
  const first = aulas[0];
  s = replaceOnce(s, RE.pager, (_, o, c) => `${o.replace("Navegação entre aulas", "Continuar")}
      <a class="pager__link pager__link--prev" href="index.html#aulas">
        <span class="pager__dir">← Início</span>
        <span class="pager__title">Todas as aulas</span>
      </a>
      <a class="pager__link pager__link--next" href="aulas/aula-${nn(first.numero)}.html">
        <span class="pager__dir">Começar →</span>
        <span class="pager__no">${nn(first.numero)}</span>
        <span class="pager__title">${esc(first.titulo)}</span>
      </a>${c}`, "pager");
  s = stripBuilderComments(s);
  if (/\{\{/.test(s)) throw new Error("Placeholder não preenchido no guia");
  write("guia.html", s);
}

/* ------------------------------------------------------------ index.html */
function sectionAfter(a, titulo) {
  const i = a.blocos.findIndex((b) => b.tipo === "titulo" && b.texto === titulo);
  return i < 0 ? null : a.blocos[i + 1];
}
function computeStats() {
  const comandos = aulas.filter((a) => a.blocos.some((b) => b.tipo === "titulo" && b.texto === "Comando de demonstração")).length;
  const checklist = aulas.reduce((n, a) => n + ((sectionAfter(a, "Checklist do professor") || {}).itens || []).length, 0);
  const exercicios = aulas.reduce((n, a) => n + a.blocos.filter((b) => b.tipo === "exercicio").length, 0);
  const stats = [
    ["Aulas", aulas.length],
    ["Módulos", modules.length],
    ["Comandos de demonstração", comandos],
    ["Itens de checklist do professor", checklist],
  ];
  if (exercicios) stats.push(["Exercícios", exercicios]); // só aparece se o conteúdo tiver exercícios
  return stats;
}

function buildHome() {
  const stats = computeStats();
  const notas = introBy("Notas de produção");
  const papel = introBy("Papel do professor");
  const metodo = introBy("Método de cada aula");
  const prereq = introBy("Pré-requisito");
  const labelled = [notas, papel, metodo, prereq];
  const plain = curso.introducao.filter((p) => !labelled.includes(p));
  const lead = plain.find((p) => /aulas/i.test(p)) || plain[0] || "";
  const identidade = plain.filter((p) => p !== lead);

  const subtitle = esc(curso.subtitulo).replace(" | ", " · ").replace(/(\d+ aulas)/, "<em>$1</em>");
  const heroTabs = modules.map((m, k) => `          <button class="hero-tab" role="tab" aria-selected="${k === 0}" aria-controls="mod-panel" id="mod-${k + 1}" data-index="${k}"${k ? ' tabindex="-1"' : ""}>
            <span class="hero-tab__bar"><span class="hero-tab__fill"></span></span>
            <span class="hero-tab__no">${nn(k + 1)}</span><span class="hero-tab__name">${esc(m.curto)}</span>
          </button>`).join("\n");
  const panelTexts = modules.map((m) => `${rangeLabel(m)}: ${m.tema}.${m.entrega ? ` Entrega: ${m.entrega.toLowerCase()}.` : ""}`);

  const tracks = modules.map((m) => `          <div class="track-group">
            <h3 class="track__label"><span class="track__id">V${m.idx}</span> ${esc(m.curto)}</h3>
            <ol class="track"${m.aulas[0].numero > 1 ? ` start="${m.aulas[0].numero}"` : ""}>
${m.aulas.map((a) => `              <li><a class="clip reveal" href="aulas/aula-${nn(a.numero)}.html" data-aula="${nn(a.numero)}">
                <span class="clip__no">${nn(a.numero)}</span>
                <span class="clip__title">${esc(a.titulo)}</span>
                <span class="clip__meta">${esc(m.curto)}${durShort(a) ? ` · ≈ ${durShort(a)}` : ""}</span>
                <span class="clip__done" aria-hidden="true"></span><span class="sr-only" data-done-label></span>
              </a></li>`).join("\n")}
            </ol>
          </div>`).join("\n");

  const steps = [...afterLabel(metodo).matchAll(/\d+\.\s*([^.]+)\./g)].map((m) => m[1].trim());
  const guideSteps = steps.map((t, k) => `          <li class="reveal">
            <h3>${esc(t)}</h3>
            <p>Passo ${nn(k + 1)} de ${nn(steps.length)}</p>
          </li>`).join("\n");

  // "Em cada aula": seções h2 presentes em todas as aulas
  const common = aulas[0].blocos.filter((b, i, arr) => b.tipo === "titulo" && !(arr[i - 1] && arr[i - 1].tipo === "titulo"))
    .map((b) => b.texto.replace(/^AULA \d+ \/ /, ""))
    .filter((t) => aulas.every((a) => a.blocos.some((b) => b.tipo === "titulo" && b.texto.replace(/^AULA \d+ \/ /, "") === t)));
  const sw = ["clay", "ink", "neon", "amber"];
  const kit = ["Objetivo da aula", ...common.map((t) => (t === "NARRAÇÃO" ? "Texto para narração" : t))]
    .map((t, k) => `            <li><span class="kit__swatch kit__swatch--${sw[k % 4]}" aria-hidden="true"></span>${esc(t)}</li>`).join("\n");

  const statsHtml = stats.map(([l, v]) => `        <div class="stat"><dt>${esc(l)}</dt><dd data-count="${v}">${v}</dd></div>`).join("\n");
  const introHtml = [
    `        <p class="lead">${inline(lead)}</p>`,
    prereq && `        <p>${inline(prereq, { label: true })}</p>`,
  ].filter(Boolean).join("\n");

  const vals = {
    CURSO_TITULO: esc(curso.titulo),
    N_AULAS: String(aulas.length),
    META_DESC: esc(lead),
    H1_SR: `${esc(curso.titulo)}: ${esc(curso.subtitulo.replace(" | ", ", "))}`,
    HERO_LEAD: `${subtitle}${/[.!?]$/.test(curso.subtitulo) ? "" : "."}`,
    HERO_TABS: heroTabs,
    PANEL_TEXTS: escAttrSingle(JSON.stringify(panelTexts)),
    PANEL_FIRST: esc(panelTexts[0]),
    STATS: statsHtml,
    INTRO_TEXT: introHtml,
    TRACKS: tracks,
    DURATION_NOTE: inline(notas, { label: true }),
    GUIDE_LEAD: esc(afterLabel(papel)),
    GUIDE_STEPS: guideSteps,
    KIT: kit,
    CTA_TITLE: `Comece pela aula 01: ${esc(aulas[0].titulo)}.`,
    FOOTER_NOTE: [...identidade.map(esc), "Curso independente sobre o uso do Claude na edição de vídeos. Não é um produto oficial nem afiliado à Anthropic. Claude é uma marca da Anthropic, PBC."].join(" "),
  };
  let s = HOME_TPL.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, k) => {
    if (!(k in vals)) throw new Error(`Placeholder sem valor no index: ${k}`);
    return vals[k];
  });
  write("index.html", s);
  return stats;
}

/* ------------------------------------------------------------ run */
console.log("Gerando site a partir de content/aulas.json…");
aulas.forEach((a, i) => buildLesson(a, i));
buildGuide();
const stats = buildHome();
console.log("Números da home:", stats.map(([l, v]) => `${l}=${v}`).join(", "));
console.log("Módulos:", modules.map((m) => `${rangeLabel(m)} ${m.curto}`).join(" | "));
