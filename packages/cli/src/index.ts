#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import { glob } from "glob";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import { createTwoFilesPatch } from "diff";
import { createJiti } from "jiti";

const program = new Command();

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function defaultPathFor(file: string, line: number, kind: "text" | "link" | "image") {
  const stem = file
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .replace(/\.[tj]sx?$/, "")
    .replace(/[^a-zA-Z0-9/]+/g, "-")
    .replace(/\//g, ".");

  return `pages.todo.${stem}.${kind}.${line}`;
}

async function ensureDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

program
  .name("webmaster-droid")
  .description("Webmaster Droid CLI")
  .version("0.1.0-alpha.0");

program
  .command("init")
  .description("Initialize webmaster-droid config in current project")
  .option("--framework <framework>", "framework", "next")
  .option("--backend <backend>", "backend", "aws")
  .option("--out <dir>", "output dir", ".")
  .action(async (opts) => {
    const outDir = path.resolve(process.cwd(), opts.out);
    const configPath = path.join(outDir, "webmaster-droid.config.ts");
    await ensureDir(configPath);

    const config = `export default {
  framework: "${opts.framework}",
  backend: "${opts.backend}",
  schema: "./cms/schema.webmaster.ts",
  apiBaseUrlEnv: "NEXT_PUBLIC_AGENT_API_BASE_URL"
};\n`;

    try {
      await fs.access(configPath);
      console.log(`Config already exists: ${configPath}`);
    } catch {
      await fs.writeFile(configPath, config, "utf8");
      console.log(`Created: ${configPath}`);
    }

    const envExample = path.join(outDir, ".env.webmaster-droid.example");
    try {
      await fs.access(envExample);
    } catch {
      await fs.writeFile(
        envExample,
        [
          "NEXT_PUBLIC_AGENT_API_BASE_URL=http://localhost:8787",
          "CMS_S3_BUCKET=",
          "CMS_S3_REGION=",
          "CMS_PUBLIC_BASE_URL=https://your-domain.example",
          "SUPABASE_JWKS_URL=",
          "MODEL_OPENAI_ENABLED=true",
          "MODEL_GEMINI_ENABLED=true",
          "DEFAULT_MODEL_ID=openai:gpt-5.2",
        ].join("\n") + "\n",
        "utf8"
      );
      console.log(`Created: ${envExample}`);
    }
  });

const schema = program.command("schema").description("Schema helpers");

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
  .command("scan")
  .description("Scan source files for static content candidates")
  .argument("<srcDir>", "source directory")
  .option("--out <file>", "report output", ".webmaster-droid/scan-report.json")
  .action(async (srcDir, opts) => {
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
    await ensureDir(output);
    await fs.writeFile(
      output,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          source: root,
          totalFiles: files.length,
          totalFindings: findings.length,
          findings,
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    console.log(`Scan complete. Findings: ${findings.length}. Report: ${output}`);
  });

program
  .command("codemod")
  .description("Apply deterministic JSX codemods to Editable components")
  .argument("<srcDir>", "source directory")
  .option("--apply", "write file changes", false)
  .option("--out <file>", "report output", ".webmaster-droid/codemod-report.json")
  .action(async (srcDir, opts) => {
    const root = path.resolve(process.cwd(), srcDir);
    const files = await glob("**/*.{tsx,jsx}", {
      cwd: root,
      absolute: true,
      ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    });

    const changed: Array<Record<string, unknown>> = [];

    for (const file of files) {
      const source = await fs.readFile(file, "utf8");
      const ast = parse(source, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });

      let touched = false;
      let needsEditableTextImport = false;

      traverse(ast, {
        JSXElement(pathNode) {
          const children = pathNode.node.children;
          const nonWhitespace = children.filter(
            (child) => !(t.isJSXText(child) && normalizeText(child.value) === "")
          );

          if (nonWhitespace.length !== 1 || !t.isJSXText(nonWhitespace[0])) {
            return;
          }

          const text = normalizeText(nonWhitespace[0].value);
          if (!text || text.length < 3) {
            return;
          }

          const loc = nonWhitespace[0].loc?.start.line ?? 0;
          const rel = path.relative(process.cwd(), file);
          const pathHint = defaultPathFor(rel, loc, "text");

          const editableEl = t.jsxElement(
            t.jsxOpeningElement(t.jsxIdentifier("EditableText"), [
              t.jsxAttribute(t.jsxIdentifier("path"), t.stringLiteral(pathHint)),
              t.jsxAttribute(t.jsxIdentifier("fallback"), t.stringLiteral(text)),
            ], true),
            null,
            [],
            true
          );

          pathNode.node.children = [t.jsxExpressionContainer(editableEl)];
          touched = true;
          needsEditableTextImport = true;
        },
      });

      if (!touched) {
        continue;
      }

      if (needsEditableTextImport) {
        const body = ast.program.body;
        const hasImport = body.some(
          (node) =>
            t.isImportDeclaration(node) &&
            node.source.value === "@webmaster-droid/web" &&
            node.specifiers.some(
              (specifier) =>
                t.isImportSpecifier(specifier) &&
                t.isIdentifier(specifier.imported) &&
                specifier.imported.name === "EditableText"
            )
        );

        if (!hasImport) {
          body.unshift(
            t.importDeclaration(
              [
                t.importSpecifier(
                  t.identifier("EditableText"),
                  t.identifier("EditableText")
                ),
              ],
              t.stringLiteral("@webmaster-droid/web")
            )
          );
        }
      }

      const next = generate(ast, { retainLines: true }, source).code;
      if (next === source) {
        continue;
      }

      const relFile = path.relative(process.cwd(), file);
      changed.push({
        file: relFile,
        patch: createTwoFilesPatch(relFile, relFile, source, next),
      });

      if (opts.apply) {
        await fs.writeFile(file, next, "utf8");
      }
    }

    const output = path.resolve(process.cwd(), opts.out);
    await ensureDir(output);
    await fs.writeFile(
      output,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          source: root,
          apply: Boolean(opts.apply),
          changedFiles: changed.length,
          changes: changed,
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    console.log(`${opts.apply ? "Applied" : "Previewed"} codemod changes: ${changed.length}. Report: ${output}`);
  });

program
  .command("doctor")
  .description("Validate local environment for webmaster-droid")
  .action(async () => {
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
      console.error("Doctor found issues:");
      for (const issue of issues) {
        console.error(`- ${issue}`);
      }
      process.exitCode = 1;
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
