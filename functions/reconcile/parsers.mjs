// Разбор публичных калькуляторов компаний. Каждый парсер получает текст страницы/скрипта
// и возвращает «то, что сейчас на сайте» в формате, сравнимом с data/tariffs.json.
// Парсеры только читают — данные в tariffs.json они не меняют.

const num = (s) => Number(String(s).trim());

export const SOURCES = {
  tasnim: "https://tasnim.ing/",
  kupitak: "https://kupitak.ru/",
  lariba: "https://newcalc.lariba.ru/rates/default.json",
  vatan: "https://vatan-rassrochka.ru/",
  alBaraka: "https://al-baraka.ru/payment-plan.js",
};

// Tasnim: window.cartTariffs = { express: { coefficients: { "1": 1.0625, ... } }, ... }
export function parseTasnim(html) {
  const start = html.indexOf("window.cartTariffs");
  if (start < 0) throw new Error("Tasnim: не найден window.cartTariffs");
  const chunk = html.slice(start, start + 20000);
  const out = {};
  for (const m of chunk.matchAll(/(economy|standard|express|garant)\s*:\s*\{[\s\S]*?coefficients\s*:\s*\{([\s\S]*?)\}/g)) {
    const coefs = {};
    for (const p of m[2].matchAll(/"(\d+)"\s*:\s*([\d.]+)/g)) coefs[p[1]] = num(p[2]);
    out[m[1]] = coefs;
  }
  if (!Object.keys(out).length) throw new Error("Tasnim: коэффициенты не разобраны");
  return out;
}

// КупиТак (и FinCity на его сайте): tariffs: { ingushetia: {...markupPercents: [..]}, chechnya: {...} }
export function parseKupitak(html) {
  const out = {};
  for (const region of ["ingushetia", "chechnya"]) {
    const m = html.match(new RegExp(`${region}\\s*:\\s*\\{([\\s\\S]*?markupPercents\\s*:\\s*\\[([^\\]]+)\\][\\s\\S]*?)\\}`));
    if (!m) continue;
    const body = m[1];
    const pick = (k) => {
      const x = body.match(new RegExp(`${k}\\s*:\\s*([\\d.]+)`));
      return x ? num(x[1]) : null;
    };
    out[region] = {
      markupPercents: m[2].split(",").map(num),
      minDownPercent: pick("minDownPercent"),
      maxCost: pick("maxCost"),
      minTerm: pick("minTerm"),
    };
  }
  if (!out.ingushetia) throw new Error("КупиТак: не найдена сетка наценок");
  return out;
}

// LaRiba: JSON-массив тарифов.
export function parseLariba(text) {
  const arr = JSON.parse(text);
  return arr.filter((t) => t.enabled !== false).map((t) => ({
    name: t.name,
    percent: t.percent,
    minGoodsCost: t.minGoodsCost,
    maxGoodsCost: t.maxGoodsCost,
    zeroInitialPaymentUpTo: t.zeroInitialPaymentUpTo,
    minInitialPaymentPercent: t.minInitialPaymentPercent,
    maxInitialPaymentPercent: t.maxInitialPaymentPercent,
    maxFinancingAmount: t.maxFinancingAmount,
    minContractMonthCount: t.minContractMonthCount,
    maxContractMonthCount: t.maxContractMonthCount,
    minMarkup: t.minMarkup,
  }));
}

// Ватан: var proc1 = 500; ... var proc5 = 42; obsluj = 800 / 300 внутри updateValue.
export function parseVatan(html) {
  const v = (name) => {
    const m = html.match(new RegExp(`var\\s+${name}\\s*=\\s*([\\d.]+)`));
    return m ? num(m[1]) : null;
  };
  const fees = [...html.matchAll(/obsluj\s*=\s*(\d+)\s*;/g)].map((m) => num(m[1]));
  const res = { proc1: v("proc1"), proc2: v("proc2"), proc3: v("proc3"), proc4: v("proc4"), proc5: v("proc5"), fees };
  if (res.proc5 === null) throw new Error("Ватан: не найдены proc1–proc5");
  return res;
}

// Al-Baraka: const annualRates = Object.freeze({ ideal: 0.40, standard: 0.48 });
export function parseAlBaraka(js) {
  const m = js.match(/annualRates\s*=\s*Object\.freeze\(\{([^}]*)\}/);
  if (!m) throw new Error("Al-Baraka: не найден annualRates");
  const out = {};
  for (const p of m[1].matchAll(/(\w+)\s*:\s*([\d.]+)/g)) out[p[1]] = num(p[2]);
  const ceil100 = /Math\.ceil\([^;]*\/\s*100\)\s*\*\s*100/.test(js);
  return { rates: out, ceil100 };
}

// ---------- Сравнение с tariffs.json ----------
const close = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-4;

function diffTable(label, expected, actual, out) {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const k of keys) {
    if (expected[k] === undefined) out.push(`${label}: на сайте появился срок ${k} мес. (${actual[k]})`);
    else if (actual[k] === undefined) out.push(`${label}: на сайте пропал срок ${k} мес.`);
    else if (!close(expected[k], actual[k])) out.push(`${label}, ${k} мес.: у нас ${expected[k]}, на сайте ${actual[k]}`);
  }
}

