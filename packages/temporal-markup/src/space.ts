import { sealGraphFragment } from "@hypit/elaborator";
import type { StructuredElement, SurfaceAttributeVocabulary, SurfaceResolvedReference } from "@hypit/markup";
import { programSpaceTypes } from "@hypit/program-space";
import { semanticTrackProducers, semanticTrackTypes } from "@hypit/semantic-track";

export type TemporalContext = {
  readonly semantic?: SurfaceResolvedReference;
  readonly space?: SurfaceResolvedReference;
};

export const temporalContextAttributeVocabulary = [
  { name: "semantic", kind: "reference", required: false, accepts: [semanticTrackTypes.track],
    summary: "Uses the performance's time axis and resolves Script Selections and Moments." },
  { name: "space", kind: "reference", required: false, accepts: [programSpaceTypes.programSpace],
    summary: "Uses a declared film time axis for authored animation. Supply semantic or space." },
] as const satisfies readonly SurfaceAttributeVocabulary[];

/** Select the author's film time source. */
export function resolveTemporalContext(input: {
  readonly element: StructuredElement;
  readonly resolveReference: (path: string) => SurfaceResolvedReference | undefined;
}): TemporalContext {
  const { element, resolveReference } = input;
  if (Number(element.attributes.semantic !== undefined) + Number(element.attributes.space !== undefined) !== 1) {
    throw new Error(`${element.name} requires one time source: semantic or space.`);
  }
  const name = element.attributes.semantic === undefined ? "space" : "semantic";
  const raw = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference.`);
  const found = resolveReference(raw.path);
  const expected = name === "semantic" ? semanticTrackTypes.track : programSpaceTypes.programSpace;
  if (found === undefined || found.type.module.name !== expected.module.name
    || found.type.module.version !== expected.module.version || found.type.name !== expected.name) {
    throw new Error(`${element.name}.${name} must reference ${expected.name}.`);
  }
  return { [name]: found };
}

/** Give consumers a ProgramSpace while preserving semantic context for word-bound projections. */
export function createTemporalSpace(input: TemporalContext & { readonly id: string; readonly element: StructuredElement }) {
  if (input.space !== undefined) return { records: [], components: [], fragments: [], space: input.space };
  if (input.semantic === undefined) throw new Error(`${input.element.name} requires a film time source.`);
  const fragment = sealGraphFragment({
    inputs: [{ name: "semantic", type: semanticTrackTypes.track }],
    operations: [{ id: "project-space", producer: semanticTrackProducers.projectProgramSpace,
      inputs: { track: { kind: "fragment-input", name: "semantic" } }, result: { kind: "output", name: "space" } }],
    exports: [{ name: "space", type: programSpaceTypes.programSpace,
      root: { kind: "fragment-operation", operation: "project-space" } }],
  });
  const id = `${input.id}.__space`;
  const space: SurfaceResolvedReference = { path: `${id}.space`, type: programSpaceTypes.programSpace,
    ref: { kind: "component-output", component: id, output: "space" } };
  return {
    records: [],
    components: [{ id, fragment: fragment.id, inputs: { semantic: input.semantic.ref }, outputs: { space: `${id}.space` }, range: input.element.range }],
    fragments: [fragment],
    space,
  };
}
