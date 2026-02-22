import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptsDir, "..");
const source = join(packageRoot, "src", "agent", "SOUL.md");
const destinationDir = join(packageRoot, "dist", "agent");
const destination = join(destinationDir, "SOUL.md");

await mkdir(destinationDir, { recursive: true });
await copyFile(source, destination);
