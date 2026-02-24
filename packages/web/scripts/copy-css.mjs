#!/usr/bin/env node

import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const srcDir = path.join(packageDir, "src");
const distDir = path.join(packageDir, "dist");

await mkdir(distDir, { recursive: true });

for (const file of ["core.css", "theme.css"]) {
  await cp(path.join(srcDir, file), path.join(distDir, file));
}
