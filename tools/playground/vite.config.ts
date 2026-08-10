import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

/**
 * Workspace packages publish raw TypeScript (`exports: { ".": "./src/index.ts" }`),
 * so they must reach Vite as project source rather than as prebundled
 * dependencies. Aliasing every package by its declared entry does that and picks
 * up transitive dependencies for free — enumerating them by hand would drift the
 * moment a package gains one.
 */
function workspaceAliases(): Array<{ find: string; replacement: string }> {
  const packages = join(repoRoot, "packages");
  return readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = join(packages, entry.name, "package.json");
      let manifest: { name?: unknown; exports?: unknown };
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof manifest;
      } catch {
        return [];
      }
      const entryPoint = (manifest.exports as Record<string, unknown> | undefined)?.["."];
      if (typeof manifest.name !== "string" || typeof entryPoint !== "string") return [];
      // Exact-or-followed-by-slash matching keeps one package prefix from
      // swallowing another package whose name happens to extend it.
      return [{ find: manifest.name, replacement: join(packages, entry.name, entryPoint) }];
    });
}

export default defineConfig({
  root: here,
  resolve: {
    alias: [
      // `digestOf` hashes synchronously at module load, so Web Crypto cannot
      // stand in. See src/shims/node-crypto.ts.
      { find: "node:crypto", replacement: join(here, "src/shims/node-crypto.ts") },
      ...workspaceAliases(),
    ],
  },
  server: {
    port: 5178,
    // Workspace sources resolve through the aliases above, which point outside
    // this root. Stylesheets and media are chosen by the operator and read in
    // the browser, so the server serves no repository content of its own.
    fs: { allow: [repoRoot] },
  },
});
