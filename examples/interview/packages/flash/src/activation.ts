import { assertAttributes, assertEmptyElement, createMarkupSurfaceFacet, textAttribute } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ModuleManifest } from "@hypit/hypit/protocol";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import {
  assertVisualTrackIdentity,
  compositionTypes,
  sealVisualTrack,
} from "@hypit/composition";
import type {
  VisualElement,
  VisualStyleDeclaration,
} from "@hypit/composition";
import { assertSpatialFrame, spatialTypes } from "@hypit/spatial";
import type { SpatialFrame } from "@hypit/spatial";
import {
  assertTemporalWindowFor,
  temporalTypes,
} from "@hypit/temporal";
import type { TemporalWindow } from "@hypit/temporal";
import {
  resolveTemporalWindowReference,
  resolveTemporalContext,
  temporalContextAttributeVocabulary,
  temporalWindowAttributeNames,
  temporalWindowAttributeVocabulary,
} from "@hypit/temporal/markup";
import {
  assertTimelineIdentity,
  timelineTypes,
} from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";

const moduleRef = { name: "@interview/flash", version: "1" } as const;
const optionsType = { module: moduleRef, name: "FlashOptions" } as const;
const renderProducer = { module: moduleRef, name: "render" } as const;

type FlashOptions = {
  readonly id: string;
  readonly color: string;
  readonly intensity: number;
  readonly attackFrames: number;
  readonly holdFrames: number;
  readonly decayFrames: number;
  readonly stackingOrder: number;
};

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [timelineTypes.timeline, temporalTypes.window, spatialTypes.frame, compositionTypes.visualTrack]
    .map((type) => ({ module: type.module })),
  types: [{ name: optionsType.name }],
  capabilities: [],
  producers: [{
    name: renderProducer.name,
    inputs: [
      { name: "timeline", type: timelineTypes.timeline },
      { name: "within", type: spatialTypes.frame },
      { name: "window", type: temporalTypes.window },
      { name: "options", type: optionsType },
    ],
    result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack },
  }],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertOptions(value: FlashOptions): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value.id), "Flash id is invalid.");
  assert(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value.color), "Flash color must be hexadecimal.");
  assert(Number.isFinite(value.intensity) && value.intensity >= 0 && value.intensity <= 1,
    "Flash intensity must be between 0 and 1.");
  for (const [name, frames] of [
    ["attack", value.attackFrames],
    ["hold", value.holdFrames],
    ["decay", value.decayFrames],
  ] as const) {
    assert(Number.isSafeInteger(frames) && frames >= 0, `Flash ${name} must be a non-negative frame count.`);
  }
  assert(Number.isSafeInteger(value.stackingOrder), "Flash z must be an integer.");
}

function px(value: number): string {
  return `${Number(value.toFixed(6))}px`;
}

function renderFlash(
  timeline: Timeline,
  within: SpatialFrame,
  window: TemporalWindow,
  options: FlashOptions,
) {
  assertTimelineIdentity(timeline);
  assertSpatialFrame(within);
  assertOptions(options);
  assertTemporalWindowFor(window, { subjectId: options.id, timeline });
  const duration = window.span.endFrameExclusive - window.span.startFrame;
  const total = options.attackFrames + options.holdFrames + options.decayFrames;
  assert(total <= duration, "Flash envelope cannot outlive its Window.");

  const style: readonly VisualStyleDeclaration[] = [
    { name: "background-color", value: options.color },
    { name: "height", value: px(within.heightPx) },
    { name: "left", value: px(within.xPx) },
    { name: "overflow", value: "hidden" },
    { name: "position", value: "absolute" },
    { name: "top", value: px(within.yPx) },
    { name: "width", value: px(within.widthPx) },
  ];
  const marks = new Map<number, number>();
  marks.set(0, options.attackFrames === 0 ? options.intensity : 0);
  marks.set(options.attackFrames, options.intensity);
  marks.set(options.attackFrames + options.holdFrames, options.intensity);
  marks.set(total, 0);
  marks.set(duration, 0);
  const element: VisualElement = total === 0 ? {
    id: "root",
    order: 0,
    kind: "box",
    style: [...style, { name: "opacity", value: options.intensity }],
  } : {
    id: "root",
    order: 0,
    kind: "box",
    style,
    animation: {
      keyframes: [...marks]
        .sort(([left], [right]) => left - right)
        .map(([atFrame, opacity]) => ({ atFrame, style: [{ name: "opacity", value: opacity }] })),
    },
  };
  const track = sealVisualTrack({
    id: options.id,
    timelineId: timeline.id,
    visualIr: "hypit.visual-ir@1",
    presents: [{
      id: options.id,
      subjectId: options.id,
      order: 0,
      z: options.stackingOrder,
      span: { ...window.span },
      elements: [element],
    }],
  });
  assertVisualTrackIdentity(track, timeline);
  return track;
}

