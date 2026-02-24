import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runInit(outDir: string): string {
  return execFileSync(
    process.execPath,
    ["--import", "tsx", "src/index.ts", "init", "--out", outDir, "--backend", "aws"],
    {
      cwd: packageDir,
      encoding: "utf8",
    }
  );
}

test("init creates env template and does not create webmaster-droid.config.ts", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "wmd-cli-init-"));

  try {
    const output = runInit(outDir);
    const envPath = path.join(outDir, ".env.webmaster-droid.example");
    const configPath = path.join(outDir, "webmaster-droid.config.ts");

    assert.equal(existsSync(envPath), true);
    assert.equal(existsSync(configPath), false);
    assert.match(readFileSync(envPath, "utf8"), /NEXT_PUBLIC_AGENT_API_BASE_URL=/);
    assert.match(output, /Backend preset: aws/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("init is idempotent when env template already exists", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "wmd-cli-init-existing-"));
  const envPath = path.join(outDir, ".env.webmaster-droid.example");

  try {
    runInit(outDir);
    const firstVersion = readFileSync(envPath, "utf8");
    const output = runInit(outDir);
    const secondVersion = readFileSync(envPath, "utf8");

    assert.equal(secondVersion, firstVersion);
    assert.match(output, /Env template already exists/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
