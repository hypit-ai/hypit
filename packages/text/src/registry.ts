import { isDigest } from "@narratage/core";
import type { Digest, ModuleRef } from "@narratage/protocol";

import type {
  RawSurfaceHandler,
  RegisteredSurface,
  StructuredSurfaceHandler,
  TextSurfaceRegistryLike,
} from "./types.js";

function key(module: ModuleRef, surface: string): string {
  return `${module.name}@${module.version}#${surface}`;
}

export class TextSurfaceRegistry implements TextSurfaceRegistryLike {
  readonly #values = new Map<string, RegisteredSurface>();

  registerRaw(
    module: ModuleRef,
    surface: string,
    implementationDigest: Digest,
    handler: RawSurfaceHandler,
  ): void {
    this.register({ module, surface, implementationDigest, mode: "raw", handler });
  }

  registerStructured(
    module: ModuleRef,
    surface: string,
    implementationDigest: Digest,
    handler: StructuredSurfaceHandler,
  ): void {
    this.register({ module, surface, implementationDigest, mode: "structured", handler });
  }

  private register(value: RegisteredSurface): void {
    if (!isDigest(value.implementationDigest)) throw new Error("Surface implementation digest is invalid");
    const identity = key(value.module, value.surface);
    if (this.#values.has(identity)) throw new Error(`Surface ${identity} is already registered`);
    this.#values.set(identity, value);
  }

  resolve(module: ModuleRef, surface: string): RegisteredSurface | undefined {
    return this.#values.get(key(module, surface));
  }
}
