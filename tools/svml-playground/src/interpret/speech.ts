import type { VisualTrack } from "@narratage/composition";
import type { StructuredElement } from "@narratage/markup";
import {
  appendMediaPaintLayer,
  appendSegmentMediaItem,
  appendTimedMediaLayer,
  decodeMediaFit,
  decodeMediaSampleSpec,
  createMediaLayerSet,
  createMediaSoundSet,
  finalizeMediaTrack,
  projectMediaVisualTrack,
  sealMediaItemSpec,
  sealMediaPaintLayerSpec,
  sealMediaTrackHeader,
} from "@narratage/media-track";
import type { MediaFramePresentation, MediaTrackSet } from "@narratage/media-track";
import type { NarrativeExcerpt } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import { narrativeExcerptType } from "@narratage/script";
import { spatialTypes } from "@narratage/spatial";
import type { CanvasSpace, SpatialFrame } from "@narratage/spatial";
import type { SvsRecipe } from "@narratage/svs";

import type { Clip, Range } from "../shared.js";
import { elementChildren, referencePath, requireReferencePath, text } from "./attributes.js";
import type { MaterialSet } from "./material.js";
import { sameType, Scope } from "./scope.js";
import type { FrameRate } from "./timing.js";

/** What a Take paints while its material is still a Provider's job. */
const TAKE_PAINT = "#101014";

const RATE = /^(\d+)(?:\/(\d+))?$/u;

/** A Take fills its visual Frame; the Spine declares no box treatment. */
const FLUSH: MediaFramePresentation = {
  clip: { kind: "frame" },
  padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 },
  shadows: [],
};

function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon < 0 ? tag : tag.slice(colon + 1);
}

/** The Spine's declared frame rate is the whole program's frame domain. */
export function spineFrameRate(element: StructuredElement): FrameRate {
  const match = RATE.exec(text(element, "frame-rate"));
  if (match === null) {
    throw new Error(`${element.name}.frame-rate must be a positive rational such as 30 or 30000/1001.`);
  }
  const numerator = Number(match[1]);
  const denominator = Number(match[2] ?? "1");
  if (!Number.isSafeInteger(numerator) || numerator <= 0
    || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(`${element.name}.frame-rate is invalid.`);
  }
  return { numerator, denominator };
}

export type SpeechSpine = {
  readonly id: string;
  readonly clips: readonly Clip[];
  readonly visual: VisualTrack;
};

/**
 * Project each `<speech:Take>` onto the base track.
 *
 * Takes go through the same Media Track machinery the overlays use, so the base
 * track and the B-roll above it are projected by one code path and can never
 * disagree about where a Segment sits or what a present is called.
 */
export function interpretSpine(
  element: StructuredElement,
  scope: Scope,
  canvas: CanvasSpace,
  map: CompleteSemanticMap,
  space: ProgramSpace,
  segmentRange: (id: string) => Range | undefined,
  material: MaterialSet,
  appearance: SvsRecipe | undefined,
): SpeechSpine {
  const id = text(element, "id");
  const visualFrame = scope.require(
    requireReferencePath(element, "visual-frame"),
    `${element.name}.visual-frame`,
  );
  if (!sameType(visualFrame.type, spatialTypes.frame)) {
    throw new Error(`${element.name}.visual-frame must reference a SpatialFrame.`);
  }
  const frame = visualFrame.value as SpatialFrame;
  const stackOrder = Number(text(element, "visual-z"));
  if (!Number.isSafeInteger(stackOrder)) throw new Error(`${element.name}.visual-z must be an integer.`);

  const header = sealMediaTrackHeader({ contract: "svml.media-track-header@1", id });
  const sounds = createMediaSoundSet();
  let set: MediaTrackSet = { contract: "svml.media-track-set@1", items: [], sequences: [] };
  const bindings = new Map<string, { readonly excerpt: NarrativeExcerpt; readonly range: Range }>();

  let ordinal = 0;
  for (const child of elementChildren(element)) {
    if (localName(child.name) !== "Take") {
      throw new Error(`${element.name} accepts only Take children; found ${child.name}.`);
    }
    ordinal += 1;
    const entry = scope.require(requireReferencePath(child, "segment"), `${child.name}.segment`);
    if (!sameType(entry.type, narrativeExcerptType)) {
      throw new Error(`${child.name}.segment must reference a Script Segment.`);
    }
    const excerpt = entry.value as NarrativeExcerpt;
    const specId = `${id}-take-${String(ordinal).padStart(2, "0")}`;
    const spec = sealMediaItemSpec({
      contract: "svml.media-item-spec@1",
      id: specId,
      projection: { start: { ref: "segment.start" }, end: { ref: "segment.end" } },
      expansion: { kind: "one" },
      presentation: FLUSH,
      motion: { sustain: [] },
      stackingOrder: stackOrder,
    });
    let layers = appendMediaPaintLayer(createMediaLayerSet(), sealMediaPaintLayerSpec({
      contract: "svml.media-paint-layer-spec@1",
      id: `${specId}:placeholder`,
      paint: { kind: "solid", color: TAKE_PAINT },
      opacity: 1,
    }));
    // Real frames when this Take's source already exists in the program's frame
    // domain; the paint above stands in for it otherwise.
    const source = referencePath(child, "video") ?? referencePath(child, "media");
    const supplied = source === undefined ? undefined : material.get(source);
    if (supplied !== undefined && appearance !== undefined) {
      layers = appendTimedMediaLayer(
        layers,
        supplied.media,
        decodeMediaFit(appearance),
        decodeMediaSampleSpec(appearance, `${specId}:material`, "timed"),
      );
    }
    try {
      set = appendSegmentMediaItem(set, header, space, canvas, layers, frame, map, excerpt, spec, sounds);
    } catch (error) {
      throw Object.assign(
        new Error(`<${child.name}> ${error instanceof Error ? error.message : String(error)}`),
        { range: child.range },
      );
    }
    bindings.set(specId, { excerpt, range: child.range });
  }
  if (ordinal === 0) throw new Error(`${element.name} requires at least one Take.`);

  const program = finalizeMediaTrack(set, header, space);
  const clips: Clip[] = program.items.map((item) => {
    const binding = bindings.get(item.id.slice(0, item.id.indexOf("::")))!;
    const range = segmentRange(binding.excerpt.id);
    return {
      id: item.id,
      authoredId: id,
      label: binding.excerpt.id,
      kind: "speech",
      startFrame: item.span.startFrame,
      endFrameExclusive: item.span.endFrameExclusive,
      elementRange: binding.range,
      ...(range === undefined ? {} : { bindingRange: range }),
      binding: { kind: "segment", id: binding.excerpt.id },
      frame: { xPx: frame.xPx, yPx: frame.yPx, widthPx: frame.widthPx, heightPx: frame.heightPx },
      contentFrame: { xPx: frame.xPx, yPx: frame.yPx, widthPx: frame.widthPx, heightPx: frame.heightPx },
      animated: false,
      placeholder: !item.layers.some((layer) => layer.kind === "sample"),
      stackOrder: item.stacking.order,
    };
  });

  return { id, clips, visual: projectMediaVisualTrack(space, program) };
}
