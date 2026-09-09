import type { Candidate } from "@hypit/protocol";
import { sameType } from "@hypit/protocol";
import type { StudioFilmCompanion } from "@hypit/studio-adapter";
import { semanticTrackTypes } from "@hypit/semantic-track";

import type { CompiledSource } from "./compile.js";
import type { Placement } from "./observe.js";
import type { RunPlan } from "./run.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import {
  outputFor,
  referencedValueFor,
  placementFor,
  roleFor,
  traceFor,
  tracedStudioValues,
  unique,
} from "./studio-trace.js";
import type { StudioViewRole, StudioTrace } from "./studio-trace.js";

export type StudioViewRequirement = {
  readonly name: string;
  readonly ref: string;
  readonly type: string;
  readonly role: StudioViewRole;
  readonly candidateId?: string;
  readonly trace: StudioTrace;
  readonly candidatePolicy: "materialized-inline" | "deterministic-derived";
};

export type StudioInspection = {
  readonly renderTargets: readonly string[];
  readonly filmComposition: string;
  readonly timeRef: string;
  readonly projections: readonly StudioViewRequirement[];
};

export class StudioPreflightError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(["Studio cannot start:", ...issues.map((issue) => `- ${issue}`)].join("\n"));
    this.name = "StudioPreflightError";
    this.issues = issues;
  }
}

function candidateIsMaterialized(candidate: Candidate | undefined): boolean {
  return candidate?.root.kind === "value"
    && candidate.root.value.value.kind === "inline";
}

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function filmForTarget(registry: StudioCompanionRegistry, source: CompiledSource, targetRef: string): {
  readonly renderTarget: boolean;
  readonly compositionRef?: string;
  readonly placement?: Placement;
  readonly companion?: StudioFilmCompanion;
} {
  const targetPlacement = placementFor(source, targetRef);
  if (targetPlacement === undefined) return { renderTarget: false };
  const candidates = unique([
    targetRef,
    ...Object.values(targetPlacement.resolvedReferenceAttributes ?? {}),
    ...targetPlacement.children.flatMap((child) => Object.values(child.resolvedReferenceAttributes ?? {})),
  ]).flatMap((ref) => {
    const output = outputFor(source, ref);
    const placement = placementFor(source, ref);
    const companion = output === undefined ? undefined : registry.filmCompanionFor(output.typeRef, placement);
    return output === undefined || placement === undefined || companion === undefined
      ? []
      : [{ compositionRef: output.ref, placement, companion }];
  });
  if (candidates.length > 1) throw new Error(`Run target ${targetRef} reaches more than one Studio Film.`);
  const found = candidates[0];
  return found === undefined ? { renderTarget: false } : { renderTarget: true, ...found };
}

/**
 * Video-domain policy is centralized here, inside Studio. Core still only
 * supplies the compiled graph and its exact BuildPlan/Need closure.
 */
