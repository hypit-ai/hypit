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
  readonly #tags = new Set<string>();
  readonly #byModule = new Map<string, RegisteredSurface[]>();

  register(value: RegisteredSurface): void {
    if (value.module.name.trim().length === 0 || value.module.version.trim().length === 0) {
      throw new Error("Surface module is invalid");
    }
    if (value.surface.trim().length === 0) throw new Error("Surface name is empty");
    if (value.tag.trim().length === 0) throw new Error("Surface tag is empty");
    if (value.mode !== "raw" && value.mode !== "structured") throw new Error("Surface mode is invalid");
    const surfaceKey = key(value.module, value.surface);
    if (this.#values.has(surfaceKey)) throw new Error(`Surface ${surfaceKey} is already registered`);
    const module = `${value.module.name}@${value.module.version}`;
    const tag = `${module}#${value.tag}`;
    if (this.#tags.has(tag)) throw new Error(`Surface tag ${value.tag} is already registered for ${module}`);
    this.#values.set(surfaceKey, value);
    this.#tags.add(tag);
    const surfaces = this.#byModule.get(module) ?? [];
    surfaces.push(value);
    this.#byModule.set(module, surfaces);
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
    return [...(this.#byModule.get(`${module.name}@${module.version}`) ?? [])];
  }
}
