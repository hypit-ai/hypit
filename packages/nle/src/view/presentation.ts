import type { PackageSymbol } from "../implementation.js";
import type {
  NleAdjustItem,
  NleComponentItem,
  NleComposition,
  NleProject,
  NleTrack,
} from "../types.js";
import { assertContributionOwner, packageSymbolKey } from "./symbol.js";
import type {
  NleTimelineDisplayLayer,
  NleTimelineItemObservation,
  NleTimelineTone,
} from "./types.js";

export const nleTimelinePresentationContributionKind = "hypit.nle-timeline-presentation";

export type NleTimelinePresentationChrome = "standard" | "group" | "compact";
export type NleTimelinePresentationLayer = Extract<NleTimelineDisplayLayer, { readonly kind: "text" }>;

/** Package artwork whose bytes stay behind a Host-owned resource address. */
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
  /** Factual text only. Markup and product chrome are not package vocabulary. */
  readonly layers?: readonly NleTimelinePresentationLayer[];
  readonly poster?: NleTimelinePresentationPoster;
};

export type NleTimelineComponentPresentationContext = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly track: NleTrack;
  readonly item: NleComponentItem;
};

export type NleTimelineAdjustPresentationContext = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly track: NleTrack;
  readonly item: NleAdjustItem;
};

type NleTimelinePresentationBase = {
  readonly displayName: string;
  readonly tone: NleTimelineTone;
  readonly chrome: NleTimelinePresentationChrome;
  /** Package-preferred default. A persisted View height still wins. */
  readonly heightPx?: number;
  readonly poster?: NleTimelinePresentationPoster;
};

export type NleTimelineComponentPresentation = NleTimelinePresentationBase & {
  readonly component: PackageSymbol;
  readonly project?: (context: NleTimelineComponentPresentationContext) => NleTimelinePresentationDraft;
};

export type NleTimelineAdjustPresentation = NleTimelinePresentationBase & {
  readonly operator: PackageSymbol;
  readonly project?: (context: NleTimelineAdjustPresentationContext) => NleTimelinePresentationDraft;
};

/** One explicitly selected npm package's process-local Timeline presentation contribution. */
export type NleTimelinePresentationContribution = {
  readonly kind: typeof nleTimelinePresentationContributionKind;
  readonly package: string;
  readonly components: readonly NleTimelineComponentPresentation[];
  readonly adjusts: readonly NleTimelineAdjustPresentation[];
};

export type NleTimelinePresentationHost = {
  readonly observations: (
    project: NleProject,
    composition: string,
    resourceUrl?: (resource: string) => string,
  ) => readonly NleTimelineItemObservation[];
  readonly resource: (resource: string) => NleTimelinePresentationResource | undefined;
};

