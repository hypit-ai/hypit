import type { CompiledSource } from "./compile.js";
import type { Placement } from "./observe.js";

export type StudioProjectionRole =
  | "semantic-take"
  | "semantic-map"
  | "caption-plan"
  | "speech-visual"
  | "speech-audio"
  | "media"
  | "text"
  | "caption"
  | "track";

export type StudioTraceDependency = {
  readonly name: string;
  readonly ref: string;
  readonly type: string;
};

export type StudioTrace = {
  readonly placement?: string;
  readonly references: readonly StudioTraceDependency[];
};

export type StudioOutput = {
  readonly name: string;
  readonly type: string;
  readonly ref: string;
};

type StudioOutputRule = {
  readonly type: string;
  readonly role: StudioProjectionRole;
  readonly tag?: string;
  readonly namespace?: string;
};

type StudioDependencyRule = {
  readonly fromRole: StudioProjectionRole;
  readonly type: string;
  readonly role: StudioProjectionRole;
};

/**
 * This table belongs entirely to Studio. It understands public Output types
 * and observed Surface tags without asking domain packages to register UI
 * knowledge.
 */
const OUTPUT_RULES: readonly StudioOutputRule[] = [
  { type: "SemanticTake", role: "semantic-take" },
  { type: "CompleteSemanticMap", role: "semantic-map" },
  { type: "CaptionPlan", role: "caption-plan" },
  { type: "VisualTrack", role: "speech-visual", tag: "spine" },
  { type: "AudioTrack", role: "speech-audio", tag: "spine" },
  { type: "VisualTrack", role: "media", tag: "track", namespace: "media-track" },
  { type: "AudioTrack", role: "media", tag: "track", namespace: "media-track" },
  { type: "VisualTrack", role: "text", tag: "track", namespace: "text" },
  { type: "VisualTrack", role: "caption", tag: "track", namespace: "caption-fine" },
];

const DEPENDENCY_RULES: readonly StudioDependencyRule[] = [
  { fromRole: "caption", type: "CaptionPlan", role: "caption-plan" },
];

function lastTag(placement: Placement | undefined): string {
  return placement?.tag.split(":").at(-1) ?? "";
}

export function outputFor(source: CompiledSource, ref: string): StudioOutput | undefined {
  return source.exports.find((item) => item.ref === ref || item.name === ref);
}

export function placementFor(source: CompiledSource, ref: string): Placement | undefined {
  const output = outputFor(source, ref);
  return source.observations.placements.find((item) =>
    item.outputs.includes(ref) || (output !== undefined && item.outputs.includes(output.name))
  );
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function lastPlacementTag(source: CompiledSource, ref: string): string {
  return lastTag(placementFor(source, ref));
}

export function roleFor(source: CompiledSource, ref: string): StudioProjectionRole | undefined {
  const output = outputFor(source, ref);
  if (output === undefined) return undefined;
  const placement = placementFor(source, ref);
  const tag = lastTag(placement).toLowerCase();
  const namespace = placement?.tag.split(":")[0]?.toLowerCase();
  return OUTPUT_RULES.find((rule) =>
    rule.type === output.type
    && (rule.tag === undefined || rule.tag === tag)
    && (rule.namespace === undefined || rule.namespace === namespace)
  )?.role ?? ((output.type === "VisualTrack" || output.type === "AudioTrack") ? "track" : undefined);
}

export function traceFor(source: CompiledSource, ref: string): StudioTrace {
  const placement = placementFor(source, ref);
  if (placement === undefined) return { references: [] };
  const refs = unique([
    ...placement.references,
    ...placement.children.flatMap((child) => child.references),
  ]).flatMap((dependency) => {
    const output = outputFor(source, dependency);
    return output === undefined ? [] : [{ name: output.name, ref: output.ref, type: output.type }];
  });
  return {
    placement: placement.tag,
    references: refs,
  };
}

export function tracedRealizations(
  source: CompiledSource,
  ref: string,
): readonly { ref: string; role: StudioProjectionRole }[] {
  const role = roleFor(source, ref);
  if (role === undefined) return [];
  return traceFor(source, ref).references.flatMap((dependency) => {
    const rule = DEPENDENCY_RULES.find((item) =>
      item.fromRole === role && item.type === dependency.type);
    return rule === undefined ? [] : [{ ref: dependency.ref, role: rule.role }];
  });
}
