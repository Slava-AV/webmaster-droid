import assert from "node:assert/strict";
import test from "node:test";

import {
  readEnv,
  readFirstTrimmedEnv,
  readTrimmedEnv,
  requireTrimmedEnv,
} from "./runtime-env";

test("readEnv prefers Deno.env when available", () => {
  const key = "WMD_RUNTIME_ENV_PRIORITY";
  const original = process.env[key];
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;

  try {
    process.env[key] = "process-value";
    (globalThis as { Deno?: unknown }).Deno = {
      env: {
        get(name: string) {
          return name === key ? "deno-value" : undefined;
        },
      },
    };

    assert.equal(readEnv(key), "deno-value");
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }

    if (originalDeno === undefined) {
      delete (globalThis as { Deno?: unknown }).Deno;
    } else {
      (globalThis as { Deno?: unknown }).Deno = originalDeno;
    }
  }
});

test("trim helpers normalize and resolve first match", () => {
  const first = "WMD_RUNTIME_ENV_FIRST";
  const second = "WMD_RUNTIME_ENV_SECOND";
  const firstOriginal = process.env[first];
  const secondOriginal = process.env[second];

  try {
    process.env[first] = "   ";
    process.env[second] = " value-two ";

    assert.equal(readTrimmedEnv(first), undefined);
    assert.equal(readTrimmedEnv(second), "value-two");
    assert.equal(readFirstTrimmedEnv([first, second]), "value-two");
  } finally {
    if (firstOriginal === undefined) {
      delete process.env[first];
    } else {
      process.env[first] = firstOriginal;
    }

    if (secondOriginal === undefined) {
      delete process.env[second];
    } else {
      process.env[second] = secondOriginal;
    }
  }
});

test("requireTrimmedEnv throws for missing values", () => {
  const key = "WMD_RUNTIME_ENV_REQUIRED";
  const original = process.env[key];

  try {
    delete process.env[key];
    assert.throws(() => requireTrimmedEnv(key), /Missing required environment variable/);
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});