const tones = new Set<NleTimelineTone>([
  "blue", "blue-muted", "green", "green-muted", "violet", "magenta", "orange", "neutral",
]);
const chromes = new Set<NleTimelinePresentationChrome>(["standard", "group", "compact"]);
const posterLayouts = new Set<NonNullable<NleTimelinePresentationPoster["layout"]>>([
  "repeat-x", "cover", "contain",
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertPoster(poster: NleTimelinePresentationPoster | undefined, key: string): void {
  if (poster === undefined) return;
  assert(poster !== null && typeof poster === "object" && !Array.isArray(poster),
    `NLE Timeline presentation ${key} poster is invalid.`);
  assert(typeof poster.mediaType === "string" && /^image\/[a-z0-9.+-]+$/iu.test(poster.mediaType),
    `NLE Timeline presentation ${key} poster media type is invalid.`);
  assert(poster.layout === undefined || posterLayouts.has(poster.layout),
    `NLE Timeline presentation ${key} poster layout is invalid.`);
  assert(typeof poster.open === "function", `NLE Timeline presentation ${key} poster open is not callable.`);
}

function assertBase(value: NleTimelinePresentationBase, key: string): void {
  assert(typeof value.displayName === "string" && value.displayName.trim().length > 0,
    `NLE Timeline presentation ${key} displayName is empty.`);
  assert(tones.has(value.tone), `NLE Timeline presentation ${key} tone is invalid.`);
  assert(chromes.has(value.chrome), `NLE Timeline presentation ${key} chrome is invalid.`);
  assert(value.heightPx === undefined || Number.isSafeInteger(value.heightPx)
    && value.heightPx >= 32 && value.heightPx <= 240,
  `NLE Timeline presentation ${key} height must be an integer from 32 through 240 pixels.`);
  assertPoster(value.poster, key);
}

function assertContribution(value: NleTimelinePresentationContribution): void {
  assert(value !== null && typeof value === "object", "NLE Timeline presentation contribution must be an object.");
  assert(Array.isArray(value.components) && Array.isArray(value.adjusts),
    "NLE Timeline presentation contribution declarations must be arrays.");
  assertContributionOwner(value.package, [
    ...value.components.map((entry) => entry.component),
    ...value.adjusts.map((entry) => entry.operator),
  ], "NLE Timeline presentation contribution");
  const keys = new Set<string>();
  for (const entry of value.components) {
    const key = `component:${packageSymbolKey(entry.component)}`;
    assert(!keys.has(key), `NLE Timeline presentation contribution repeats ${key}.`);
    keys.add(key);
    assertBase(entry, key);
    assert(entry.project === undefined || typeof entry.project === "function",
      `NLE Timeline presentation ${key} project is not callable.`);
  }
  for (const entry of value.adjusts) {
    const key = `adjust:${packageSymbolKey(entry.operator)}`;
    assert(!keys.has(key), `NLE Timeline presentation contribution repeats ${key}.`);
    keys.add(key);
    assertBase(entry, key);
    assert(entry.project === undefined || typeof entry.project === "function",
      `NLE Timeline presentation ${key} project is not callable.`);
  }
}

function sealDraft(value: NleTimelinePresentationDraft, key: string): NleTimelinePresentationDraft {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    `NLE Timeline presentation ${key} returned an invalid draft.`);
  const fields = Object.keys(value);
  assert(fields.every((field) => field === "title" || field === "layers" || field === "poster"),
    `NLE Timeline presentation ${key} returned unknown draft fields.`);
  if (value.title !== undefined) {
    assert(typeof value.title === "string" && value.title.trim().length > 0,
      `NLE Timeline presentation ${key} returned an invalid title.`);
  }
  if (value.layers !== undefined) {
    assert(Array.isArray(value.layers), `NLE Timeline presentation ${key} layers must be an array.`);
    for (const [index, layer] of value.layers.entries()) {
      assert(layer !== null && typeof layer === "object" && !Array.isArray(layer)
        && Object.keys(layer).length === 2 && layer.kind === "text" && typeof layer.text === "string",
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

export function createNleTimelinePresentationContribution(value: {
  readonly package: string;
  readonly components?: readonly NleTimelineComponentPresentation[];
  readonly adjusts?: readonly NleTimelineAdjustPresentation[];
}): NleTimelinePresentationContribution {
  const contribution: NleTimelinePresentationContribution = {
    kind: nleTimelinePresentationContributionKind,
    package: value.package,
    components: [...(value.components ?? [])],
    adjusts: [...(value.adjusts ?? [])],
  };
  assertContribution(contribution);
  return contribution;
}

export function createNleTimelinePresentationHost(
  contributions: readonly NleTimelinePresentationContribution[],
): NleTimelinePresentationHost {
  const components = new Map<string, NleTimelineComponentPresentation>();
  const adjusts = new Map<string, NleTimelineAdjustPresentation>();
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
  for (const contribution of contributions) {
    assertContribution(contribution);
    for (const entry of contribution.components) {
      const key = packageSymbolKey(entry.component);
      assert(!components.has(key), `NLE Timeline has multiple Component presentations for ${key}.`);
      components.set(key, entry);
      registerResource(`component:${key}`, entry.poster);
    }
    for (const entry of contribution.adjusts) {
      const key = packageSymbolKey(entry.operator);
      assert(!adjusts.has(key), `NLE Timeline has multiple Adjust presentations for ${key}.`);
      adjusts.set(key, entry);
      registerResource(`adjust:${key}`, entry.poster);
    }
  }
  const observation = (
    base: NleTimelinePresentationBase,
    draft: NleTimelinePresentationDraft,
    item: string,
    resourceKey: string,
    resourceUrl: ((resource: string) => string) | undefined,
  ): NleTimelineItemObservation => {
    const poster = draft.poster ?? base.poster;
    if (draft.poster !== undefined) registerResource(resourceKey, draft.poster);
    return {
      item,
      title: draft.title ?? base.displayName,
      layers: [
        ...(poster === undefined || resourceUrl === undefined ? [] : [{
          kind: "preview" as const,
          media: "image" as const,
          state: "ready" as const,
          resource: resourceUrl(resourceKey),
          layout: poster.layout ?? "repeat-x",
        }]),
        ...(draft.layers ?? []),
      ],
      presentation: {
        tone: base.tone,
        chrome: base.chrome,
        ...(base.heightPx === undefined ? {} : { heightPx: base.heightPx }),
      },
    };
  };
  return {
    observations(project, compositionId, resourceUrl) {
      const composition = project.compositions.find((candidate) => candidate.id === compositionId);
      assert(composition !== undefined, `Unknown NLE Composition: ${compositionId}.`);
      const observations: NleTimelineItemObservation[] = [];
      for (const track of composition.tracks) {
        for (const item of track.items) {
          if (item.kind === "adjust") {
            const symbol = packageSymbolKey(item.operator);
            const presentation = adjusts.get(symbol);
            if (presentation === undefined) continue;
            const key = `adjust:${symbol}`;
            const projected = sealDraft(
              presentation.project?.({ project, composition, track, item }) ?? {}, key,
            );
            observations.push(observation(
              presentation,
              projected,
              item.id,
              projected.poster === undefined ? key : `${key}:item:${item.id}`,
              resourceUrl,
            ));
            continue;
          }
          if (item.source !== "component") continue;
          const symbol = packageSymbolKey(item.component);
          const presentation = components.get(symbol);
          if (presentation === undefined) continue;
          const key = `component:${symbol}`;
          const projected = sealDraft(
            presentation.project?.({ project, composition, track, item }) ?? {}, key,
          );
          observations.push(observation(
            presentation,
            projected,
            item.id,
            projected.poster === undefined ? key : `${key}:item:${item.id}`,
            resourceUrl,
          ));
        }
      }
      return observations;
    },
    resource(resource) {
      return resources.get(resource);
    },
  };
}
