// Движок расчёта исламской рассрочки (мурабаха).
// Один и тот же файл работает в браузере и в тестах (node --test).
// Никаких ставок здесь нет: все цифры берутся из data/tariffs.json.
//
// Схема 2: каждое числовое ограничение источника лежит в своём поле под своим именем.
// Стоимость товара (maxGoodsCost) и сумма финансирования (maxFinancingAmount) —
// это РАЗНЫЕ ограничения, сводить их в одно поле «максимум» нельзя: у ЛяРибы
// товар до 1 000 000 ₽, а финансирование до 400 000 ₽, то есть товар за миллион
// доступен только при взносе от 600 000 ₽.

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
  return Math.round(n).toLocaleString("ru-RU").replace(/\u00a0/g, " ") + " ₽";
}

// Минимальный и максимальный взнос по правилам тарифа.
export function downLimits(t, price) {
  let min;
  if (t.zeroInitialPaymentUpTo && price <= t.zeroInitialPaymentUpTo) {
    min = 0;
  } else {
    min = ceilTo((price * (t.minInitialPaymentPercent || 0)) / 100, t.initialPaymentRoundUpTo);
  }
  // Ограничение по сумме финансирования поднимает минимальный взнос.
  if (t.maxFinancingAmount) min = Math.max(min, price - t.maxFinancingAmount);
  let max = floorTo((price * (t.maxInitialPaymentPercent ?? 100)) / 100, t.initialPaymentRoundUpTo);
  if (t.minFinancingAmount) max = Math.min(max, price - t.minFinancingAmount);
  max = Math.min(max, price);
  return { min: Math.max(0, min), max };
}

function termRange(t) {
  return `от ${t.minContractMonthCount} до ${t.maxContractMonthCount} мес.`;
}

// Человекочитаемый перечень лимитов: каждое ограничение названо отдельно.
// Намеренно НЕ сводит стоимость товара и сумму финансирования в одно «до N ₽».
export function limitsSummary(t) {
  const parts = [];
  if (t.minGoodsCost || t.maxGoodsCost) {
    const a = t.minGoodsCost ? `от ${formatRub(t.minGoodsCost)}` : null;
    const b = t.maxGoodsCost ? `до ${formatRub(t.maxGoodsCost)}` : null;
    parts.push(`товар ${[a, b].filter(Boolean).join(" ")}`);
  }
  if (t.minFinancingAmount || t.maxFinancingAmount) {
    const a = t.minFinancingAmount ? `от ${formatRub(t.minFinancingAmount)}` : null;
    const b = t.maxFinancingAmount ? `до ${formatRub(t.maxFinancingAmount)}` : null;
    parts.push(`финансирование ${[a, b].filter(Boolean).join(" ")}`);
  }
  if (t.zeroInitialPaymentUpTo) {
    parts.push(`без взноса при товаре до ${formatRub(t.zeroInitialPaymentUpTo)}`);
  }
  if (t.minInitialPaymentPercent || t.maxInitialPaymentPercent) {
    const a = t.minInitialPaymentPercent ? `от ${t.minInitialPaymentPercent}%` : null;
    const b = t.maxInitialPaymentPercent && t.maxInitialPaymentPercent < 100 ? `до ${t.maxInitialPaymentPercent}%` : null;
    if (a || b) parts.push(`взнос ${[a, b].filter(Boolean).join(" ")}`);
  }
  if (t.minContractMonthCount && t.maxContractMonthCount) {
    parts.push(`срок ${t.minContractMonthCount}–${t.maxContractMonthCount} мес.`);
  }
  if (t.guarantorCount !== null && t.guarantorCount !== undefined) {
    parts.push(t.guarantorCount === 0 ? "без поручителей" : `поручителей: ${t.guarantorCount}`);
  }
  return parts.join(", ");
}

// Есть ли у тарифа подтверждённая ставка. Если нет — лимиты показываем, расчёт нет.
export function isComputable(t) {
  return Boolean(t && t.rateModel);
}

