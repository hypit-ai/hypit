import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { childEntities, readonlyInteraction, sameSurfaceValue } from "./types.js";
import { itemTemporalLineage } from "./temporal.js";

type MediaTrackProgramValue = {
  readonly items?: readonly {
    readonly id: string;
    readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly stacking: { readonly order: number };
    readonly layers?: readonly MediaLayerValue[];
  }[];
  readonly sequences?: readonly {
    readonly id: string;
    readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly stacking: { readonly order: number };
    readonly members?: readonly { readonly layers?: readonly MediaLayerValue[] }[];
  }[];
};

type MediaLayerValue = {
  readonly kind?: string;
  readonly source?: {
    readonly kind?: string;
    readonly artifact?: { readonly digest?: string; readonly mediaType?: string };
  };
};

function imagePreview(layers: readonly MediaLayerValue[] | undefined): StudioEntityDraft["preview"] {
  const source = layers?.find((layer) => layer.kind === "sample")?.source;
  const artifact = source?.artifact;
  if (source?.kind !== "still" || artifact?.digest === undefined || artifact.mediaType?.startsWith("image/") !== true) {
    return undefined;
  }
  return { kind: "image", url: `/__studio/material/${artifact.digest}` };
}

function projectMedia(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = sameSurfaceValue(context, "program") as MediaTrackProgramValue | undefined;
  if (program === undefined) return context.generic();
  const items = [
    ...(program.items ?? []).map((item) => ({
      id: item.id, startFrame: item.span.startFrame, endFrameExclusive: item.span.endFrameExclusive,
      stackOrder: item.stacking.order, preview: imagePreview(item.layers),
    })),
    ...(program.sequences ?? []).map((item) => ({
      id: item.id, startFrame: item.span.startFrame, endFrameExclusive: item.span.endFrameExclusive,
      stackOrder: item.stacking.order, preview: imagePreview(item.members?.[0]?.layers),
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
      ...(item.preview === undefined || context.track.type === "AudioTrack" ? {} : { preview: item.preview }),
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
  },
  {
    id: "media-audio", role: "media",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", icon: "waveform", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectMedia,
  },
];
