import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const budgets = {
  performance: 0.9,
  accessibility: 0.95,
  "best-practices": 0.95,
  seo: 0.95,
};

let failed = false;
for (const [category, minimum] of Object.entries(budgets)) {
  const score = report.categories?.[category]?.score;
  const shown = typeof score === "number" ? Math.round(score * 100) : "n/a";
  const floor = Math.round(minimum * 100);
  console.log(`${category}: ${shown} (minimum ${floor})`);
  if (typeof score !== "number" || score < minimum) {
    failed = true;
  }
}

if (failed) {
  console.error("Lighthouse scores are below the budget.");
  process.exit(1);
}
