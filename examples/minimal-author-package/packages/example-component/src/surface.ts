import type { StructuredElement, StructuredSurfaceHandler, SurfaceComponentDraft, SurfaceRecordDraft, SurfaceResolvedReference } from "@hypit/hypit/author-kit";
import { exampleBoxFragment, exampleMediaFragment, exampleTextFragment } from "./fragment.js";
import { exampleMarkupSurfaces, exampleTypes } from "./manifest.js";
import { mediaTypes } from "@hypit/hypit/media";
import { svsRecipeType } from "@hypit/hypit/svs";
import { artifactTypes } from "@hypit/hypit/artifact";

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
  if (element.name.endsWith(":Style")) {
    const recipe = reference(element, "recipe", resolveReference);
    const font = reference(element, "font", resolveReference);
    if (recipe.type.module.name !== svsRecipeType.module.name || recipe.type.name !== svsRecipeType.name) throw new Error("Style.recipe must be an SVS Recipe.");
    if (font.type.module.name !== mediaTypes.fontStack.module.name || font.type.name !== mediaTypes.fontStack.name) throw new Error("Style.font must be a FontStackRef.");
    if (recipe.record?.value.kind !== "inline" || font.record?.value.kind !== "inline") throw new Error("Style references must resolve to inline records.");
    return { records: [{ id, type: exampleTypes.style, value: { kind: "inline", value: { recipe: recipe.record.value.value, fonts: font.record.value.value } }, range: element.range }], components: [], fragments: [], exports: [id] };
  }
  const semantic = reference(element, "semantic", resolveReference);
  const surface = exampleMarkupSurfaces.find((item) => item.tag === element.name.split(":").at(-1));
  if (surface === undefined) throw new Error(`Unknown example surface ${element.name}`);
  const fragment = surface.name === "box" ? exampleBoxFragment : surface.name === "text" ? exampleTextFragment : exampleMediaFragment;
  const type = surface.name === "box" ? exampleTypes.box : surface.name === "text" ? exampleTypes.text : exampleTypes.mediaSlot;
  const record: SurfaceRecordDraft = { id: `${id}.value`, type, value: { kind: "inline", value: { id } }, range: element.range };
  const media = element.attributes.media === undefined ? undefined : reference(element, "media", resolveReference);
  if (media !== undefined && (media.type.module.name !== artifactTypes.blob.module.name || media.type.name !== artifactTypes.blob.name)) throw new Error(`${element.name}.media must be a Blob Artifact.`);
  const component: SurfaceComponentDraft = { id, fragment: fragment.id, inputs: { semantic: semantic.ref, ...(media === undefined ? {} : { media: media.ref }) }, outputs: { track: `${id}.track` }, range: element.range };
  return { records: [record], components: [component], fragments: [fragment], exports: [`${id}.value`, `${id}.track`] };
};
