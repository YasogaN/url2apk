#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: check-lcov.mjs <coverage.lcov> [...]");
  process.exit(2);
}

let instrumented = 0;
let missed = 0;
for (const file of files) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.startsWith("DA:")) {
      continue;
    }
    const [lineNumber, count] = line.slice(3).split(",");
    instrumented += 1;
    if (Number(count) === 0) {
      missed += 1;
      console.error(`${file}:${lineNumber} has no coverage`);
    }
  }
}
if (instrumented === 0) {
  console.error("No instrumented lines were found.");
  process.exit(1);
}
if (missed > 0) {
  console.error(`${missed}/${instrumented} instrumented lines are uncovered.`);
  process.exit(1);
}
console.log(`100% line coverage across ${instrumented} instrumented lines.`);
