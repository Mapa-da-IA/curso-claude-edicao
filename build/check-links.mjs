#!/usr/bin/env node
/* check-links.mjs — confere todos os href/src internos do HTML gerado (arquivo existe + âncora existe)
   e garante que nenhuma página do aluno aponta para um guia do professor.
   node build/check-links.mjs

   Páginas esperadas (DESIGN.md §10): index.html (escolha do nível) · avancado.html · guia.html · aulas/ · aluno/
   · iniciante/index.html · iniciante/guia.html · iniciante/aulas/ · iniciante/aluno/ */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lessonsIn = (dir) => existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => /^aula-\d\d\.html$/.test(f)).map((f) => `${dir}/${f}`) : [];
const LEVEL_BASES = ["", "iniciante/"];
const required = ["index.html"];
const pages = ["index.html"];
for (const b of LEVEL_BASES) {
  const profHome = b ? `${b}index.html` : "avancado.html";
  const set = [profHome, `${b}guia.html`, `${b}aluno/index.html`];
  required.push(...set);
  pages.push(...set, ...lessonsIn(`${b}aulas`), ...lessonsIn(`${b}aluno`));
  for (const d of ["aulas", "aluno"]) if (lessonsIn(`${b}${d}`).length !== 12) console.log(`Aviso: ${b}${d}/ tem ${lessonsIn(`${b}${d}`).length} aulas (esperado 12)`);
}
const missing = required.filter((p) => !existsSync(join(ROOT, p)));
if (missing.length) { console.log("Páginas faltando: " + missing.join(", ")); process.exit(1); }

const idsCache = new Map();
const idsOf = (file) => {
  if (!idsCache.has(file)) idsCache.set(file, new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(file);
};
const isStudent = (page) => /(^|\/)aluno\//.test(page);
const isGuide = (abs) => /(^|[\\/])guia\.html$/.test(abs);

let checked = 0, external = 0; const errors = [];
for (const page of pages) {
  const abs = join(ROOT, page);
  const html = readFileSync(abs, "utf8");
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const url = m[1].replace(/&amp;/g, "&");
    if (/^(https?:|mailto:|data:|tel:)/i.test(url)) { external++; continue; }
    checked++;
    const [path, frag] = url.split("#");
    const target = path ? resolve(dirname(abs), decodeURI(path)) : abs;
    if (!relative(ROOT, target).split(sep).every((p) => p !== "..")) { errors.push(`${page}: link para fora do site -> ${url}`); continue; }
    if (!existsSync(target)) { errors.push(`${page}: arquivo inexistente -> ${url}`); continue; }
    if (frag && target.endsWith(".html") && !idsOf(target).has(frag)) errors.push(`${page}: âncora inexistente -> ${url}`);
    if (isStudent(page) && (isGuide(target) || (frag === "guia" && !isStudent(relative(ROOT, target).split(sep).join("/")))))
      errors.push(`${page}: página do aluno aponta para o guia do professor -> ${url}`);
  }
}
console.log(`${pages.length} páginas · ${checked} links internos conferidos · ${external} externos ignorados`);
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("OK: nenhum link interno quebrado; nenhuma página do aluno aponta para o guia do professor.");
