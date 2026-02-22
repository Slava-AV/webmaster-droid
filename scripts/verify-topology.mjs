import { promises as fs } from "node:fs";
import path from "node:path";

const REQUIRED_PACKAGE_DIRS = ["cli", "contracts", "server", "web"];
const REQUIRED_WORKSPACES = REQUIRED_PACKAGE_DIRS.map((name) => `@webmaster-droid/${name}`);
const LEGACY_PACKAGE_NAMES = [
  "@webmaster-droid/admin",
  "@webmaster-droid/admin-ui",
  "@webmaster-droid/react",
  "@webmaster-droid/core",
  "@webmaster-droid/storage-s3",
  "@webmaster-droid/agent-ai-sdk",
  "@webmaster-droid/api-aws",
];

const rootDir = process.cwd();
const errors = [];

function sorted(values) {
  return [...values].sort();
}

function addError(message) {
  errors.push(message);
}

async function verifyPackageDirs() {
  const packagesDir = path.join(rootDir, "packages");
  const entries = await fs.readdir(packagesDir, { withFileTypes: true });
  const found = sorted(
    entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name)
  );
  const expected = sorted(REQUIRED_PACKAGE_DIRS);

  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    addError(
      `packages/ directory mismatch. expected=${expected.join(", ")} found=${found.join(", ")}`
    );
  }
}

async function verifyRootScripts() {
  const packageJsonPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const scripts = pkg.scripts ?? {};

  for (const scriptName of ["build", "typecheck"]) {
    const script = scripts[scriptName];
    if (typeof script !== "string" || !script.trim()) {
      addError(`package.json scripts.${scriptName} is missing or empty.`);
      continue;
    }

    for (const workspace of REQUIRED_WORKSPACES) {
      if (!script.includes(workspace)) {
        addError(`package.json scripts.${scriptName} must include ${workspace}.`);
      }
    }

    for (const legacy of LEGACY_PACKAGE_NAMES) {
      if (script.includes(legacy)) {
        addError(`package.json scripts.${scriptName} still references legacy package ${legacy}.`);
      }
    }
  }
}

async function verifyDocsAndWorkflows() {
  const workflowDir = path.join(rootDir, ".github", "workflows");
  const workflowFiles = (await fs.readdir(workflowDir))
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => path.join(workflowDir, name));

  const filesToScan = [
    path.join(rootDir, "README.md"),
    path.join(rootDir, "CHANGELOG.md"),
    ...workflowFiles,
  ];

  for (const file of filesToScan) {
    const content = await fs.readFile(file, "utf8");
    for (const legacy of LEGACY_PACKAGE_NAMES) {
      if (content.includes(legacy)) {
        addError(`${path.relative(rootDir, file)} references legacy package ${legacy}.`);
      }
    }
  }
}

await verifyPackageDirs();
await verifyRootScripts();
await verifyDocsAndWorkflows();

if (errors.length > 0) {
  console.error("Topology verification failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Topology verification passed.");
