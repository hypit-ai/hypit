import { compositionTypes } from "@hypit/hypit/composition";
import type { StudioEntityDraft, StudioTrackCompanion, StudioTrackCompanionContext } from "@hypit/hypit/studio-adapter";
import { textLayer } from "@hypit/hypit/studio-adapter";

const moduleRef = { name: "@project/manim-showcase", version: "1" } as const;

function projectShowcase(context: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
  const moments = new Map((context.semantic?.moments ?? []).map((moment) => [moment.id, moment.frame] as const));
  const endFrame = context.semantic?.anchors.at(-1)?.frame
    ?? Math.max(0, ...context.spans.map((span) => span.endFrameExclusive));
  const phases = [
    { id: "mathematics", start: moments.get("first"), end: moments.get("next"), title: "Mathematics" },
    { id: "machine-learning", start: moments.get("next"), end: moments.get("finally"), title: "Machine learning" },
    { id: "physics", start: moments.get("finally"), end: moments.get("these"), title: "Physics" },
    { id: "overview", start: moments.get("these"), end: endFrame, title: "All three cards" },
  ];
  const projected = phases.flatMap((phase, index): StudioEntityDraft[] => {
    if (phase.start === undefined || phase.end === undefined || phase.end <= phase.start) return [];
    return [{
      id: `${context.track.outputRef}:phase:${phase.id}`,
      authoredId: phase.id,
      display: { title: phase.title, layers: [textLayer(phase.title)] },
      startFrame: phase.start,
      endFrameExclusive: phase.end,
      stackOrder: index,
      presentation: { entity: "media-item", chrome: "standard" },
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
