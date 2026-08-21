import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { childEntities, laneHeights, readonlyInteraction, sameSurfaceValue } from "./types.js";
import { itemTemporalLineage } from "./temporal.js";

type MediaTrackProgramValue = {
  readonly items?: readonly {
    readonly id: string;
    readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly stacking: { readonly order: number };
    readonly layers?: readonly MediaLayerValue[];
    readonly sourceAudio?: { readonly fromLayer: string };
  }[];
  readonly sequences?: readonly {
    readonly id: string;
    readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly stacking: { readonly order: number };
    readonly members?: readonly {
      readonly layers?: readonly MediaLayerValue[];
      readonly sourceAudio?: { readonly fromLayer: string };
    }[];
  }[];
};

type MediaLayerValue = {
  readonly id?: string;
  readonly kind?: string;
  readonly source?: {
    readonly kind?: string;
    readonly artifact?: { readonly digest?: string; readonly mediaType?: string };
    readonly audio?: { readonly artifact?: { readonly digest?: string; readonly mediaType?: string } };
  };
};

function materialPreview(
  layers: readonly MediaLayerValue[] | undefined,
  facet: "visual" | "audio",
  audioFromLayer?: string,
): StudioEntityDraft["preview"] {
  const layer = layers?.find((candidate) => candidate.kind === "sample"
    && (facet === "visual" || audioFromLayer === undefined || candidate.id === audioFromLayer));
  const source = layer?.source;
  if (facet === "audio") {
    const artifact = source?.audio?.artifact;
    return artifact?.digest === undefined
      ? undefined
      : { kind: "audio", url: `/__studio/material/${artifact.digest}` };
  }
  const artifact = source?.artifact;
  if (artifact?.digest === undefined) return undefined;
  if (source?.kind === "still") return { kind: "image", url: `/__studio/material/${artifact.digest}` };
  if (source?.kind === "timed") return { kind: "video", url: `/__studio/material/${artifact.digest}` };
  return undefined;
}

function projectMedia(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = sameSurfaceValue(context, "program") as MediaTrackProgramValue | undefined;
  if (program === undefined) return context.generic();
  const facet = context.track.type === "AudioTrack" ? "audio" : "visual";
  const items = [
    ...(program.items ?? []).map((item) => ({
      id: item.id, startFrame: item.span.startFrame, endFrameExclusive: item.span.endFrameExclusive,
      stackOrder: item.stacking.order, preview: materialPreview(item.layers, facet, item.sourceAudio?.fromLayer),
    })),
    ...(program.sequences ?? []).map((item) => ({
      id: item.id, startFrame: item.span.startFrame, endFrameExclusive: item.span.endFrameExclusive,
      stackOrder: item.stacking.order,
      preview: materialPreview(item.members?.[0]?.layers, facet, item.members?.[0]?.sourceAudio?.fromLayer),
    })),
  ];
  return childEntities(context, items, "media-item",
    context.track.type === "AudioTrack" ? "waveform" : "picture").map((entity, index) => {
    const item = items[index];
    if (item === undefined) return entity;
    const temporal = itemTemporalLineage({
      runtimeId: item.id, span: item,
      ...(context.placement === undefined ? {} : { placement: context.placement }),
    });
    return {
      ...entity,
      ...(item.preview === undefined ? {} : { preview: item.preview }),
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const mediaAdapters: readonly StudioAdapter[] = [
  { id: "media-program", role: "realization", output: { type: "MediaTrackProgram", modules: ["@hypit/media-track"] } },
  {
    id: "media-visual", role: "media",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", icon: "video", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectMedia,
    lane: { layout: "flat", height: laneHeights.picture },
  },
  {
    id: "media-audio", role: "media",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", icon: "waveform", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectMedia,
    lane: { layout: "flat", height: laneHeights.audio },
  },
];
