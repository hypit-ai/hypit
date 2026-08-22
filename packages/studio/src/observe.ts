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
  MarkupSurfaceRegistryLike, RegisteredSurface, StructuredElement, StructuredSurfaceInput, SurfaceDecodeOutput,
} from "@hypit/markup";
import type { ModuleRef } from "@hypit/protocol";
import { parseScript } from "@hypit/script";
import type { StudioObservedValue, StudioPlacement } from "@hypit/studio-adapter";

import type { Range } from "./shared.js";

export type ObservedValue = StudioObservedValue;

/** One authored element, where it was written, and what it produced. */
export type Placement = StudioPlacement;

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
/** Attributes the author wrote as plain text, by name. */
function written(element: StructuredElement): Record<string, string> {
  const held: Record<string, string> = {};
  for (const [name, value] of Object.entries(element.attributes)) {
    if (typeof value === "string") held[name] = value;
  }
  return held;
}

/** Every whole-value reference an element points at, in written order. */
function referenced(element: StructuredElement): string[] {
  return Object.values(referenceAttributes(element));
}

/** Whole-value references retained by attribute name for reversible interpretation. */
function referenceAttributes(element: StructuredElement): Record<string, string> {
  const held: Record<string, string> = {};
  for (const [name, value] of Object.entries(element.attributes)) {
    if (typeof value === "object" && value !== null
      && (value as { kind?: string }).kind === "reference") {
      held[name] = (value as { path: string }).path;
    }
  }
  return held;
}

export function createObserver(
  surfaces: MarkupSurfaceRegistryLike,
  resolveModule: (request: { readonly from: string }) => ModuleRef,
): Observer {
  const placements: Placement[] = [];
  const sourceMaps: Record<string, unknown>[] = [];

  // A Frontend may reach a Surface by name or by walking a module's whole list,
  // so both ways in are wrapped: an unwatched Surface decodes silently and the
  // preview loses the tag that placed the picture.
  const watch = (found: RegisteredSurface | undefined, module: ModuleRef): RegisteredSurface | undefined => {
      // A raw Surface parses its own body and reports its own positions, so
      // there is nothing here to recover.
      if (found === undefined) return found;
      if (found.mode !== "structured") {
        const raw = found.handler as (input: RawInput) => unknown;
        return {
          ...found,
          async handler(input: RawInput) {
            const output = await raw(input);
            harvestScript(input, sourceMaps);
            return output;
          },
        } as RegisteredSurface;
      }
      const handler = found.handler as (input: StructuredSurfaceInput) => unknown;
      return {
        ...found,
        async handler(input: StructuredSurfaceInput) {
          const output = await handler(input) as SurfaceDecodeOutput;
          const id = input.element.attributes.id;
          const observed = output.records.flatMap((record): ObservedValue[] => record.value.kind === "inline" ? [{
            id: record.id,
            type: { module: { ...record.type.module }, name: record.type.name },
            value: structuredClone(record.value.value),
          }] : []);
          const valuesFor = (range: { readonly start: number; readonly end: number }): readonly ObservedValue[] =>
            observed.filter((value) => output.records.some((record) =>
              record.id === value.id && record.range.start === range.start && record.range.end === range.end));
          const referenceTypes = (element: StructuredElement): Readonly<Record<string, string>> => Object.fromEntries(
            Object.entries(referenceAttributes(element)).flatMap(([name, path]) => {
              const resolved = input.resolveReference(path);
              return resolved === undefined ? [] : [[name, resolved.type.name]];
            }),
          );
          placements.push({
            tag: input.element.name,
            module: { ...module },
            sourcePath: input.sourceName,
            attributeValueRanges: input.element.attributeValueRanges ?? {},
            surface: found.surface,
            ...(typeof id === "string" ? { id } : {}),
            range: { start: input.element.range.start, end: input.element.range.end },
            records: output.records.map((record) => record.id),
            values: valuesFor(input.element.range),
            outputs: output.components.flatMap((component) => Object.values(component.outputs)),
            outputPorts: output.components.flatMap((component) =>
              Object.entries(component.outputs).map(([name, ref]) => ({ name, ref }))),
            attributes: written(input.element),
            referenceAttributes: referenceAttributes(input.element),
            referenceTypes: referenceTypes(input.element),
            references: [
              ...referenced(input.element),
              ...input.element.children
                .filter((child): child is StructuredElement => child.kind === "element")
                .flatMap(referenced),
            ],
            children: input.element.children
              .filter((child): child is StructuredElement => child.kind === "element")
              .map((child) => {
                const childId = child.attributes.id;
                return {
                  tag: child.name,
                  sourcePath: input.sourceName,
                  attributeValueRanges: child.attributeValueRanges ?? {},
                  ...(typeof childId === "string" ? { id: childId } : {}),
                  range: { start: child.range.start, end: child.range.end },
                  attributes: written(child),
                  references: referenced(child),
                  referenceAttributes: referenceAttributes(child),
                  referenceTypes: referenceTypes(child),
                  values: valuesFor(child.range),
                };
              }),
          });
          return output;
        },
      } as RegisteredSurface;
  };

  const watchedSurfaces: MarkupSurfaceRegistryLike = {
    surfaces(module) {
      return surfaces.surfaces(module).map((found) => watch(found, module)!) as readonly RegisteredSurface[];
    },
    resolve(module, surface) { return watch(surfaces.resolve(module, surface), module); },
  };

  return {
    surfaces: watchedSurfaces,
    frontend<T extends { readonly id: string }>(frontend: T): T { return frontend; },
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

/** What a raw Surface is handed: the whole Source and where its body begins. */
type RawInput = {
  readonly sourceName: string;
  readonly source: string;
  readonly tag: string;
  readonly openingStart: number;
  readonly contentStart: number;
  readonly attributes: Readonly<Record<string, unknown>>;
};

/**
 * Where a Script wrote its markers.
 *
 * The compiler carries no Source map, and a Script is a raw Surface that parses
 * its own body, so the same parser is asked again for the one thing the compile
 * discards: the offsets. Nothing is decoded here that the package does not
 * decode itself.
 */
function harvestScript(input: RawInput, into: Record<string, unknown>[]): void {
  if (input.tag.split(":").at(-1) !== "script") return;
  const id = input.attributes.id;
  if (typeof id !== "string") return;
  const closing = `</${input.tag}>`;
  const end = input.source.indexOf(closing, input.contentStart);
  if (end < 0) return;
  try {
    const parsed = parseScript(
      input.sourceName,
      input.source.slice(input.contentStart, end),
      input.contentStart,
    );
    into.push({
      format: "hypit.script-source-map@1",
      record: id,
      range: { start: input.openingStart, end: end + closing.length },
      segments: parsed.segments.map((segment) => ({ id: segment.id, range: segment.range })),
      selections: parsed.selections.map((selection) => ({
        id: selection.id,
        open: selection.open.range,
        close: selection.close.range,
      })),
      moments: parsed.moments.map((moment) => ({
        id: moment.id,
        range: moment.range,
      })),
      tokens: parsed.tokens.map((token) => ({ id: token.id, range: token.range })),
    });
  } catch {
    // A Script the parser refuses is a Source that will not compile either, and
    // the compile is what should report it.
  }
}
