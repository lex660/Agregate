// Адрес сайта задаётся при сборке переменной SITE_URL (см. .github/workflows/deploy.yml).
// Пока домен не выбран, сайт работает по адресу GitHub Pages.
const url = (process.env.SITE_URL || "https://lex660.github.io/Agregate").replace(/\/$/, "");

export default {
  name: "Сравни рассрочку",
  url,
  host: new URL(url).host,
  pathPrefix: new URL(url).pathname.replace(/\/$/, ""),
  metrikaId: 104202450,
  adsContact: "https://wa.me/79261380676",
  // Оператор персональных данных для страницы /politika/ (issue #6).
  // ФИО или наименование и ИНН заполняет владелец сайта. Пока поля пустые,
  // страница называет оператора «владелец сайта», а npm run check выводит предупреждение.
  operator: {
    name: "",
    inn: "",
    contact: "https://wa.me/79261380676",
  },
  policyDate: "2026-10-15",
  year: new Date().getFullYear(),
  buildDate: new Date().toISOString().slice(0, 10),
};