export function compareAll(data, site) {
  const diffs = [];
  const T = (id) => data.tariffs.find((t) => t.id === id);

  if (site.tasnim) {
    const map = { express: "tasnim-express", standard: "tasnim-standard", economy: "tasnim-economy", garant: "tasnim-garant" };
    for (const [key, id] of Object.entries(map)) {
      const t = T(id);
      if (!site.tasnim[key]) { diffs.push(`Tasnim: на сайте нет тарифа ${key}`); continue; }
      // Сравниваем только сроки, которые мы показываем
      const inRange = ([m]) => Number(m) >= t.min_term && Number(m) <= t.max_term;
      const actual = Object.fromEntries(Object.entries(site.tasnim[key]).filter(inRange));
      const expected = Object.fromEntries(Object.entries(t.rate).filter(inRange));
      diffTable(`Tasnim ${t.tariff}`, expected, actual, diffs);
    }
  }

  if (site.kupitak) {
    const asTable = (arr) => Object.fromEntries(arr.map((v, i) => [String(i + 1), v]));
    const k = T("kupitak");
    diffTable("КупиТак", k.rate, asTable(site.kupitak.ingushetia.markupPercents), diffs);
    if (site.kupitak.ingushetia.maxCost && site.kupitak.ingushetia.maxCost !== k.max_price) diffs.push(`КупиТак: макс. сумма у нас ${k.max_price}, на сайте ${site.kupitak.ingushetia.maxCost}`);
    if (site.kupitak.chechnya) {
      const f = T("fincity");
      diffTable("FinCity", f.rate, asTable(site.kupitak.chechnya.markupPercents), diffs);
      if (site.kupitak.chechnya.minTerm && site.kupitak.chechnya.minTerm !== f.min_term) diffs.push(`FinCity: мин. срок у нас ${f.min_term}, на сайте ${site.kupitak.chechnya.minTerm}`);
      if (site.kupitak.chechnya.maxCost && site.kupitak.chechnya.maxCost !== f.max_price) diffs.push(`FinCity: макс. сумма у нас ${f.max_price}, на сайте ${site.kupitak.chechnya.maxCost}`);
    } else {
      diffs.push("FinCity: сетка пропала с сайта kupitak.ru");
    }
  }

  if (site.lariba) {
    const ours = data.tariffs.filter((t) => t.company === "lariba");
    for (const s of site.lariba) {
      const t = ours.find((o) => o.tariff === s.name);
      if (!t) { diffs.push(`LaRiba: на сайте новый тариф «${s.name}» (${s.percent}%/мес)`); continue; }
      if (!close(t.rate.monthly * 100, s.percent)) diffs.push(`LaRiba ${s.name}: у нас ${t.rate.monthly * 100}%/мес, на сайте ${s.percent}%`);
      const pairs = [["min_price", s.minGoodsCost], ["max_price", s.maxGoodsCost], ["zero_down_up_to", s.zeroInitialPaymentUpTo], ["min_down_pct", s.minInitialPaymentPercent], ["max_down_pct", s.maxInitialPaymentPercent], ["max_financing", s.maxFinancingAmount], ["min_term", s.minContractMonthCount], ["max_term", s.maxContractMonthCount]];
      for (const [k, v] of pairs) if (v !== undefined && v !== t[k]) diffs.push(`LaRiba ${s.name}: ${k} у нас ${t[k]}, на сайте ${v}`);
      if (s.minMarkup !== undefined && s.minMarkup !== t.rate.min_markup) diffs.push(`LaRiba ${s.name}: мин. наценка у нас ${t.rate.min_markup}, на сайте ${s.minMarkup}`);
    }
    for (const t of ours) if (!site.lariba.some((s) => s.name === t.tariff)) diffs.push(`LaRiba: тариф «${t.tariff}» пропал с сайта`);
  }

  if (site.vatan) {
    const r = T("vatan").rate;
    const ours = { proc1: r.bands[0].per_month, proc2: r.bands[1].per_month, proc3: r.bands[2].per_month, proc4: r.bands[3].per_month, proc5: r.annual_above * 100 };
    for (const [k, v] of Object.entries(ours)) if (!close(v, site.vatan[k])) diffs.push(`Ватан ${k}: у нас ${v}, на сайте ${site.vatan[k]}`);
    for (const fee of [r.service_fee, r.service_fee_zero_down]) if (!site.vatan.fees.includes(fee)) diffs.push(`Ватан: плата за обслуживание ${fee} ₽ не найдена на сайте (там ${site.vatan.fees.join(", ")})`);
  }

  if (site.alBaraka) {
    const map = { standard: "al-baraka-standard", ideal: "al-baraka-ideal" };
    for (const [k, id] of Object.entries(map)) {
      if (!close(T(id).rate.annual, site.alBaraka.rates[k])) diffs.push(`Al-Baraka ${k}: у нас ${T(id).rate.annual}, на сайте ${site.alBaraka.rates[k]}`);
    }
    if (!site.alBaraka.ceil100) diffs.push("Al-Baraka: изменилось округление платежа (раньше вверх до 100 ₽)");
  }

  return diffs;
}

export function staleCompanies(data, now = new Date(), days = 30) {
  return data.companies
    .filter((c) => c.verified_at && (now - new Date(c.verified_at)) / 86400000 > days)
    .map((c) => `${c.name}: условия не перепроверялись больше ${days} дней (с ${c.verified_at})`);
}
