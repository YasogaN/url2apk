#!/usr/bin/env node

const base = process.argv[2] ?? "http://127.0.0.1:8787";

const checks = [
  {
    name: "landing page",
    path: "/",
    status: 200,
    type: "text/html",
    body: /<h1/,
  },
  {
    name: "security.txt",
    path: "/.well-known/security.txt",
    status: 200,
    type: "text/plain",
    body: /^Contact: https:\/\//m,
  },
  {
    name: "AI catalog",
    path: "/.well-known/ai-catalog.json",
    status: 200,
    type: "application/json",
    body: /"specVersion": "1\.0"/,
  },
  {
    name: "legacy security redirect",
    path: "/security.txt",
    status: 301,
    location: "/.well-known/security.txt",
  },
  {
    name: "guide page",
    path: "/website-to-apk",
    status: 200,
    type: "text/html",
    body: /<h1/,
  },
  {
    name: "missing page",
    path: "/this-page-should-not-exist",
    status: 404,
    type: "text/html",
    body: /This page is not installed\./,
  },
];

let failures = 0;

for (const check of checks) {
  const url = new URL(check.path, base);
  let response;
  try {
    response = await fetch(url, { redirect: "manual" });
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${check.name} (${check.path}): ${message}`);
    continue;
  }

  const problems = [];
  if (response.status !== check.status) {
    problems.push(`status ${response.status}, expected ${check.status}`);
  }

  const type = response.headers.get("content-type") ?? "";
  if (check.type !== undefined && !type.startsWith(check.type)) {
    problems.push(`content-type ${type || "(none)"}, expected ${check.type}`);
  }

  if (check.location !== undefined) {
    const location = response.headers.get("location");
    if (location !== check.location) {
      problems.push(
        `location ${location ?? "(none)"}, expected ${check.location}`,
      );
    }
  }

  const body = await response.text();
  if (check.body !== undefined && !check.body.test(body)) {
    problems.push(`body did not match ${check.body}`);
  }

  if (problems.length > 0) {
    failures += 1;
    console.error(`FAIL ${check.name} (${check.path}): ${problems.join("; ")}`);
  } else {
    console.log(`ok   ${check.name} (${check.path})`);
  }
}

if (failures > 0) {
  console.error(`${failures} check(s) failed against ${base}`);
  process.exitCode = 1;
} else {
  console.log(`all checks passed against ${base}`);
}
