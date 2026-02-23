#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const srcDir = path.join(cwd, "src");

function collectTestFiles(dir, result) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectTestFiles(fullPath, result);
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".test.ts")) {
      result.push(path.relative(cwd, fullPath));
    }
  }
}

const testFiles = [];

try {
  collectTestFiles(srcDir, testFiles);
} catch (error) {
  if (error && error.code === "ENOENT") {
    console.log("No src directory found; skipping tests.");
    process.exit(0);
  }
  throw error;
}

if (testFiles.length === 0) {
  console.log("No test files found; skipping tests.");
  process.exit(0);
}

try {
  execFileSync("tsx", ["--test", ...testFiles], { stdio: "inherit" });
} catch (error) {
  process.exit(error.status ?? 1);
}
