import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { createAuthorDeclarationFacet, declarationField, sealGraphFragment } from "@hypit/hypit/author";
import type { AuthorDeclarationCompiler, AuthorResolvedReference } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ModuleManifest, TypeRef, TypedRecord } from "@hypit/hypit/protocol";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import type { FontStackRef } from "@hypit/media";
import type { PreparedMedia } from "@hypit/media";
import { timelineTypes } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import type { SpatialFrame } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "@hypit/temporal";
import { renderExplainer } from "./render.js";
import type { ExplainerOptions } from "./render.js";

const module = { name: "@example/responsive-explainer", version: "1" } as const;
const optionsType = { module, name: "ExplainerOptions" };
const producer = { module, name: "compose" };
const inputs = [
  { name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
  { name: "window", type: temporalTypes.window }, { name: "reveal", type: temporalTypes.instant },
  { name: "media", type: mediaTypes.prepared }, { name: "sourceWindow", type: temporalTypes.window },
  { name: "font", type: mediaTypes.fontStack }, { name: "options", type: optionsType },
];
export const manifest: ModuleManifest = { format: "hypit.module@1", ...module,
  dependencies: [...[compositionTypes.visualTrack, mediaTypes.fontStack, timelineTypes.timeline,
    spatialTypes.frame, temporalTypes.window, temporalTypes.instant]
    .map(type => type.module)],
  types: [optionsType.name], capabilities: [],
  producers: [{ name: producer.name, inputs, result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack } }],
};
const fragment = sealGraphFragment({ inputs, operations: [
  { id: "compose", producer,
  inputs: Object.fromEntries(inputs.map(input => [input.name, { kind: "fragment-input" as const, name: input.name }])),
  result: { kind: "output" as const, name: "visual" } }],
  exports: [{ name: "visual", type: compositionTypes.visualTrack, root: { kind: "fragment-operation", operation: "compose" } }],
});
const valueOf = <T>(record: TypedRecord | undefined): T => {
  if (record?.value === undefined) throw new Error("Explainer inputs are missing.");
  return record.value as T;
};
const component: { producers?: ProducerPackage; refinements?: RefinementPackage } = { producers: [{ producer, handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(renderExplainer(valueOf<Timeline>(inputs.timeline),
    valueOf<SpatialFrame>(inputs.within), valueOf<TemporalWindow>(inputs.window), valueOf<TemporalInstant>(inputs.reveal),
    valueOf<PreparedMedia>(inputs.media), valueOf<TemporalWindow>(inputs.sourceWindow),
    valueOf<FontStackRef>(inputs.font).faces, valueOf<ExplainerOptions>(inputs.options)))) }) }] };

function literal(declaration: Parameters<AuthorDeclarationCompiler["bindings"]>[0], name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) throw new Error(`${declaration.name}.${name} must be text.`);
  return field.value.trim();
}
async function reference(
  declaration: Parameters<AuthorDeclarationCompiler["bindings"]>[0],
  name: string,
  type: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(type, value.type)) throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  return value;
}
const authorDeclaration: AuthorDeclarationCompiler = {
  module, declaration: "scene", outputs: [compositionTypes.visualTrack, optionsType],
  shape: { summary: "Builds one responsive explainer scene.", fields: [
    { name: "id", kind: "identifier", required: true, summary: "Names the scene." },
    { name: "title", kind: "literal", required: true, summary: "Sets the title." },
    { name: "transition-frames", kind: "literal", required: true, summary: "Sets the transition duration." },
    { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the Timeline." },
    { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Places the scene." },
    { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontStack], summary: "Selects the font." },
    { name: "media", kind: "reference", required: true, accepts: [mediaTypes.prepared], summary: "Selects prepared media." },
    { name: "source-window", kind: "reference", required: true, accepts: [temporalTypes.window], summary: "Selects source time." },
    { name: "reveal", kind: "expression", required: true, accepts: [temporalTypes.instant], summary: "Selects the reveal Instant." },
    { name: "during", kind: "expression", required: true, accepts: [temporalTypes.window], summary: "Selects the scene Window." },
  ] },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" }, type: compositionTypes.visualTrack }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const options: ExplainerOptions = { id, title: literal(declaration, "title"),
      transitionFrames: Number(literal(declaration, "transition-frames")) };
    const refs = {
      timeline: await reference(declaration, "timeline", timelineTypes.timeline, resolveReference),
      within: await reference(declaration, "within", spatialTypes.frame, resolveReference),
      font: await reference(declaration, "font", mediaTypes.fontStack, resolveReference),
      media: await reference(declaration, "media", mediaTypes.prepared, resolveReference),
      sourceWindow: await reference(declaration, "source-window", temporalTypes.window, resolveReference),
      window: await reference(declaration, "during", temporalTypes.window, resolveReference),
      reveal: await reference(declaration, "reveal", temporalTypes.instant, resolveReference),
    };
    return {
      records: [{ id: `${id}.options`, type: optionsType, value: canonicalize(options), range: declaration.range }],
      components: [{ id, fragment, inputs: {
        timeline: refs.timeline.ref, within: refs.within.ref, font: refs.font.ref, media: refs.media.ref,
        sourceWindow: refs.sourceWindow.ref, window: refs.window.ref, reveal: refs.reveal.ref,
        options: { kind: "record", id: `${id}.options` },
      }, outputs: { visual: `${id}.visual` }, range: declaration.range }],
    };
  },
};
const markupDeclaration = { name: "scene", tag: "Scene" } as const;
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest }],
  facets: [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? []),
    createAuthorDeclarationFacet(authorDeclaration), createMarkupDeclarationFacet({ module, declaration: markupDeclaration })] };
export default hypitPackage;
