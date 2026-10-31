import { registerHooks } from "node:module";
import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  embeddedPackageDirectory,
} from "./location.js";

let installed: readonly string[] = [];

function packageAddress(specifier: string): { readonly name: string; readonly subpath: string } | undefined {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (parts.length < 2) return undefined;
    return { name: `${parts[0]}/${parts[1]}`, subpath: parts.slice(2).join("/") };
  }
  return { name: parts[0]!, subpath: parts.slice(1).join("/") };
}

function distributionPackageEntry(root: string, specifier: string): string | undefined {
  const address = packageAddress(specifier);
  if (address === undefined) return undefined;
  const packageRoot = embeddedPackageDirectory(root, address.name);
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

function distributionPublicEntry(root: string, specifier: string): string | undefined {
  const address = packageAddress(specifier);
  if (address === undefined) return undefined;
  const manifestPath = join(root, "package.json");
  if (!existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    readonly name?: string;
    readonly exports?: Readonly<Record<string, string | {
      readonly import?: string;
      readonly default?: string;
    }>>;
  };
  if (manifest.name !== address.name) return undefined;
  const declared = manifest.exports?.[address.subpath.length === 0 ? "." : `./${address.subpath}`];
  const target = typeof declared === "string" ? declared : declared?.import ?? declared?.default;
  return target === undefined ? undefined : resolve(root, target);
}

/** Resolve one import owned by an explicit Hypit Distribution. */
export function resolveDistributionPackageImport(root: string, specifier: string): string | undefined {
  return distributionPublicEntry(resolve(root), specifier) ?? distributionPackageEntry(resolve(root), specifier);
}

/** Whether one package import is shared host code of the active Distribution. */
export function isActiveDistributionHostImport(specifier: string): boolean {
  return installed.some((root) => resolveDistributionPackageImport(root, specifier) !== undefined);
}

/**
 * Let external activations import public APIs and exact embedded packages from a read-only
 * Distribution. Independently published @hypit packages remain ordinary project dependencies.
 */
export function installDistributionPackageResolution(roots: readonly string[]): void {
  const next = roots.map((root) => resolve(root));
  if (next.every((root, index) => root === installed[index]) && next.length === installed.length) return;
  if (installed.length > 0) throw new Error("Distribution package roots cannot change inside one Host process");
  installed = next;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      for (const root of installed) {
        const entry = resolveDistributionPackageImport(root, specifier);
        if (entry !== undefined) return nextResolve(pathToFileURL(entry).href, context);
      }
      return nextResolve(specifier, context);
    },
  });
}

/** Install this Distribution's package resolver before a standalone worker loads its adapters. */
export function installOwningDistributionPackageResolution(): void {
  installDistributionPackageResolution([fileURLToPath(new URL("../../../../", import.meta.url))]);
}
