import { createResolvedClosure } from "@hypit/generation-build";
import type {
  GenerationModuleDeclaration,
  ResolvedGenerationModule,
  ResolvedModuleClosure,
} from "@hypit/generation-build";
import { compareCodeUnits } from "@hypit/protocol";
import { moduleIdentity, moduleKey } from "@hypit/module";
import type { ModuleRef } from "@hypit/module";
import type { ModuleDefinition } from "@hypit/module";

import { CompilerError } from "./error.js";

function manifestRef(manifest: ModuleDefinition): ModuleRef {
  return { name: manifest.name };
}

export type RegisteredModulePackage = {
  readonly manifest: ModuleDefinition;
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
  readonly #manifests = new Map<string, ModuleDefinition>();
  readonly #generation = new Map<string, GenerationModuleDeclaration>();
  readonly #specifiers = new Map<string, string>();

  register(value: RegisteredModulePackage): void {
    const ref = manifestRef(value.manifest);
    const display = moduleKey(ref);
    const identity = moduleIdentity(ref);
    const existing = this.#manifests.get(identity);
    if (existing !== undefined) {
      throw new CompilerError("DUPLICATE_MODULE_PACKAGE", `Module package ${display} is already registered`, display);
    }
    const owner = this.#specifiers.get(display);
    if (owner !== undefined) {
      throw new CompilerError(
        "DUPLICATE_MODULE_SPECIFIER",
        `Import ${display} is already bound to ${owner}`,
        display,
      );
    }
    this.#manifests.set(identity, value.manifest);
    this.#specifiers.set(display, identity);
  }

  registerGeneration(declaration: GenerationModuleDeclaration): void {
    const identity = moduleIdentity(declaration.module);
    if (this.#generation.has(identity)) {
      const display = moduleKey(declaration.module);
      throw new CompilerError(
        "DUPLICATE_GENERATION_MODULE",
        `Generation declarations for ${display} are already registered`,
        display,
      );
    }
    this.#generation.set(identity, declaration);
  }

  resolve(request: string): ModuleRef | undefined {
    const key = this.#specifiers.get(request);
    const manifest = key === undefined ? undefined : this.#manifests.get(key);
    return manifest === undefined ? undefined : manifestRef(manifest);
  }

  createClosure(requests: readonly string[]): ResolvedModuleClosure {
    const included = new Map<string, ModuleDefinition>();
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
    const resolved: ResolvedGenerationModule[] = [...included.values()]
      .sort((left, right) => compareCodeUnits(moduleKey(manifestRef(left)), moduleKey(manifestRef(right))))
      .map((manifest) => {
        const generation = this.#generation.get(moduleIdentity(manifestRef(manifest)));
        return {
          ...manifest,
          capabilities: generation?.capabilities ?? [],
          producers: generation?.producers ?? [],
        };
      });
    return createResolvedClosure(resolved);
  }
}
