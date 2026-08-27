import type { StructuredElement, StructuredSurfaceHandler, SurfaceComponentDraft, SurfaceRecordDraft, SurfaceResolvedReference } from "@hypit/markup";
import { exampleBoxFragment, exampleMediaFragment, exampleTextFragment } from "./fragment.js";
import { exampleMarkupSurfaces, exampleTypes } from "./manifest.js";

function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}
function reference(element: StructuredElement, name: string, resolve: (path: string) => SurfaceResolvedReference | undefined): SurfaceResolvedReference {
  const value = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference.`);
  const resolved = resolve(value.path);
  if (resolved === undefined) throw new Error(`${element.name}.${name} cannot resolve ${value.path}`);
  return resolved;
}

export const decodeExampleSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const id = text(element, "id");
  const space = reference(element, "space", resolveReference);
  const surface = exampleMarkupSurfaces.find((item) => item.tag === element.name.split(":").at(-1));
  if (surface === undefined) throw new Error(`Unknown example surface ${element.name}`);
  const fragment = surface.name === "box" ? exampleBoxFragment : surface.name === "text" ? exampleTextFragment : exampleMediaFragment;
  const type = surface.name === "box" ? exampleTypes.box : surface.name === "text" ? exampleTypes.text : exampleTypes.mediaSlot;
  const record: SurfaceRecordDraft = { id: `${id}.value`, type, value: { kind: "inline", value: { id } }, range: element.range };
  const component: SurfaceComponentDraft = { id, fragment: fragment.id, inputs: { space: space.ref }, outputs: { track: `${id}.track` }, range: element.range };
  return { records: [record], components: [component], fragments: [fragment], exports: [`${id}.value`, `${id}.track`] };
};
