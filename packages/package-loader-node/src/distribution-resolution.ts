import { registerHooks } from "node:module";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  distributionPackageDirectory,
  setActiveDistributionPackageRoots,
  setActiveExternalPackageRoots,
} from "./location.js";

let installed: readonly string[] = [];
let externalInstalled: readonly string[] = [];

function packageAddress(specifier: string): { readonly name: string; readonly subpath: string } | undefined {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (parts.length < 2) return undefined;
    return { name: `${parts[0]}/${parts[1]}`, subpath: parts.slice(2).join("/") };
  }
  return { name: parts[0]!, subpath: parts.slice(1).join("/") };
}

function barePackageSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".")
    && !specifier.startsWith("/")
    && !specifier.startsWith("#")
    && !specifier.includes(":");
}

function distributionPackageEntry(root: string, specifier: string): string | undefined {
  const address = packageAddress(specifier);
  if (address === undefined) return undefined;
  const packageRoot = distributionPackageDirectory(root, address.name);
  if (packageRoot === undefined) return undefined;
  const manifestPath = join(packageRoot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    readonly name?: string;
    readonly exports?: string | Readonly<Record<string, string>>;
  };
  if (manifest.name !== address.name) return undefined;
  const key = address.subpath.length === 0 ? "." : `./${address.subpath}`;
  const declared = typeof manifest.exports === "string"
    ? (key === "." ? manifest.exports : undefined)
    : manifest.exports?.[key];
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
  setActiveDistributionPackageRoots(installed);
  const rootUrls = installed.map((root) => pathToFileURL(`${root}/`).href);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@hypit/")) {
        // A contributor checkout may resolve through workspace links. An installed
        // monolithic Distribution resolves from its own packages/services tree.
        // Accept ordinary resolution only when its real target remains inside this
        // Distribution; a project-local package with the same spelling may not shadow it.
        try {
          const found = nextResolve(specifier, context);
          if (found.url.startsWith("file:") && rootUrls.some((root) => found.url.startsWith(root))) {
            return found;
          }
        } catch {
          // Try the explicit Distribution resolvers below.
        }
        for (const root of installed) {
          const entry = distributionPackageEntry(root, specifier);
          if (entry !== undefined) return { url: pathToFileURL(entry).href, shortCircuit: true };
        }
        throw new Error(`Active Hypit Distribution does not provide ${specifier}`);
      }
      return nextResolve(specifier, context);
    },
  });
}

/**
 * Fall back to the machine npm home for upstream packages that are not part of
 * the Distribution or the current project. Project resolution always wins;
 * the @hypit namespace always remains Distribution-owned.
 */
export function installExternalPackageResolution(roots: readonly string[]): void {
  const next = roots.map((root) => resolve(root));
  if (next.every((root, index) => root === externalInstalled[index])
    && next.length === externalInstalled.length) return;
  if (externalInstalled.length > 0) {
    throw new Error("External package roots cannot change inside one Host process");
  }
  externalInstalled = next;
  setActiveExternalPackageRoots(externalInstalled);
  const parentUrls = externalInstalled.map((root) => pathToFileURL(join(root, "__hypit_external__.mjs")).href);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@hypit/") || !barePackageSpecifier(specifier)) {
        return nextResolve(specifier, context);
      }
      try {
        return nextResolve(specifier, context);
      } catch (original) {
        for (const parentURL of parentUrls) {
          try {
            return nextResolve(specifier, { ...context, parentURL });
          } catch {
            // Try the next machine package root before preserving Node's error.
          }
        }
        throw original;
      }
    },
  });
}
