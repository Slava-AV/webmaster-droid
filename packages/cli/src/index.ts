#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import { glob } from "glob";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import { createTwoFilesPatch } from "diff";
import { createJiti } from "jiti";
import { normalizeText, transformEditableTextCodemod } from "./codemod";

const program = new Command();
const CLI_VERSION = "0.1.0-alpha.0";
const traverse =
  (traverseModule as unknown as { default?: typeof traverseModule }).default ??
  traverseModule;

interface CliEnvelope {
  ok: boolean;
  command: string;
  version: string;
  timestamp: string;
  data?: Record<string, unknown>;
  errors?: string[];
}

function emitCliEnvelope(payload: CliEnvelope, isError = false) {
  const out = JSON.stringify(payload, null, 2);
  if (isError) {
    console.error(out);
    return;
  }

  console.log(out);
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ensureDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function splitPath(pathValue: string): string[] {
  return pathValue
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function readByPath(input: unknown, pathValue: string): unknown {
  const segments = splitPath(pathValue);
  let current: unknown = input;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isNaN(index)) {
        return undefined;
      }

      current = current[index];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function writeByPath(input: unknown, pathValue: string, value: unknown): boolean {
  const segments = splitPath(pathValue);
  if (segments.length === 0) {
    return false;
  }

  let current: unknown = input;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (Array.isArray(current)) {
      const itemIndex = Number(segment);
      if (Number.isNaN(itemIndex)) {
        return false;
      }

      if (current[itemIndex] === undefined) {
        const next = segments[index + 1];
        current[itemIndex] = /^\d+$/.test(next) ? [] : {};
      }

      current = current[itemIndex];
      continue;
    }

    if (!isRecord(current)) {
      return false;
    }

    if (current[segment] === undefined) {
      const next = segments[index + 1];
      current[segment] = /^\d+$/.test(next) ? [] : {};
    }

    current = current[segment];
  }

  const leaf = segments.at(-1);
  if (!leaf) {
    return false;
  }

  if (Array.isArray(current)) {
    const itemIndex = Number(leaf);
    if (Number.isNaN(itemIndex)) {
      return false;
    }

    current[itemIndex] = value;
    return true;
  }

  if (!isRecord(current)) {
    return false;
  }

  current[leaf] = value;
  return true;
}

type SeedDocument = {
  meta: {
    schemaVersion: number;
    contentVersion: string;
    updatedAt: string;
    updatedBy: string;
    [key: string]: unknown;
  };
  themeTokens: Record<string, unknown>;
  layout: Record<string, unknown>;
  pages: Record<string, unknown>;
  seo: Record<string, unknown>;
  [key: string]: unknown;
};

function createSeedDocument(): SeedDocument {
  const now = new Date().toISOString();
  return {
    meta: {
      schemaVersion: 1,
      contentVersion: "seed_v1",
      updatedAt: now,
      updatedBy: "seed-generator",
    },
    themeTokens: {},
    layout: {},
    pages: {},
    seo: {},
  };
}

function normalizeSeedDocument(input: unknown): SeedDocument {
  const defaults = createSeedDocument();
  if (!isRecord(input)) {
    return defaults;
  }

  const output: SeedDocument = {
    ...defaults,
    ...input,
  } as SeedDocument;

  const metaValue = isRecord(output.meta) ? output.meta : {};
  output.meta = {
    ...defaults.meta,
    ...metaValue,
  };

  for (const key of ["themeTokens", "layout", "pages", "seo"] as const) {
    if (!isRecord(output[key])) {
      output[key] = {};
    }
  }

  return output;
}

function extractIdentifierName(value: t.JSXOpeningElement["name"]): string | null {
  if (t.isJSXIdentifier(value)) {
    return value.name;
  }

  return null;
}

type AttributeValueResult =
  | { kind: "missing" }
  | { kind: "dynamic" }
  | { kind: "static"; value: string };

function staticTemplateLiteralValue(template: t.TemplateLiteral): string | null {
  if (template.expressions.length > 0) {
    return null;
  }

  return template.quasis.map((part) => part.value.cooked ?? part.value.raw).join("");
}

function resolveAttributeValue(
  value: t.JSXAttribute["value"] | null | undefined
): AttributeValueResult {
  if (!value) {
    return { kind: "missing" };
  }

  if (t.isStringLiteral(value)) {
    return { kind: "static", value: value.value };
  }

  if (!t.isJSXExpressionContainer(value)) {
    return { kind: "dynamic" };
  }

  const expression = value.expression;
  if (t.isStringLiteral(expression)) {
    return { kind: "static", value: expression.value };
  }

  if (t.isTemplateLiteral(expression)) {
    const staticValue = staticTemplateLiteralValue(expression);
    if (staticValue !== null) {
      return { kind: "static", value: staticValue };
    }
  }

  return { kind: "dynamic" };
}

function findAttribute(
  node: t.JSXOpeningElement,
  name: string
): t.JSXAttribute | null {
  for (const attribute of node.attributes) {
    if (!t.isJSXAttribute(attribute)) {
      continue;
    }

    if (!t.isJSXIdentifier(attribute.name)) {
      continue;
    }

    if (attribute.name.name === name) {
      return attribute;
    }
  }

  return null;
}

type EditablePathSpec = {
  pathProp: string;
  fallbackProp: string;
};

const EDITABLE_COMPONENT_PATHS: Record<string, EditablePathSpec[]> = {
  EditableText: [{ pathProp: "path", fallbackProp: "fallback" }],
  EditableRichText: [{ pathProp: "path", fallbackProp: "fallback" }],
  EditableImage: [
    { pathProp: "path", fallbackProp: "fallbackSrc" },
    { pathProp: "altPath", fallbackProp: "fallbackAlt" },
  ],
  EditableLink: [
    { pathProp: "hrefPath", fallbackProp: "fallbackHref" },
    { pathProp: "labelPath", fallbackProp: "fallbackLabel" },
  ],
};

function isSeedableEditablePath(pathValue: string): boolean {
  return (
    pathValue.startsWith("pages.") ||
    pathValue.startsWith("layout.") ||
    pathValue.startsWith("seo.") ||
    pathValue.startsWith("themeTokens.")
  );
}

program
  .name("webmaster-droid")
  .description("Webmaster Droid CLI")
  .version(CLI_VERSION);

program
  .command("init")
  .description("Initialize webmaster-droid environment template in current project")
  .option("--backend <backend>", "backend (supabase|aws)", "supabase")
  .option("--out <dir>", "output dir", ".")
  .action(async (opts) => {
    const backendRaw = String(opts.backend ?? "supabase").trim().toLowerCase();
    if (backendRaw !== "supabase" && backendRaw !== "aws") {
      throw new Error(`Unsupported backend '${opts.backend}'. Expected 'supabase' or 'aws'.`);
    }

    const backend = backendRaw as "supabase" | "aws";
    const outDir = path.resolve(process.cwd(), opts.out);

    const envExample = path.join(outDir, ".env.webmaster-droid.example");
    let createdEnvTemplate = false;
    try {
      await fs.access(envExample);
    } catch {
      await ensureDir(envExample);
      await fs.writeFile(
        envExample,
        [
          "NEXT_PUBLIC_AGENT_API_BASE_URL=http://localhost:8787",
          "",
          "# Supabase (default backend)",
          "# Supabase Edge blocks user-defined secrets with SUPABASE_ prefix.",
          "# Use CMS_* overrides for custom secrets and leave built-in SUPABASE_* values as provided by Supabase.",
          "NEXT_PUBLIC_SUPABASE_URL=",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
          "SUPABASE_URL=",
          "SUPABASE_ANON_KEY=",
          "SUPABASE_SERVICE_ROLE_KEY=",
          "CMS_SUPABASE_URL=",
          "CMS_SUPABASE_JWKS_URL=",
          "CMS_SUPABASE_AUTH_KEY=",
          "CMS_SUPABASE_JWT_SECRET=",
          "CMS_SUPABASE_BUCKET=webmaster-droid-cms",
          "CMS_STORAGE_PREFIX=cms",
          "",
          "# Shared runtime",
          "CMS_PUBLIC_BASE_URL=https://your-domain.example",
          "MODEL_OPENAI_ENABLED=true",
          "MODEL_GEMINI_ENABLED=true",
          "DEFAULT_MODEL_ID=openai:gpt-5.2",
          "",
          "# AWS (optional backend)",
          "CMS_S3_BUCKET=",
          "CMS_S3_REGION=",
        ].join("\n") + "\n",
        "utf8"
      );
      createdEnvTemplate = true;
    }

    if (createdEnvTemplate) {
      console.log(`Created: ${envExample}`);
    } else {
      console.log(`Env template already exists: ${envExample}`);
    }

    console.log(`Backend preset: ${backend}`);
  });

const schema = program.command("schema").description("Optional schema helpers");

schema
  .command("init")
  .description("Create starter schema file")
  .option("--out <file>", "schema output", "cms/schema.webmaster.ts")
  .action(async (opts) => {
    const outFile = path.resolve(process.cwd(), opts.out);
    await ensureDir(outFile);
    const template = `export default {
  name: "webmaster-droid-schema",
  version: 1,
  editablePathPrefixes: ["pages.", "layout.", "seo.", "themeTokens."],
  notes: "Adjust this schema to your website model"
};\n`;

    try {
      await fs.access(outFile);
      console.log(`Schema already exists: ${outFile}`);
    } catch {
      await fs.writeFile(outFile, template, "utf8");
      console.log(`Created: ${outFile}`);
    }
  });

schema
  .command("build")
  .description("Compile schema file to runtime manifest JSON")
  .requiredOption("--input <file>", "input schema file (.ts, .js, .json)")
  .option("--output <file>", "output manifest", "cms/schema.manifest.json")
  .action(async (opts) => {
    const input = path.resolve(process.cwd(), opts.input);
    const output = path.resolve(process.cwd(), opts.output);

    let manifest: Record<string, unknown>;
    if (input.endsWith(".json")) {
      manifest = await readJson<Record<string, unknown>>(input);
    } else {
      const jiti = createJiti(import.meta.url);
      const loaded = (await jiti.import(input)) as {
        default?: unknown;
        schema?: unknown;
      };
      manifest = (loaded.default ?? loaded.schema ?? loaded) as Record<string, unknown>;
    }

    if (!manifest || typeof manifest !== "object") {
      throw new Error("Schema manifest must be an object.");
    }

    const prefixes = (manifest.editablePathPrefixes ?? []) as unknown;
    if (!Array.isArray(prefixes) || prefixes.some((value) => typeof value !== "string")) {
      throw new Error("manifest.editablePathPrefixes must be a string array.");
    }

    await ensureDir(output);
    await fs.writeFile(output, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`Wrote manifest: ${output}`);
  });

program
  .command("seed")
  .description("Generate CMS seed document from Editable component paths")
  .argument("<srcDir>", "source directory")
  .option("--out <file>", "seed output file", "cms/seed.from-editables.json")
  .option("--base <file>", "merge into an existing seed document")
  .option("--json", "emit machine-readable JSON output", false)
  .action(async (srcDir, opts) => {
    try {
      const root = path.resolve(process.cwd(), srcDir);
      let rootStat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        rootStat = await fs.stat(root);
      } catch {
        throw new Error(`Source directory not found: ${root}`);
      }

      if (!rootStat.isDirectory()) {
        throw new Error(`Source path is not a directory: ${root}`);
      }

      const files = await glob("**/*.{ts,tsx,js,jsx}", {
        cwd: root,
        absolute: true,
        ignore: ["**/*.d.ts", "**/node_modules/**", "**/.next/**", "**/dist/**"],
      });

      const staticPaths = new Map<string, { fallback: string; source: string; line?: number }>();
      const dynamicPaths: Array<{ file: string; line?: number; prop: string }> = [];
      const invalidPaths: Array<{ file: string; line?: number; path: string }> = [];

      for (const file of files) {
        const code = await fs.readFile(file, "utf8");
        const ast = parse(code, {
          sourceType: "module",
          plugins: ["typescript", "jsx"],
        });

        traverse(ast, {
          JSXOpeningElement(pathNode) {
            const componentName = extractIdentifierName(pathNode.node.name);
            if (!componentName) {
              return;
            }

            const specs = EDITABLE_COMPONENT_PATHS[componentName];
            if (!specs) {
              return;
            }

            for (const spec of specs) {
              const pathAttr = findAttribute(pathNode.node, spec.pathProp);
              const pathValue = resolveAttributeValue(pathAttr?.value);
              if (pathValue.kind === "missing") {
                continue;
              }

              const relFile = path.relative(process.cwd(), file);
              if (pathValue.kind === "dynamic") {
                dynamicPaths.push({
                  file: relFile,
                  line: pathAttr?.loc?.start.line,
                  prop: spec.pathProp,
                });
                continue;
              }

              const normalizedPath = pathValue.value.trim();
              if (!normalizedPath) {
                continue;
              }

              if (!isSeedableEditablePath(normalizedPath)) {
                invalidPaths.push({
                  file: relFile,
                  line: pathAttr?.loc?.start.line,
                  path: normalizedPath,
                });
                continue;
              }

              const fallbackAttr = findAttribute(pathNode.node, spec.fallbackProp);
              const fallbackValue = resolveAttributeValue(fallbackAttr?.value);
              const fallback =
                fallbackValue.kind === "static" ? fallbackValue.value : "";

              const existing = staticPaths.get(normalizedPath);
              if (!existing) {
                staticPaths.set(normalizedPath, {
                  fallback,
                  source: relFile,
                  line: pathAttr?.loc?.start.line,
                });
                continue;
              }

              if (!existing.fallback && fallback) {
                staticPaths.set(normalizedPath, {
                  fallback,
                  source: relFile,
                  line: pathAttr?.loc?.start.line,
                });
              }
            }
          },
        });
      }

      const baseFile = opts.base
        ? path.resolve(process.cwd(), String(opts.base))
        : null;
      const baseSeed = baseFile
        ? await readJson<Record<string, unknown>>(baseFile)
        : createSeedDocument();
      const seedDocument = normalizeSeedDocument(baseSeed);

      let writtenPaths = 0;
      let preservedPaths = 0;
      let writeFailures = 0;
      for (const [seedPath, entry] of staticPaths.entries()) {
        const existingValue = readByPath(seedDocument, seedPath);
        if (existingValue !== undefined) {
          preservedPaths += 1;
          continue;
        }

        const written = writeByPath(seedDocument, seedPath, entry.fallback);
        if (written) {
          writtenPaths += 1;
        } else {
          writeFailures += 1;
        }
      }

      const output = path.resolve(process.cwd(), opts.out);
      await ensureDir(output);
      await fs.writeFile(output, JSON.stringify(seedDocument, null, 2) + "\n", "utf8");

      const report = {
        outputPath: output,
        source: root,
        baseFile,
        totalFiles: files.length,
        discoveredStaticPaths: staticPaths.size,
        writtenPaths,
        preservedPaths,
        dynamicPathSkips: dynamicPaths.length,
        invalidPathSkips: invalidPaths.length,
        writeFailures,
      };

      if (opts.json) {
        emitCliEnvelope({
          ok: writeFailures === 0,
          command: "seed",
          version: CLI_VERSION,
          timestamp: new Date().toISOString(),
          data: report,
          errors:
            writeFailures > 0
              ? [`Failed to write ${writeFailures} discovered path(s) into seed document.`]
              : undefined,
        }, writeFailures > 0);
        if (writeFailures > 0) {
          process.exitCode = 1;
        }
        return;
      }

      console.log(
        `Seed generated. Static paths: ${staticPaths.size}. Written: ${writtenPaths}. Preserved: ${preservedPaths}. Output: ${output}`
      );
      if (dynamicPaths.length > 0) {
        console.log(
          `Skipped ${dynamicPaths.length} dynamic path expression(s). Convert them manually or use concrete index paths.`
        );
      }
      if (invalidPaths.length > 0) {
        console.log(
          `Skipped ${invalidPaths.length} non-editable path(s) outside pages/layout/seo/themeTokens.`
        );
      }
      if (writeFailures > 0) {
        throw new Error(`Failed to write ${writeFailures} discovered path(s) into seed document.`);
      }
    } catch (error) {
      if (!opts.json) {
        throw error;
      }

      emitCliEnvelope(
        {
          ok: false,
          command: "seed",
          version: CLI_VERSION,
          timestamp: new Date().toISOString(),
          errors: [errorToMessage(error)],
        },
        true
      );
      process.exitCode = 1;
    }
  });

