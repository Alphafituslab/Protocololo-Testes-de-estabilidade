import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, "../src/build-info.ts");

const content = readFileSync(filePath, "utf-8");

const buildMatch = content.match(/BUILD_NUMBER = (\d+)/);
const currentBuild = buildMatch ? parseInt(buildMatch[1], 10) : 0;
const nextBuild = currentBuild + 1;

const today = new Date().toISOString().slice(0, 10);

const updated = content
  .replace(/BUILD_NUMBER = \d+/, `BUILD_NUMBER = ${nextBuild}`)
  .replace(/BUILD_DATE = "[^"]*"/, `BUILD_DATE = "${today}"`);

writeFileSync(filePath, updated, "utf-8");
console.log(`Build incremented: ${currentBuild} → ${nextBuild} (${today})`);
