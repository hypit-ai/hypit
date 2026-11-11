import type { Facet } from "@hypit/facet";
import {
  nlePackageSymbolKey,
  type NleAdjustmentItem,
  type NleComponentItem,
  type NlePackageSymbol,
  type NleProject,
  type NleTrack,
} from "@hypit/nle";

import type {
  NleTimelineDisplayLayer,
  NleTimelineItemObservation,
  NleTimelineTone,
} from "./types.js";

export const nleTimelinePresentationFacetAbi = "hypit.nle-timeline-presentation@1";

export type NleTimelinePresentationChrome = "standard" | "group" | "compact";
export type NleTimelinePresentationLayer = Extract<NleTimelineDisplayLayer, { readonly kind: "text" }>;

/**
 * Package-owned, static visual identity for a Timeline Item kind. Workbench
 * owns the resource URL, caching and the finite layout implementation.
 */
export type NleTimelinePresentationPoster = {
  readonly mediaType: string;
  readonly layout?: "repeat-x" | "cover" | "contain";
  readonly open: () => Uint8Array | Promise<Uint8Array>;
};

export type NleTimelinePresentationResource = {
  readonly mediaType: string;
  readonly read: () => Promise<Uint8Array>;
};

export type NleTimelinePresentationDraft = {
  readonly title?: string;
  /** Package-owned factual text only. Preview resources remain Host observations. */
  readonly layers?: readonly NleTimelinePresentationLayer[];
  /** Optional Item-specific artwork. The Host still owns its URL, cache and finite layout. */
  readonly poster?: NleTimelinePresentationPoster;
};

export type NleTimelineComponentPresentationContext = {
  readonly project: NleProject;
  readonly track: NleTrack;
  readonly item: NleComponentItem;
};

export type NleTimelineAdjustmentPresentationContext = {
  readonly project: NleProject;
  readonly track: NleTrack;
  readonly item: NleAdjustmentItem;
};

type NleTimelinePresentationBase = {
  readonly displayName: string;
  /** Workbench owns the actual palette and shell rendering for these finite tokens. */
  readonly tone: NleTimelineTone;
  readonly chrome: NleTimelinePresentationChrome;
  /** Preferred default for a Track containing this Item; the persisted View still wins. */
  readonly heightPx?: number;
  /** Optional package artwork; it cannot provide a browser URL, DOM or CSS. */
  readonly poster?: NleTimelinePresentationPoster;
};

export type NleTimelineComponentPresentation = NleTimelinePresentationBase & {
  readonly component: NlePackageSymbol;
  readonly project?: (context: NleTimelineComponentPresentationContext) => NleTimelinePresentationDraft;
};

export type NleTimelineAdjustmentPresentation = NleTimelinePresentationBase & {
  readonly component: NlePackageSymbol;
  readonly project?: (context: NleTimelineAdjustmentPresentationContext) => NleTimelinePresentationDraft;
};

export type NleTimelinePresentationPackage = {
  readonly components?: readonly NleTimelineComponentPresentation[];
  readonly adjustments?: readonly NleTimelineAdjustmentPresentation[];
};

export type NleTimelinePresentationFacet = Facet & {
  readonly abi: typeof nleTimelinePresentationFacetAbi;
  readonly implementation: NleTimelinePresentationPackage;
};

export type NleTimelinePresentationHost = {
  /** Project one observation for every exact package-owned Item that has a selected presentation. */
  readonly observations: (
    project: NleProject,
    resourceUrl?: (resource: string) => string,
  ) => readonly NleTimelineItemObservation[];
  /** Resolve a package poster by its process-local presentation identity. */
  readonly resource: (resource: string) => NleTimelinePresentationResource | undefined;
};

