import { compareCodeUnits } from "@hypit/hypit/protocol";
import { compareExactTemporalValues } from "@hypit/temporal";
import type { FrameSpan } from "@hypit/timeline";
import { sealVisualProcessEffect } from "./validation.js";
import type {
  VisualTextPaintLayer,
  VisualTextFlowElement,
  VisualPathTextElement,
  VisualElement,
  VisualPresent,
  VisualProcess,
  VisualContribution,
  VisualAdjustment,
  VisualItem,
  VisualPresentDraft,
  VisualTrack,
  PresentVisualTrack
} from "./types.js";

function normalizeElement(element: VisualElement): VisualElement {
  const common = {
    id: element.id,
  };
  if (element.kind === "program") return {
    ...common,
    kind: "program",
    program: structuredClone(element.program),
    slots: element.slots.map((slot) => ({ name: slot.name, element: normalizeElement(slot.element) })),
  };
  if (element.kind === "mask") return {
    ...common,
    kind: "mask",
    mode: element.mode,
    mask: normalizeElement(element.mask),
    content: normalizeElement(element.content),
  };
  if (element.kind === "text") {
    return {
      ...common,
      kind: "text",
      text: element.text,
      fonts: element.fonts.map((font) => ({
          sources: font.sources.map((source) => ({
            artifact: { ...source.artifact },
            ...(source.unicodeRange === undefined ? {} : { unicodeRange: source.unicodeRange }),
          })),
          weight: font.weight,
          style: font.style,
        })),
      ...(element.paints === undefined ? {} : { paints: structuredClone(element.paints) as VisualTextPaintLayer[] }),
    };
  }
  if (element.kind === "text-flow" || element.kind === "path-text") {
    const copy = structuredClone(element);
    return {
      ...copy,
      ...common,
      kind: element.kind,
      sequences: element.sequences.map((sequence) => ({
        ...sequence,
        range: { ...sequence.range },
        keyframes: sequence.keyframes.map((keyframe) => structuredClone(keyframe)),
      })),
    } as VisualTextFlowElement | VisualPathTextElement;
  }
  if (element.kind === "surface") {
    return {
      ...common,
      kind: "surface",
      surface: {
        ...element.surface,
        artifact: { ...element.surface.artifact },
        timing: element.surface.timing.kind === "still"
          ? { kind: "still" }
          : { ...element.surface.timing, frameRate: { ...element.surface.timing.frameRate } },
      },
      ...(element.sampling === undefined ? {} : { sampling: structuredClone(element.sampling) }),
    };
  }
  // Spreading an absent artifact produced `{}`, which is not an artifact and is not nothing either:
  // the field the author actually wrote was dropped without a word, and the refusal came one call
  // later from the identity check, naming `.artifact` — a field they had not typed.
  if (element.kind === "image" && element.artifact === undefined) {
    throw new Error(`${element.id} is a ${element.kind} element with no artifact.`);
  }
  if (element.kind === "image") return {
    ...common, kind: "image", artifact: { ...element.artifact }, picture: structuredClone(element.picture),
  };
  return {
    ...common,
    kind: "video",
    source: structuredClone(element.source),
    sampling: structuredClone(element.sampling),
    ...(element.muted === undefined ? {} : { muted: element.muted }),
  };
}

function normalizeVisualContribution(value: VisualContribution): VisualContribution {
  const common = {
    id: value.id,
    ...(value.subjectId === undefined ? {} : { subjectId: value.subjectId }),
    span: { ...value.span },
    ...(value.visibility === undefined ? {} : { visibility: value.visibility.map((span) => ({ ...span })) }),
  } as const;
  if (value.kind === "present") return { ...common, kind: "present", root: normalizeElement(value.root) };
  return {
    ...common,
    kind: "process",
    inputs: value.inputs.map((input) => ({
      name: input.name,
      contribution: normalizeVisualContribution(input.contribution),
    })),
    effect: sealVisualProcessEffect(value.effect),
  };
}

