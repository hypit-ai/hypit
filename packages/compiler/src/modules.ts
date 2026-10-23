import { createResolvedClosure } from "@hypit/kernel";
import { compareCodeUnits, moduleIdentity, moduleKey } from "@hypit/protocol";
import type {
  ModuleManifest,
  ModuleRef,
  ResolvedModuleClosure,
} from "@hypit/protocol";

import { CompilerError } from "./error.js";

function manifestRef(manifest: ModuleManifest): ModuleRef {
  return { name: manifest.name, version: manifest.version };
}

export type RegisteredModulePackage = {
  readonly manifest: ModuleManifest;
  /** Additional author import spellings resolved to this exact manifest. */
  readonly specifiers?: readonly string[];
};

export interface ModulePackageRegistryLike {
  resolve(request: string): ModuleRef | undefined;
  createClosure(requests: readonly string[]): ResolvedModuleClosure;
}

/**
 * Deterministic registry of already trusted/installed module manifests.
 *
 * This is intentionally not an npm loader: locating and trusting executable package code belongs
 * to the embedding Host. The registry only resolves an author import spelling to one immutable
 * manifest and closes that manifest's declared dependencies.
 */
export class ModulePackageRegistry implements ModulePackageRegistryLike {
  readonly #manifests = new Map<string, ModuleManifest>();
  readonly #specifiers = new Map<string, string>();

  register(value: RegisteredModulePackage): void {
    const ref = manifestRef(value.manifest);
    const display = moduleKey(ref);
    const identity = moduleIdentity(ref);
    const existing = this.#manifests.get(identity);
    if (existing !== undefined) {
      throw new CompilerError("DUPLICATE_MODULE_PACKAGE", `Module package ${display} is already registered`, display);
    }
    const specifiers = new Set([display, ...(value.specifiers ?? [])]);
    for (const specifier of specifiers) {
      if (specifier.length === 0) {
        throw new CompilerError("EMPTY_MODULE_SPECIFIER", `${display} declares an empty import specifier`, display);
      }
      const owner = this.#specifiers.get(specifier);
      if (owner !== undefined) {
        throw new CompilerError(
          "DUPLICATE_MODULE_SPECIFIER",
          `Import ${specifier} is already bound to ${owner}`,
          specifier,
        );
      }
    }
    this.#manifests.set(identity, value.manifest);
    for (const specifier of specifiers) this.#specifiers.set(specifier, identity);
  }

  resolve(request: string): ModuleRef | undefined {
    const key = this.#specifiers.get(request);
    const manifest = key === undefined ? undefined : this.#manifests.get(key);
    return manifest === undefined ? undefined : manifestRef(manifest);
  }

  createClosure(requests: readonly string[]): ResolvedModuleClosure {
    const included = new Map<string, ModuleManifest>();
    const visit = (key: string): void => {
      if (included.has(key)) return;
      const manifest = this.#manifests.get(key);
      if (manifest === undefined) {
        throw new CompilerError("MISSING_MODULE_DEPENDENCY", `Module dependency ${key} is not registered`, key);
      }
      included.set(key, manifest);
      for (const dependency of manifest.dependencies) {
        const dependencyIdentity = moduleIdentity(dependency);
        const dependencyDisplay = moduleKey(dependency);
        const resolved = this.#manifests.get(dependencyIdentity);
        if (resolved === undefined) {
          throw new CompilerError(
            "MISSING_MODULE_DEPENDENCY",
            `${moduleKey(manifestRef(manifest))} requires unregistered module ${dependencyDisplay}`,
            dependencyDisplay,
          );
        }
        visit(dependencyIdentity);
      }
    };

    for (const request of [...new Set(requests)].sort()) {
      const key = this.#specifiers.get(request);
      if (key === undefined) {
        throw new CompilerError("UNKNOWN_MODULE_IMPORT", `No registered module satisfies ${request}`, request);
      }
      visit(key);
    }
    return createResolvedClosure(
      [...included.values()].sort((left, right) =>
        compareCodeUnits(moduleKey(manifestRef(left)), moduleKey(manifestRef(right))),
      ),
    );
  }
}