program
  .command("scan")
  .description("Scan source files for static content candidates")
  .argument("<srcDir>", "source directory")
  .option("--out <file>", "report output", ".webmaster-droid/scan-report.json")
  .option("--json", "emit machine-readable JSON output", false)
  .action(async (srcDir, opts) => {
    try {
      const root = path.resolve(process.cwd(), srcDir);
      const files = await glob("**/*.{ts,tsx,js,jsx}", {
        cwd: root,
        absolute: true,
        ignore: ["**/*.d.ts", "**/node_modules/**", "**/.next/**", "**/dist/**"],
      });

      const findings: Array<Record<string, unknown>> = [];

      for (const file of files) {
        const code = await fs.readFile(file, "utf8");
        const ast = parse(code, {
          sourceType: "module",
          plugins: ["typescript", "jsx"],
        });

        traverse(ast, {
          JSXText(pathNode) {
            const text = normalizeText(pathNode.node.value);
            if (!text || text.length < 3) {
              return;
            }

            findings.push({
              type: "jsx-text",
              file: path.relative(process.cwd(), file),
              line: pathNode.node.loc?.start.line,
              column: pathNode.node.loc?.start.column,
              text,
            });
          },
          JSXAttribute(pathNode) {
            const name = t.isJSXIdentifier(pathNode.node.name) ? pathNode.node.name.name : "";
            if (!["src", "href", "alt", "title"].includes(name)) {
              return;
            }

            const valueNode = pathNode.node.value;
            if (!valueNode || !t.isStringLiteral(valueNode)) {
              return;
            }

            findings.push({
              type: "jsx-attr",
              attr: name,
              file: path.relative(process.cwd(), file),
              line: valueNode.loc?.start.line,
              column: valueNode.loc?.start.column,
              text: valueNode.value,
            });
          },
        });
      }

      const output = path.resolve(process.cwd(), opts.out);
      const report = {
        createdAt: new Date().toISOString(),
        source: root,
        totalFiles: files.length,
        totalFindings: findings.length,
        findings,
      };
      await ensureDir(output);
      await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");

      if (opts.json) {
        emitCliEnvelope({
          ok: true,
          command: "scan",
          version: CLI_VERSION,
          timestamp: new Date().toISOString(),
          data: {
            reportPath: output,
            source: root,
            totalFiles: files.length,
            totalFindings: findings.length,
          },
        });
        return;
      }

      console.log(`Scan complete. Findings: ${findings.length}. Report: ${output}`);
    } catch (error) {
      if (!opts.json) {
        throw error;
      }

      emitCliEnvelope(
        {
          ok: false,
          command: "scan",
          version: CLI_VERSION,
          timestamp: new Date().toISOString(),
          errors: [errorToMessage(error)],
        },
        true
      );
      process.exitCode = 1;
    }
  });

