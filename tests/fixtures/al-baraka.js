/* Shared by the existing calculator and the variant B catalogue. */
(() => {
  'use strict';
  const annualRates = Object.freeze({ ideal: 0.40, standard: 0.48 });
  const calculate = ({ price, down = 0, months = 12, tariff = 'standard' }) => {
    const annualRate = Object.hasOwn(annualRates, tariff) ? annualRates[tariff] : null;
    if (annualRate === null) return null;
    const financed = price - down;
    // Round up to 100 rubles; the final markup includes this payment rounding.
    const monthly = Math.ceil(financed * (1 + annualRate * months / 12) / months / 100) * 100;
    return { price, down, months, tariff, monthly, total: down + monthly * months };
  };
  window.AlBarakaPayments = Object.freeze({ calculate });
})();
