// Плановая сверка тарифов из GitHub Actions (.github/workflows/reconcile.yml) или вручную:
//   node scripts/reconcile.mjs [путь к отчёту.md]
// Читает публичные калькуляторы компаний и сравнивает с локальным data/tariffs.json.
// Код выхода: 0 — совпадает, 1 — есть расхождения или сайт не прочитался.
// Сама ничего не меняет: правка tariffs.json — только человеком через PR.
import { readFileSync, writeFileSync } from "node:fs";
import { reconcile, formatReport } from "../functions/reconcile/index.mjs";

const data = JSON.parse(readFileSync(new URL("../data/tariffs.json", import.meta.url), "utf8"));
const result = await reconcile(data);
const report = formatReport(result, { markdown: true });

console.log(report);
const out = process.argv[2];
if (out) writeFileSync(out, report + "\n");
process.exit(result.ok ? 0 : 1);