program
  .command("codemod")
  .description("Apply deterministic JSX codemods to Editable components")
  .argument("<srcDir>", "source directory")
  .option("--apply", "write file changes", false)
  .option("--out <file>", "report output", ".webmaster-droid/codemod-report.json")
  .option("--json", "emit machine-readable JSON output", false)
  .action(async (srcDir, opts) => {
    try {
      const root = path.resolve(process.cwd(), srcDir);
      const files = await glob("**/*.{tsx,jsx}", {
        cwd: root,
        absolute: true,
        ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
      });

      const changed: Array<Record<string, unknown>> = [];
      const failures: Array<{ file: string; error: string }> = [];

      for (const file of files) {
        const relFile = path.relative(process.cwd(), file);
        try {
          const source = await fs.readFile(file, "utf8");
          const transformed = transformEditableTextCodemod(source, file, root);
          if (!transformed.changed) {
            continue;
          }
          const next = transformed.next;

          changed.push({
            file: relFile,
            patch: createTwoFilesPatch(relFile, relFile, source, next),
          });

          if (opts.apply) {
            await fs.writeFile(file, next, "utf8");
          }
        } catch (error) {
          failures.push({
            file: relFile,
            error: errorToMessage(error),
          });
        }
      }

      const output = path.resolve(process.cwd(), opts.out);
      const report = {
        createdAt: new Date().toISOString(),
        source: root,
        apply: Boolean(opts.apply),
        changedFiles: changed.length,
        failedFiles: failures.length,
        failures,
        changes: changed,
      };
      await ensureDir(output);
      await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");

      if (failures.length > 0) {
        const errorMessage = failures
          .map((item) => `${item.file}: ${item.error}`)
          .join("; ");

        if (opts.json) {
          emitCliEnvelope(
            {
              ok: false,
              command: "codemod",
              version: CLI_VERSION,
              timestamp: new Date().toISOString(),
              data: {
                reportPath: output,
                source: root,
                apply: Boolean(opts.apply),
                changedFiles: changed.length,
              },
              errors: [errorMessage],
            },
            true
          );
          process.exitCode = 1;
          return;
        }

        console.error(`Codemod encountered ${failures.length} file error(s). Report: ${output}`);
        for (const failure of failures) {
          console.error(`- ${failure.file}: ${failure.error}`);
        }
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        emitCliEnvelope({
          ok: true,
          command: "codemod",
          version: CLI_VERSION,
          timestamp: new Date().toISOString(),
          data: {
            reportPath: output,
            source: root,
            apply: Boolean(opts.apply),
            changedFiles: changed.length,
          },
        });
        return;
      }

      console.log(
        `${opts.apply ? "Applied" : "Previewed"} codemod changes: ${changed.length}. Report: ${output}`
      );
    } catch (error) {
      if (!opts.json) {
        throw error;
      }

      emitCliEnvelope(
        {
          ok: false,
          command: "codemod",
          version: CLI_VERSION,
          timestamp: new Date().toISOString(),
          errors: [errorToMessage(error)],
        },
        true
      );
      process.exitCode = 1;
    }
  });

