// Движок расчёта исламской рассрочки (мурабаха).
// Один и тот же файл работает в браузере и в тестах (node --test).
// Никаких ставок здесь нет: все цифры берутся из data/tariffs.json.

const STATUS_ORDER = { ok: 0, adjusted: 1, need_down: 2, unavailable: 3, pending: 4 };

function ceilTo(value, step) {
  if (!step || step <= 1) return Math.ceil(value);
  return Math.ceil(value / step) * step;
}

function floorTo(value, step) {
  if (!step || step <= 1) return Math.floor(value);
  return Math.floor(value / step) * step;
}

export function formatRub(n) {
  return Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ") + " ₽";
}

// Минимальный и максимальный взнос по правилам тарифа.
export function downLimits(t, price) {
  let min;
  if (t.zero_down_up_to && price <= t.zero_down_up_to) {
    min = 0;
  } else {
    min = ceilTo((price * (t.min_down_pct || 0)) / 100, t.down_round_up_to);
  }
  if (t.max_financing) min = Math.max(min, price - t.max_financing);
  let max = floorTo((price * (t.max_down_pct ?? 100)) / 100, t.down_round_up_to);
  if (t.min_financing) max = Math.min(max, price - t.min_financing);
  max = Math.min(max, price);
  return { min: Math.max(0, min), max };
}

function termRange(t) {
  return `от ${t.min_term} до ${t.max_term} мес.`;
}

// Наценка и платёж при уже выбранном взносе. Возвращает null, если срок не поддерживается.
export function computeCore(t, price, down, term) {
  const financed = price - down;
  const r = t.rate;
  let markup;
  let monthly;

  switch (t.rate_model) {
    case "coef_table": {
      const coef = r[String(term)];
      if (!coef) return null;
      const totalFinanced = Math.round(financed * coef);
      markup = totalFinanced - financed;
      monthly = Math.round(totalFinanced / term);
      break;
    }
    case "percent_table": {
      const pct = r[String(term)];
      if (pct === undefined || pct === null) return null; // 0 — допустимая ставка
      const exact = (financed * pct) / 100;
      markup = Math.round(exact);
      monthly = Math.round((financed + exact) / term);
      break;
    }
    case "monthly_flat": {
      const exact = Math.max(financed * r.monthly * term, r.min_markup || 0);
      markup = Math.round(exact);
      monthly = Math.round((financed + exact) / term);
      break;
    }
    case "annual_flat": {
      // Al-Baraka: платёж округляется вверх до 100 ₽, округление входит в наценку.
      monthly = Math.ceil((financed * (1 + (r.annual * term) / 12)) / term / 100) * 100;
      markup = monthly * term - financed;
      break;
    }
    case "vatan_bands": {
      const fee = down === 0 ? r.service_fee_zero_down : r.service_fee;
      const band = r.bands.find((b) => financed < b.below);
      let exact;
      if (band) {
        if (term > band.max_term) return { termLimit: band.max_term };
        exact = band.per_month * term + fee;
      } else {
        exact = ((financed * r.annual_above) / 12) * term + fee;
      }
      markup = Math.round(exact);
      monthly = Math.round((financed + exact) / term);
      break;
    }
    default:
      throw new Error(`Неизвестная модель расчёта: ${t.rate_model}`);
  }

  return { financed, markup, monthly, total: price + markup, down };
}

// Полный расчёт одного тарифа для пользователя.
export function evaluateTariff(t, input) {
  const { price, down, term } = input;
  const base = { tariff: t, status: "ok", note: null };
  const individualNote = t.individual ? "Компания пишет, что расчёт индивидуальный — уточните условия перед оформлением." : null;

  if (price < t.min_price || price > t.max_price) {
    return { ...base, status: "unavailable", note: `Сумма товара от ${formatRub(t.min_price)} до ${formatRub(t.max_price)}` };
  }
  if (term < t.min_term || term > t.max_term) {
    return { ...base, status: "unavailable", note: `Срок ${termRange(t)}` };
  }

  const lim = downLimits(t, price);
  if (lim.min > lim.max) {
    return { ...base, status: "unavailable", note: "Не подходит под лимиты суммы финансирования" };
  }

  let usedDown = down;
  let status = "ok";
  let note = null;
  if (down < lim.min) {
    usedDown = lim.min;
    status = "need_down";
    note = `Нужен взнос от ${formatRub(lim.min)}. Расчёт показан с этим взносом.`;
  } else if (down > lim.max) {
    usedDown = lim.max;
    status = "adjusted";
    note = `Максимальный взнос — ${formatRub(lim.max)}. Расчёт показан с ним.`;
  }

  const core = computeCore(t, price, usedDown, term);
  if (!core) {
    return { ...base, status: "unavailable", note: `Срок ${termRange(t)}` };
  }
  if (core.termLimit) {
    return { ...base, status: "unavailable", note: `Для такой суммы срок до ${core.termLimit} мес.` };
  }
  return { ...base, status, note: [note, individualNote].filter(Boolean).join(" ") || null, ...core };
}

// Все предложения региона, отсортированные: сначала подходящие по итоговой стоимости.
export function compare(data, input) {
  const companies = new Map(data.companies.map((c) => [c.id, c]));
  const results = [];

  for (const t of data.tariffs) {
    if (t.region !== input.region) continue;
    results.push({ ...evaluateTariff(t, input), company: companies.get(t.company) });
  }

  // Компании без подтверждённых ставок — показываем, но без расчёта.
  for (const c of data.companies) {
    if (c.confirmation !== "pending" || !c.regions.includes(input.region)) continue;
    results.push({ tariff: null, company: c, status: "pending", note: "Условия уточняются — ставки компания не публикует" });
  }

  results.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    if (a.total !== undefined && b.total !== undefined) return a.total - b.total;
    return a.company.name.localeCompare(b.company.name, "ru");
  });

  // «Выгоднее всего» — только для тарифов с открытыми условиями (не «индивидуальный расчёт»).
  const best = results.find((r) => r.status === "ok" && !r.tariff?.individual);
  if (best) best.best = true;
  return results;
}

// Ссылка на сайт компании: только https, только домен компании, с UTM-метками.
export function outboundUrl(company, input, siteHost) {
  if (!company.url) return null;
  let u;
  try {
    u = new URL(company.url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  u.searchParams.set("utm_source", siteHost || "aggregator");
  u.searchParams.set("utm_medium", "referral");
  u.searchParams.set("utm_campaign", input.region);
  return u.toString();
}

// Текст «моего расчёта», который человек может вставить в анкету или мессенджер.
export function summaryText(r, input) {
  const lines = [
    `Здравствуйте! Хочу оформить рассрочку.`,
    `Компания: ${r.company.name}${r.tariff ? `, тариф «${r.tariff.tariff}»` : ""}`,
    `Стоимость товара: ${formatRub(input.price)}`,
    `Первоначальный взнос: ${formatRub(r.down ?? input.down)}`,
    `Срок: ${input.term} мес.`,
  ];
  if (r.monthly !== undefined) {
    lines.push(`Платёж по расчёту: ${formatRub(r.monthly)} в месяц, наценка ${formatRub(r.markup)}`);
  }
  return lines.join("\n");
}
