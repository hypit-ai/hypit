import { canonicalStringify, compareCodeUnits } from "@hypit/hypit/protocol";
import { assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { audioTrackContent } from "./audio.js";
import type {
  VisualTrack,
  VisualScopeProcessMember,
  VisualScopeMember,
  VisualScope,
  VisualTrackOccurrence,
  Composition,
  CompositionDraft
} from "./types.js";

function visualScopeContent(value: VisualScope): VisualScope {
  return {
    members: [...value.members].map((member): VisualScopeMember => {
      if (member.kind === "track") return { kind: "track", id: member.id, track: structuredClone(member.track) };
      if (member.kind === "stack") return { kind: "stack", id: member.id, scope: visualScopeContent(member.scope) };
      return {
        kind: "process",
        id: member.id,
        inputs: member.inputs.map((input) => ({ name: input.name, scope: visualScopeContent(input.scope) })),
        effect: {
          inputs: [...member.effect.inputs],
          program: structuredClone(member.effect.program),
        },
      };
    }),
  };
}

export function sealVisualScope(value: VisualScope): VisualScope {
  return visualScopeContent(value);
}

export function visualScopeTracks(scope: VisualScope): VisualTrack[] {
  return scope.members.flatMap((member) => {
    if (member.kind === "track") return [member.track];
    if (member.kind === "stack") return visualScopeTracks(member.scope);
    return member.inputs.flatMap((input) => visualScopeTracks(input.scope));
  });
}

export function visualScopeProcesses(scope: VisualScope): VisualScopeProcessMember[] {
  return scope.members.flatMap((member): VisualScopeProcessMember[] => {
    if (member.kind === "track") return [];
    if (member.kind === "stack") return visualScopeProcesses(member.scope);
    return [member, ...member.inputs.flatMap((input) => visualScopeProcesses(input.scope))];
  });
}

export function visualScopeTrackOccurrences(
  scope: VisualScope,
  parentPath: readonly string[] = [],
): VisualTrackOccurrence[] {
  return scope.members.flatMap((member) => {
    const path = [...parentPath, member.id];
    if (member.kind === "track") return [{ path, member }];
    if (member.kind === "stack") return visualScopeTrackOccurrences(member.scope, path);
    return member.inputs.flatMap((input) => visualScopeTrackOccurrences(
      input.scope,
      [...parentPath, `process:${member.id}`, `input:${input.name}`],
    ));
  });
}

function compositionContent(value: CompositionDraft, timeline: Timeline): Composition {
  return {
    id: value.id,
    timeline: structuredClone(timeline),
    visual: {
      canvas: { ...value.visual.canvas },
      root: visualScopeContent(value.visual.root),
    },
    audio: {
      contributions: [...value.audio.contributions]
        .map((track) => audioTrackContent({ timelineId: track.timelineId, id: track.id, graph: track.graph }))
        .sort((left, right) => compareCodeUnits(canonicalStringify(left), canonicalStringify(right))),
    },
  };
}

export function sealComposition(value: CompositionDraft, timeline: Timeline): Composition {
  assertTimelineIdentity(timeline);
  return compositionContent(value, timeline);
}
