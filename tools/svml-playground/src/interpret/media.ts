import type { StructuredElement } from "@narratage/markup";
import {
  appendMediaPaintLayer,
  appendMomentMediaItem,
  appendProgramMediaItem,
  appendSegmentMediaItem,
  appendSelectionMediaItem,
  appendTimedMediaLayer,
  createMediaLayerSet,
  createMediaSoundSet,
  decodeMediaFit,
  decodeMediaFramePaint,
  decodeMediaMotion,
  decodeMediaPresentation,
  decodeMediaSampleSpec,
  finalizeMediaTrack,
  projectMediaVisualTrack,
  sealMediaItemSpec,
  sealMediaPaintLayerSpec,
  sealMediaTrackHeader,
} from "@narratage/media-track";
import type { MediaItemProgram, MediaItemSpec, MediaTrackSet } from "@narratage/media-track";
import type {
  NarrativeExcerpt,
  NarrativeMomentRef,
  NarrativeSelectionRef,
} from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import {
  narrativeExcerptType,
  narrativeMomentType,
  narrativeSelectionType,
} from "@narratage/script";
import { spatialTypes } from "@narratage/spatial";
import type { CanvasSpace, SpatialFrame } from "@narratage/spatial";
import type { SvsRecipe } from "@narratage/svs";
import type { VisualTrack } from "@narratage/composition";
import type { TemporalDuration, TemporalPointExpression, TemporalWindowProjection } from "@narratage/temporal";

import type { Clip, ClipBinding, Range, Rect } from "../shared.js";
import { elementChildren, optionalText, referencePath, requireReferencePath, text } from "./attributes.js";
import type { MaterialSet } from "./material.js";
import { sameType, Scope } from "./scope.js";
import type { ScopeEntry } from "./scope.js";

/** The colour a Media Item paints when its material has not been generated. */
const PLACEHOLDER_PAINT = "#15151a";

const UNSUPPORTED_CHILD =
  "Media Sequences and Sounds are not interpreted by the preview; build the Source to see them.";

function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon < 0 ? tag : tag.slice(colon + 1);
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/** The exact duration grammar `<media-track:Item>` accepts: 12f, 250ms, 1.5s. */
function duration(value: string, label: string): TemporalDuration {
  const match = /^(\d+)(?:\.(\d+))?(f|ms|s)$/u.exec(value.trim());
  if (match === null) {
    throw new Error(`${label} must be an exact duration such as 12f, 250ms or 1.5s.`);
  }
  const whole = Number(match[1]);
  const fraction = match[2] ?? "";
  const unit = match[3];
  if (!Number.isSafeInteger(whole)) throw new Error(`${label} is outside safe arithmetic.`);
  if (unit === "f" || unit === "ms") {
    if (fraction.length > 0) throw new Error(`${label} ${unit} duration must be an integer.`);
    return { unit: unit === "f" ? "frames" : "milliseconds", value: whole };
  }
  const scale = 10 ** fraction.length;
  const numerator = whole * scale + (fraction.length === 0 ? 0 : Number(fraction));
  const divisor = gcd(numerator, scale);
  return { unit: "seconds", numerator: numerator / divisor, denominator: scale / divisor };
}

function negate(value: TemporalDuration): TemporalDuration {
  return value.unit === "seconds"
    ? { ...value, numerator: -value.numerator }
    : { ...value, value: -value.value };
}

const POINT_REFS = [
  "program.start", "program.end", "selection.start", "selection.end",
  "segment.start", "segment.end", "moment.cue",
] as const;

function point(value: string, label: string): TemporalPointExpression {
  const trimmed = value.trim();
  for (const ref of POINT_REFS) {
    if (trimmed === ref) return { ref };
    const match = new RegExp(`^${ref.replace(".", "\\.")}\\s*([+-])\\s*(.+)$`, "u").exec(trimmed);
    if (match !== null) {
      const offset = duration(match[2]!, `${label} offset`);
      return { ref, offset: match[1] === "-" ? negate(offset) : offset };
    }
  }
  return { ref: "absolute", at: duration(trimmed, label) };
}

