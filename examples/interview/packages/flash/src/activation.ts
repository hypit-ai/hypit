import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { createAuthorDeclarationFacet, declarationField, sealGraphFragment } from "@hypit/hypit/author";
import type { AuthorDeclarationCompiler, AuthorResolvedReference } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ModuleManifest, TypeRef } from "@hypit/hypit/protocol";
import {
  assertVisualTrackIdentity,
  compositionTypes,
  sealPresentVisualTrack,
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
};

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [timelineTypes.timeline, temporalTypes.window, spatialTypes.frame, compositionTypes.visualTrack]
    .map((type) => type.module),
  types: [optionsType.name],
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
    kind: "box",
    children: [],
    style: [...style, { name: "opacity", value: options.intensity }],
  } : {
    id: "root",
    kind: "box",
    children: [],
    style,
    animation: {
      keyframes: [...marks]
        .sort(([left], [right]) => left - right)
        .map(([atFrame, opacity]) => ({ atFrame, style: [{ name: "opacity", value: opacity }] })),
    },
  };
  const track = sealPresentVisualTrack({
    id: options.id,
    timelineId: timeline.id,
    visualIr: "hypit.visual-ir@1",
    presents: [{
      id: options.id,
      subjectId: options.id,
      span: { ...window.span },
      root: element,
    }],
  });
  assertVisualTrackIdentity(track, timeline);
  return track;
}

const component: { producers?: ProducerPackage; refinements?: RefinementPackage } = {
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


function literal(declaration: Parameters<AuthorDeclarationCompiler["bindings"]>[0], name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) throw new Error(`${declaration.name}.${name} must be text.`);
  return field.value.trim();
}
function numeric(declaration: Parameters<AuthorDeclarationCompiler["bindings"]>[0], name: string): number {
  const value = Number(literal(declaration, name));
  if (!Number.isFinite(value)) throw new Error(`${declaration.name}.${name} must be numeric.`);
  return value;
}
function integer(declaration: Parameters<AuthorDeclarationCompiler["bindings"]>[0], name: string): number {
  const value = numeric(declaration, name);
  if (!Number.isSafeInteger(value)) throw new Error(`${declaration.name}.${name} must be an integer.`);
  return value;
}
async function reference(
  declaration: Parameters<AuthorDeclarationCompiler["bindings"]>[0],
  name: string,
  type: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`${declaration.name}.${name} must be a reference.`);
  const found = await resolve(field.path);
  if (found === undefined || !sameType(found.type, type)) throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  return found;
}
const flashFragment = sealGraphFragment({
  inputs: [
    { name: "timeline", type: timelineTypes.timeline },
    { name: "within", type: spatialTypes.frame },
    { name: "window", type: temporalTypes.window },
    { name: "options", type: optionsType },
  ],
  operations: [{
    id: "render", producer: renderProducer,
    inputs: {
      timeline: { kind: "fragment-input", name: "timeline" },
      within: { kind: "fragment-input", name: "within" },
      window: { kind: "fragment-input", name: "window" },
      options: { kind: "fragment-input", name: "options" },
    },
    result: { kind: "output", name: "visual" },
  }],
  exports: [{ name: "visual", type: compositionTypes.visualTrack, root: { kind: "fragment-operation", operation: "render" } }],
});
const authorDeclaration: AuthorDeclarationCompiler = {
  module: moduleRef,
  declaration: "flash",
  outputs: [compositionTypes.visualTrack, optionsType],
  shape: {
    summary: "Paints one project-owned color flash over an explicit Window.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the flash." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the Timeline." },
      { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Sets the painted Frame." },
      { name: "during", kind: "expression", required: true, accepts: [temporalTypes.window], summary: "Selects the Window." },
      ...["color", "intensity", "attack", "hold", "decay"].map((name) => ({
        name, kind: "literal" as const, required: true, summary: `Sets ${name}.`,
      })),
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" }, type: compositionTypes.visualTrack }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const timeline = await reference(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const within = await reference(declaration, "within", spatialTypes.frame, resolveReference);
    const window = await reference(declaration, "during", temporalTypes.window, resolveReference);
    const options: FlashOptions = {
      id, color: literal(declaration, "color"), intensity: numeric(declaration, "intensity"),
      attackFrames: integer(declaration, "attack"), holdFrames: integer(declaration, "hold"),
      decayFrames: integer(declaration, "decay"),
    };
    assertOptions(options);
    const optionsId = `${id}.options`;
    return {
      records: [{ id: optionsId, type: optionsType, value: canonicalize(options), range: declaration.range }],
      components: [{ id, fragment: flashFragment, inputs: {
        timeline: timeline.ref, within: within.ref, window: window.ref, options: { kind: "record", id: optionsId },
      }, outputs: { visual: `${id}.visual` }, range: declaration.range }],
    };
  },
};
const markupDeclaration = { name: "flash", tag: "Flash" } as const;

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest }],
  facets: [
    createProducerPackageFacet(component.producers ?? []),
    createRefinementPackageFacet(component.refinements ?? []),
    createAuthorDeclarationFacet(authorDeclaration),
    createMarkupDeclarationFacet({ module: moduleRef, declaration: markupDeclaration }),
  ],
};
export default hypitPackage;
