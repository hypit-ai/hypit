import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { childEntities, laneHeights, readonlyInteraction, sameSurfaceValue } from "./types.js";
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

type CaptionPlanValue = {
  readonly runs?: readonly {
    readonly cues?: readonly { readonly id: string; readonly atomIds: readonly string[] }[];
  }[];
};

type CaptionDisplayValue = {
  readonly atoms?: readonly { readonly id: string; readonly wordIds: readonly string[] }[];
  readonly words?: readonly { readonly id: string; readonly text: string }[];
};

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
function projectTerminalVisual(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const presents = new Map(((context.track.track as TerminalVisualTrack).presents ?? [])
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

function projectTerminalAudio(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const clips = new Map(((context.track.track as TerminalAudioTrack).clips ?? [])
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
  const planRef = context.track.trace.references.find((reference) => reference.type === "CaptionPlan")?.ref;
  const displayRef = context.track.trace.references.find((reference) => reference.type === "CaptionDisplaySequence")?.ref;
  const plan = planRef === undefined ? undefined : context.values.get(planRef) as CaptionPlanValue | undefined;
  const display = displayRef === undefined ? undefined : context.values.get(displayRef) as CaptionDisplayValue | undefined;
  if (plan?.runs === undefined || display?.atoms === undefined || display.words === undefined) return context.generic();
  const atoms = new Map(display.atoms.map((atom) => [atom.id, atom] as const));
  const words = new Map(display.words.map((word) => [word.id, word.text] as const));
  const spans = new Map(context.spans.map((span) => [span.id, span] as const));
  return plan.runs.flatMap((run) => run.cues ?? []).flatMap((cue): readonly StudioEntityDraft[] => {
    const span = spans.get(cue.id);
    if (span === undefined) return [];
    const label = cue.atomIds.flatMap((atomId) => atoms.get(atomId)?.wordIds ?? [])
      .flatMap((wordId) => words.get(wordId) ?? [])
      .join(" ");
    return [{
      id: `${context.track.outputRef}:entity:${cue.id}`,
      authoredId: context.placement?.id ?? cue.id,
      label: label.length === 0 ? cue.id : label,
      startFrame: span.startFrame,
      endFrameExclusive: span.endFrameExclusive,
      stackOrder: span.stackOrder,
      ...(context.placement === undefined ? {} : { elementRange: context.placement.range }),
      presentId: span.id,
      renderIds: [span.id],
      presentation: { entity: "caption-cue", shape: "text", depth: 0 },
      interaction: readonlyInteraction,
    }];
  });
}

export const genericAdapters: readonly StudioAdapter[] = [
  { id: "caption-plan", role: "caption-plan", output: { type: "CaptionPlan" } },
  { id: "typography-program", role: "realization", output: { type: "TypographyTrackProgram", modules: ["@hypit/typography-track"] } },
  {
    id: "text", role: "text", output: { type: "VisualTrack", surface: "track", modules: ["@hypit/typography-track"] },
    family: "text", icon: "text", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectText,
    lane: { layout: "flat", height: laneHeights.text },
  },
  {
    id: "caption", role: "caption", output: { type: "VisualTrack", surface: "track", modules: ["@hypit/caption-fine"] },
    family: "caption", icon: "captions", interaction: readonlyInteraction,
    dependencies: [{ type: "CaptionPlan", role: "caption-plan" }], project: projectCaption,
    lane: { layout: "flat", height: laneHeights.text },
  },
  {
    id: "component", role: "track",
    output: { type: "VisualTrack", modules: ["@hypit/ranking", "@hypit/comment-sticker", "@hypit/screen-overlay"] },
    family: "component", icon: "component", interaction: readonlyInteraction,
    lane: { layout: "flat", height: laneHeights.component },
  },
  { id: "audio-track", role: "track", output: { type: "AudioTrack" }, family: "audio", icon: "waveform", interaction: readonlyInteraction,
    project: projectTerminalAudio, lane: { layout: "flat", height: laneHeights.audio } },
  { id: "visual-track", role: "track", output: { type: "VisualTrack" }, family: "media", icon: "video", interaction: readonlyInteraction,
    project: projectTerminalVisual, lane: { layout: "flat", height: laneHeights.picture } },
];
