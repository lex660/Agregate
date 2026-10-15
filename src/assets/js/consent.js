// Согласие на cookie и загрузка Яндекс.Метрики только после него (issue #5, ADR-004).
// Выбор хранится только в браузере (localStorage), на сервер ничего не отправляется.
// Без согласия счётчик не загружается вовсе, цели не отправляются.
(function () {
  "use strict";
  var KEY = "agg_consent_v1";
  var me = document.currentScript;
  var id = Number(me && me.dataset.counter);
  var banner = document.getElementById("consent");

  function read() {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (_) { /* приватный режим: спросим ещё раз */ }
  }

  function loadMetrika() {
    if (!id || window.__ymId) return;
    window.__ymId = id;
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) return; }
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=" + id, "ym");
    // Вебвизор выключен: запись действий пользователя не нужна сайту и трактуется строже статистики.
    window.ym(id, "init", { webvisor: false, clickmap: true, trackLinks: true, accurateTrackBounce: true });
    window.ym(id, "reachGoal", "visit");
  }

  // Удаляем cookie Метрики при отзыве согласия (на текущем домене и родительском).
  function dropMetrikaCookies() {
    var host = location.hostname;
    var parts = host.split(".");
    var domains = ["", host, "." + host];
    if (parts.length > 2) domains.push("." + parts.slice(-2).join("."));
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (!/^_ym/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + "=; Max-Age=0; path=/" + (d ? "; domain=" + d : "");
      });
    });
  }

  function show() { if (banner) banner.hidden = false; }
  function hide() { if (banner) banner.hidden = true; }

  function decide(value) {
    var before = read();
    write(value);
    hide();
    if (value === "granted") loadMetrika();
    // Метрику нельзя выгрузить со страницы: при отзыве чистим cookie и перезагружаем.
    if (value === "denied" && (before === "granted" || window.__ymId)) {
      dropMetrikaCookies();
      location.reload();
    }
  }

  if (banner) {
    var accept = banner.querySelector("[data-consent='granted']");
    var reject = banner.querySelector("[data-consent='denied']");
    if (accept) accept.addEventListener("click", function () { decide("granted"); });
    if (reject) reject.addEventListener("click", function () { decide("denied"); });
  }
  document.querySelectorAll("[data-consent-open]").forEach(function (b) {
    b.addEventListener("click", function () { show(); var f = banner && banner.querySelector("button"); if (f) f.focus(); });
  });

  var state = read();
  if (state === "granted") loadMetrika();
  else if (state !== "denied") show();
})();