function visualTrackContent(value: Omit<VisualTrack, "kind">): VisualTrack {
  if (!Array.isArray(value.items)) {
    throw new Error(`VisualTrack ${value.id} requires an items array.`);
  }
  return {
    kind: "visual",
    timelineId: value.timelineId,
    id: value.id,
    items: [...value.items]
      .map((item): VisualItem => {
        if (item === null || typeof item !== "object") {
          throw new Error(`VisualTrack ${value.id} contains an invalid Visual Item.`);
        }
        const common = {
          kind: item.kind,
          id: item.id,
          ...(item.subjectId === undefined ? {} : { subjectId: item.subjectId }),
          span: { ...item.span },
          ...(item.visibility === undefined ? {} : { visibility: item.visibility.map((span: FrameSpan) => ({ ...span })) }),
        } as const;
        if (item.kind === "present" || item.kind === "process") return normalizeVisualContribution(item);
        if (item.kind === "adjustment") {
          return { ...common, kind: "adjustment", program: structuredClone(item.program) };
        }
        const invalid = item as { readonly id?: unknown; readonly kind?: unknown };
        const id = typeof invalid.id === "string" && invalid.id.length > 0 ? invalid.id : "unknown";
        throw new Error(`VisualTrack ${value.id}.${id} has invalid Visual Item kind ${String(invalid.kind)}.`);
      }),
  };
}

export function sealVisualTrack(value: Omit<VisualTrack, "kind">): VisualTrack {
  return visualTrackContent(value);
}

/** Construct the common Present-only subset while keeping the terminal value on the unified item waist. */
export function sealPresentVisualTrack(
  value: Omit<VisualTrack, "kind" | "items"> & { readonly presents: readonly VisualPresentDraft[] },
): PresentVisualTrack {
  if (!Array.isArray(value.presents)) {
    throw new Error(`Present VisualTrack ${value.id} requires a presents array.`);
  }
  return visualTrackContent({
    timelineId: value.timelineId,
    id: value.id,
    items: value.presents.map((present, index) => {
      if (present === null || typeof present !== "object") {
        throw new Error(`Present VisualTrack ${value.id} contains an invalid Present at index ${index}.`);
      }
      const suppliedKind = (present as VisualPresentDraft & { readonly kind?: unknown }).kind;
      if (suppliedKind !== undefined && suppliedKind !== "present") {
        throw new Error(`Present VisualTrack ${value.id}.${present.id} received non-Present kind ${String(suppliedKind)}.`);
      }
      return { ...present, kind: "present" };
    }),
  }) as PresentVisualTrack;
}

export function visualPresents(track: VisualTrack): readonly VisualPresent[] {
  return track.items.flatMap((item) => item.kind === "adjustment" ? [] : visualContributionPresents(item));
}

export function visualContributionPresents(contribution: VisualContribution): readonly VisualPresent[] {
  return contribution.kind === "present"
    ? [contribution]
    : contribution.inputs.flatMap((input) => visualContributionPresents(input.contribution));
}

export function visualProcesses(track: VisualTrack): readonly VisualProcess[] {
  const processes = (contribution: VisualContribution): VisualProcess[] => contribution.kind === "present"
    ? []
    : [contribution, ...contribution.inputs.flatMap((input) => processes(input.contribution))];
  return track.items.flatMap((item) => item.kind === "adjustment" ? [] : processes(item));
}

/** Structural children of one visual node, preserving each relation's semantic order. */
export function visualElementChildren(element: VisualElement): readonly VisualElement[] {
  if (element.kind === "program") return element.slots.map((slot) => slot.element);
  if (element.kind === "mask") return [element.mask, element.content];
  return [];
}

/** Pre-order observation of one rooted visual tree. The returned array is derived, never identity. */
export function visualElements(root: VisualElement): readonly VisualElement[] {
  return [root, ...visualElementChildren(root).flatMap(visualElements)];
}

export function visualAdjustments(track: VisualTrack): readonly VisualAdjustment[] {
  return track.items.filter((item): item is VisualAdjustment => item.kind === "adjustment");
}
