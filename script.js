document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // КОНФИГ
  // =========================
  const CLOUDFLARE_WORKER_URL =
    "https://islamic-installment-api.ghalghaiv.workers.dev";
  const ymCounterId = 104202450;

  const form = document.getElementById("calculator-form");
  const resultsContainer = document.getElementById("results-container");

  let lastCalculationInputs = {};
  let isLoading = false;

  // =========================
  // ЕДИНЫЙ МАССИВ МЕДИА (РОВНО 4 ЭЛЕМЕНТА)
  // Порядок важен: [0,1] — слева; [2,3] — справа; на мобиле все 4 идут между тарифами
  // =========================
  const MEDIA_ITEMS = [
    {
      href: "mailto:lex660@yandex.ru?body=Здравствуйте!%20Пишу%20с%20сайта%20vsay-rassrochka.ru.%20Хочу%20узнать%20подробнее%20о%20рекламе.",
      img: "https://raw.githubusercontent.com/lex660/Agregate_1.1/main/reklama_v-r.png",
      alt: "Медиа 1",
    },
    {
      href: "https://wa.me/79604345577?text=Здравствуйте.%20Ди%20дика%20хилда!%20Пишу%20с%20сайта%20vsay-rassrochka.ru.%20Хочу%20узнать%20подробнее%20о%20смартфонах.",
      img: "https://raw.githubusercontent.com/lex660/Agregate/main/Adab2_Left.png",
      alt: "Медиа 2",
    },
    {
      href: "https://wa.me/79931700676?text=Ди%20дика%20хилда!%20Пишу%20с%20сайта%20vsay-rassrochka.ru.%20Хочу%20узнать%20подробнее%20о%20рекламе",
      img: "https://raw.githubusercontent.com/lex660/Agregate_1.1/main/reklama_v-r.png",
      alt: "Медиа 3",
    },
    {
      href: "https://wa.me/79604345577?text=Здравствуйте.%20Ди%20дика%20хилда!%20Пишу%20с%20сайта%20vsay-rassrochka.ru.%20Хочу%20узнать%20подробнее%20о%20покупке%20телефона.",
      img: "https://raw.githubusercontent.com/lex660/Agregate/main/Adab1_R.png",
      alt: "Медиа 4",
    },
  ];

  // после каких по счёту строк вставлять inline (1-based)
  const INLINE_INSERT_POSITIONS = [1, 2, 3, 4];

  // медиазапрос для переключения режимов
  const mq = window.matchMedia("(max-width: 1024px)");
  let lastInlineMode = mq.matches;

  function isInlineMode() {
    return mq.matches;
  }

  // =========================
  // АНАЛИТИКА: посещение
  // =========================
  if (typeof ym === "function") {
    try {
      ym(ymCounterId, "reachGoal", "visit");
    } catch (e) {
      console.warn("ym error", e);
    }
  }

  // =========================
  // Утилиты медиа
  // =========================
  function mediaCardHTML(item) {
    return `
        <a class="media-card" href="${item.href}" target="_blank" rel="noopener">
          <img src="${item.img}" alt="${item.alt}" loading="lazy" decoding="async">
        </a>`;
  }

  // Desktop: отрисовываем по бокам (2 слева, 2 справа)
  function renderSideMedia() {
    const leftEl = document.querySelector('[data-slot="left"]');
    const rightEl = document.querySelector('[data-slot="right"]');
    if (!leftEl || !rightEl) return;

    leftEl.innerHTML = "";
    rightEl.innerHTML = "";

    const leftItems = MEDIA_ITEMS.slice(0, 2);
    const rightItems = MEDIA_ITEMS.slice(2, 4);

    leftEl.innerHTML = leftItems.map(mediaCardHTML).join("");
    rightEl.innerHTML = rightItems.map(mediaCardHTML).join("");
  }

  // Inline-вставки в таблицу
  function clearInlineRows(tbody) {
    tbody.querySelectorAll(".inline-media-row").forEach((el) => el.remove());
  }
  function createInlineRow(item) {
    const tr = document.createElement("tr");
    tr.className = "inline-media-row";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.innerHTML = `
        <div class="inline-media-card">
          <a href="${item.href}" target="_blank" rel="noopener">
            <img src="${item.img}" alt="${item.alt}" loading="lazy" decoding="async">
          </a>
        </div>`;
    tr.appendChild(td);
    return tr;
  }
  function injectInlineMediaRows() {
    const tbody = resultsContainer.querySelector("tbody");
    if (!tbody) return;

    // показываем inline только в inline-режиме
    if (!isInlineMode()) {
      clearInlineRows(tbody);
      return;
    }

    clearInlineRows(tbody);

    const rows = Array.from(tbody.querySelectorAll(".result-row"));
    if (!rows.length) return;

    let i = 0;
    INLINE_INSERT_POSITIONS.forEach((pos) => {
      if (i >= MEDIA_ITEMS.length) return;
      const idx = pos - 1;
      const mediaRow = createInlineRow(MEDIA_ITEMS[i]);

      if (rows[idx] && rows[idx].parentNode) {
        rows[idx].after(mediaRow);
      } else {
        tbody.appendChild(mediaRow);
      }
      i++;
    });
  }

  // главный переключатель при изменении режима
  function renderResponsiveMedia() {
    const inline = isInlineMode();
    if (inline === lastInlineMode) {
      // режим не поменялся — если inline и уже есть таблица, просто обновим вставки
      if (inline) injectInlineMediaRows();
      return;
    }

    lastInlineMode = inline;

    if (inline) {
      // перешли в inline-режим: чистим боковые, вставляем в таблицу
      document.querySelector('[data-slot="left"]')?.replaceChildren();
      document.querySelector('[data-slot="right"]')?.replaceChildren();
      injectInlineMediaRows();
    } else {
      // вышли из inline-режима: чистим inline, рисуем по бокам
      const tbody = resultsContainer.querySelector("tbody");
      if (tbody) clearInlineRows(tbody);
      renderSideMedia();
    }
  }

  // слушаем медиазапрос
  mq.addEventListener?.("change", renderResponsiveMedia);
  // на старте: если не inline — показываем боковые
  if (!isInlineMode()) renderSideMedia();

  // =========================
  // ОТПРАВКА ФОРМЫ
  // =========================
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isLoading) return;

    if (typeof ym === "function") {
      try {
        ym(ymCounterId, "reachGoal", "calc_click");
      } catch (e) {}
    }

    const region = document.getElementById("region").value;
    const productPrice = parseFloat(
      document.getElementById("product-price").value
    );
    const downPayment = parseFloat(
      document.getElementById("down-payment").value
    );
    const term = parseInt(document.getElementById("term").value, 10);

    if (isNaN(productPrice) || productPrice <= 0) {
      alert("Пожалуйста, введите корректную стоимость товара.");
      return;
    }
    if (isNaN(downPayment) || downPayment < 0) {
      alert("Пожалуйста, введите корректный первоначальный взнос.");
      return;
    }
    if (downPayment >= productPrice) {
      alert(
        "Первоначальный взнос не может быть больше или равен стоимости товара."
      );
      return;
    }

    lastCalculationInputs = { region, productPrice, downPayment, term };
    await fetchAndDisplayResults(region, productPrice, downPayment, term);

    if (typeof ym === "function") {
      try {
        ym(ymCounterId, "reachGoal", "calc_used", {
          price: productPrice,
          down_payment: downPayment,
          term,
          region,
        });
      } catch (e) {}
    }
  });

  // =========================
  // API
  // =========================
  async function fetchAndDisplayResults(region, price, downPayment, term) {
    try {
      isLoading = true;
      showLoadingState();

      const response = await fetch(`${CLOUDFLARE_WORKER_URL}/api/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region, price, downPayment, term }),
      });

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();

      if (data.success === false && data.error === "no_data") {
        showNoDataState(data.message, data.failedBanks);
      } else if (data.success && data.results) {
        displayResults(data.results, data.warnings);
      } else {
        throw new Error(data.error || "Неизвестная ошибка");
      }
    } catch (error) {
      showErrorState(error.message || String(error));
    } finally {
      isLoading = false;
    }
  }

  // =========================
  // UI-состояния
  // =========================
  function showNoDataState(message, failedBanks) {
    const failedList = failedBanks?.length
      ? `<ul class="failed-banks-list">${failedBanks
          .map((b) => `<li>${b.name}</li>`)
          .join("")}</ul>`
      : "";
    resultsContainer.innerHTML = `
        <div class="placeholder error">
          <p>⚠️ ${message}</p>
          ${failedList}
          <p class="info-text">Мы уже работаем над обновлением данных. Попробуйте обновить страницу через несколько минут.</p>
          <button onclick="location.reload()" class="calculate-btn">Обновить страницу</button>
        </div>`;
  }

  function showLoadingState() {
    resultsContainer.innerHTML = `
        <div class="placeholder">
          <div class="loading-spinner"></div>
          <p>Загрузка предложений...</p>
        </div>`;
  }

  function showErrorState(errorMessage) {
    resultsContainer.innerHTML = `
        <div class="placeholder error">
          <p>⚠️ Произошла ошибка при загрузке данных.</p>
          <p class="error-details">${errorMessage}</p>
          <button onclick="location.reload()" class="calculate-btn">Обновить страницу</button>
        </div>`;
  }

  // =========================
  // Результаты + inline media
  // =========================
  function displayResults(results, warnings) {
    const formatCurrency = (v) => Math.round(v).toLocaleString("ru-RU");

    if (!results?.length) {
      resultsContainer.innerHTML = `
          <div class="placeholder">
            <p>❌ Нет доступных предложений для указанных параметров.</p>
            <p>Попробуйте изменить условия рассрочки.</p>
          </div>`;
      return;
    }

    const warningsHtml = warnings?.length
      ? `<div class="warnings-banner"><p>⚠️ ${warnings.join(" ")}</p></div>`
      : "";

    const tableContent = `
        ${warningsHtml}
        <div class="table-wrapper">
          <table class="results-table" aria-live="polite">
            <thead>
              <tr>
                <th scope="col">Компания</th>
                <th scope="col">Наценка (₽)</th>
                <th scope="col">Итого (₽)</th>
                <th scope="col">В месяц (₽)</th>
                <th scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              ${results
                .map((result, index) => {
                  const noteHtml = result.note
                    ? `<span class="bank-note">${result.note}</span>`
                    : `<span class="bank-note">Общая стоимость: ${result.totalCost.toLocaleString()}₽, платеж ${result.monthlyPayment.toLocaleString()}₽/мес.</span>`;
                  const best =
                    index === 0
                      ? '<span class="best-deal-badge">🏆 Лучшее</span>'
                      : "";
                  return `
                    <tr class="result-row">
                      <td data-label="Компания" class="bank-name-cell">${
                        result.name
                      } ${best} ${noteHtml}</td>
                      <td data-label="Наценка (₽)">${formatCurrency(
                        result.markup
                      )}</td>
                      <td data-label="Итого (₽)">${formatCurrency(
                        result.totalCost
                      )}</td>
                      <td data-label="В месяц (₽)">${formatCurrency(
                        result.monthlyPayment
                      )}</td>
                      <td data-label="Действие">
                        <a href="${
                          result.url
                        }" target="_blank" rel="noopener noreferrer"
                           class="apply-btn bank-link" data-bank-name="${
                             result.name
                           }">
                          Перейти на сайт
                        </a>
                      </td>
                    </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
        <p class="disclaimer">💡 Расчёты носят справочный характер. Финальные условия уточняйте у компании-продавца.</p>`;

    resultsContainer.innerHTML = tableContent;

    // важное: после построения результатов — подстроить медиа под текущий режим
    renderResponsiveMedia();
  }

  // на всякий случай ещё при resize
  window.addEventListener("resize", renderResponsiveMedia);

  // =========================
  // Трекинг кликов по «Перейти на сайт»
  // =========================
  resultsContainer.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a.bank-link");
    if (!link) return;

    const bankName = link.getAttribute("data-bank-name") || "unknown";
    const sentData = {
      bank: bankName,
      price:
        lastCalculationInputs.productPrice ??
        lastCalculationInputs.price ??
        null,
      down_payment:
        lastCalculationInputs.downPayment ??
        lastCalculationInputs.down_payment ??
        null,
      term: lastCalculationInputs.term ?? null,
    };

    if (typeof ym === "function") {
      try {
        ym(ymCounterId, "reachGoal", "bank_click", sentData);
      } catch (e) {}
    }
  });
});




