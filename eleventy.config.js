import { limitsSummary } from "./src/assets/js/calc.js";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/yandex_49e44b65439ecbfe.html": "yandex_49e44b65439ecbfe.html" });
  eleventyConfig.addPassthroughCopy({ "src/google27ab92039188ca79.html": "google27ab92039188ca79.html" });
  eleventyConfig.addWatchTarget("data/");

  eleventyConfig.addFilter("json", (value) =>
    // Безопасная вставка JSON в <script type="application/json">
    JSON.stringify(value).replace(/</g, "\\u003c")
  );
  eleventyConfig.addFilter("ruDate", (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  });
  eleventyConfig.addFilter("rub", (n) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ") + " ₽");
  eleventyConfig.addFilter("byRegion", (companies, regionId) => companies.filter((c) => c.regions.includes(regionId)));
  eleventyConfig.addFilter("activeAds", (ads) => ads.filter((a) => a.active && (!a.is_ad || (a.erid && a.advertiser))));
  eleventyConfig.addFilter("tariffsOf", (tariffs, companyId) => tariffs.filter((t) => t.company === companyId));
  // Перечень лимитов тарифа: каждое ограничение названо отдельно.
  // Сводить стоимость товара и сумму финансирования в одно «до N ₽» нельзя.
  eleventyConfig.addFilter("limits", (t) => limitsSummary(t));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    pathPrefix: new URL(process.env.SITE_URL || "https://lex660.github.io/Agregate").pathname,
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
  };
}
