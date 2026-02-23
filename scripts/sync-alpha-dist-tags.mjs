#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_DIRS = ["contracts", "web", "server", "cli"];

function loadPackageManifest(packageDir) {
  const manifestPath = path.join(ROOT_DIR, "packages", packageDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (!manifest.name || !manifest.version) {
    throw new Error(`Missing required name/version fields in ${manifestPath}`);
  }

  return {
    name: manifest.name,
    version: manifest.version,
  };
}

function setAlphaTag(name, version) {
  const spec = `${name}@${version}`;
  const command = `npm dist-tag add ${spec} alpha`;

  try {
    execFileSync("npm", ["dist-tag", "add", spec, "alpha"], {
      cwd: ROOT_DIR,
      stdio: "pipe",
      encoding: "utf8",
    });
    console.log(`Tagged ${spec} as alpha`);
  } catch (error) {
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";

    throw new Error(
      `Failed to run "${command}"\n` +
        `${stdout ? `stdout:\n${stdout}\n` : ""}` +
        `${stderr ? `stderr:\n${stderr}\n` : ""}` +
        "Check npm publish permissions/trusted publishing configuration and package ownership."
    );
  }
}

for (const packageDir of PACKAGE_DIRS) {
  const { name, version } = loadPackageManifest(packageDir);
  setAlphaTag(name, version);
}
