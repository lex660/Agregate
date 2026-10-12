// Интерфейс калькулятора. Только DOM-API и textContent — никакого innerHTML с данными.
import { compare, formatRub, outboundUrl, summaryText } from "./calc.js";

const data = JSON.parse(document.getElementById("tariffs-data").textContent);
const ALLOWED_HOSTS = new Set(
  data.companies.filter((c) => c.url).map((c) => new URL(c.url).hostname)
);
const SITE_HOST = location.hostname;

const $ = (id) => document.getElementById(id);
const form = $("calc-form");
const list = $("res-list");
const summary = $("res-summary");
const errorEl = $("f-error");
const tpl = $("tpl-offer");
const adsPool = $("ads-pool");
const termInput = $("f-term");
const termOut = $("f-term-out");

let lastInput = null;
let resultsShown = false;

// ---------- Метрика (цели не меняем: visit, calc_click, calc_used, bank_click) ----------
function goal(name, params) {
  try {
    if (typeof window.ym === "function") window.ym(Number(window.__ymId), "reachGoal", name, params);
  } catch (_) { /* аналитика не должна ломать калькулятор */ }
}

// ---------- Ввод ----------
const digits = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;
const pretty = (n) => (n ? n.toLocaleString("ru-RU").replace(/ /g, " ") : "");

function bindMoney(input) {
  input.addEventListener("input", () => {
    const n = digits(input.value);
    input.value = pretty(n);
    updateDownPct();
  });
}
bindMoney($("f-price"));
bindMoney($("f-down"));

function updateDownPct() {
  const p = digits($("f-price").value);
  const d = digits($("f-down").value);
  $("f-down-pct").textContent = p ? `${Math.round((d / p) * 100)}% от стоимости` : "";
}

function setTerm(v) {
  termInput.value = v;
  termOut.textContent = v;
  document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(Number(c.dataset.term) === Number(v))));
}
termInput.addEventListener("input", () => setTerm(termInput.value));
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
  setTerm(c.dataset.term);
  if (resultsShown) run(false);
}));
$("f-region").addEventListener("change", () => { if (resultsShown) run(false); });

function readInput() {
  return {
    region: $("f-region").value,
    price: digits($("f-price").value),
    down: digits($("f-down").value),
    term: Number(termInput.value),
  };
}

function validate(i) {
  if (!i.price || i.price < 1000) return "Укажите стоимость товара — от 1 000 ₽.";
  if (i.price > 10000000) return "Стоимость товара — не больше 10 000 000 ₽.";
  if (i.down >= i.price) return "Взнос должен быть меньше стоимости товара.";
  return null;
}

// ---------- Ссылка на расчёт (можно поделиться) ----------
function writeUrl(i) {
  const q = new URLSearchParams({ r: i.region, p: i.price, d: i.down, t: i.term });
  history.replaceState(null, "", `${location.pathname}?${q}`);
}
function readUrl() {
  const q = new URLSearchParams(location.search);
  if (!q.has("p")) return false;
  const region = q.get("r");
  if (data.regions.some((r) => r.id === region)) $("f-region").value = region;
  $("f-price").value = pretty(digits(q.get("p")));
  $("f-down").value = pretty(digits(q.get("d")));
  const t = Math.min(36, Math.max(1, digits(q.get("t")) || 6));
  setTerm(t);
  return true;
}

// ---------- Рендер ----------
function setText(root, sel, text) {
  const el = root.querySelector(sel);
  el.textContent = text;
  return el;
}

function legalLine(c) {
  const parts = [`Юрлицо: ${c.legal_entity || "не опубликовано на сайте компании"}`];
  if (c.inn) parts.push(`ИНН ${c.inn}`);
  if (c.cbr_registry) parts.push(`в реестре Банка России: ${c.cbr_registry}`);
  return parts.join(" · ");
}