export function inspectStudioRun(
  registry: StudioCompanionRegistry,
  source: CompiledSource,
  base: RunPlan,
): StudioInspection {
  const issues: string[] = [];
  if (base.targets.length === 0) issues.push("the Run Source has no target; Studio requires Film or Render");

  const targets = base.targets.flatMap((ref) => {
    const found = filmForTarget(registry, source, ref);
    return found.renderTarget ? [{ ref, ...found }] : [];
  });
  if (targets.length === 0 && base.targets.length > 0) {
    issues.push("the Run target is not a Film or Render output from the current SVML");
  }
  const filmCompositions = unique(targets.flatMap((target) =>
    target.compositionRef === undefined ? [] : [target.compositionRef]));
  if (filmCompositions.length > 1) {
    issues.push(`the Run reaches multiple Film compositions (${filmCompositions.join(", ")}); Studio requires one explicit Film`);
  }
  const chosen = targets.find((item) => item.compositionRef !== undefined && item.placement !== undefined);
  if (chosen?.compositionRef === undefined || chosen.placement === undefined || chosen.companion === undefined) {
    issues.push("Film/Render target has no traceable Film composition");
    throw new StudioPreflightError(issues);
  }
  const film = chosen.companion;

  const candidates = new Map(base.run.graph.candidates.map((item) => [item.id, item] as const));
  const satisfactions = new Map(base.run.graph.satisfactions.map((item) => [item.output, item.candidate] as const));
  for (const target of targets) {
    const candidateId = satisfactions.get(target.ref);
    const candidate = candidateId === undefined ? undefined : candidates.get(candidateId);
    if (candidate?.root.kind === "value" && candidate.root.value.value.kind === "blob") {
      issues.push(`Render target ${outputFor(source, target.ref)?.name ?? target.ref} is an opaque media Candidate; Studio needs the current Film graph`);
    }
  }

  // The selected Film companion declares membership and time-source vocabulary.
  const filmTrackRefs = unique(chosen.placement.children.flatMap((child) => {
    if (localName(child.tag) !== film.tracks.childSurface) return [];
    const source = child.resolvedReferenceAttributes?.[film.tracks.sourceAttribute];
    return source === undefined ? [] : [source];
  })).flatMap((ref) => {
    const output = outputFor(source, ref);
    return output !== undefined && film.tracks.types.some((type) => sameType(type, output.typeRef))
      ? [output.ref]
      : [];
  });
  const times = film.timeSources.flatMap((sourceType) => {
    const value = referencedValueFor(source, chosen.placement!.resolvedReferenceAttributes?.[sourceType.attribute] ?? "");
    return value !== undefined && sameType(value.typeRef, sourceType.type) ? [value] : [];
  });
  const timeOutput = times[0];
  if (times.length !== 1) issues.push("Film requires one traceable time source.");
  const semanticOutput = timeOutput !== undefined && sameType(timeOutput.typeRef, semanticTrackTypes.track) ? timeOutput : undefined;
  let companionValueRefs: readonly string[] = [];
  try {
    companionValueRefs = unique(filmTrackRefs.flatMap((ref) =>
      tracedStudioValues(registry, source, ref)));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const companionValueSet = new Set(companionValueRefs);

  const projectionRefs = unique([
    ...filmTrackRefs,
    ...(semanticOutput !== undefined && sameType(semanticOutput.typeRef, semanticTrackTypes.track) ? [semanticOutput.ref] : []),
    ...companionValueRefs,
  ]);
  const projections: StudioViewRequirement[] = [];
  const derived: Omit<StudioViewRequirement, "candidatePolicy">[] = [];
  for (const ref of projectionRefs) {
    const output = outputFor(source, ref);
    const role = roleFor(registry, source, ref) ?? (companionValueSet.has(ref) ? "supporting-value" : undefined);
    if (output === undefined || role === undefined) continue;
    const candidateId = satisfactions.get(ref);
    const candidate = candidateId === undefined ? undefined : candidates.get(candidateId);
    if (candidateIsMaterialized(candidate)) {
      projections.push({
        name: output.name,
        ref,
        type: output.type,
        role,
        ...(candidateId === undefined ? {} : { candidateId }),
        trace: traceFor(source, ref),
        candidatePolicy: "materialized-inline",
      });
      continue;
    }
    derived.push({
      name: output.name,
      ref,
      type: output.type,
      role,
      ...(candidateId === undefined ? {} : { candidateId }),
      trace: traceFor(source, ref),
    });
  }

  if (derived.length > 0) {
    projections.push(...derived.map((projection) => ({
      ...projection,
      candidatePolicy: "deterministic-derived" as const,
    })));
  }
  if (issues.length > 0) throw new StudioPreflightError(issues);
  return {
    renderTargets: targets.map((item) => item.ref),
    filmComposition: chosen.compositionRef,
    timeRef: timeOutput!.ref,
    projections,
  };
}
