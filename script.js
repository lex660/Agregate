document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // КОНФИГУРАЦИЯ
    // ============================================
    
    // ВАЖНО: Замените этот URL на URL вашего Cloudflare Worker
    const CLOUDFLARE_WORKER_URL = 'https://islamic-installment-api.sasun-smbatyan.workers.dev';
    
    // DOM элементы
    const form = document.getElementById('calculator-form');
    const resultsContainer = document.getElementById('results-container');
    
    // Переменные состояния
    let lastCalculationInputs = {};
    let isLoading = false;

    // ============================================
    // АНАЛИТИКА
    // ============================================
    
    // Отслеживание посещения страницы
    if (typeof ym === 'function') {
        ym(ymCounterId, 'reachGoal', 'visit');
    }

    // ============================================
    // ОСНОВНАЯ ЛОГИКА
    // ============================================
    
    // Обработчик отправки формы
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        if (isLoading) return; // Предотвращаем множественные запросы

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

        // Сохранение данных расчёта
        lastCalculationInputs = { region, productPrice, downPayment, term };

        // Отправка запроса к Cloudflare Worker
        await fetchAndDisplayResults(region, productPrice, downPayment, term);
        
        // Аналитика: расчёт использован
        if (typeof ym === 'function') {
            ym(ymCounterId, 'reachGoal', 'calc_used', {
                price: productPrice,
                down_payment: downPayment,
                term: term,
                region: region
            });
        }
    });

    // ============================================
    // API ЗАПРОСЫ
    // ============================================
    
    /**
     * Отправка запроса к Cloudflare Worker и отображение результатов
     */
    async function fetchAndDisplayResults(region, price, downPayment, term) {
        try {
            isLoading = true;
            showLoadingState();

            const response = await fetch(`${CLOUDFLARE_WORKER_URL}/api/calculate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    region: region,
                    price: price,
                    downPayment: downPayment,
                    term: term
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success === false && data.error === 'no_data') {
                // Нет доступных данных
                showNoDataState(data.message, data.failedBanks);
            } else if (data.success && data.results) {
                displayResults(data.results, data.warnings);
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }

        } catch (error) {
            console.error('Ошибка при получении данных:', error);
            showErrorState(error.message);
        } finally {
            isLoading = false;
        }
    }

    // ============================================
    // ОТОБРАЖЕНИЕ РЕЗУЛЬТАТОВ
    // ============================================
    
    /**
     * Показать состояние "нет данных"
     */
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

    /**
     * Показать состояние загрузки
     */
    function showLoadingState() {
        resultsContainer.innerHTML = `
            <div class="placeholder">
                <div class="loading-spinner"></div>
                <p>Загрузка предложений...</p>
            </div>`;
    }

    /**
     * Показать ошибку
     */
    function showErrorState(errorMessage) {
        resultsContainer.innerHTML = `
            <div class="placeholder error">
                <p>⚠️ Произошла ошибка при загрузке данных.</p>
                <p class="error-details">${errorMessage}</p>
                <button onclick="location.reload()" class="calculate-btn">Обновить страницу</button>
            </div>`;
    }

    /**
     * Отобразить результаты расчётов
     */
    function displayResults(results, warnings) {
        const formatCurrency = (value) => Math.round(value).toLocaleString('ru-RU');

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="placeholder">
                    <p>❌ Нет доступных предложений для указанных параметров.</p>
                    <p>Попробуйте изменить условия рассрочки.</p>
                </div>`;
            return;
        }

        // Предупреждения о недоступных банках
        const warningsHtml = warnings && warnings.length > 0 
            ? `<div class="warnings-banner">
                <p>⚠️ ${warnings.join(' ')}</p>
               </div>`
            : '';

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
                            const noteHtml = result.note ? `<span class="bank-note">${result.note}</span>` : '';
                            const bestDeal = index === 0 ? '<span class="best-deal-badge">🏆 Лучшее</span>' : '';
                            
                            return `
                            <tr>
                                <td data-label="Компания" class="bank-name-cell">
                                    ${result.name}
                                    ${bestDeal}
                                    ${noteHtml}
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
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <p class="disclaimer">
                💡 Расчёты носят справочный характер. Финальные условия уточняйте у компании-продавца.
            </p>
        `;
        
        resultsContainer.innerHTML = tableContent;
    }

    // ============================================
    // ОТСЛЕЖИВАНИЕ КЛИКОВ ПО ССЫЛКАМ
    // ============================================
    
    resultsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('bank-link')) {
            const link = event.target;
            const bankName = link.getAttribute('data-bank-name');

            // Аналитика: клик по ссылке банка
            if (typeof ym === 'function') {
                ym(ymCounterId, 'reachGoal', 'bank_link_click', {
                    bank: bankName,
                    price: lastCalculationInputs.productPrice,
                    down_payment: lastCalculationInputs.downPayment,
                    term: lastCalculationInputs.term
                });
            }
        }
    });
});
