document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // КОНФИГУРАЦИЯ
    // ============================================
    const CLOUDFLARE_WORKER_URL = 'https://islamic-installment-api.ghalghaiv.workers.dev';
    const ymCounterId = 104202450;

    const form = document.getElementById('calculator-form');
    const resultsContainer = document.getElementById('results-container');

    let lastCalculationInputs = {};
    let isLoading = false;

    // ============================================
    // АНАЛИТИКА: посещение страницы
    // ============================================
    if (typeof ym === 'function') {
        try { ym(ymCounterId, 'reachGoal', 'visit'); } catch (e) { console.warn('ym error', e); }
    }

    // ============================================
    // ОБРАБОТЧИК ОТПРАВКИ ФОРМЫ
    // ============================================
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isLoading) return;

        // Отправляем событие клика здесь (сразу при нажатии)
        if (typeof ym === 'function') {
            try {
                ym(ymCounterId, 'reachGoal', 'calc_click');
            } catch (e) {
            }
        } 

        // Получение данных из формы
        const region = document.getElementById('region').value;
        const productPrice = parseFloat(document.getElementById('product-price').value);
        const downPayment = parseFloat(document.getElementById('down-payment').value);
        const term = parseInt(document.getElementById('term').value, 10);

        // Валидация
        if (isNaN(productPrice) || productPrice <= 0) {
            alert('Пожалуйста, введите корректную стоимость товара.');
            return;
        }
        if (isNaN(downPayment) || downPayment < 0) {
            alert('Пожалуйста, введите корректный первоначальный взнос.');
            return;
        }
        if (downPayment >= productPrice) {
            alert('Первоначальный взнос не может быть больше или равен стоимости товара.');
            return;
        }

        lastCalculationInputs = { region, productPrice, downPayment, term };

        // Отправка запроса к Cloudflare Worker
        await fetchAndDisplayResults(region, productPrice, downPayment, term);

        // Событие "расчёт использован" (доп. данные)
        if (typeof ym === 'function') {
            try {
                ym(ymCounterId, 'reachGoal', 'calc_used', {
                    price: productPrice,
                    down_payment: downPayment,
                    term: term,
                    region: region
                });
            } catch (e) {
            }
        }
    });

    // ============================================
    // API ЗАПРОСЫ
    // ============================================
    async function fetchAndDisplayResults(region, price, downPayment, term) {
        try {
            isLoading = true;
            showLoadingState();

            const response = await fetch(`${CLOUDFLARE_WORKER_URL}/api/calculate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ region, price, downPayment, term })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            if (data.success === false && data.error === 'no_data') {
                showNoDataState(data.message, data.failedBanks);
            } else if (data.success && data.results) {
                displayResults(data.results, data.warnings);
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
        } catch (error) {
            showErrorState(error.message || error.toString());
        } finally {
            isLoading = false;
        }
    }

    // ============================================
    // ОТОБРАЖЕНИЕ РЕЗУЛЬТАТОВ (как у тебя)
    // ============================================
    function showNoDataState(message, failedBanks) {
        const failedList = failedBanks && failedBanks.length > 0
            ? `<ul class="failed-banks-list">${failedBanks.map(b => `<li>${b.name}</li>`).join('')}</ul>`
            : '';
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

    function displayResults(results, warnings) {
        const formatCurrency = (value) => Math.round(value).toLocaleString('ru-RU');
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="placeholder">
                    <p>❌ Нет доступных предложений для указанных параметров.</p>
                    <p>Попробуйте изменить условия рассрочки.</p>
                    <p>Максимальная стоимость товара 1 000 000.</p>
                    <p>Минимальный первоначальный взнос 25% от стоимости товара.</p>
                </div>`;
            return;
        }

        const warningsHtml = warnings && warnings.length ? `<div class="warnings-banner"><p>⚠️ ${warnings.join(' ')}</p></div>` : '';

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
                        ${results.map((result, index) => {
                        const noteHtml = result.note
  ? `<span class="bank-note">${result.note}</span>`
  : `<span class="bank-note">Общая стоимость: ${result.totalCost.toLocaleString()}₽, платеж ${result.monthlyPayment.toLocaleString()}₽/мес., мин. взнос 25%</span>`;
                            const bestDeal = index === 0 ? '<span class="best-deal-badge">🏆 Лучшее</span>' : '';
                            return `
                            <tr>
                                <td data-label="Компания" class="bank-name-cell">
                                    ${result.name} ${bestDeal} ${noteHtml}
                                </td>
                                <td data-label="Наценка (₽)">${formatCurrency(result.markup)}</td>
                                <td data-label="Итого (₽)">${formatCurrency(result.totalCost)}</td>
                                <td data-label="В месяц (₽)">${formatCurrency(result.monthlyPayment)}</td>
                                <td data-label="Действие">
                                    <a href="${result.url}"
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       class="apply-btn bank-link"
                                       data-bank-name="${result.name}">
                                        Перейти на сайт
                                    </a>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <p class="disclaimer">💡 Расчёты носят справочный характер. Финальные условия уточняйте у компании-продавца.</p>
        `;
        resultsContainer.innerHTML = tableContent;
    }

    // ============================================
    // ОТСЛЕЖИВАНИЕ КЛИКОВ ПО ССЫЛКАМ (делегирование)
    // ============================================
    resultsContainer.addEventListener('click', (event) => {
        const link = event.target.closest && event.target.closest('a.bank-link');
        if (!link) return;

        const bankName = link.getAttribute('data-bank-name') || 'unknown';
        const sentData = {
            bank: bankName,
            price: lastCalculationInputs.productPrice || lastCalculationInputs.price || null,
            down_payment: lastCalculationInputs.downPayment || lastCalculationInputs.down_payment || null,
            term: lastCalculationInputs.term || null
        };

        if (typeof ym === 'function') {
            try {
                ym(ymCounterId, 'reachGoal', 'bank_click', sentData);
            } catch (e) {
            }
        }
        // Для безопасности — не блокируем переход (ссылки открываются в _blank)
    });
});

