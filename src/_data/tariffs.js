import { readFileSync } from "node:fs";

// Единственный источник истины — data/tariffs.json в корне репозитория.
export default function () {
  return JSON.parse(readFileSync(new URL("../../data/tariffs.json", import.meta.url), "utf8"));
}