function renderOffer(r, input, index) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.classList.add(`offer--${r.status}`);
  setText(node, ".offer__name", r.company.name);
  const tariffText = r.tariff
    ? [`Тариф «${r.tariff.tariff}»`, r.tariff.conditions].filter(Boolean).join(" · ")
    : "Условия уточняются";
  setText(node, ".offer__tariff", tariffText);

  const badge = node.querySelector(".badge");
  if (r.best) { badge.hidden = false; badge.textContent = "Выгоднее всего"; node.classList.add("offer--best"); }
  else if (r.status === "need_down") { badge.hidden = false; badge.textContent = "Нужен больший взнос"; badge.classList.add("badge--warn"); }
  else if (r.status === "unavailable") { badge.hidden = false; badge.textContent = "Не подходит"; badge.classList.add("badge--off"); }

  const nums = node.querySelector(".offer__nums");
  if (r.monthly === undefined) {
    nums.remove();
  } else {
    setText(nums, '[data-k="monthly"]', formatRub(r.monthly));
    setText(nums, '[data-k="markup"]', formatRub(r.markup));
    setText(nums, '[data-k="total"]', formatRub(r.total));
    setText(nums, '[data-k="down"]', formatRub(r.down));
  }

  if (r.note) {
    const n = node.querySelector(".offer__note");
    n.hidden = false;
    n.textContent = r.note;
  }
  setText(node, ".offer__legal", legalLine(r.company));
  const meta = r.company.checkedAt
    ? `Условия с сайта компании, проверено ${r.company.checkedAt.split("-").reverse().join(".")}`
    : "Ставки компанией не опубликованы";
  setText(node, ".offer__meta", meta);

  const link = node.querySelector(".bank-link");
  const href = outboundUrl(r.company, input, SITE_HOST);
  if (href && ALLOWED_HOSTS.has(new URL(href).hostname)) {
    link.href = href;
    link.dataset.bankName = r.tariff ? `${r.company.name} ${r.tariff.tariff}` : r.company.name;
    link.dataset.position = String(index + 1);
  } else {
    link.remove();
  }

  const copy = node.querySelector(".copy-btn");
  if (r.monthly === undefined) {
    copy.remove();
  } else {
    copy.addEventListener("click", async () => {
      const text = summaryText(r, input);
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "Скопировано";
      } catch (_) {
        window.prompt("Скопируйте расчёт:", text);
      }
      setTimeout(() => { copy.textContent = "Скопировать расчёт"; }, 2000);
    });
  }
  return node;
}

function placeAds(cards) {
  if (!adsPool) return;
  const ads = [...adsPool.children];
  if (!ads.length) return;
  // На телефоне карточки идут по очереди: предложение, баннер, предложение, баннер…
  // Каждый баннер показывается один раз; когда баннеры кончились — дальше только предложения.
  // На компьютере баннеры — колонкой сбоку.
  const mobile = window.matchMedia("(max-width: 1023px)").matches;
  adsPool.hidden = mobile;
  list.querySelectorAll(".ad--inline").forEach((a) => a.remove());
  if (!mobile) return;
  ads.forEach((ad, i) => {
    const anchor = cards[i];
    if (!anchor) return;
    const clone = ad.cloneNode(true);
    clone.classList.add("ad--inline");
    anchor.after(clone);
  });
}

function run(track = true) {
  const input = readInput();
  const err = validate(input);
  errorEl.hidden = !err;
  errorEl.textContent = err || "";
  if (err) return;

  if (track) goal("calc_click");
  lastInput = input;
  writeUrl(input);

  const results = compare(data, input);
  list.replaceChildren();
  const cards = results.map((r, i) => renderOffer(r, input, i));
  cards.forEach((c) => list.append(c));
  placeAds(cards);

  const ok = results.filter((r) => r.status === "ok").length;
  const regionName = data.regions.find((r) => r.id === input.region).name;
  summary.textContent = ok
    ? `${regionName}: подходит ${ok} из ${results.length}. ${formatRub(input.price)}, взнос ${formatRub(input.down)}, ${input.term} мес.`
    : `${regionName}: при таких условиях полностью подходящих предложений нет — посмотрите пометки в карточках.`;

  resultsShown = true;
  if (track) {
    goal("calc_used", { price: input.price, down_payment: input.down, term: input.term, region: input.region });
    if (window.matchMedia("(max-width: 1023px)").matches) $("res-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

form.addEventListener("submit", (e) => { e.preventDefault(); run(true); });

list.addEventListener("click", (e) => {
  const link = e.target.closest && e.target.closest("a.bank-link");
  if (!link || !lastInput) return;
  goal("bank_click", {
    bank: link.dataset.bankName || "unknown",
    price: lastInput.price,
    down_payment: lastInput.down,
    term: lastInput.term,
  });
});

window.matchMedia("(max-width: 1023px)").addEventListener?.("change", () => {
  if (resultsShown) placeAds([...list.querySelectorAll(".offer")]);
});

// ---------- Старт ----------
updateDownPct();
setTerm(termInput.value);
readUrl();
run(false); // сразу показываем пример, чтобы на телефоне не было пустого экрана
