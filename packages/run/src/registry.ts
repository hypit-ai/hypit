import type { GraphFragment } from "@narratage/elaborator";

import type { RunFragmentPackage, RunFragmentRegistryLike } from "./types.js";

export class RunFragmentRegistry implements RunFragmentRegistryLike {
  readonly #packages = new Map<string, ReadonlyMap<string, GraphFragment>>();

  register(item: RunFragmentPackage): void {
    if (item.name.trim().length === 0) throw new Error("Run Fragment package name must not be empty");
    if (this.#packages.has(item.name)) throw new Error(`Run Fragment package ${item.name} is already registered`);
    const fragments = new Map<string, GraphFragment>();
    for (const [name, fragment] of Object.entries(item.fragments)) {
      if (name.trim().length === 0) throw new Error(`${item.name} has an empty Run Fragment name`);
      if (fragments.has(name)) throw new Error(`${item.name} repeats Run Fragment ${name}`);
      fragments.set(name, fragment);
    }
    if (fragments.size === 0) throw new Error(`Run Fragment package ${item.name} exports no Fragments`);
    this.#packages.set(item.name, fragments);
  }

  resolve(packageName: string, fragmentName: string): GraphFragment | undefined {
    return this.#packages.get(packageName)?.get(fragmentName);
  }
}
