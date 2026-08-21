import { plannedNeeds } from "@hypit/core";
import type { Candidate } from "@hypit/protocol";

import type { CompiledSource } from "./compile.js";
import type { Placement } from "./observe.js";
import type { RunPlan } from "./run.js";
import {
  lastPlacementTag,
  outputFor,
  placementFor,
  roleFor,
  traceFor,
  tracedRealizations,
  tracedStudioRealizations,
  unique,
} from "./studio-trace.js";
import type { StudioProjectionRole, StudioTrace } from "./studio-trace.js";

export type StudioProjection = {
  readonly name: string;
  readonly ref: string;
  readonly type: string;
  readonly role: StudioProjectionRole;
  readonly candidateId?: string;
  readonly trace: StudioTrace;
  readonly candidatePolicy: "materialized-inline" | "deterministic-derived";
};

export type StudioInspection = {
  readonly renderTargets: readonly string[];
  readonly filmComposition: string;
  readonly projections: readonly StudioProjection[];
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

function plannedExternalNeeds(base: RunPlan, refs: readonly string[]): readonly string[] {
  const planned = base.plan(base.run, refs);
  return unique(plannedNeeds(planned.state).map((need) =>
    `${need.capability.module.name}@${need.capability.module.version}#${need.capability.name}`,
  ));
}

function filmForTarget(source: CompiledSource, targetRef: string): {
  readonly renderTarget: boolean;
  readonly compositionRef?: string;
  readonly placement?: Placement;
} {
  const targetPlacement = placementFor(source, targetRef);
  if (targetPlacement === undefined) return { renderTarget: false };
  if (lastPlacementTag(source, targetRef) === "Film") {
    return { renderTarget: true, compositionRef: targetRef, placement: targetPlacement };
  }
  if (lastPlacementTag(source, targetRef) !== "Video") return { renderTarget: false };
  const composition = targetPlacement.references
    .map((ref) => outputFor(source, ref))
    .find((item) => item?.type === "Composition");
  const compositionRef = composition?.ref;
  const placement = compositionRef === undefined ? undefined : placementFor(source, compositionRef);
  return {
    renderTarget: true,
    ...(compositionRef === undefined ? {} : { compositionRef }),
    ...(placement === undefined ? {} : { placement }),
  };
}

/**
 * Video-domain policy is centralized here, inside Studio. Core still only
 * supplies the compiled graph and its exact BuildPlan/Need closure.
 */
export function inspectStudioRun(source: CompiledSource, base: RunPlan): StudioInspection {
  const issues: string[] = [];
  if (base.targets.length === 0) issues.push("the Run Source has no target; Studio requires Film or Render");

  const targets = base.targets.flatMap((ref) => {
    const found = filmForTarget(source, ref);
    return found.renderTarget ? [{ ref, ...found }] : [];
  });
  if (targets.length === 0 && base.targets.length > 0) {
    issues.push("the Run target is not a Film or Render output from the current SVML");
  }
  const chosen = targets.find((item) => item.compositionRef !== undefined && item.placement !== undefined);
  if (chosen?.compositionRef === undefined || chosen.placement === undefined) {
    issues.push("Film/Render target has no traceable Film composition");
    throw new StudioPreflightError(issues);
  }

  const candidates = new Map(base.run.graph.candidates.map((item) => [item.id, item] as const));
  const satisfactions = new Map(base.run.graph.satisfactions.map((item) => [item.output, item.candidate] as const));
  for (const target of targets) {
    const candidateId = satisfactions.get(target.ref);
    const candidate = candidateId === undefined ? undefined : candidates.get(candidateId);
    if (candidate?.root.kind === "value" && candidate.root.value.value.kind === "blob") {
      issues.push(`Render target ${outputFor(source, target.ref)?.name ?? target.ref} is an opaque media Candidate; Studio needs the current Film graph`);
    }
  }

  // Only authored <film:Track source={...}/> children define Film membership
  // and Studio lane order. Film's canvas, semantic and appearance references
  // are not Tracks, and sibling outputs of those references are not implied.
  const filmTrackRefs = unique(chosen.placement.children.flatMap((child) => {
    const source = child.referenceAttributes.source;
    return source === undefined ? [] : [source];
  })).flatMap((ref) => {
    const output = outputFor(source, ref);
    return output !== undefined && (output.type === "VisualTrack" || output.type === "AudioTrack")
      ? [output.ref]
      : [];
  });
  const semanticOutput = outputFor(source, chosen.placement.referenceAttributes.semantic ?? "");
  if (semanticOutput?.type !== "SemanticTrack") {
    issues.push("Film has no traceable SemanticTrack reference");
  }
  const semanticPlacement = semanticOutput === undefined
    ? undefined
    : placementFor(source, semanticOutput.ref);
  const semanticTakeRefs = unique(semanticPlacement === undefined ? [] : [
    ...semanticPlacement.references,
    ...semanticPlacement.children.flatMap((child) => child.references),
  ]).flatMap((ref) => outputFor(source, ref)?.type === "SemanticTake"
    ? [outputFor(source, ref)!.ref] : []);
  if (semanticTakeRefs.length === 0) issues.push("Film has no traceable SemanticTake / Speech Track chain");

  const captionPlanRefs = unique(filmTrackRefs.flatMap((ref) =>
    tracedRealizations(source, ref).map((dependency) => dependency.ref)));

  const adapterRealizationRefs = unique(filmTrackRefs.flatMap((ref) =>
    tracedStudioRealizations(source, ref)));

  const projectionRefs = unique([
    ...filmTrackRefs,
    ...(semanticOutput?.type === "SemanticTrack" ? [semanticOutput.ref] : []),
    ...semanticTakeRefs,
    ...captionPlanRefs,
    ...adapterRealizationRefs,
  ]);
  const projections: StudioProjection[] = [];
  const derived: Omit<StudioProjection, "candidatePolicy">[] = [];
  for (const ref of projectionRefs) {
    const output = outputFor(source, ref);
    const role = roleFor(source, ref);
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
    const needs = plannedExternalNeeds(base, derived.map((projection) => projection.ref));
    if (needs.length > 0) {
      issues.push(`the Studio projection closure requires unresolved capabilities: ${needs.join(", ")}`);
    } else {
      projections.push(...derived.map((projection) => ({
        ...projection,
        candidatePolicy: "deterministic-derived" as const,
      })));
    }
  }
  if (issues.length > 0) throw new StudioPreflightError(issues);
  return {
    renderTargets: targets.map((item) => item.ref),
    filmComposition: chosen.compositionRef,
    projections,
  };
}
