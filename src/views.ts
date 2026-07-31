import type { Compilation } from "./compiler.js";
import type { PlanIR } from "./model.js";

export type CanvasView = {
  contract: "svml.canvas-view.v1";
  root: string;
  nodes: Array<
    | {
      id: string;
      identity: string;
      kind: "value";
      valueType: string;
      contentDigest?: string;
    }
    | {
      id: string;
      identity: string;
      kind: "kernel";
      kernel: string;
      executionDigest?: string;
    }
  >;
  edges: PlanIR["edges"];
};

export type TimelineView = {
  contract: "svml.timeline-view.v1";
  fps: number;
  durationFrames: number;
  words: Compilation["located"]["words"];
  segments: Compilation["located"]["segments"];
  selections: Compilation["located"]["selections"];
  moments: Compilation["located"]["moments"];
  captionCues: Compilation["located"]["captionCues"];
  visuals: Compilation["target"]["visuals"];
  audios: Compilation["target"]["audios"];
};

export function projectCanvas(plan: PlanIR): CanvasView {
  return {
    contract: "svml.canvas-view.v1",
    root: plan.root,
    nodes: [
      ...plan.values.map((value) => ({
        id: value.id,
        identity: value.identity,
        kind: "value" as const,
        valueType: value.type,
        ...(value.contentDigest ? { contentDigest: value.contentDigest } : {}),
      })),
      ...plan.instances.map((instance) => ({
        id: instance.id,
        identity: instance.identity,
        kind: "kernel" as const,
        kernel: instance.kernel,
        ...(instance.executionDigest
          ? { executionDigest: instance.executionDigest }
          : {}),
      })),
    ],
    edges: plan.edges,
  };
}

export function projectTimeline(compilation: Compilation): TimelineView {
  return {
    contract: "svml.timeline-view.v1",
    fps: compilation.located.fps,
    durationFrames: compilation.located.durationFrames,
    words: compilation.located.words,
    segments: compilation.located.segments,
    selections: compilation.located.selections,
    moments: compilation.located.moments,
    captionCues: compilation.located.captionCues,
    visuals: compilation.target.visuals,
    audios: compilation.target.audios,
  };
}