// Наценка и платёж при уже выбранном взносе. Возвращает null, если срок не поддерживается.
export function computeCore(t, price, down, term) {
  const financed = price - down;
  let markup;
  let monthly;

  switch (t.rateModel) {
    case "coef_table": {
      const coef = t.coefTable?.[String(term)];
      if (!coef) return null;
      const totalFinanced = Math.round(financed * coef);
      markup = totalFinanced - financed;
      monthly = Math.round(totalFinanced / term);
      break;
    }
    case "percent_table": {
      const pct = t.percentTable?.[String(term)];
      if (pct === undefined || pct === null) return null; // 0 — допустимая ставка
      const exact = (financed * pct) / 100;
      markup = Math.round(exact);
      monthly = Math.round((financed + exact) / term);
      break;
    }
    case "monthly_flat": {
      // percent хранится в процентах, как в источнике (ЛяРиба: percent 3.8).
      const exact = Math.max((financed * t.percent * term) / 100, t.minMarkup || 0);
      markup = Math.round(exact);
      monthly = Math.round((financed + exact) / term);
      break;
    }
    case "coef_linear": {
      // ФинЛайт: коэффициент = coefBase + coefPerMonth × срок, от суммы финансирования.
      const coef = t.coefBase + t.coefPerMonth * term;
      const totalFinanced = Math.round(financed * coef);
      markup = totalFinanced - financed;
      monthly = Math.round(totalFinanced / term);
      break;
    }
    case "annual_flat": {
      // Al-Baraka: платёж округляется вверх до 100 ₽, округление входит в наценку.
      monthly = Math.ceil((financed * (1 + (t.annualPercent / 100 * term) / 12)) / term / 100) * 100;
      markup = monthly * term - financed;
      break;
    }
    case "vatan_bands": {
      const fee = down === 0 ? t.serviceFeeZeroDown : t.serviceFee;
      const band = t.bands.find((b) => financed < b.below);
      let exact;
      if (band) {
        if (term > band.max_term) return { termLimit: band.max_term };
        exact = band.per_month * term + fee;
      } else {
        exact = ((financed * (t.annualPercent / 100)) / 12) * term + fee;
      }
      markup = Math.round(exact);
      monthly = Math.round((financed + exact) / term);
      break;
    }
    default:
      throw new Error(`Неизвестная модель расчёта: ${t.rateModel}`);
  }

  return { financed, markup, monthly, total: price + markup, down };
}

// Полный расчёт одного тарифа для пользователя.
export function evaluateTariff(t, input) {
  const { price, down, term } = input;
  const base = { tariff: t, status: "ok", note: null };
  const individualNote = t.individual ? "Компания пишет, что расчёт индивидуальный — уточните условия перед оформлением." : null;

  // Тариф без подтверждённой ставки: показываем лимиты, расчёт не делаем.
  if (!isComputable(t)) {
    const l = limitsSummary(t);
    return { ...base, status: "pending", note: ["Ставку компания не публикует — расчёт не показываем.", l && `Известные условия: ${l}.`].filter(Boolean).join(" ") };
  }

  if ((t.minGoodsCost && price < t.minGoodsCost) || (t.maxGoodsCost && price > t.maxGoodsCost)) {
    const a = t.minGoodsCost ? `от ${formatRub(t.minGoodsCost)}` : null;
    const b = t.maxGoodsCost ? `до ${formatRub(t.maxGoodsCost)}` : null;
    return { ...base, status: "unavailable", note: `Стоимость товара ${[a, b].filter(Boolean).join(" ")}` };
  }
  if (term < t.minContractMonthCount || term > t.maxContractMonthCount) {
    return { ...base, status: "unavailable", note: `Срок ${termRange(t)}` };
  }

  const lim = downLimits(t, price);
  if (lim.min > lim.max) {
    // Разводим причины: ограничение по финансированию и по взносу — разные вещи.
    const why = t.maxFinancingAmount && price - t.maxFinancingAmount > lim.max
      ? `Сумма финансирования у этого тарифа до ${formatRub(t.maxFinancingAmount)}, для такого товара нужен взнос больше максимального`
      : "Не подходит под лимиты суммы финансирования";
    return { ...base, status: "unavailable", note: why };
  }

  let usedDown = down;
  let status = "ok";
  let note = null;
  if (down < lim.min) {
    usedDown = lim.min;
    status = "need_down";
    const why = t.maxFinancingAmount && price - t.maxFinancingAmount >= lim.min
      ? ` Это ограничение по сумме финансирования: она у тарифа до ${formatRub(t.maxFinancingAmount)}.`
      : "";
    note = `Нужен взнос от ${formatRub(lim.min)}. Расчёт показан с этим взносом.${why}`;
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
  const covered = new Set();

  for (const t of data.tariffs) {
    if (!t.regions.includes(input.region)) continue;
    covered.add(t.company);
    results.push({ ...evaluateTariff(t, input), company: companies.get(t.company) });
  }

  // Компании вообще без тарифа — показываем, но без расчёта и без лимитов.
  for (const c of data.companies) {
    if (covered.has(c.id) || !c.regions.includes(input.region)) continue;
    results.push({ tariff: null, company: c, status: "pending", note: "Условия уточняются — компания не публикует ставки" });
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
