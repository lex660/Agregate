// Яндекс.Метрика вынесена в отдельный файл, чтобы CSP не разрешал inline-скрипты.
(function () {
  var me = document.currentScript;
  var id = Number(me && me.dataset.counter);
  if (!id) return;
  window.__ymId = id;
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) return; }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0];
    k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=" + id, "ym");
  window.ym(id, "init", { webvisor: true, clickmap: true, trackLinks: true, accurateTrackBounce: true });
  window.ym(id, "reachGoal", "visit");
})();