type Binding = {
  readonly kind: "program" | "selection" | "segment" | "moment";
  readonly projection: TemporalWindowProjection;
  readonly source?: ScopeEntry;
};

function narrativeSource(
  element: StructuredElement,
  name: string,
  scope: Scope,
  expected: readonly { readonly module: { readonly name: string; readonly version: string }; readonly name: string }[],
): ScopeEntry {
  const path = requireReferencePath(element, name);
  const entry = scope.require(path, `${element.name}.${name}`);
  if (!expected.some((type) => sameType(entry.type, type))) {
    throw new Error(`${element.name}.${name} resolves ${path}, which is not a Script marker.`);
  }
  return entry;
}

/** Exactly one of during, at/for, or start/end — the Item Surface's own rule. */
function temporalBinding(element: StructuredElement, scope: Scope): Binding {
  const during = element.attributes.during;
  const at = element.attributes.at;
  const start = optionalText(element, "start");
  const end = optionalText(element, "end");
  const forms = Number(during !== undefined) + Number(at !== undefined)
    + Number(start !== undefined || end !== undefined);
  if (forms !== 1) {
    throw new Error(`${element.name} requires exactly one of during, at/for, or start/end.`);
  }

  if (during !== undefined) {
    if (typeof during === "string") {
      if (during.trim() !== "program") throw new Error(`${element.name}.during text must be program.`);
      return {
        kind: "program",
        projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
      };
    }
    const source = narrativeSource(element, "during", scope, [narrativeSelectionType, narrativeExcerptType]);
    return sameType(source.type, narrativeSelectionType)
      ? { kind: "selection", source, projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } } }
      : { kind: "segment", source, projection: { start: { ref: "segment.start" }, end: { ref: "segment.end" } } };
  }

  if (at !== undefined) {
    const span = duration(text(element, "for"), `${element.name}.for`);
    return {
      kind: "moment",
      source: narrativeSource(element, "at", scope, [narrativeMomentType]),
      projection: { start: { ref: "moment.cue" }, end: { ref: "moment.cue", offset: span } },
    };
  }

  if (start === undefined || end === undefined) {
    throw new Error(`${element.name} explicit timing requires start and end.`);
  }
  const projection: TemporalWindowProjection = {
    start: point(start, `${element.name}.start`),
    end: point(end, `${element.name}.end`),
  };
  const bound = (["selection", "segment", "moment"] as const)
    .filter((name) => element.attributes[name] !== undefined);
  if (bound.length > 1) {
    throw new Error(`${element.name} cannot bind Selection, Segment and Moment together.`);
  }
  if (bound[0] === "selection") {
    return { kind: "selection", source: narrativeSource(element, "selection", scope, [narrativeSelectionType]), projection };
  }
  if (bound[0] === "segment") {
    return { kind: "segment", source: narrativeSource(element, "segment", scope, [narrativeExcerptType]), projection };
  }
  if (bound[0] === "moment") {
    return { kind: "moment", source: narrativeSource(element, "moment", scope, [narrativeMomentType]), projection };
  }
  return { kind: "program", projection };
}

function recipeFor(
  element: StructuredElement,
  name: string,
  scope: Scope,
  required: boolean,
): SvsRecipe | undefined {
  const path = referencePath(element, name);
  if (path === undefined) {
    if (required) throw new Error(`${element.name}.${name} must reference an SVS Recipe.`);
    return undefined;
  }
  return scope.require(path, `${element.name}.${name}`).value as SvsRecipe;
}

