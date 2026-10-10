import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTasnim, parseKupitak, parseLariba, parseVatan, parseAlBaraka, compareAll, staleCompanies } from "../functions/reconcile/parsers.mjs";

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const data = JSON.parse(readFileSync(new URL("../data/tariffs.json", import.meta.url)));

function siteNow() {
  return {
    tasnim: parseTasnim(fx("tasnim.html")),
    kupitak: parseKupitak(fx("kupitak.html")),
    lariba: parseLariba(fx("lariba.json")),
    vatan: parseVatan(fx("vatan.html")),
    alBaraka: parseAlBaraka(fx("al-baraka.js")),
  };
}

test("Сверка: снимок сайтов на 10.10.2026 совпадает с tariffs.json", () => {
  assert.deepEqual(compareAll(data, siteNow()), []);
});

test("Сверка ловит изменение ставки LaRiba", () => {
  const site = siteNow();
  site.lariba[0].percent = 4.2;
  const d = compareAll(data, site);
  assert.equal(d.length, 1);
  assert.match(d[0], /LaRiba Супер/);
});

test("Сверка ловит изменение сетки КупиТак и новый тариф LaRiba", () => {
  const site = siteNow();
  site.kupitak.ingushetia.markupPercents[5] = 35;
  site.lariba.push({ name: "Надёжный", percent: 2.5 });
  const d = compareAll(data, site);
  assert.ok(d.some((x) => /КупиТак, 6 мес/.test(x)));
  assert.ok(d.some((x) => /новый тариф «Надёжный»/.test(x)));
});

test("Сверка ловит изменение Al-Baraka и Ватан", () => {
  const site = siteNow();
  site.alBaraka.rates.standard = 0.5;
  site.vatan.proc5 = 45;
  const d = compareAll(data, site);
  assert.ok(d.some((x) => /Al-Baraka standard/.test(x)));
  assert.ok(d.some((x) => /Ватан proc5/.test(x)));
});

test("Редизайн сайта (нет данных) — понятная ошибка, а не тишина", () => {
  assert.throws(() => parseTasnim("<html></html>"), /cartTariffs/);
  assert.throws(() => parseAlBaraka("console.log(1)"), /annualRates/);
});

test("Устаревшие проверки (больше 30 дней) попадают в отчёт", () => {
  const s = staleCompanies(data, new Date("2026-12-01"));
  assert.ok(s.length >= 6);
});
