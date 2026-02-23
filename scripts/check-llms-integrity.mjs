#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const files = ["llms.txt", "llms-full.txt"];
const requiredLinks = [
  "README.md",
  "AGENTS.md",
  "docs/index.md",
  "docs/value-proposition.md",
  "docs/getting-started/non-technical-quickstart.md",
  "docs/migration/optional-skill.md",
  "docs/api/openapi.api-aws.yaml"
];

for (const name of files) {
  const full = path.join(repoRoot, name);
  if (!existsSync(full)) {
    console.error(`Missing required file: ${name}`);
    process.exit(1);
  }
}

const markdownLinkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
const discovered = new Set();

for (const name of files) {
  const full = path.join(repoRoot, name);
  const content = await readFile(full, "utf8");
  for (const match of content.matchAll(markdownLinkRegex)) {
    const target = match[1].trim().split("#", 1)[0].split("?", 1)[0];
    if (!target || /^[a-z]+:/i.test(target)) {
      continue;
    }

    discovered.add(target);

    const resolved = target.startsWith("/")
      ? path.join(repoRoot, target.slice(1))
      : path.resolve(path.dirname(full), target);

    if (!existsSync(resolved)) {
      console.error(`${name} references missing path: ${target}`);
      process.exit(1);
    }
  }
}

const missingRequired = requiredLinks.filter((link) => !discovered.has(link));
if (missingRequired.length > 0) {
  console.error("llms index is missing required references:");
  for (const item of missingRequired) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("llms index integrity verified.");
