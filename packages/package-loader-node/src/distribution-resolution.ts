import { createRequire, registerHooks } from "node:module";
import { basename, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

let installed: readonly string[] = [];

function distributionPackageEntry(root: string, specifier: string): string | undefined {
  const packageRoot = join(root, "packages", basename(specifier));
  const manifestPath = join(packageRoot, "package.json");
  if (!existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    readonly name?: string;
    readonly exports?: string | { readonly "."?: string };
  };
  if (manifest.name !== specifier) return undefined;
  const declared = typeof manifest.exports === "string" ? manifest.exports : manifest.exports?.["."];
  return declared === undefined ? undefined : resolve(packageRoot, declared);
}

/**
 * Let external project activations import official packages from a read-only Distribution checkout.
 * The @hypit namespace belongs to the active Distribution and cannot be shadowed by project installs.
 */
export function installDistributionPackageResolution(roots: readonly string[]): void {
  const next = roots.map((root) => resolve(root));
  if (next.every((root, index) => root === installed[index]) && next.length === installed.length) return;
  if (installed.length > 0) throw new Error("Distribution package roots cannot change inside one Host process");
  installed = next;
  const resolvers = installed.map((root) => createRequire(join(root, "__hypit_distribution__.cjs")));
  const rootUrls = installed.map((root) => pathToFileURL(`${root}/`).href);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@hypit/")) {
        // Absolute/file parent ids are already part of this Distribution's
        // module graph; let ordinary package-relative resolution use that
        // package's own pnpm links.
        if (context.parentURL !== undefined
          && context.parentURL.startsWith("file:")
          && rootUrls.some((root) => context.parentURL!.startsWith(root))) {
          return nextResolve(specifier, context);
        }
        // Package-relative pnpm links are legitimate only when their real target
        // remains in this Distribution. A project-local shadow with the same
        // spelling resolves successfully too, so success alone is not enough.
        try {
          const found = nextResolve(specifier, context);
          if (found.url.startsWith("file:") && rootUrls.some((root) => found.url.startsWith(root))) {
            return found;
          }
        } catch {
          // Try the explicit Distribution resolvers below.
        }
        for (const resolver of resolvers) {
          try {
            return { url: pathToFileURL(resolver.resolve(specifier)).href, shortCircuit: true };
          } catch {
            const entry = distributionPackageEntry(installed[resolvers.indexOf(resolver)]!, specifier);
            if (entry !== undefined) return { url: pathToFileURL(entry).href, shortCircuit: true };
            // Try the next explicit Distribution root.
          }
        }
        throw new Error(`Active Hypit Distribution does not provide ${specifier}`);
      }
      return nextResolve(specifier, context);
    },
  });
}