function stackOrder(appearance: SvsRecipe, label: string): number {
  const value = appearance.properties["stack-order"];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} appearance Recipe ${appearance.path} requires an integer stack-order.`);
  }
  return value;
}

function rect(frame: SpatialFrame): Rect {
  return { xPx: frame.xPx, yPx: frame.yPx, widthPx: frame.widthPx, heightPx: frame.heightPx };
}

function contentRect(item: MediaItemProgram): Rect {
  const padding = item.presentation.padding;
  return {
    xPx: item.frame.xPx + padding.leftPx,
    yPx: item.frame.yPx + padding.topPx,
    widthPx: item.frame.widthPx - padding.leftPx - padding.rightPx,
    heightPx: item.frame.heightPx - padding.topPx - padding.bottomPx,
  };
}

type ItemRecord = {
  readonly specId: string;
  readonly elementRange: Range;
  readonly binding: Binding;
  readonly label: string;
};

export type MediaTrack = {
  readonly id: string;
  readonly clips: readonly Clip[];
  readonly visual: VisualTrack;
};

export type MarkerRanges = {
  selection(id: string, occurrence: number): Range | undefined;
  segment(id: string): Range | undefined;
  moment(id: string, occurrence: number): Range | undefined;
};

function clipBinding(binding: Binding, occurrence: number): ClipBinding {
  if (binding.kind === "program") return { kind: "program" };
  const id = (binding.source!.value as { readonly id: string }).id;
  if (binding.kind === "segment") return { kind: "segment", id };
  return { kind: binding.kind, id, occurrence };
}

/**
 * Realize one `<media-track:Track>` against the program's frame domain.
 *
 * Every Item contributes a paint layer rather than its authored material: the
 * material is generated by a Provider, so in a preview it is a black rectangle
 * placed and animated exactly where the real frames would land. That keeps the
 * item free of Artifacts entirely, which is both honest and scrubbable — a
 * `<video>` with an unresolvable source would render nothing and seek nowhere.
 */
export function interpretMediaTrack(
  element: StructuredElement,
  scope: Scope,
  map: CompleteSemanticMap,
  space: ProgramSpace,
  markers: MarkerRanges,
  material: MaterialSet,
): MediaTrack {
  const id = text(element, "id");
  const canvasEntry = scope.require(requireReferencePath(element, "canvas"), `${element.name}.canvas`);
  if (!sameType(canvasEntry.type, spatialTypes.canvas)) {
    throw new Error(`${element.name}.canvas must reference a CanvasSpace.`);
  }
  const canvas = canvasEntry.value as CanvasSpace;
  const header = sealMediaTrackHeader({ contract: "svml.media-track-header@1", id });
  const sounds = createMediaSoundSet();

  let set: MediaTrackSet = { contract: "svml.media-track-set@1", items: [], sequences: [] };
  const records = new Map<string, ItemRecord>();

  let ordinal = 0;
  for (const child of elementChildren(element)) {
    ordinal += 1;
    if (localName(child.name) !== "Item") throw new Error(`${element.name}: ${UNSUPPORTED_CHILD}`);
    if (elementChildren(child).length > 0) throw new Error(`${child.name}: ${UNSUPPORTED_CHILD}`);

    const specId = optionalText(child, "id") ?? `${id}-item-${String(ordinal).padStart(2, "0")}`;
    const binding = temporalBinding(child, scope);
    const appearance = recipeFor(child, "appearance", scope, true)!;
    const frameEntry = scope.require(requireReferencePath(child, "frame"), `${child.name}.frame`);
    if (!sameType(frameEntry.type, spatialTypes.frame)) {
      throw new Error(`${child.name}.frame must reference a SpatialFrame.`);
    }
    const frame = frameEntry.value as SpatialFrame;

    const spec: MediaItemSpec = sealMediaItemSpec({
      contract: "svml.media-item-spec@1",
      id: specId,
      projection: binding.projection,
      expansion: optionalText(child, "occurrences") === "each" ? { kind: "each" } : { kind: "one" },
      presentation: decodeMediaPresentation(appearance),
      motion: decodeMediaMotion(recipeFor(child, "motion", scope, false)),
      stackingOrder: stackOrder(appearance, child.name),
    });

    // The frame paint sits behind the material, and stands in for it entirely
    // when there is none.
    const paint = decodeMediaFramePaint(appearance, `${specId}:frame-paint`) ?? sealMediaPaintLayerSpec({
      contract: "svml.media-paint-layer-spec@1",
      id: `${specId}:placeholder`,
      paint: { kind: "solid", color: PLACEHOLDER_PAINT },
      opacity: 1,
    });
    let layers = appendMediaPaintLayer(createMediaLayerSet(), paint);

    // Real frames whenever this Item's source already exists and already lives
    // in the program's frame domain; a painted box otherwise.
    const output = referencePath(child, "video") ?? referencePath(child, "media");
    const supplied = output === undefined ? undefined : material.get(output);
    if (supplied !== undefined) {
      layers = appendTimedMediaLayer(
        layers,
        supplied.media,
        decodeMediaFit(appearance),
        decodeMediaSampleSpec(appearance, `${specId}:material`, "timed", undefined, true),
      );
    }

    const source = binding.source?.value;
    try {
      set = binding.kind === "program"
        ? appendProgramMediaItem(set, header, space, canvas, layers, frame, spec, sounds)
        : binding.kind === "selection"
          ? appendSelectionMediaItem(set, header, space, canvas, layers, frame, map, source as NarrativeSelectionRef, spec, sounds)
          : binding.kind === "segment"
            ? appendSegmentMediaItem(set, header, space, canvas, layers, frame, map, source as NarrativeExcerpt, spec, sounds)
            : appendMomentMediaItem(set, header, space, canvas, layers, frame, map, source as NarrativeMomentRef, spec, sounds);
    } catch (error) {
      // Name the element the author has to look at; the domain message alone
      // only names the Item id.
      throw Object.assign(
        new Error(`<${child.name} id="${specId}"> ${error instanceof Error ? error.message : String(error)}`),
        { range: child.range },
      );
    }

    records.set(specId, { specId, elementRange: child.range, binding, label: specId });
  }

  const program = finalizeMediaTrack(set, header, space);
  const clips: Clip[] = program.items.map((item) => {
    // A projected id is `<specId>::<markerId>#<occurrence>`; one authored Item
    // can realize several occurrences of the same marker.
    const record = records.get(item.id.slice(0, item.id.indexOf("::")));
    if (record === undefined) throw new Error(`Media Item ${item.id} has no authored element.`);
    const occurrence = Number(item.sourceOccurrenceId.slice(item.sourceOccurrenceId.lastIndexOf("#") + 1));
    const binding = clipBinding(record.binding, Number.isFinite(occurrence) ? occurrence : 0);
    const bindingRange = binding.kind === "selection"
      ? markers.selection(binding.id, binding.occurrence)
      : binding.kind === "segment"
        ? markers.segment(binding.id)
        : binding.kind === "moment"
          ? markers.moment(binding.id, binding.occurrence)
          : undefined;
    return {
      id: item.id,
      authoredId: record.specId,
      label: record.label,
      kind: "media",
      startFrame: item.span.startFrame,
      endFrameExclusive: item.span.endFrameExclusive,
      elementRange: record.elementRange,
      ...(bindingRange === undefined ? {} : { bindingRange }),
      binding,
      frame: rect(item.frame),
      contentFrame: contentRect(item),
      animated: item.motion.enter !== undefined
        || item.motion.exit !== undefined
        || item.motion.sustain.length > 0,
      placeholder: !item.layers.some((layer) => layer.kind === "sample"),
      stackOrder: item.stacking.order,
    };
  });

  // Never project the audio track: with no authored Sounds it throws, and the
  // preview has nothing to play anyway.
  return { id, clips, visual: projectMediaVisualTrack(space, program) };
}