program
  .command("doctor")
  .description("Validate local environment for webmaster-droid")
  .option("--json", "emit machine-readable JSON output", false)
  .action(async (opts) => {
    const issues: string[] = [];

    const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
    if (!Number.isFinite(major) || major < 20) {
      issues.push(`Node.js 20+ required, found ${process.versions.node}`);
    }

    try {
      await fs.access(path.resolve(process.cwd(), "package.json"));
    } catch {
      issues.push("package.json missing in current working directory");
    }

    if (issues.length > 0) {
      if (opts.json) {
        emitCliEnvelope(
          {
            ok: false,
            command: "doctor",
            version: CLI_VERSION,
            timestamp: new Date().toISOString(),
            data: {
              checksPassed: false,
            },
            errors: issues,
          },
          true
        );
        process.exitCode = 1;
        return;
      }

      console.error("Doctor found issues:");
      for (const issue of issues) {
        console.error(`- ${issue}`);
      }
      process.exitCode = 1;
      return;
    }

    if (opts.json) {
      emitCliEnvelope({
        ok: true,
        command: "doctor",
        version: CLI_VERSION,
        timestamp: new Date().toISOString(),
        data: {
          checksPassed: true,
        },
      });
      return;
    }

    console.log("Doctor checks passed.");
  });

