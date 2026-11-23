import { assertExactTemporalValue, compareExactTemporalValues, exactTemporalZero } from "@hypit/temporal/algebra";
import type { PackageSymbol } from "../implementation.js";
import type { NleSourceTimeBounds } from "../source-time.js";
import type { NleComponentItem, NleComposition, NleProject, NleTrack } from "../types.js";
import type { NleTimelineItemObservation } from "./projection-types.js";
import { assertContributionOwner, packageSymbolKey } from "./symbol.js";

export const nleComponentDefinitionKind = "hypit.nle-component-definition";

export type NleComponentDefinition = {
  readonly component: PackageSymbol;
  /** Readable source coordinates from the authored parameters, independent of Item placement. */
  readonly sourceTime: (parameters: NleComponentItem["parameters"]) => NleSourceTimeBounds;
} & (
  | { readonly role: "picture" | "effect"; readonly readText?: never }
  | {
      readonly role: "text" | "subtitle";
      readonly readText: (parameters: NleComponentItem["parameters"]) => string;
    }
);

export type NleComponentDefinitionContribution = {
  readonly kind: typeof nleComponentDefinitionKind;
  readonly package: string;
  readonly components: readonly NleComponentDefinition[];
};

export type NleComponentDefinitions = {
  readonly definition: (symbol: PackageSymbol) => NleComponentDefinition;
  readonly assertProject: (project: NleProject) => void;
  readonly sourceTime: (item: NleComponentItem) => NleSourceTimeBounds;
  readonly text: (composition: NleComposition) => readonly NleTimelineItemObservation[];
};

/** Resolve placement, readable source time and authored text for installed Component symbols. */
export function createNleComponentDefinitions(
  contributions: readonly NleComponentDefinitionContribution[],
): NleComponentDefinitions {
  const entries = new Map<string, NleComponentDefinition>();
  for (const contribution of contributions) {
    if (!Array.isArray(contribution.components)) {
      throw new Error(`NLE package ${contribution.package} must declare a Component definitions array.`);
    }
    const components: readonly NleComponentDefinition[] = contribution.components;
    for (const entry of components) {
      if (entry === null || typeof entry !== "object") throw new Error("NLE Component definition must be an object.");
      assertContributionOwner(contribution.package, [entry.component], "NLE Component definition");
      const key = packageSymbolKey(entry.component);
      const textual = entry.role === "text" || entry.role === "subtitle";
      if (typeof entry.sourceTime !== "function") {
        throw new Error(`NLE Component definition ${key} must declare readable source time.`);
      }
      if (Object.keys(entry).some(field => field !== "component" && field !== "role" && field !== "sourceTime"
        && !(textual && field === "readText"))
        || (textual ? typeof entry.readText !== "function" : entry.role !== "picture" && entry.role !== "effect")) {
        throw new Error(`NLE Component definition ${key} has invalid fields for its Track role.`);
      }
      if (entries.has(key)) throw new Error(`NLE repeats Component definition ${key}.`);
      entries.set(key, entry);
    }
  }
  const definition = (symbol: PackageSymbol, item?: string) => {
    const key = packageSymbolKey(symbol);
    const entry = entries.get(key);
    if (entry === undefined) {
      throw new Error(`NLE Component ${key}${item === undefined ? "" : ` on Item ${item}`} requires an installed Component definition.`);
    }
    return entry;
  };
  const placedDefinition = (item: NleComponentItem, track: NleTrack) => {
    const entry = definition(item.component, item.id);
    if (entry.role !== track.role) {
      throw new Error(`NLE Item ${item.id} Component ${packageSymbolKey(item.component)} requires a ${entry.role} Track.`);
    }
    return entry;
  };
  return {
    definition,
    sourceTime(item) {
      const bounds = definition(item.component, item.id).sourceTime(item.parameters);
      const label = `NLE Component ${packageSymbolKey(item.component)} on Item ${item.id} source time`;
      if (bounds === null || typeof bounds !== "object" || Array.isArray(bounds)
        || (bounds.kind !== "constant" && bounds.kind !== "timed")) throw new Error(`${label} is invalid.`);
      if (Object.keys(bounds).some(field => field !== "kind" && !(bounds.kind === "timed" && field === "duration"))) {
        throw new Error(`${label} has invalid fields.`);
      }
      if (bounds.kind === "timed" && bounds.duration !== undefined) {
        assertExactTemporalValue(bounds.duration, `${label} duration`);
        if (compareExactTemporalValues(bounds.duration, exactTemporalZero()) <= 0) {
          throw new Error(`${label} duration must be positive.`);
        }
      }
      return bounds;
    },
    assertProject(project) {
      for (const composition of project.compositions) for (const track of composition.tracks) {
        for (const item of track.items) {
          if (item.kind === "present" && item.source === "component") placedDefinition(item, track);
        }
      }
    },
    text(composition) {
      return composition.tracks.flatMap(track => track.items.flatMap(item => {
        if (item.kind !== "present" || item.source !== "component") return [];
        const entry = placedDefinition(item, track);
        if (entry.readText === undefined) return [];
        const text = entry.readText(item.parameters);
        if (typeof text !== "string") throw new Error(`NLE Component ${packageSymbolKey(item.component)} on Item ${item.id} must return text.`);
        return [{ item: item.id, text }];
      }));
    },
  };
}
