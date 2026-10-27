#!/usr/bin/env node
/* check-links.mjs — confere todos os href/src internos do HTML gerado (arquivo existe + âncora existe).
   node build/check-links.mjs */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lessonsIn = (dir) => existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => /^aula-\d\d\.html$/.test(f)).map((f) => `${dir}/${f}`) : [];
// professor: index, guia, aulas/ · aluno: aluno/index + aluno/aula-NN
const pages = ["index.html", "guia.html", ...lessonsIn("aulas"),
  ...(existsSync(join(ROOT, "aluno/index.html")) ? ["aluno/index.html"] : []), ...lessonsIn("aluno")];
const idsCache = new Map();
const idsOf = (file) => {
  if (!idsCache.has(file)) idsCache.set(file, new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(file);
};

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
    if (!existsSync(target)) { errors.push(`${page}: arquivo inexistente -> ${url}`); continue; }
    if (frag && target.endsWith(".html") && !idsOf(target).has(frag)) errors.push(`${page}: âncora inexistente -> ${url}`);
  }
}
console.log(`${pages.length} páginas · ${checked} links internos conferidos · ${external} externos ignorados`);
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("OK: nenhum link interno quebrado.");
