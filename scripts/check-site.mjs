// Проверка собранного сайта перед релизом (npm run build && npm run check).
// Падает с кодом 1, если нарушено хотя бы одно правило проекта.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "_site";
const data = JSON.parse(readFileSync("data/tariffs.json", "utf8"));
const errors = [];
const warn = [];

const companyHosts = data.companies.filter((c) => c.url).map((c) => new URL(c.url).hostname);
const ALLOWED = new Set([...companyHosts, "wa.me", "mc.yandex.ru", "mc.yandex.com", "yastatic.net"]);
const FORBIDDEN = [/vsay-rassrochka/i, /workers\.dev/i, /googletagmanager/i, /google-analytics/i, /gtag\(/];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(OUT);
const pages = files.filter((f) => f.endsWith(".html") && !/(yandex_|google)[0-9a-f]+\.html$/.test(f));

for (const f of files.filter((f) => /\.(html|js|css|xml|txt)$/.test(f))) {
  const s = readFileSync(f, "utf8");
  for (const re of FORBIDDEN) if (re.test(s)) errors.push(`${f}: запрещённая ссылка или код (${re})`);
}

for (const f of pages) {
  const s = readFileSync(f, "utf8");
  if (!s.includes('http-equiv="Content-Security-Policy"')) errors.push(`${f}: нет CSP`);
  if (!s.includes('class="disclaimer"')) errors.push(`${f}: нет дисклеймера`);
  if (!/<title>[^<]{10,}<\/title>/.test(s)) errors.push(`${f}: пустой title`);
  for (const m of s.matchAll(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>/g)) {
    const tag = m[0];
    const u = new URL(m[1].replace(/&amp;/g, "&"));
    if (u.protocol !== "https:") errors.push(`${f}: ссылка не https — ${u}`);
    if (u.hostname.endsWith("github.io")) continue; // собственный адрес сайта
    if (!ALLOWED.has(u.hostname)) errors.push(`${f}: домен не в белом списке — ${u.hostname}`);
    if (!/rel="[^"]*noopener[^"]*nofollow/.test(tag)) errors.push(`${f}: внешняя ссылка без rel="noopener nofollow" — ${u.hostname}`);
  }
}

for (const f of walk("src/assets/js")) {
  const s = readFileSync(f, "utf8");
  if (/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(s)) errors.push(`${f}: запрещено вставлять HTML строкой`);
}

const sitemap = readFileSync(join(OUT, "sitemap.xml"), "utf8");
for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const path = new URL(m[1]).pathname.replace(/^\/Agregate/, "");
  if (!existsSync(join(OUT, path, "index.html"))) errors.push(`sitemap: нет страницы ${path}`);
}

const today = new Date();
for (const c of data.companies) {
  if (!c.checkedAt) { warn.push(`${c.name}: условия не подтверждены`); continue; }
  const age = (today - new Date(c.checkedAt)) / 86400000;
  if (age > 30) warn.push(`${c.name}: условия проверялись ${Math.floor(age)} дн. назад (больше 30)`);
}

for (const w of warn) console.log("⚠️ ", w);
if (errors.length) {
  for (const e of errors) console.error("❌", e);
  process.exit(1);
}
console.log(`✅ Проверка пройдена: страниц ${pages.length}, файлов ${files.length}.`);
