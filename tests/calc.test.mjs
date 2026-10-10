import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateTariff, compare, downLimits, outboundUrl } from "../src/assets/js/calc.js";

const data = JSON.parse(readFileSync(new URL("../data/tariffs.json", import.meta.url)));
const T = (id) => {
  const t = data.tariffs.find((x) => x.id === id);
  assert.ok(t, `нет тарифа ${id}`);
  return t;
};

// ---------- Эталоны с сайтов компаний (проверено 10.10.2026) ----------

test("Al-Baraka Стандарт: 100 000 / 25 000 / 12 → 9 300 ₽, итого 136 600 ₽", () => {
  const r = evaluateTariff(T("al-baraka-standard"), { price: 100000, down: 25000, term: 12 });
  assert.equal(r.status, "ok");
  assert.equal(r.monthly, 9300);
  assert.equal(r.total, 136600);
});

test("Al-Baraka Стандарт: 100 000 / 50 000 / 6 → 10 400 ₽, итого 112 400 ₽ (взнос пользователя учитывается)", () => {
  const r = evaluateTariff(T("al-baraka-standard"), { price: 100000, down: 50000, term: 6 });
  assert.equal(r.status, "ok");
  assert.equal(r.monthly, 10400);
  assert.equal(r.total, 112400);
});

test("Al-Baraka Идеал: 100 000 / 25 000 / 6 → 15 000 ₽, итого 115 000 ₽", () => {
  const r = evaluateTariff(T("al-baraka-ideal"), { price: 100000, down: 25000, term: 6 });
  assert.equal(r.monthly, 15000);
  assert.equal(r.total, 115000);
});

// ---------- Формулы, воспроизведённые из кода калькуляторов компаний ----------

test("Tasnim Стандарт 140 000 / 70 000 / 3: наценка 10 087 ₽, платёж 26 696 ₽", () => {
  const r = evaluateTariff(T("tasnim-standard"), { price: 140000, down: 70000, term: 3 });
  assert.equal(r.markup, 10087);
  assert.equal(r.monthly, 26696);
});

test("Tasnim Гарант недоступен для покупки на 100 000 ₽", () => {
  const r = evaluateTariff(T("tasnim-garant"), { price: 100000, down: 30000, term: 12 });
  assert.equal(r.status, "unavailable");
});

test("Tasnim: минимальный взнос округляется вверх до 100 ₽", () => {
  assert.equal(downLimits(T("tasnim-express"), 33333).min, 8400);
});

test("КупиТак 140 000 / 70 000 / 6: наценка 23 800 ₽, платёж 15 633 ₽", () => {
  const r = evaluateTariff(T("kupitak"), { price: 140000, down: 70000, term: 6 });
  assert.equal(r.markup, 23800);
  assert.equal(r.monthly, 15633);
});

test("LaRiba Супер 100 000 / 25 000 / 6: наценка 17 100 ₽, платёж 15 350 ₽", () => {
  const r = evaluateTariff(T("lariba-super"), { price: 100000, down: 25000, term: 6 });
  assert.equal(r.markup, 17100);
  assert.equal(r.monthly, 15350);
});

test("LaRiba: без взноса до 50 000 ₽, минимальная наценка 500 ₽", () => {
  const r = evaluateTariff(T("lariba-super"), { price: 10000, down: 0, term: 1 });
  assert.equal(r.status, "ok");
  assert.equal(r.markup, 500);
});

test("LaRiba: финансирование не больше 400 000 ₽", () => {
  assert.equal(downLimits(T("lariba-super"), 1000000).min, 600000);
});

test("Ватан 100 000 / 30 000 / 6: 42% годовых + 300 ₽ обслуживание → наценка 15 000 ₽", () => {
  const r = evaluateTariff(T("vatan"), { price: 100000, down: 30000, term: 6 });
  assert.equal(r.markup, 15000);
  assert.equal(r.monthly, 14167);
});

test("Ватан: малая сумма — фиксированная плата за месяц и срок до 6 мес.", () => {
  const ok = evaluateTariff(T("vatan"), { price: 20000, down: 6000, term: 4 });
  assert.equal(ok.markup, 700 * 4 + 300);
  const long = evaluateTariff(T("vatan"), { price: 20000, down: 6000, term: 9 });
  assert.equal(long.status, "unavailable");
});

test("FinCity: срок от 4 месяцев, 6 мес. = 32%", () => {
  const short = evaluateTariff(T("fincity"), { price: 200000, down: 50000, term: 3 });
  assert.equal(short.status, "unavailable");
  const r = evaluateTariff(T("fincity"), { price: 200000, down: 50000, term: 6 });
  assert.equal(r.markup, 48000);
});

test("Нулевая ставка не теряется (ошибка старого воркера с LaRiba 0%)", () => {
  const zero = { ...T("kupitak"), rate: { ...T("kupitak").rate, "3": 0 } };
  const r = evaluateTariff(zero, { price: 30000, down: 0, term: 3 });
  assert.equal(r.status, "ok");
  assert.equal(r.markup, 0);
});

test("Взнос ниже минимума: компания показывается с пометкой, а не пропадает", () => {
  const r = evaluateTariff(T("al-baraka-standard"), { price: 100000, down: 0, term: 6 });
  assert.equal(r.status, "need_down");
  assert.equal(r.down, 25000);
  assert.match(r.note, /25 000/);
});

// ---------- Сравнение и данные ----------

test("Сравнение: лучшим отмечается только полностью подходящее предложение", () => {
  const res = compare(data, { region: "ingushetiya", price: 100000, down: 30000, term: 6 });
  const best = res.filter((r) => r.best);
  assert.equal(best.length, 1);
  assert.equal(best[0].status, "ok");
  const totals = res.filter((r) => r.status === "ok").map((r) => r.total);
  assert.deepEqual(totals, [...totals].sort((a, b) => a - b));
});

test("Компании без подтверждённых ставок показываются как «уточняется»", () => {
  const res = compare(data, { region: "chechnya", price: 100000, down: 30000, term: 6 });
  const pending = res.filter((r) => r.status === "pending").map((r) => r.company.id).sort();
  assert.deepEqual(pending, ["finhub", "khalim", "safra"]);
});

test("Каждый тариф имеет verified_at и source, каждая компания — поле юрлица", () => {
  for (const t of data.tariffs) {
    assert.match(t.verified_at || "", /^\d{4}-\d{2}-\d{2}$/, t.id);
    assert.ok(t.source, t.id);
    assert.ok(data.companies.some((c) => c.id === t.company), `компания ${t.company}`);
  }
  for (const c of data.companies) {
    assert.ok("legal_entity" in c && "inn" in c, c.id);
    if (c.url) assert.ok(c.url.startsWith("https://"), `${c.id}: только https`);
  }
});

test("Ссылка на компанию: только https и UTM-метки", () => {
  const c = data.companies.find((x) => x.id === "kupitak");
  const u = new URL(outboundUrl(c, { region: "ingushetiya" }, "example.ru"));
  assert.equal(u.hostname, "kupitak.ru");
  assert.equal(u.searchParams.get("utm_campaign"), "ingushetiya");
  assert.equal(outboundUrl({ url: "http://evil.example" }, { region: "x" }), null);
});

test("Тариф с индивидуальным расчётом не получает отметку «Выгоднее всего»", () => {
  const res = compare(data, { region: "ingushetiya", price: 100000, down: 25000, term: 6 });
  const best = res.find((r) => r.best);
  assert.ok(!best.tariff.individual);
  const ideal = res.find((r) => r.tariff?.id === "al-baraka-ideal");
  assert.match(ideal.note, /индивидуальный/);
});
