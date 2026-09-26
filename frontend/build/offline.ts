import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** Entry code loads before SW control on a first visit. Precache the build,
 * including lazy screens, instead of relying on a second online reload. */
export function offlineShell(): Plugin {
  let publicDir = "";
  return {
    name: "dialog-offline-shell",
    apply: "build",
    enforce: "post",
    configResolved(config) { publicDir = config.publicDir; },
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter(name => /\.(?:js|css)$/.test(name)).sort();
      if (!files.length) throw new Error("Offline shell has no application assets");
      const template = readFileSync(join(publicDir, "sw.js"), "utf8");
      const marker = "const BUILD_ASSETS = [];";
      if (!template.includes(marker)) throw new Error("Offline precache marker missing");
      this.emitFile({ type: "asset", fileName: "sw.js", source: template.replace(marker,
        `const BUILD_ASSETS = ${JSON.stringify(files.map(name => "/" + name))};`) });
    },
  };
}
