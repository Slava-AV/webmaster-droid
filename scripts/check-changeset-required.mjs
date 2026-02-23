#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const BASE_BRANCH = process.env.GITHUB_BASE_REF || "main";
const BASE_REMOTE_REF = `origin/${BASE_BRANCH}`;

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function tryRunGit(args) {
  try {
    return runGit(args);
  } catch {
    return "";
  }
}

tryRunGit(["fetch", "origin", BASE_BRANCH, "--depth=100"]);

let mergeBase = tryRunGit(["merge-base", "HEAD", BASE_REMOTE_REF]);
if (!mergeBase) {
  mergeBase = tryRunGit(["rev-parse", "HEAD~1"]);
}

const diffRange = mergeBase ? `${mergeBase}..HEAD` : "HEAD";
const changedFilesOutput = tryRunGit(["diff", "--name-only", "--diff-filter=ACMR", diffRange]);
const changedFiles = changedFilesOutput ? changedFilesOutput.split("\n") : [];

const packageChanges = changedFiles.filter((file) => file.startsWith("packages/"));
if (packageChanges.length === 0) {
  console.log("No changes under packages/**; changeset is not required.");
  process.exit(0);
}

const hasChangesetFile = changedFiles.some((file) => {
  return file.startsWith(".changeset/") && file.endsWith(".md") && file !== ".changeset/README.md";
});

if (hasChangesetFile) {
  console.log("Changeset file detected; release intent check passed.");
  process.exit(0);
}

console.error("Changes under packages/** were detected without a changeset file.");
console.error("Add one by running `npm run changeset` and commit the generated file under .changeset/.");
console.error("Changed package files:");
for (const file of packageChanges.slice(0, 25)) {
  console.error(`- ${file}`);
}

if (packageChanges.length > 25) {
  console.error(`...and ${packageChanges.length - 25} more`);
}

process.exit(1);