const tones = new Set<NleTimelineTone>([
  "blue", "blue-muted", "green", "green-muted", "teal", "violet",
  "magenta", "magenta-muted", "orange", "orange-muted", "neutral",
]);
const chromes = new Set<NleTimelinePresentationChrome>(["standard", "group", "compact"]);
const posterLayouts = new Set<NonNullable<NleTimelinePresentationPoster["layout"]>>([
  "repeat-x", "cover", "contain",
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertBase(value: NleTimelinePresentationBase, key: string): void {
  assert(typeof value.displayName === "string" && value.displayName.trim().length > 0,
    `NLE Timeline presentation ${key} display name is empty.`);
  assert(tones.has(value.tone), `NLE Timeline presentation ${key} tone is invalid.`);
  assert(chromes.has(value.chrome), `NLE Timeline presentation ${key} chrome is invalid.`);
  assert(value.heightPx === undefined || Number.isSafeInteger(value.heightPx)
    && value.heightPx >= 32 && value.heightPx <= 240,
  `NLE Timeline presentation ${key} height must be an integer from 32 through 240 pixels.`);
  assertPoster(value.poster, key);
}

function assertPoster(poster: NleTimelinePresentationPoster | undefined, key: string): void {
  if (poster !== undefined) {
    assert(poster !== null && typeof poster === "object" && !Array.isArray(poster),
      `NLE Timeline presentation ${key} poster is invalid.`);
    assert(typeof poster.mediaType === "string" && /^image\/[a-z0-9.+-]+$/iu.test(poster.mediaType),
      `NLE Timeline presentation ${key} poster media type is invalid.`);
    assert(poster.layout === undefined || posterLayouts.has(poster.layout),
      `NLE Timeline presentation ${key} poster layout is invalid.`);
    assert(typeof poster.open === "function",
      `NLE Timeline presentation ${key} poster open is not callable.`);
  }
}

function assertPackage(value: NleTimelinePresentationPackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "NLE Timeline presentation package must be an object.");
  const keys = new Set<string>();
  for (const presentation of value.components ?? []) {
    const key = `component:${nlePackageSymbolKey(presentation.component)}`;
    assert(!keys.has(key), `NLE Timeline presentation package repeats ${key}.`);
    keys.add(key);
    assertBase(presentation, key);
    assert(presentation.project === undefined || typeof presentation.project === "function",
      `NLE Timeline presentation ${key} project is not callable.`);
  }
  for (const presentation of value.adjustments ?? []) {
    const key = `adjustment:${nlePackageSymbolKey(presentation.component)}`;
    assert(!keys.has(key), `NLE Timeline presentation package repeats ${key}.`);
    keys.add(key);
    assertBase(presentation, key);
    assert(presentation.project === undefined || typeof presentation.project === "function",
      `NLE Timeline presentation ${key} project is not callable.`);
  }
}

function draft(value: NleTimelinePresentationDraft, key: string): NleTimelinePresentationDraft {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    `NLE Timeline presentation ${key} returned an invalid draft.`);
  const fields = new Set(Object.keys(value));
  assert([...fields].every((field) => field === "title" || field === "layers" || field === "poster"),
    `NLE Timeline presentation ${key} returned unknown draft fields.`);
  if (value.title !== undefined) {
    assert(typeof value.title === "string" && value.title.trim().length > 0,
      `NLE Timeline presentation ${key} returned an empty title.`);
  }
  if (value.layers !== undefined) {
    assert(Array.isArray(value.layers), `NLE Timeline presentation ${key} layers must be an array.`);
    for (const [index, layer] of value.layers.entries()) {
      assert(layer !== null && typeof layer === "object" && !Array.isArray(layer)
        && layer.kind === "text" && layer.role === "content" && typeof layer.text === "string",
      `NLE Timeline presentation ${key} layer ${index} is invalid.`);
    }
  }
  assertPoster(value.poster, key);
  return {
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.layers === undefined ? {} : { layers: structuredClone(value.layers) }),
    ...(value.poster === undefined ? {} : { poster: value.poster }),
  };
}

export function createNleTimelinePresentationFacet(
  value: NleTimelinePresentationPackage,
): NleTimelinePresentationFacet {
  assertPackage(value);
  return { abi: nleTimelinePresentationFacetAbi, implementation: value };
}

export function nleTimelinePresentationPackagesFromFacets(
  facets: readonly Facet[],
): readonly NleTimelinePresentationPackage[] {
  return facets.flatMap((facet) => facet.abi === nleTimelinePresentationFacetAbi
    ? [(facet as NleTimelinePresentationFacet).implementation]
    : []);
}

