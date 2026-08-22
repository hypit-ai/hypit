import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { childEntities, readonlyInteraction, sameSurfaceValue } from "@hypit/studio-adapter";
import { videoLaneHeights } from "./presentation.js";
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
    editOperations: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "during", label: "During", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "at", label: "At", writable: false },
      { name: "for", label: "For", writable: true },
      { name: "source", label: "Source", writable: false },
      { name: "source-audio", label: "Source audio", writable: false },
      { name: "extent", label: "Extent", writable: false },
      { name: "fit", label: "Fit", writable: false },
      { name: "sample-spec", label: "Sample spec", writable: false },
      { name: "item-spec", label: "Item spec", writable: false },
      { name: "window-spec", label: "Window spec", writable: false },
      { name: "audio", label: "Audio", writable: true },
      { name: "gain", label: "Gain", control: "number", writable: true },
      { name: "frame", label: "Frame", writable: false },
      { name: "appearance", label: "Appearance", writable: false },
      { name: "motion", label: "Motion", writable: false },
      { name: "z", label: "Z", control: "number", writable: true },
    ],
    realizationPorts: ["program"], project: projectMedia,
    lane: { layout: "flat", height: videoLaneHeights.picture },
  },
  {
    id: "media-audio", role: "media",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", icon: "waveform", interaction: readonlyInteraction,
    editOperations: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "during", label: "During", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "at", label: "At", writable: false },
      { name: "for", label: "For", writable: true },
      { name: "source", label: "Source", writable: false },
      { name: "source-audio", label: "Source audio", writable: false },
      { name: "sample-spec", label: "Sample spec", writable: false },
      { name: "item-spec", label: "Item spec", writable: false },
      { name: "window-spec", label: "Window spec", writable: false },
      { name: "audio", label: "Audio", writable: true },
      { name: "gain", label: "Gain", control: "number", writable: true },
      { name: "frame", label: "Frame", writable: false },
      { name: "appearance", label: "Appearance", writable: false },
      { name: "motion", label: "Motion", writable: false },
      { name: "z", label: "Z", control: "number", writable: true },
    ],
    realizationPorts: ["program"], project: projectMedia,
    lane: { layout: "flat", height: videoLaneHeights.audio },
  },
];
