import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { childEntities, readonlyInteraction, sameSurfaceValue } from "@hypit/studio-adapter";
import { videoLaneHeights } from "./presentation.js";
import { itemTemporalLineage } from "./temporal.js";

type TypographyTrackProgram = {
  readonly items?: readonly {
    readonly id: string;
    readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly style: { readonly stackingOrder: number };
    readonly document?: {
      readonly paragraphs?: readonly {
        readonly inlines?: readonly ({ readonly kind: "text"; readonly text: string } | { readonly kind: "break" })[];
      }[];
    };
  }[];
};

function textOf(document: NonNullable<NonNullable<TypographyTrackProgram["items"]>[number]["document"]>): string {
  return (document.paragraphs ?? []).map((paragraph) => (paragraph.inlines ?? [])
    .map((inline) => inline.kind === "text" ? inline.text : " ")
    .join(""))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

type TerminalVisualTrack = {
  readonly presents?: readonly {
    readonly id: string;
    readonly elements?: readonly {
      readonly kind?: string;
      readonly artifact?: { readonly digest?: string };
    }[];
  }[];
};

type TerminalAudioTrack = {
  readonly clips?: readonly {
    readonly id: string;
    readonly artifact?: { readonly digest?: string };
  }[];
};

/** Terminal media has one Studio treatment regardless of which package authored it. */
export function projectTerminalVisual(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const presents = new Map(((context.track.value as TerminalVisualTrack).presents ?? [])
    .map((present) => [present.id, present] as const));
  return context.generic().map((entity) => {
    const present = entity.presentId === undefined ? undefined : presents.get(entity.presentId);
    const material = present?.elements?.find((element) =>
      (element.kind === "image" || element.kind === "video") && element.artifact?.digest !== undefined);
    const digest = material?.artifact?.digest;
    return {
      ...entity,
      presentation: { entity: "media-item", shape: "picture", depth: 0 },
      ...(digest === undefined ? {} : {
        preview: {
          kind: material?.kind === "image" ? "image" as const : "video" as const,
          url: `/__studio/material/${digest}`,
        },
      }),
    };
  });
}

export function projectTerminalAudio(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const clips = new Map(((context.track.value as TerminalAudioTrack).clips ?? [])
    .map((clip) => [clip.id, clip] as const));
  return context.generic().map((entity, index) => {
    const digest = clips.get(context.spans[index]?.id ?? "")?.artifact?.digest;
    return {
      ...entity,
      presentation: { entity: "audio-clip", shape: "waveform", depth: 0 },
      ...(digest === undefined ? {} : {
        preview: { kind: "audio" as const, url: `/__studio/material/${digest}` },
      }),
    };
  });
}

function projectText(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = sameSurfaceValue(context, "program") as TypographyTrackProgram | undefined;
  if (program?.items === undefined) return context.generic();
  const items = program.items.map((item) => ({
    id: item.id,
    startFrame: item.span.startFrame,
    endFrameExclusive: item.span.endFrameExclusive,
    stackOrder: item.style.stackingOrder,
  }));
  return childEntities(context, items, "typography-item", "text").map((entity, index) => {
    const item = items[index];
    if (item === undefined) return entity;
    const document = program.items?.[index]?.document;
    const label = document === undefined ? "" : textOf(document);
    const temporal = itemTemporalLineage({
      runtimeId: item.id, span: item,
      ...(context.placement === undefined ? {} : { placement: context.placement }),
    });
    const named = label.length === 0 ? entity : { ...entity, label };
    return temporal === undefined ? named : { ...named, temporal };
  });
}

function projectCaption(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  return context.generic().map((entity) => ({
    ...entity,
    presentation: { entity: "caption-cue", shape: "text", depth: 0 },
    interaction: readonlyInteraction,
  }));
}

export const genericAdapters: readonly StudioAdapter[] = [
  { id: "typography-program", role: "realization", output: { type: "TypographyTrackProgram", modules: ["@hypit/typography-track"] } },
  {
    id: "text", role: "text", output: { type: "VisualTrack", surface: "track", modules: ["@hypit/typography-track"] },
    family: "text", icon: "text", interaction: readonlyInteraction,
    editOperations: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "placement", label: "Placement", writable: false },
      { name: "during", label: "During", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "at", label: "At", writable: false },
      { name: "for", label: "For", writable: true },
      { name: "style", label: "Style", writable: false },
    ],
    realizationPorts: ["program"], project: projectText,
    lane: { layout: "flat", height: videoLaneHeights.text },
  },
  {
    id: "caption", role: "caption", output: { type: "VisualTrack", surface: "track", modules: ["@hypit/caption-fine"] },
    family: "caption", icon: "captions", interaction: readonlyInteraction,
    editOperations: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "during", label: "During", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "at", label: "At", writable: false },
      { name: "for", label: "For", writable: true },
      { name: "style", label: "Style", writable: false },
      { name: "program", label: "Program", writable: false },
    ],
    project: projectCaption,
    lane: { layout: "flat", height: videoLaneHeights.text },
  },
  {
    id: "component", role: "track",
    output: { type: "VisualTrack", modules: ["@hypit/ranking", "@hypit/comment-sticker", "@hypit/screen-overlay"] },
    family: "component", icon: "component", interaction: readonlyInteraction,
    editOperations: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "during", label: "During", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "at", label: "At", writable: false },
      { name: "for", label: "For", writable: true },
      { name: "until", label: "Until", writable: false },
      { name: "z", label: "Z", control: "number", writable: true },
      { name: "frame", label: "Frame", writable: false },
      { name: "appearance", label: "Appearance", writable: false },
      { name: "motion", label: "Motion", writable: false },
      { name: "style", label: "Style", writable: false },
      { name: "program", label: "Program", writable: false },
      { name: "source", label: "Source", writable: false },
      { name: "icon", label: "Icon", writable: false },
      { name: "label", label: "Label", writable: true },
      { name: "rank", label: "Rank", control: "number", writable: true },
      { name: "color", label: "Color", writable: true },
      { name: "intensity", label: "Intensity", control: "number", writable: true },
      { name: "opacity", label: "Opacity", control: "number", writable: true },
      { name: "attack", label: "Attack", control: "number", writable: true, unit: "f" },
      { name: "hold", label: "Hold", control: "number", writable: true, unit: "f" },
      { name: "decay", label: "Decay", control: "number", writable: true, unit: "f" },
      { name: "gain", label: "Gain", control: "number", writable: true },
      { name: "fade-in", label: "Fade in", control: "number", writable: true, unit: "f" },
      { name: "fade-out", label: "Fade out", control: "number", writable: true, unit: "f" },
      { name: "center-x", label: "Center X", control: "number", writable: true },
      { name: "center-y", label: "Center Y", control: "number", writable: true },
      { name: "radius-x", label: "Radius X", control: "number", writable: true },
      { name: "radius-y", label: "Radius Y", control: "number", writable: true },
      { name: "softness", label: "Softness", control: "number", writable: true },
      { name: "spacing", label: "Spacing", control: "number", writable: true },
      { name: "thickness", label: "Thickness", control: "number", writable: true },
      { name: "angle", label: "Angle", control: "number", writable: true },
      { name: "direction", label: "Direction", writable: true },
      { name: "seed", label: "Seed", control: "number", writable: true },
      { name: "amount", label: "Amount", control: "number", writable: true },
      { name: "noise-size", label: "Noise size", control: "number", writable: true },
      { name: "scan-line-opacity", label: "Scan-line opacity", control: "number", writable: true },
      { name: "motion-rate", label: "Motion rate", control: "number", writable: true },
    ],
    lane: { layout: "flat", height: videoLaneHeights.component },
  },
  { id: "audio-track", role: "track", output: { type: "AudioTrack" }, family: "audio", icon: "waveform", interaction: readonlyInteraction,
    editOperations: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "during", label: "During", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "at", label: "At", writable: false },
      { name: "for", label: "For", writable: true },
    ],
    project: projectTerminalAudio, lane: { layout: "flat", height: videoLaneHeights.audio } },
  { id: "visual-track", role: "track", output: { type: "VisualTrack" }, family: "media", icon: "video", interaction: readonlyInteraction,
    editOperations: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "during", label: "During", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "at", label: "At", writable: false },
      { name: "for", label: "For", writable: true },
    ],
    project: projectTerminalVisual, lane: { layout: "flat", height: videoLaneHeights.picture } },
];
