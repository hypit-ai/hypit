import type { ModuleRef } from "@narratage/protocol";

import type {
  RawSurfaceDeclaration,
  RawSurfaceHandler,
  RegisteredSurface,
  MarkupSurfaceRegistryLike,
  StructuredSurfaceDeclaration,
  StructuredSurfaceHandler,
} from "./types.js";

function key(module: ModuleRef, surface: string): string {
  return `${module.name}@${module.version}#${surface}`;
}

export class MarkupSurfaceRegistry implements MarkupSurfaceRegistryLike {
  readonly #values = new Map<string, RegisteredSurface>();

  register(value: RegisteredSurface): void {
    if (value.module.name.trim().length === 0 || value.module.version.trim().length === 0) {
      throw new Error("Surface module identity is invalid");
    }
    if (value.surface.trim().length === 0) throw new Error("Surface name is empty");
    if (value.tag.trim().length === 0) throw new Error("Surface tag is empty");
    if (value.mode !== "raw" && value.mode !== "structured") throw new Error("Surface mode is invalid");
    const identity = key(value.module, value.surface);
    if (this.#values.has(identity)) throw new Error(`Surface ${identity} is already registered`);
    const tag = [...this.#values.values()].find((item) =>
      item.module.name === value.module.name
      && item.module.version === value.module.version
      && item.tag === value.tag);
    if (tag !== undefined) throw new Error(`Surface tag ${value.tag} is already registered for ${value.module.name}@${value.module.version}`);
    this.#values.set(identity, value);
  }

  registerRaw(options: {
    readonly module: ModuleRef;
    readonly declaration: RawSurfaceDeclaration;
    readonly handler: RawSurfaceHandler;
  }): void {
    this.register({
      module: options.module,
      surface: options.declaration.name,
      tag: options.declaration.tag,
      outputs: options.declaration.outputs,
      mode: "raw",
      handler: options.handler,
    });
  }

  registerStructured(options: {
    readonly module: ModuleRef;
    readonly declaration: StructuredSurfaceDeclaration;
    readonly handler: StructuredSurfaceHandler;
  }): void {
    this.register({
      module: options.module,
      surface: options.declaration.name,
      tag: options.declaration.tag,
      outputs: options.declaration.outputs,
      mode: "structured",
      handler: options.handler,
    });
  }

  resolve(module: ModuleRef, surface: string): RegisteredSurface | undefined {
    return this.#values.get(key(module, surface));
  }

  surfaces(module: ModuleRef): readonly RegisteredSurface[] {
    return [...this.#values.values()]
      .filter((item) => item.module.name === module.name && item.module.version === module.version)
      .sort((left, right) => left.surface.localeCompare(right.surface));
  }
}
