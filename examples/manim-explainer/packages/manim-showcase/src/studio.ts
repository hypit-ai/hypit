import { compositionTypes } from "@hypit/hypit/composition";
import { temporalTypes } from "@hypit/hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "@hypit/hypit/temporal";
import { sameType } from "@hypit/hypit/protocol";
import type { TypeRef } from "@hypit/hypit/protocol";
import type { StudioItemDraft, StudioTrackCompanion, StudioTrackCompanionContext } from "@hypit/studio-companion";
import { textLayer } from "@hypit/studio-companion";

const moduleRef = { name: "@project/manim-showcase", version: "1" } as const;

function projectShowcase(context: StudioTrackCompanionContext): readonly StudioItemDraft[] {
  const referenced = <T>(input: string, type: TypeRef): T | undefined => {
    const reference = context.track.trace.references.find(candidate => candidate.input === input && sameType(candidate.typeRef, type));
    return reference === undefined ? undefined : context.values.get(reference.ref) as T | undefined;
  };
  const moments = new Map(["first", "next", "finally", "these"].map(name => [name,
    referenced<TemporalInstant>(name, temporalTypes.instant)?.frame,
  ] as const));
  const endFrame = referenced<TemporalWindow>("during", temporalTypes.window)?.span.endFrameExclusive
    ?? Math.max(0, ...context.spans.map((span) => span.endFrameExclusive));
  const phases = [
    { id: "mathematics", start: moments.get("first"), end: moments.get("next"), title: "Mathematics" },
    { id: "machine-learning", start: moments.get("next"), end: moments.get("finally"), title: "Machine learning" },
    { id: "physics", start: moments.get("finally"), end: moments.get("these"), title: "Physics" },
    { id: "overview", start: moments.get("these"), end: endFrame, title: "All three cards" },
  ];
  const projected = phases.flatMap((phase, index): StudioItemDraft[] => {
    if (phase.start === undefined || phase.end === undefined || phase.end <= phase.start) return [];
    return [{
      id: `${context.track.outputRef}:phase:${phase.id}`,
      authoredId: phase.id,
      display: { title: phase.title, layers: [textLayer(phase.title)] },
      startFrame: phase.start,
      endFrameExclusive: phase.end,
      stackOrder: index,
      presentation: { kind: "media-item", chrome: "standard" },
    }];
  });
  return projected.length > 0 ? projected : context.generic();
}

export const manimShowcaseStudioTrackCompanions: readonly StudioTrackCompanion[] = [{
  id: "scene",
  role: "track",
  output: {
    type: compositionTypes.visualTrack,
    surface: "scene",
    modules: [moduleRef],
  },
  family: "manim-showcase",
  label: "Manim showcase",
  tone: "teal",
  icon: "video",
  lane: { heightPx: 64 },
  project: projectShowcase,
}];
