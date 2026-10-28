import type { Facet } from "@hypit/facet";
import { moduleKey, type ModuleRef } from "@hypit/protocol";

export type MarkupDeclarationSyntax = {
  readonly name: string;
  readonly tag: string;
  /** Markup parsing only; an opaque body is passed to the package as exact text. */
  readonly body?: "structured" | "opaque";
};

export type RegisteredMarkupDeclaration = {
  readonly module: ModuleRef;
  readonly declaration: string;
  readonly tag: string;
  readonly body?: "structured" | "opaque";
};

export interface MarkupDeclarationRegistryLike {
  resolve(module: ModuleRef, declaration: string): RegisteredMarkupDeclaration | undefined;
  declarations(module: ModuleRef): readonly RegisteredMarkupDeclaration[];
}

function key(module: ModuleRef, declaration: string): string {
  return `${moduleKey(module)}#${declaration}`;
}

/** Frontend-owned spelling only; semantic compilation belongs to @hypit/author. */
export class MarkupDeclarationRegistry implements MarkupDeclarationRegistryLike {
  readonly #values = new Map<string, RegisteredMarkupDeclaration>();
  readonly #byModule = new Map<string, RegisteredMarkupDeclaration[]>();
  readonly #tags = new Set<string>();

  register(value: RegisteredMarkupDeclaration): void {
    if (value.module.name.trim().length === 0 || value.module.version.trim().length === 0) {
      throw new Error("Markup declaration module is invalid.");
    }
    if (value.declaration.trim().length === 0) throw new Error("Markup declaration name is empty.");
    if (value.tag.trim().length === 0) throw new Error("Markup declaration tag is empty.");
    if (value.body !== undefined && value.body !== "structured" && value.body !== "opaque") {
      throw new Error("Markup declaration body mode is invalid.");
    }
    const identity = key(value.module, value.declaration);
    if (this.#values.has(identity)) throw new Error(`Markup declaration ${identity} is already registered.`);
    const module = moduleKey(value.module);
    const tag = `${module}#${value.tag}`;
    if (this.#tags.has(tag)) throw new Error(`Markup declaration tag ${value.tag} is already registered for ${module}.`);
    this.#values.set(identity, value);
    this.#tags.add(tag);
    const declarations = this.#byModule.get(module) ?? [];
    declarations.push(value);
    this.#byModule.set(module, declarations);
  }

  resolve(module: ModuleRef, declaration: string): RegisteredMarkupDeclaration | undefined {
    return this.#values.get(key(module, declaration));
  }

  declarations(module: ModuleRef): readonly RegisteredMarkupDeclaration[] {
    return [...(this.#byModule.get(moduleKey(module)) ?? [])];
  }
}

export const markupDeclarationFacetAbi = "hypit.markup-declaration@1";

export function createMarkupDeclarationFacet(options: {
  readonly module: ModuleRef;
  readonly declaration: MarkupDeclarationSyntax;
}): Facet {
  return {
    abi: markupDeclarationFacetAbi,
    implementation: {
      module: options.module,
      declaration: options.declaration.name,
      tag: options.declaration.tag,
      ...(options.declaration.body === undefined ? {} : { body: options.declaration.body }),
    } satisfies RegisteredMarkupDeclaration,
  };
}

export function installMarkupDeclarationFacets(
  facets: readonly Facet[],
  registry: Pick<MarkupDeclarationRegistry, "register">,
): void {
  for (const facet of facets) {
    if (facet.abi !== markupDeclarationFacetAbi) continue;
    registry.register(facet.implementation as RegisteredMarkupDeclaration);
  }
}
