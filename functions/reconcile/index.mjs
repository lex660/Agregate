// Yandex Cloud Function «сверка тарифов». Запускается таймером раз в сутки.
// Читает публичные калькуляторы компаний, сравнивает с data/tariffs.json и при расхождениях
// пишет в Telegram. Сама ничего не меняет — правку tariffs.json делает человек через PR.
//
// Переменные окружения функции:
//   TARIFFS_URL        — откуда брать tariffs.json (по умолчанию raw-файл из ветки main)
//   TELEGRAM_BOT_TOKEN — токен бота (хранить в Lockbox, не в коде)
//   TELEGRAM_CHAT_ID   — куда слать
//   SEND_OK            — "1", чтобы присылать сообщение и когда всё совпало
import { SOURCES, parseTasnim, parseKupitak, parseLariba, parseVatan, parseAlBaraka, compareAll, staleCompanies } from "./parsers.mjs";

const UA = "Mozilla/5.0 (compatible; tariff-check; +https://github.com/lex660/Agregate)";

async function get(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(`${url}: ${last.message}`);
}

async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.log("[telegram выключен]\n" + text);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("Telegram:", res.status, await res.text());
}

export async function run() {
  const tariffsUrl = process.env.TARIFFS_URL || "https://raw.githubusercontent.com/lex660/Agregate/main/data/tariffs.json";
  const data = JSON.parse(await get(tariffsUrl));

  const parsers = {
    tasnim: [SOURCES.tasnim, parseTasnim],
    kupitak: [SOURCES.kupitak, parseKupitak],
    lariba: [SOURCES.lariba, parseLariba],
    vatan: [SOURCES.vatan, parseVatan],
    alBaraka: [SOURCES.alBaraka, parseAlBaraka],
  };
  const site = {};
  const errors = [];
  await Promise.all(Object.entries(parsers).map(async ([key, [url, parse]]) => {
    try {
      site[key] = parse(await get(url));
    } catch (e) {
      errors.push(`${key}: не удалось прочитать (${e.message}) — возможно, сайт обновили`);
    }
  }));

  const diffs = compareAll(data, site);
  const stale = staleCompanies(data);
  const ok = !diffs.length && !errors.length;

  const lines = [];
  if (diffs.length) lines.push("⚠️ Условия на сайтах изменились:", ...diffs.map((d) => "• " + d), "");
  if (errors.length) lines.push("❌ Сверка не прошла:", ...errors.map((d) => "• " + d), "");
  if (stale.length) lines.push("🕒 Давно не проверялись:", ...stale.map((d) => "• " + d), "");
  if (ok) lines.unshift("✅ Тарифы на сайтах совпадают с tariffs.json.");
  lines.push("Изменения в tariffs.json вносятся только через PR с новыми verified_at и source.");

  if (!ok || stale.length || process.env.SEND_OK === "1") await telegram(lines.join("\n"));
  return { ok, diffs, errors, stale };
}

// Точка входа Yandex Cloud Functions: index.handler
export async function handler() {
  const result = await run();
  return { statusCode: 200, body: JSON.stringify(result) };
}
