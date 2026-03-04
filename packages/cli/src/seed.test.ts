import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runSeedJson(input: {
  srcDir: string;
  outFile: string;
  baseFile?: string;
}): Record<string, unknown> {
  const args = [
    "--import",
    "tsx",
    "src/index.ts",
    "seed",
    input.srcDir,
    "--out",
    input.outFile,
    "--json",
  ];

  if (input.baseFile) {
    args.push("--base", input.baseFile);
  }

  const output = execFileSync(process.execPath, args, {
    cwd: packageDir,
    encoding: "utf8",
  });

  return JSON.parse(output) as Record<string, unknown>;
}

function runSeedJsonRaw(input: {
  srcDir: string;
  outFile: string;
  baseFile?: string;
}): ReturnType<typeof spawnSync> {
  const args = [
    "--import",
    "tsx",
    "src/index.ts",
    "seed",
    input.srcDir,
    "--out",
    input.outFile,
    "--json",
  ];

  if (input.baseFile) {
    args.push("--base", input.baseFile);
  }

  return spawnSync(process.execPath, args, {
    cwd: packageDir,
    encoding: "utf8",
  });
}

test("seed extracts editable component paths and writes fallback values", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "wmd-cli-seed-"));
  const srcDir = path.join(outDir, "src");
  const sourceFile = path.join(srcDir, "page.tsx");
  const outFile = path.join(outDir, "cms-seed.json");

  try {
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      sourceFile,
      `import { EditableImage, EditableLink, EditableText } from "@webmaster-droid/web";

export default function Page() {
  return (
    <>
      <EditableText path="pages.home.hero.title" fallback="Welcome" />
      <EditableImage path="pages.home.hero.image" fallbackSrc="/hero.png" altPath="pages.home.hero.imageAlt" fallbackAlt="Hero alt" />
      <EditableLink hrefPath="pages.home.hero.ctaHref" labelPath="pages.home.hero.ctaLabel" fallbackHref="/about" fallbackLabel="About us" />
      <EditableText path={\`pages.home.cards.\${index}.title\`} fallback="Card title" />
    </>
  );
}
`,
      "utf8"
    );

    const envelope = runSeedJson({
      srcDir,
      outFile,
    });

    assert.equal(envelope.ok, true);
    const data = envelope.data as Record<string, unknown>;
    assert.equal(data.discoveredStaticPaths, 5);
    assert.equal(data.dynamicPathSkips, 1);

    const seed = JSON.parse(readFileSync(outFile, "utf8")) as Record<string, unknown>;
    assert.equal(seed.meta !== undefined, true);
    assert.equal(
      (seed.pages as Record<string, unknown>).home !== undefined,
      true
    );

    const pages = seed.pages as Record<string, unknown>;
    const home = pages.home as Record<string, unknown>;
    const hero = home.hero as Record<string, unknown>;
    assert.equal(hero.title, "Welcome");
    assert.equal(hero.image, "/hero.png");
    assert.equal(hero.imageAlt, "Hero alt");
    assert.equal(hero.ctaHref, "/about");
    assert.equal(hero.ctaLabel, "About us");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("seed preserves existing base values", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "wmd-cli-seed-base-"));
  const srcDir = path.join(outDir, "src");
  const sourceFile = path.join(srcDir, "page.tsx");
  const baseFile = path.join(outDir, "base-seed.json");
  const outFile = path.join(outDir, "merged-seed.json");

  try {
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      sourceFile,
      `import { EditableText } from "@webmaster-droid/web";

export default function Page() {
  return <EditableText path="pages.home.hero.title" fallback="Generated title" />;
}
`,
      "utf8"
    );

    writeFileSync(
      baseFile,
      JSON.stringify(
        {
          meta: {
            schemaVersion: 1,
            contentVersion: "seed_v1",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          pages: {
            home: {
              hero: {
                title: "Existing title",
              },
            },
          },
          layout: {},
          seo: {},
          themeTokens: {},
        },
        null,
        2
      ),
      "utf8"
    );

    const envelope = runSeedJson({
      srcDir,
      outFile,
      baseFile,
    });

    assert.equal(envelope.ok, true);
    const data = envelope.data as Record<string, unknown>;
    assert.equal(data.preservedPaths, 1);
    assert.equal(data.writtenPaths, 0);

    const seed = JSON.parse(readFileSync(outFile, "utf8")) as Record<string, unknown>;
    const pages = seed.pages as Record<string, unknown>;
    const home = pages.home as Record<string, unknown>;
    const hero = home.hero as Record<string, unknown>;
    assert.equal(hero.title, "Existing title");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("seed fails when source directory does not exist", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "wmd-cli-seed-missing-"));
  const missingSrcDir = path.join(outDir, "does-not-exist");
  const outFile = path.join(outDir, "cms-seed.json");

  try {
    const result = runSeedJsonRaw({
      srcDir: missingSrcDir,
      outFile,
    });

    assert.notEqual(result.status, 0);
    const stderr = String(result.stderr ?? "");
    const envelope = JSON.parse(stderr) as Record<string, unknown>;
    assert.equal(envelope.ok, false);
    const errors = envelope.errors as string[] | undefined;
    assert.equal(Array.isArray(errors), true);
    assert.match(errors?.[0] ?? "", /Source directory not found:/);
    assert.equal(existsSync(outFile), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
