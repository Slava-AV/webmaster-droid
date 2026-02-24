import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const cssFiles = ["core.css", "theme.css"].map((file) => path.join(srcDir, file));

const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: ":root selector", pattern: /(^|[\s,{]):root(?=[\s,{.#[:]|$)/m },
  { label: ":host selector", pattern: /(^|[\s,{]):host(?=[\s,{.#[:]|$)/m },
  { label: "@layer theme", pattern: /@layer\s+theme\b/ },
  { label: "@layer base", pattern: /@layer\s+base\b/ },
  { label: "global html selector", pattern: /(^|[\s,{])html(?=[\s,{.#[:]|$)/m },
  { label: "global body selector", pattern: /(^|[\s,{])body(?=[\s,{.#[:]|$)/m },
];

for (const filePath of cssFiles) {
  test(`${path.basename(filePath)} stays scoped`, () => {
    const css = readFileSync(filePath, "utf8");

    for (const { label, pattern } of forbiddenPatterns) {
      assert.equal(
        pattern.test(css),
        false,
        `${path.basename(filePath)} should not include ${label}`
      );
    }
  });
}
