// Линтер: базовые правила ESLint. Запуск — npm run lint.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["_site/**", "node_modules/**", "tests/fixtures/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      // Правило проекта: данные в DOM только через textContent / DOM-API
      "no-restricted-properties": ["error",
        { property: "innerHTML", message: "Только textContent или DOM-API (правило проекта)." },
        { property: "outerHTML", message: "Только textContent или DOM-API (правило проекта)." },
        { property: "insertAdjacentHTML", message: "Только textContent или DOM-API (правило проекта)." },
      ],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["src/assets/js/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // consent.js — обычный (не модульный) скрипт: нужен document.currentScript
    files: ["src/assets/js/consent.js"],
    languageOptions: { sourceType: "script" },
  },
];
