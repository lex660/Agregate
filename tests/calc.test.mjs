import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateTariff, compare, downLimits, outboundUrl, limitsSummary, isComputable } from "../src/assets/js/calc.js";

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
  const zero = { ...T("kupitak"), percentTable: { ...T("kupitak").percentTable, "3": 0 } };
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
  assert.deepEqual(pending, ["alif-chechnya", "finhub", "khalim", "rayhana", "safra"]);
});

test("Тариф без ставки показывает известные лимиты, а не пустоту", () => {
  const t = T("safra-base");
  assert.equal(isComputable(t), false);
  const r = evaluateTariff(t, { price: 100000, down: 30000, term: 6 });
  assert.equal(r.status, "pending");
  assert.match(r.note, /Известные условия/);
  assert.match(r.note, /срок 1–12 мес\./);
  assert.equal(r.markup, undefined);
});

test("Каждый тариф имеет checkedAt, source и provenance; каждая компания — поле юрлица", () => {
  for (const t of data.tariffs) {
    assert.match(t.checkedAt || "", /^\d{4}-\d{2}-\d{2}$/, t.id);
    assert.ok(t.source, t.id);
    assert.ok(t.provenance && t.provenance.default, `${t.id}: нет provenance.default`);
    assert.match(t.provenance.default, /^(primary|secondary:)/, t.id);
    assert.ok(Array.isArray(t.regions) && t.regions.length, `${t.id}: regions должен быть непустым массивом`);
    assert.ok(data.companies.some((c) => c.id === t.company), `компания ${t.company}`);
  }
  for (const c of data.companies) {
    assert.ok("legal_entity" in c && "inn" in c, c.id);
    // Сайт может быть на http (у Алиф Чечня так) — но исходящую ссылку движок обязан отклонить.
    if (c.url && !c.url.startsWith("https://")) {
      assert.equal(outboundUrl(c, { region: "chechnya" }, "example.org"), null, `${c.id}: http-ссылка должна быть отклонена`);
    }
  }
});

// ---------- Схема: разные ограничения не сводятся в одно поле ----------

test("Схема: стоимость товара и сумма финансирования — разные поля, соседнее не подставляется", () => {
  const t = T("lariba-super");
  assert.equal(t.maxGoodsCost, 1000000);
  assert.equal(t.maxFinancingAmount, 400000);
  assert.notEqual(t.maxGoodsCost, t.maxFinancingAmount);
  // Ни одно поле лимитов не должно быть скопировано из соседнего по смыслу.
  for (const x of data.tariffs) {
    if (x.maxGoodsCost && x.maxFinancingAmount && x.maxGoodsCost === x.maxFinancingAmount) {
      assert.fail(`${x.id}: maxGoodsCost и maxFinancingAmount совпадают — проверьте, не подставлено ли одно вместо другого`);
    }
  }
});

test("Лимиты в тексте перечисляются по отдельности, а не одним «до N ₽»", () => {
  const s = limitsSummary(T("lariba-super"));
  assert.match(s, /товар от 1 000 ₽ до 1 000 000 ₽/);
  assert.match(s, /финансирование до 400 000 ₽/);
  assert.match(s, /без взноса при товаре до 50 000 ₽/);
});

// ---------- Формула наценки: наценка = финансирование × ставка% × срок ----------

test("ЛяРиба Супер, контрольный случай: 1 000 000 / 737 800 / 12 → наценка 119 563 ₽, платёж 31 814 ₽, итого 1 119 563 ₽", () => {
  const t = T("lariba-super");
  const r = evaluateTariff(t, { price: 1000000, down: 737800, term: 12 });
  assert.equal(r.status, "ok");
  assert.equal(r.financed, 262200);
  assert.equal(r.markup, 119563);
  assert.equal(r.monthly, 31814);
  assert.equal(r.total, 1119563);
});

test("ЛяРиба Супер: наценка равна финансирование × ставка% × срок на всём допустимом диапазоне", () => {
  const t = T("lariba-super");
  for (const [price, down, term] of [[1000000, 737800, 12], [500000, 125000, 6], [400000, 100000, 1], [1000000, 600000, 12]]) {
    const r = evaluateTariff(t, { price, down, term });
    assert.equal(r.status, "ok", `${price}/${down}/${term}: ${r.note}`);
    const expected = Math.round((r.financed * t.percent * term) / 100);
    assert.equal(r.markup, expected, `${price}/${down}/${term}`);
    assert.equal(r.total, price + r.markup);
    assert.equal(r.monthly, Math.round((r.total - r.down) / term));
  }
});

test("ЛяРиба Супер: товар за 1 000 000 ₽ требует взноса от 600 000 ₽ — это лимит финансирования, а не стоимости", () => {
  const t = T("lariba-super");
  const lim = downLimits(t, 1000000);
  assert.equal(lim.min, 600000); // 1 000 000 − maxFinancingAmount 400 000
  const r = evaluateTariff(t, { price: 1000000, down: 250000, term: 12 });
  assert.equal(r.status, "need_down");
  assert.match(r.note, /сумме финансирования/);
  assert.match(r.note, /400 000 ₽/);
});

test("ФинЛайт Старт: коэффициент 1,09 + 0,03 × срок сходится с расчётом на сайте (10 000 / 0 / 3 → итого 11 800 ₽)", () => {
  const r = evaluateTariff(T("finlight-start"), { price: 10000, down: 0, term: 3 });
  assert.equal(r.status, "ok");
  assert.equal(r.markup, 1800);
  assert.equal(r.total, 11800);
  assert.equal(r.monthly, 3933);
});

test("Кристалл Стандарт: 100 000 / 20 000 / 2 → наценка 7 200 ₽, итого 107 200 ₽", () => {
  const r = evaluateTariff(T("cristall-standard"), { price: 100000, down: 20000, term: 2 });
  assert.equal(r.status, "ok");
  assert.equal(r.markup, 7200);
  assert.equal(r.total, 107200);
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
