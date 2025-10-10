document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('calculator-form');
    const resultsContainer = document.getElementById('results-container');

    // State variables
    let lastCalculationInputs = {};

    // Track page visit
    if (typeof ym === 'function') {
        ym(ymCounterId, 'reachGoal', 'visit');
    }

    // --- Calculation Logic for Each Bank ---
    const banks = [
        {
            name: 'Tasnim',
            url: 'https://tasnim.ing/',
            region: 'Ingushetia',
            calculate: (price, downPayment, term) => {
                const MARKUP_RATE = 0.075;
                const financedAmount = price - downPayment;
                const markupValue = financedAmount * MARKUP_RATE;
                const totalPayout = financedAmount + markupValue;
                const monthlyPayment = totalPayout / term;

                return {
                    markup: markupValue,
                    totalCost: downPayment + totalPayout,
                    monthlyPayment: monthlyPayment
                };
            }
        },
        {
            name: 'ФинЛайт',
            url: 'https://финлайт.рф/',
            region: 'Ingushetia',
            calculate: (price, downPayment, term) => {
                const MAX_PRICE = 300000;
                const MAX_TERM = 9;
                const MIN_DOWN_PAYMENT_RATE = 0.25;
                const MARKUP_RATE = 0.125;

                if (price > MAX_PRICE || term > MAX_TERM || downPayment < (price * MIN_DOWN_PAYMENT_RATE)) {
                    return null;
                }

                const financedAmount = price - downPayment;
                const markupValue = financedAmount * MARKUP_RATE;
                const totalPayout = financedAmount + markupValue;
                const monthlyPayment = totalPayout / term;

                return {
                    markup: markupValue,
                    totalCost: downPayment + totalPayout,
                    monthlyPayment: monthlyPayment,
                    note: 'Макс. сумма 300т, макс. срок 9 мес., мин. взнос 25%'
                };
            }
        },
        {
            name: 'Kupitak',
            url: 'https://kupitak.ru/',
            region: 'Ingushetia',
            calculate: (price, downPayment, term) => {
                const MAX_PRICE = 500000;
                const MAX_TERM = 9;
                const MIN_DOWN_PAYMENT_RATE = 0.25;
                const MARKUP_RATE = 0.10;

                if (price > MAX_PRICE || term > MAX_TERM || downPayment < (price * MIN_DOWN_PAYMENT_RATE)) {
                    return null;
                }

                const financedAmount = price - downPayment;
                const markupValue = financedAmount * MARKUP_RATE;
                const totalPayout = financedAmount + markupValue;
                const monthlyPayment = totalPayout / term;

                return {
                    markup: markupValue,
                    totalCost: downPayment + totalPayout,
                    monthlyPayment: monthlyPayment,
                    note: 'Макс. сумма 500т, макс. срок 9 мес., мин. взнос 25%'
                };
            }
        },
        {
            name: 'Al-Baraka',
            url: 'https://www.al-baraka.ru/',
            region: 'Ingushetia',
            calculate: (price, downPayment, term) => {
                const MAX_PRICE = 300000;
                const MIN_DOWN_PAYMENT_RATE = 0.25;
                const TERM_MARKUP_RATES = { 2: 0.04, 3: 0.06, 6: 0.12, 9: 0.181, 12: 0.242 };

                if (price > MAX_PRICE || downPayment < (price * MIN_DOWN_PAYMENT_RATE) || !TERM_MARKUP_RATES[term]) {
                    return null;
                }

                const financedAmount = price - downPayment;
                const markupValue = financedAmount * TERM_MARKUP_RATES[term];
                const totalPayout = financedAmount + markupValue;
                const monthlyPayment = totalPayout / term;

                return {
                    markup: markupValue,
                    totalCost: downPayment + totalPayout,
                    monthlyPayment: monthlyPayment,
                    note: 'Макс. сумма 300т, мин. взнос 25%'
                };
            }
        },
        {
            name: 'LaRiba',
            url: '#',  // TODO: Add URL when available
            region: 'Dagestan',
            calculate: (price, downPayment, term) => {
                const MARKUP_RATE = 0.15;
                const financedAmount = price - downPayment;
                const markupValue = financedAmount * MARKUP_RATE;
                const totalPayout = financedAmount + markupValue;
                const monthlyPayment = totalPayout / term;

                return {
                    markup: markupValue,
                    totalCost: downPayment + totalPayout,
                    monthlyPayment: monthlyPayment
                };
            }
        },
        {
            name: 'Vatan',
            url: '#',  // TODO: Add URL when available
            region: 'Dagestan',
            calculate: (price, downPayment, term) => {
                const TERM_MARKUP_RATES = { 3: 0.13, 6: 0.214, 9: 0.319444, 12: 0.4216 };
                if (!TERM_MARKUP_RATES[term]) return null;

                const financedAmount = price - downPayment;
                const markupValue = financedAmount * TERM_MARKUP_RATES[term];
                const totalPayout = financedAmount + markupValue;
                const monthlyPayment = totalPayout / term;

                return {
                    markup: markupValue,
                    totalCost: downPayment + totalPayout,
                    monthlyPayment: monthlyPayment
                };
            }
        }
    ];

    // --- Main Event Listeners ---
    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const region = document.getElementById('region').value;
        const productPrice = parseFloat(document.getElementById('product-price').value);
        const downPayment = parseFloat(document.getElementById('down-payment').value);
        const term = parseInt(document.getElementById('term').value, 10);

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

        lastCalculationInputs = { productPrice, downPayment, term };

        const results = banks
            .filter(bank => bank.region === region)
            .map(bank => {
                const calculatedData = bank.calculate(productPrice, downPayment, term);
                return calculatedData ? { ...bank, ...calculatedData } : null;
            })
            .filter(Boolean); // Filter out null results

        displayResults(results);

        // Track calculation usage
        if (typeof ym === 'function') {
            ym(ymCounterId, 'reachGoal', 'calc_used', {
                price: productPrice,
                down_payment: downPayment,
                term: term,
                region: region
            });
        }
    });

    function displayResults(results) {
        const formatCurrency = (value) => Math.round(value).toLocaleString('ru-RU');

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="placeholder">
                    <p>Нет доступных предложений для указанных параметров. Попробуйте изменить условия.</p>
                </div>`;
            return;
        }

        const tableContent = `
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
                        ${results.map(result => {
                            const noteHtml = result.note ? `<span class="bank-note">${result.note}</span>` : '';
                            return `
                            <tr>
                                <td data-label="Компания" class="bank-name-cell">${result.name}${noteHtml}</td>
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
            <p class="disclaimer">💡 Расчёты носят справочный характер. Финальные условия уточняйте у компании-продавца.</p>
        `;
        resultsContainer.innerHTML = tableContent;
    }

    // --- Bank Link Click Tracking ---
    resultsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('bank-link')) {
            const link = event.target;
            const bankName = link.getAttribute('data-bank-name');

            // Track bank link click with Yandex Metrika
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
