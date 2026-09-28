import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

async function filesUnder(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesUnder(directory, name) : [name];
  }));
  return files.flat().sort();
}

/** The initial visit caches the complete built app, including its entry JS/CSS. */
export async function writeOfflineWorker(directory: string): Promise<string[]> {
  const source = await readFile(join(directory, "sw.js"), "utf8");
  // A missed placeholder would ship a constant cache name: old caches never retire.
  for (const marker of ['"dialog-dev-shell"', "/* BUILD_PRECACHE */ []"]) {
    if (!source.includes(marker)) throw new Error(`sw.js lost its build placeholder ${marker}`);
  }
  const files = (await filesUnder(directory)).filter((file) =>
    file !== "sw.js" && file !== "check.html" && !file.endsWith(".map"));
  const digest = createHash("sha256").update(source);
  for (const file of files) digest.update(file).update(await readFile(join(directory, file)));
  const precache = files.map((file) => `/${file}`);
  const worker = source
    .replace('"dialog-dev-shell"', JSON.stringify(`dialog-build-${digest.digest("hex").slice(0, 20)}`))
    .replace('/* BUILD_PRECACHE */ []', JSON.stringify(precache));
  await writeFile(join(directory, "sw.js"), worker);
  return precache;
}

export function offlinePlugin(): Plugin {
  let outDir = "";
  return {
    name: "dialog-offline-precache",
    apply: "build",
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    async closeBundle() { await writeOfflineWorker(outDir); },
  };
}
