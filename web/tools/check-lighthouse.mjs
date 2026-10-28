import { readFileSync } from "node:fs";

const paths = process.argv.slice(2);
const budgets = {
  performance: 0.9,
  accessibility: 0.95,
  "best-practices": 0.95,
  seo: 0.95,
};

if (paths.length === 0) {
  console.error("usage: check-lighthouse.mjs <report.json> [report.json ...]");
  process.exit(2);
}

let passed = 0;
for (const path of paths) {
  let report;
  try {
    report = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    continue;
  }

  let failed = false;
  for (const [category, minimum] of Object.entries(budgets)) {
    const score = report.categories?.[category]?.score;
    const shown = typeof score === "number" ? Math.round(score * 100) : "n/a";
    const floor = Math.round(minimum * 100);
    console.log(`${path}: ${category} ${shown} (minimum ${floor})`);
    if (typeof score !== "number" || score < minimum) {
      failed = true;
    }
  }
  if (!failed) {
    passed += 1;
  }
}

if (passed === 0) {
  console.error("No Lighthouse run met all budgets.");
  process.exit(1);
}

console.log(`${passed}/${paths.length} Lighthouse runs met all budgets.`);
