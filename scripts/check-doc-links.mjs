#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const filesToCheck = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (fullPath.endsWith(".md") || fullPath.endsWith(".txt")) {
      filesToCheck.push(fullPath);
    }
  }
}

walk(path.join(repoRoot, "docs"));
for (const topLevel of ["README.md", "AGENTS.md", "llms.txt", "llms-full.txt"]) {
  const target = path.join(repoRoot, topLevel);
  if (existsSync(target)) {
    filesToCheck.push(target);
  }
}

const markdownLinkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
const missing = [];

for (const filePath of filesToCheck) {
  const content = await readFile(filePath, "utf8");
  const linkTargets = [...content.matchAll(markdownLinkRegex)].map((match) => match[1].trim());

  for (const target of linkTargets) {
    if (!target || target.startsWith("#")) {
      continue;
    }

    if (/^[a-z]+:/i.test(target) || target.startsWith("//")) {
      continue;
    }

    const withoutAnchor = target.split("#", 1)[0].split("?", 1)[0];
    if (!withoutAnchor) {
      continue;
    }

    const resolved = target.startsWith("/")
      ? path.join(repoRoot, withoutAnchor.slice(1))
      : path.resolve(path.dirname(filePath), withoutAnchor);

    if (!existsSync(resolved)) {
      missing.push(`${path.relative(repoRoot, filePath)} -> ${target}`);
      continue;
    }

    const stats = statSync(resolved);
    if (stats.isDirectory()) {
      const indexMd = path.join(resolved, "index.md");
      if (!existsSync(indexMd)) {
        missing.push(`${path.relative(repoRoot, filePath)} -> ${target} (directory missing index.md)`);
      }
    }
  }
}

if (missing.length > 0) {
  console.error("Broken documentation links detected:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`Documentation links verified (${filesToCheck.length} files).`);
