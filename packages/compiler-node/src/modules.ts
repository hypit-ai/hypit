import { createResolvedClosure } from "@hypit/core";
import type {
  ModuleManifest,
  ModuleRef,
  ResolvedModuleClosure,
} from "@hypit/protocol";

import { NodeCompilerError } from "./error.js";

function moduleKey(ref: ModuleRef): string {
  return `${ref.name}@${ref.version}`;
}

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
    const key = moduleKey(ref);
    const existing = this.#manifests.get(key);
    if (existing !== undefined) {
      throw new NodeCompilerError("DUPLICATE_MODULE_PACKAGE", `Module package ${key} is already registered`, key);
    }
    const specifiers = new Set([key, ...(value.specifiers ?? [])]);
    for (const specifier of specifiers) {
      if (specifier.length === 0) {
        throw new NodeCompilerError("EMPTY_MODULE_SPECIFIER", `${key} declares an empty import specifier`, key);
      }
      const owner = this.#specifiers.get(specifier);
      if (owner !== undefined) {
        throw new NodeCompilerError(
          "DUPLICATE_MODULE_SPECIFIER",
          `Import ${specifier} is already bound to ${owner}`,
          specifier,
        );
      }
    }
    this.#manifests.set(key, value.manifest);
    for (const specifier of specifiers) this.#specifiers.set(specifier, key);
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
        throw new NodeCompilerError("MISSING_MODULE_DEPENDENCY", `Module dependency ${key} is not registered`, key);
      }
      included.set(key, manifest);
      for (const dependency of manifest.dependencies) {
        const dependencyKey = moduleKey(dependency.module);
        const resolved = this.#manifests.get(dependencyKey);
        if (resolved === undefined) {
          throw new NodeCompilerError(
            "MISSING_MODULE_DEPENDENCY",
            `${key} requires unregistered module ${dependencyKey}`,
            dependencyKey,
          );
        }
        visit(dependencyKey);
      }
    };

    for (const request of [...new Set(requests)].sort()) {
      const key = this.#specifiers.get(request);
      if (key === undefined) {
        throw new NodeCompilerError("UNKNOWN_MODULE_IMPORT", `No registered module satisfies ${request}`, request);
      }
      visit(key);
    }
    return createResolvedClosure(
      [...included.values()].sort((left, right) =>
        moduleKey(manifestRef(left)).localeCompare(moduleKey(manifestRef(right))),
      ),
    );
  }
}