export function createNleTimelinePresentationHost(
  packages: readonly NleTimelinePresentationPackage[],
): NleTimelinePresentationHost {
  const components = new Map<string, NleTimelineComponentPresentation>();
  const adjustments = new Map<string, NleTimelineAdjustmentPresentation>();
  const resources = new Map<string, NleTimelinePresentationResource>();
  const registerResource = (key: string, poster: NleTimelinePresentationPoster | undefined): void => {
    if (poster === undefined) return;
    let cached: Promise<Uint8Array> | undefined;
    resources.set(key, {
      mediaType: poster.mediaType,
      async read() {
        cached ??= Promise.resolve(poster.open()).then((bytes) => {
          assert(bytes instanceof Uint8Array && bytes.byteLength > 0,
            `NLE Timeline presentation ${key} poster returned invalid bytes.`);
          return bytes.slice();
        });
        return (await cached).slice();
      },
    });
  };
  for (const value of packages) {
    assertPackage(value);
    for (const presentation of value.components ?? []) {
      const key = nlePackageSymbolKey(presentation.component);
      assert(!components.has(key), `NLE Timeline has multiple Component presentations for ${key}.`);
      components.set(key, presentation);
      registerResource(`component:${key}`, presentation.poster);
    }
    for (const presentation of value.adjustments ?? []) {
      const key = nlePackageSymbolKey(presentation.component);
      assert(!adjustments.has(key), `NLE Timeline has multiple Adjustment presentations for ${key}.`);
      adjustments.set(key, presentation);
      registerResource(`adjustment:${key}`, presentation.poster);
    }
  }
  return {
    observations(project, resourceUrl) {
      const observations: NleTimelineItemObservation[] = [];
      for (const track of project.tracks) {
        for (const item of track.items) {
          if (item.kind === "adjustment") {
            const presentation = adjustments.get(nlePackageSymbolKey(item.component));
            if (presentation === undefined) continue;
            const key = `adjustment:${nlePackageSymbolKey(item.component)}`;
            const display = draft(presentation.project?.({ project, track, item }) ?? {}, key);
            const poster = display.poster ?? presentation.poster;
            const resourceKey = display.poster === undefined ? key : `${key}:item:${item.id}`;
            if (display.poster !== undefined) registerResource(resourceKey, display.poster);
            observations.push({
              item: item.id,
              title: display.title ?? presentation.displayName,
              layers: [
                ...(poster === undefined || resourceUrl === undefined ? [] : [{
                  kind: "preview" as const,
                  role: "decoration" as const,
                  preview: { kind: "image" as const, state: "ready" as const, resource: resourceUrl(resourceKey) },
                  layout: poster.layout ?? "repeat-x",
                }]),
                ...(display.layers ?? []),
              ],
              presentation: {
                tone: presentation.tone,
                chrome: presentation.chrome,
                ...(presentation.heightPx === undefined ? {} : { heightPx: presentation.heightPx }),
              },
            });
            continue;
          }
          if (item.source !== "component") continue;
          const presentation = components.get(nlePackageSymbolKey(item.component));
          if (presentation === undefined) continue;
          const key = `component:${nlePackageSymbolKey(item.component)}`;
          const display = draft(presentation.project?.({ project, track, item }) ?? {}, key);
          const poster = display.poster ?? presentation.poster;
          const resourceKey = display.poster === undefined ? key : `${key}:item:${item.id}`;
          if (display.poster !== undefined) registerResource(resourceKey, display.poster);
          observations.push({
            item: item.id,
            title: display.title ?? presentation.displayName,
            layers: [
              ...(poster === undefined || resourceUrl === undefined ? [] : [{
                kind: "preview" as const,
                role: "decoration" as const,
                preview: { kind: "image" as const, state: "ready" as const, resource: resourceUrl(resourceKey) },
                layout: poster.layout ?? "repeat-x",
              }]),
              ...(display.layers ?? []),
            ],
            presentation: {
              tone: presentation.tone,
              chrome: presentation.chrome,
              ...(presentation.heightPx === undefined ? {} : { heightPx: presentation.heightPx }),
            },
          });
        }
      }
      return observations;
    },
    resource(resource) {
      return resources.get(resource);
    },
  };
}
