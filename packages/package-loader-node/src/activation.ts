import {
  ModulePackageRegistry,
  NodeCompiler,
} from "@svml/compiler-node";
import { AuthorFrontendRegistry } from "@svml/elaborator";
import { isDigest } from "@svml/protocol";
import {
  createTextAuthorFrontend,
  TextSurfaceRegistry,
  textAuthorFrontendId,
} from "@svml/text";

import type { NodeAuthorPackage } from "./types.js";

export type CreateActivatedNodeCompilerOptions = {
  readonly root?: string;
};

function assertPackage(value: NodeAuthorPackage): void {
  if (value.format !== "svml.node-author-package@1") {
    throw new Error(`${value.name || "author package"} has an unsupported format`);
  }
  if (value.name.trim().length === 0) throw new Error("author package name must not be empty");
}

/** Assemble already trusted author packages without knowing any domain component by name. */
export function createActivatedNodeCompiler(
  packages: readonly NodeAuthorPackage[],
  options: CreateActivatedNodeCompilerOptions = {},
): NodeCompiler {
  const names = new Set<string>();
  const modules = new ModulePackageRegistry();
  const surfaces = new TextSurfaceRegistry();
  const frontends = new AuthorFrontendRegistry();

  for (const item of packages) {
    assertPackage(item);
    if (names.has(item.name)) throw new Error(`author package ${item.name} is activated twice`);
    names.add(item.name);
    for (const module of item.modules) modules.register(module);
    for (const surface of item.textSurfaces ?? []) {
      if (!isDigest(surface.implementationDigest)) {
        throw new Error(`${item.name} Surface ${surface.surface} has an invalid implementation digest`);
      }
      if (surface.mode === "raw") {
        surfaces.registerRaw(
          surface.module,
          surface.surface,
          surface.implementationDigest,
          surface.handler,
        );
      } else {
        surfaces.registerStructured(
          surface.module,
          surface.surface,
          surface.implementationDigest,
          surface.handler,
        );
      }
    }
    for (const frontend of item.frontends ?? []) frontends.register(frontend);
  }

  frontends.register(createTextAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`No activated author package satisfies ${request.from}`);
      return resolved;
    },
  }));

  return new NodeCompiler({
    modules,
    frontends,
    entryFrontend: textAuthorFrontendId,
    ...(options.root === undefined ? {} : { root: options.root }),
  });
}
