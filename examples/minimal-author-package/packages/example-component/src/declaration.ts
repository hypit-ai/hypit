import { declarationField, type AuthorDeclarationCompiler, type AuthorResolvedReference } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import { recipeType } from "@hypit/hypit/recipe";
import { spatialTypes } from "@hypit/spatial";
import { timelineTypes } from "@hypit/timeline";

import { exampleBoxFragment, exampleImageFragment, exampleTextFragment } from "./fragment.js";
import { exampleModuleRef, exampleTypes } from "./manifest.js";

function literal(declaration: Parameters<AuthorDeclarationCompiler["bindings"]>[0], name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) throw new Error(`${declaration.name}.${name} must be text.`);
  return field.value.trim();
}

async function reference(
  declaration: Parameters<AuthorDeclarationCompiler["bindings"]>[0],
  name: string,
  expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${declaration.name}.${name} has the wrong Type.`);
  return value;
}

const identifier = { name: "id", kind: "identifier" as const, required: true, summary: "Names this declaration." };
const field = (name: string, type: TypeRef, required = true) => ({
  name, kind: "reference" as const, required, accepts: [type], summary: `Selects ${type.name}.`,
});

const visual = (
  declaration: "box" | "text" | "image-slot",
  type: TypeRef,
  fragment: typeof exampleBoxFragment,
  image = false,
): AuthorDeclarationCompiler => ({
  module: exampleModuleRef,
  declaration,
  outputs: [type, compositionTypes.visualTrack],
  shape: { summary: `Builds the example ${declaration}.`, fields: [
    identifier, field("timeline", timelineTypes.timeline), field("within", spatialTypes.frame),
    ...(image ? [field("image", blobTypes.blob, false)] : []),
  ] },
  bindings(value) {
    const id = literal(value, "id");
    return [
      { name: `${id}.value`, ref: { kind: "record", id: `${id}.value` }, type },
      { name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" }, type: compositionTypes.visualTrack },
    ];
  },
  async compile({ declaration: value, resolveReference }) {
    const id = literal(value, "id");
    const timeline = await reference(value, "timeline", timelineTypes.timeline, resolveReference);
    const within = await reference(value, "within", spatialTypes.frame, resolveReference);
    const imageValue = declarationField(value, "image") === undefined
      ? undefined
      : await reference(value, "image", blobTypes.blob, resolveReference);
    return {
      records: [{ id: `${id}.value`, type, value: { id } as CanonicalValue, range: value.range }],
      components: [{
        id, fragment,
        inputs: { timeline: timeline.ref, within: within.ref, ...(imageValue === undefined ? {} : { image: imageValue.ref }) },
        outputs: { visual: `${id}.visual` }, range: value.range,
      }],
    };
  },
});

export const exampleAuthorDeclarations: readonly AuthorDeclarationCompiler[] = [
  visual("box", exampleTypes.box, exampleBoxFragment),
  visual("text", exampleTypes.text, exampleTextFragment),
  visual("image-slot", exampleTypes.imageSlot, exampleImageFragment, true),
  {
    module: exampleModuleRef,
    declaration: "style",
    outputs: [exampleTypes.style],
    shape: { summary: "Builds one example style.", fields: [identifier, field("recipe", recipeType), field("font", mediaTypes.fontStack)] },
    bindings(value) {
      const id = literal(value, "id");
      return [{ name: id, ref: { kind: "record", id }, type: exampleTypes.style }];
    },
    async compile({ declaration: value, resolveReference }) {
      const id = literal(value, "id");
      const recipe = await reference(value, "recipe", recipeType, resolveReference);
      const font = await reference(value, "font", mediaTypes.fontStack, resolveReference);
      if (recipe.record === undefined || font.record === undefined) throw new Error("Example Style inputs must resolve during author compilation.");
      return { records: [{ id, type: exampleTypes.style,
        value: { recipe: recipe.record.value, fonts: font.record.value } as CanonicalValue, range: value.range }], components: [] };
    },
  },
];

export const exampleMarkupDeclarations = [
  { name: "box", tag: "Box" },
  { name: "text", tag: "Text" },
  { name: "image-slot", tag: "ImageSlot" },
  { name: "style", tag: "Style" },
] as const;
