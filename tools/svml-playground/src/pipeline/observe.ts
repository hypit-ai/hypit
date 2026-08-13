/**
 * Watch a compile without changing it.
 *
 * A preview has to point at the words that produced a picture, and the compiler
 * does not carry that: an element's source range reaches its Surface and is
 * dropped when the Records it returns are sealed. Rather than decode the Source
 * a second time, both decorators here delegate to the real implementation and
 * keep what passes through.
 */
import type {
  MarkupSurfaceRegistryLike, RegisteredSurface, StructuredElement, SurfaceDecodeOutput,
} from "@narratage/markup";
import { decodeMarkup, markupAuthorFrontendId } from "@narratage/markup";
import type { ModuleRef } from "@narratage/protocol";

import type { Range } from "../shared.js";

/** One authored element, where it was written, and what it produced. */
export type Placement = {
  readonly tag: string;
  readonly id?: string;
  readonly range: Range;
  /** Records this element sealed, so a value can be traced back to its tag. */
  readonly records: readonly string[];
  /** Graph outputs this element declared, named as the author would write them. */
  readonly outputs: readonly string[];
  /** Children the author wrote inside it, so a Clip can point at its own tag. */
  readonly children: readonly { readonly tag: string; readonly id?: string; readonly range: Range }[];
};

export type Observations = {
  readonly placements: readonly Placement[];
  /** Whatever the Surfaces mapped back onto the Source, such as a Script's markers. */
  readonly sourceMaps: readonly Record<string, unknown>[];
};

export type Observer = {
  readonly surfaces: MarkupSurfaceRegistryLike;
  readonly frontend: <T extends { readonly id: string }>(frontend: T) => T;
  readonly observations: () => Observations;
};

/**
 * Wrap the Surface registry and the markup Frontend a compile will use.
 *
 * Neither wrapper decides anything: the Surface still decodes the element and
 * the Frontend still decodes the Source. Only the positions they discard are
 * kept, which is why this stays correct as packages change.
 */
export function createObserver(
  surfaces: MarkupSurfaceRegistryLike,
  resolveModule: (request: { readonly from: string }) => ModuleRef,
): Observer {
  const placements: Placement[] = [];
  const sourceMaps: Record<string, unknown>[] = [];

  const watchedSurfaces: MarkupSurfaceRegistryLike = {
    resolve(module, surface) {
      const found = surfaces.resolve(module, surface);
      // A raw Surface parses its own body and reports its own positions, so
      // there is nothing here to recover.
      if (found === undefined || found.mode !== "structured") return found;
      const handler = found.handler as (input: { element: StructuredElement }) => unknown;
      return {
        ...found,
        async handler(input: { element: StructuredElement }) {
          const output = await handler(input) as SurfaceDecodeOutput;
          const id = input.element.attributes.id;
          placements.push({
            tag: input.element.name,
            ...(typeof id === "string" ? { id } : {}),
            range: { start: input.element.range.start, end: input.element.range.end },
            records: output.records.map((record) => record.id),
            outputs: output.components.flatMap((component) => Object.values(component.outputs)),
            children: input.element.children
              .filter((child): child is StructuredElement => child.kind === "element")
              .map((child) => {
                const childId = child.attributes.id;
                return {
                  tag: child.name,
                  ...(typeof childId === "string" ? { id: childId } : {}),
                  range: { start: child.range.start, end: child.range.end },
                };
              }),
          });
          return output;
        },
      } as RegisteredSurface;
    },
  };

  return {
    surfaces: watchedSurfaces,
    frontend<T extends { readonly id: string }>(frontend: T): T {
      if (frontend.id !== markupAuthorFrontendId) return frontend;
      return {
        ...frontend,
        async decode(source: { name: string; text: string; sourceDigest: `sha256:${string}` }, context: {
          readonly closure: never;
          readonly imports?: never;
          readonly resolveAsset?: never;
        }) {
          // The same decoder the Frontend calls, with the same inputs. Only the
          // Source maps, which its return type has no room for, are kept.
          const result = await decodeMarkup(
            { name: source.name, text: source.text, sourceDigest: source.sourceDigest },
            {
              closure: context.closure,
              registry: watchedSurfaces,
              resolveModule,
              ...(context.imports === undefined ? {} : { sourceImports: context.imports }),
              ...(context.resolveAsset === undefined ? {} : { resolveAsset: context.resolveAsset }),
            } as never,
          );
          for (const map of result.sourceMaps ?? []) sourceMaps.push(map as Record<string, unknown>);
          return {
            module: result.module,
            author: result.author,
            fragments: result.fragments,
            exports: result.exports,
          };
        },
      } as unknown as T;
    },
    observations: () => ({ placements, sourceMaps }),
  };
}

/** The Frontend registry a compile is handed, with every Frontend observed. */
export function observeFrontends<R extends { resolve(id: string): unknown }>(
  registry: R,
  observer: Observer,
): R {
  return {
    resolve(id: string) {
      const frontend = registry.resolve(id) as { readonly id: string } | undefined;
      return frontend === undefined ? undefined : observer.frontend(frontend);
    },
  } as unknown as R;
}