program
  .command("dev")
  .description("Start project dev command (pass-through)")
  .option("--cmd <command>", "command to run", "npm run dev")
  .action(async (opts) => {
    const [bin, ...args] = opts.cmd.split(" ");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, { stdio: "inherit", shell: true });
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Command failed with code ${code ?? "unknown"}`));
      });
    });
  });

const deploy = program.command("deploy").description("Deployment helpers");

const aws = deploy.command("aws").description("Deploy AWS lambda bundle");

aws
  .requiredOption("--entry <file>", "entry TypeScript file")
  .requiredOption("--region <region>", "AWS region")
  .requiredOption("--functions <names>", "comma-separated Lambda function names")
  .option("--tmp-dir <dir>", "temp folder", "/tmp/webmaster-droid-deploy")
  .action(async (opts) => {
    const entry = path.resolve(process.cwd(), opts.entry);
    const tmpDir = opts.tmpDir;
    const functions = String(opts.functions)
      .split(",")
      .map((item: string) => item.trim())
      .filter(Boolean);

    const run = (cmd: string) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, { stdio: "inherit", shell: true });
        child.on("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Command failed: ${cmd}`));
          }
        });
      });

    await run(`rm -rf ${tmpDir} && mkdir -p ${tmpDir}`);
    await run(`npx esbuild ${entry} --bundle --platform=node --target=node20 --format=cjs --outfile=${tmpDir}/index.js`);
    await run(`cd ${tmpDir} && zip -q lambda.zip index.js`);

    for (const fn of functions) {
      await run(`aws lambda update-function-code --region ${opts.region} --function-name ${fn} --zip-file fileb://${tmpDir}/lambda.zip >/dev/null`);
      await run(`aws lambda wait function-updated --region ${opts.region} --function-name ${fn}`);
    }
  });