const component: ProducerPackage & RefinementPackage = {
  producers: [{
    producer: renderProducer,
    handler: ({ inputs }) => {
      const inline = <T>(name: string): T => {
        const input = inputs[name]?.value;
        if (input === undefined) throw new Error(`Flash ${name} is missing.`);
        return input as unknown as T;
      };
      return { kind: "output", value: (renderFlash(
              inline<Timeline>("timeline"),
              inline<SpatialFrame>("within"),
              inline<TemporalWindow>("window"),
              inline<FlashOptions>("options"),
            )) };
    },
  }],
};

function numberAttribute(element: Parameters<StructuredSurfaceHandler>[0]["element"], name: string): number {
  const value = Number(textAttribute(element, name));
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be numeric.`);
  return value;
}

function integerAttribute(element: Parameters<StructuredSurfaceHandler>[0]["element"], name: string): number {
  const value = numberAttribute(element, name);
  if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} must be an integer.`);
  return value;
}

const decodeFlash: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, [
    "id", "timeline", "within", "color", "intensity", "attack", "hold", "decay", "z",
    ...temporalWindowAttributeNames,
  ]);
  assertEmptyElement(element);
  const id = textAttribute(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const withinRaw = element.attributes.within;
  if (typeof withinRaw !== "object" || withinRaw.kind !== "reference") {
    throw new Error("Flash.within must be a Frame reference.");
  }
  const within = resolveReference(withinRaw.path);
  if (within === undefined || !sameType(within.type, spatialTypes.frame)) {
    throw new Error("Flash.within has the wrong Type.");
  }
  const window = resolveTemporalWindowReference({ element, resolveReference });
  const options: FlashOptions = {
    id,
    color: textAttribute(element, "color"),
    intensity: numberAttribute(element, "intensity"),
    attackFrames: integerAttribute(element, "attack"),
    holdFrames: integerAttribute(element, "hold"),
    decayFrames: integerAttribute(element, "decay"),
    stackingOrder: integerAttribute(element, "z"),
  };
  assertOptions(options);
  const optionsId = `${id}.options`;
  const fragment = sealGraphFragment({
    inputs: [
      { name: "timeline", type: timelineTypes.timeline },
      { name: "within", type: spatialTypes.frame },
      { name: "window", type: temporalTypes.window },
      { name: "options", type: optionsType },
    ],
    operations: [{
      id: "render",
      producer: renderProducer,
      inputs: {
        timeline: { kind: "fragment-input", name: "timeline" },
        within: { kind: "fragment-input", name: "within" },
        window: { kind: "fragment-input", name: "window" },
        options: { kind: "fragment-input", name: "options" },
      },
      result: { kind: "output" as const, name: "visual" },
    }],
    exports: [{
      name: "visual",
      type: compositionTypes.visualTrack,
      root: { kind: "fragment-operation", operation: "render" },
    }],
  });
  return {
    records: [
      { id: optionsId, type: optionsType, value: (canonicalize(options)), range: element.range },
    ],
    components: [
      {
        id,
        fragment,
        inputs: {
          timeline: context.timeline.ref,
          within: within.ref,
          window: window.ref,
          options: { kind: "record", id: optionsId },
        },
        outputs: { visual: `${id}.visual` },
        range: element.range,
      },
    ],
    exports: [`${id}.visual`],
  };
};

const declaration = {
  name: "flash",
  tag: "Flash",
  mode: "structured" as const,
  outputs: [
    compositionTypes.visualTrack,
    optionsType,
  ],
  vocabulary: {
    summary: "Paints one project-owned color flash over an explicit Window.",
    attributes: [
      { name: "id", kind: "identifier" as const, required: true, summary: "Names the flash." },
      ...temporalContextAttributeVocabulary,
      { name: "within", kind: "reference" as const, required: true, accepts: [spatialTypes.frame], summary: "Sets the painted Frame." },
      ...temporalWindowAttributeVocabulary,
      ...["color", "intensity", "attack", "hold", "decay", "z"].map((name) => ({
        name, kind: "literal" as const, required: true, summary: `Sets ${name}.`,
      })),
    ],
    ports: [{ name: "visual", type: compositionTypes.visualTrack, summary: "The flash as an ordinary VisualTrack." }],
    example: '<flash:Flash id="hit" timeline={speech.timeline} within={vertical.bounds} during={hit-window} z="80" color="#FFFFFF" intensity="0.28" attack="2" hold="1" decay="5"/>',
  },
};

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest }],
  facets: [
    createProducerPackageFacet(component),
    createRefinementPackageFacet(component),
    createMarkupSurfaceFacet({ module: moduleRef, declaration, handler: decodeFlash }),
  ],
};

export default hypitPackage;
