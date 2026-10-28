import { sameType } from "@hypit/hypit/protocol";
import type { StudioFilmCompanion, StudioPlacementChild } from "@hypit/studio-companion";

import type { CompiledSource } from "./compile.js";
import type { Placement } from "./observe.js";
import type { StudioPlan } from "./invocation.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import {
  outputFor,
  referencedValueFor,
  placementFor,
  isStudioTrack,
  traceFor,
  tracedStudioValues,
  unique,
} from "./studio-trace.js";
import type { StudioTrace } from "./studio-trace.js";

export type StudioTrackRequirement = {
  readonly name: string;
  readonly ref: string;
  readonly type: string;
  readonly trace: StudioTrace;
  /** Film-owned visual occurrences of this reusable Track value. */
  readonly visualOccurrences?: readonly (readonly string[])[];
};

export type StudioInspection = {
  readonly filmComposition: string;
  readonly timeRef: string;
  readonly tracks: readonly StudioTrackRequirement[];
  /** Values explicitly required by Track Companions, never projected as Tracks. */
  readonly requiredValues: readonly string[];
};

/** Invocation facts required by Studio preflight; compilation callbacks and attachments stay outside it. */
export type StudioInvocationSelection = Pick<StudioPlan, "targets" | "invocation">;

export class StudioPreflightError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(["Studio cannot start:", ...issues.map((issue) => `- ${issue}`)].join("\n"));
    this.name = "StudioPreflightError";
    this.issues = issues;
  }
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
  if (candidates.length > 1) throw new Error(`Invocation target ${targetRef} reaches more than one Studio Film.`);
  const found = candidates[0];
  return found === undefined ? { renderTarget: false } : { renderTarget: true, ...found };
}

/**
 * Video-domain policy is centralized here, inside Studio. Core still only
 * supplies the AuthorGraph facts and their exact BuildPlan/Need closure.
 */
export function inspectStudioInvocation(
  registry: StudioCompanionRegistry,
  source: CompiledSource,
  base: StudioInvocationSelection,
): StudioInspection {
  const issues: string[] = [];
  if (base.targets.length === 0) issues.push("the Invocation has no target; Studio requires Film or Render");

  const targets = base.targets.flatMap((ref) => {
    const found = filmForTarget(registry, source, ref);
    return found.renderTarget ? [{ ref, ...found }] : [];
  });
  if (targets.length === 0 && base.targets.length > 0) {
    issues.push("the Invocation target is not a Film or Render output from the current SVML");
  }
  const filmCompositions = unique(targets.flatMap((target) =>
    target.compositionRef === undefined ? [] : [target.compositionRef]));
  if (filmCompositions.length > 1) {
    issues.push(`the Invocation reaches multiple Film compositions (${filmCompositions.join(", ")}); Studio requires one explicit Film`);
  }
  const chosen = targets.find((item) => item.compositionRef !== undefined && item.placement !== undefined);
  if (chosen?.compositionRef === undefined || chosen.placement === undefined || chosen.companion === undefined) {
    issues.push("Film/Render target has no traceable Film composition");
    throw new StudioPreflightError(issues);
  }
  const film = chosen.companion;

  // The selected Film companion declares membership and time-source vocabulary.
  const trackUses = (
    children: readonly StudioPlacementChild[],
    parentPath: readonly string[] = [],
  ): { readonly ref: string; readonly occurrencePath?: readonly string[] }[] => children.flatMap((child) => {
    const tag = localName(child.tag);
    if (tag === film.tracks.childDeclaration) {
      const source = child.resolvedReferenceAttributes?.[film.tracks.sourceAttribute];
      return source === undefined ? [] : [{
        ref: source,
        ...(child.id === undefined ? {} : { occurrencePath: [...parentPath, child.id] }),
      }];
    }
    return film.tracks.containerDeclarations?.includes(tag) === true && child.id !== undefined
      ? trackUses(child.children ?? [], [...parentPath, child.id])
      : [];
  });
  const uses = trackUses(chosen.placement.children).flatMap((use) => {
    const output = outputFor(source, use.ref);
    return output !== undefined && film.tracks.types.some((type) => sameType(type, output.typeRef))
      ? [{ ref: output.ref, ...(use.occurrencePath === undefined ? {} : { occurrencePath: use.occurrencePath }) }]
      : [];
  });
  const filmTrackRefs = unique(uses.map((use) => use.ref));
  const visualOccurrences = new Map<string, readonly (readonly string[])[]>();
  for (const ref of filmTrackRefs) {
    const paths = uses.flatMap((use) => use.ref === ref && use.occurrencePath !== undefined
      ? [use.occurrencePath]
      : []);
    if (paths.length > 0) visualOccurrences.set(ref, paths);
  }
  const times = film.timeSources.flatMap((sourceType) => {
    const value = referencedValueFor(source, chosen.placement!.resolvedReferenceAttributes?.[sourceType.attribute] ?? "");
    return value !== undefined && sameType(value.typeRef, sourceType.type) ? [value] : [];
  });
  const timeOutput = times[0];
  if (times.length !== 1) issues.push("Film requires one traceable time source.");
  let companionValueRefs: readonly string[] = [];
  try {
    companionValueRefs = unique(filmTrackRefs.flatMap((ref) =>
      tracedStudioValues(registry, source, ref)));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const tracks: StudioTrackRequirement[] = [];
  for (const ref of filmTrackRefs) {
    const output = outputFor(source, ref);
    if (output === undefined || !isStudioTrack(registry, source, ref)) continue;
    const occurrences = visualOccurrences.get(ref);
    tracks.push({
      name: output.name,
      ref,
      type: output.type,
      trace: traceFor(source, ref),
      ...(occurrences === undefined ? {} : { visualOccurrences: occurrences }),
    });
  }
  if (issues.length > 0) throw new StudioPreflightError(issues);
  return {
    filmComposition: chosen.compositionRef,
    timeRef: timeOutput!.ref,
    tracks,
    requiredValues: companionValueRefs,
  };
}