const supabase = deploy
  .command("supabase")
  .description("Deploy Supabase edge functions");

supabase
  .requiredOption("--project-ref <ref>", "Supabase project reference")
  .requiredOption("--functions <names>", "comma-separated function names")
  .option("--env-file <path>", "path to env file for function deployment")
  .option("--no-verify-jwt", "disable JWT verification for deployed functions")
  .action(async (opts) => {
    const functions = String(opts.functions)
      .split(",")
      .map((item: string) => item.trim())
      .filter(Boolean);

    if (functions.length === 0) {
      throw new Error("No function names provided.");
    }

    const run = (cmd: string) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, { stdio: "inherit", shell: true });
        child.on("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Command failed: ${cmd}`));
          }
        });
      });

    for (const fn of functions) {
      const parts = [
        "supabase functions deploy",
        fn,
        "--project-ref",
        opts.projectRef,
      ];
      if (opts.envFile) {
        parts.push("--env-file", opts.envFile);
      }
      if (opts.verifyJwt === false) {
        parts.push("--no-verify-jwt");
      }

      await run(parts.join(" "));
    }
  });

const skill = program.command("skill").description("Skill helpers");

skill
  .command("install")
  .description("Install bundled conversion skill into CODEX_HOME")
  .option("--codex-home <dir>", "CODEX_HOME path override")
  .option("--force", "overwrite existing", false)
  .action(async (opts) => {
    const cliDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(cliDir, "../../..");
    const sourceSkill = path.join(repoRoot, "skills", "webmaster-droid-convert");

    const codexHome = opts.codexHome || process.env.CODEX_HOME;
    if (!codexHome) {
      throw new Error("CODEX_HOME is not set. Provide --codex-home.");
    }

    const destination = path.join(codexHome, "skills", "webmaster-droid-convert");
    await ensureDir(path.join(destination, "SKILL.md"));

    try {
      await fs.access(destination);
      if (!opts.force) {
        throw new Error(`Skill already exists at ${destination}. Use --force to overwrite.`);
      }
      await fs.rm(destination, { recursive: true, force: true });
    } catch {
      // continue
    }

    await fs.cp(sourceSkill, destination, { recursive: true });
    console.log(`Installed skill to ${destination}`);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
