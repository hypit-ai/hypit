import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
  type AuthorValueRef,
} from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { spatialTypes } from "@hypit/spatial";

import { createImageComposeFragment } from "./compose-fragment.js";
import { sealImageComposeLayerSpec, sealImageComposeOptions } from "./compose-program.js";
import { imageTransformFragment } from "./fragment.js";
import { sealImageTransformProgram } from "./program.js";
import { imageComposeTypes, imageOperationsModuleRef, imageTransformTypes } from "./refs.js";
import type { ImageTransformOperation } from "./types.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string, fallback?: string): string {
  const value = field(node, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${node.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

function optionalLiteral(node: DeclarationNode, name: string): string | undefined {
  return field(node, name) === undefined ? undefined : literal(node, name);
}

function numeric(node: DeclarationNode, name: string, fallback?: number): number {
  const raw = optionalLiteral(node, name);
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${node.name}.${name} must be finite.`);
  return value;
}

function integer(value: number, subject: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${subject} must be an integer.`);
  return value;
}

function oneOf<T extends string>(value: string, values: readonly T[], subject: string): T {
  if (!values.includes(value as T)) throw new Error(`${subject} must be one of ${values.join(", ")}.`);
  return value as T;
}

async function reference(
  node: DeclarationNode,
  name: string,
  expected: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(node, name);
  if (value?.kind !== "reference") throw new Error(`${node.name}.${name} must be a reference.`);
  const resolved = await resolveReference(value.path);
  if (resolved === undefined || !sameType(resolved.type, expected)) {
    throw new Error(`${node.name}.${name} cannot resolve the required Type.`);
  }
  return resolved;
}

function operation(node: AuthorDeclarationChild): ImageTransformOperation {
  switch (node.name) {
    case "Crop":
      return {
        kind: "crop",
        unit: oneOf(literal(node, "unit", "fraction"), ["fraction", "pixel"] as const, `${node.name}.unit`),
        x: numeric(node, "x"),
        y: numeric(node, "y"),
        width: numeric(node, "width"),
        height: numeric(node, "height"),
      };
    case "Resize":
      return {
        kind: "resize",
        width: integer(numeric(node, "width"), `${node.name}.width`),
        height: integer(numeric(node, "height"), `${node.name}.height`),
        fit: oneOf(literal(node, "fit", "contain"), ["contain", "cover", "stretch"] as const, `${node.name}.fit`),
        interpolation: oneOf(literal(node, "interpolation", "lanczos"),
          ["nearest", "linear", "cubic", "area", "lanczos"] as const, `${node.name}.interpolation`),
        ...(optionalLiteral(node, "background") === undefined ? {} : { background: literal(node, "background") }),
      };
    case "Rotate": {
      const degrees = numeric(node, "degrees");
      if (degrees !== 90 && degrees !== 180 && degrees !== 270) {
        throw new Error(`${node.name}.degrees must be 90, 180 or 270.`);
      }
      return { kind: "rotate", degrees };
    }
    case "Flip":
      return { kind: "flip", axis: oneOf(literal(node, "axis", "horizontal"),
        ["horizontal", "vertical", "both"] as const, `${node.name}.axis`) };
    case "Denoise":
      return {
        kind: "denoise",
        method: oneOf(literal(node, "method", "nlm-ycrcb"), ["nlm-ycrcb"] as const, `${node.name}.method`),
        lumaStrength: numeric(node, "luma", 2),
        chromaStrength: numeric(node, "chroma", 10),
        templateWindow: integer(numeric(node, "template-window", 7), `${node.name}.template-window`),
        searchWindow: integer(numeric(node, "search-window", 21), `${node.name}.search-window`),
        saturationRecovery: numeric(node, "saturation-recovery", 1.02),
      };
    case "Color":
      return {
        kind: "color",
        exposureStops: numeric(node, "exposure-stops", 0),
        contrast: numeric(node, "contrast", 1),
        saturation: numeric(node, "saturation", 1),
        temperature: numeric(node, "temperature", 0),
        tint: numeric(node, "tint", 0),
        gamma: numeric(node, "gamma", 1),
      };
    case "Sharpen":
      return {
        kind: "sharpen",
        amount: numeric(node, "amount", 0.5),
        radius: numeric(node, "radius", 1),
        threshold: numeric(node, "threshold", 0),
      };
    case "Blur":
      return { kind: "blur", sigma: numeric(node, "sigma") };
    case "Alpha": {
      const background = optionalLiteral(node, "background");
      return {
        kind: "alpha",
        mode: oneOf(literal(node, "mode", "preserve"), ["preserve", "flatten"] as const, `${node.name}.mode`),
        ...(background === undefined ? {} : { background }),
      };
    }
    case "Encode": {
      const quality = field(node, "quality") === undefined ? undefined : numeric(node, "quality");
      const background = optionalLiteral(node, "background");
      return {
        kind: "encode",
        format: oneOf(literal(node, "format", "png"), ["png", "jpeg", "webp"] as const, `${node.name}.format`),
        ...(quality === undefined ? {} : { quality }),
        ...(background === undefined ? {} : { background }),
      };
    }
    default:
      throw new Error(`${node.name} is not an ImageTransform operation.`);
  }
}

function recordBinding(id: string, type: TypeRef): AuthorDeclarationBinding {
  return { name: id, ref: { kind: "record", id }, type };
}

function outputBinding(id: string, output: string, type: TypeRef): AuthorDeclarationBinding {
  return {
    name: `${id}.${output}`,
    ref: { kind: "component-output", component: id, output },
    type,
  };
}

const identifierField = () => ({ name: "id", kind: "identifier" as const, required: true,
  summary: "Names this authored image operation." });
const literalField = (name: string, required = false, values?: readonly string[]) => ({
  name, kind: "literal" as const, required, summary: `Defines ${name}.`,
  ...(values === undefined ? {} : { values }),
});
const referenceField = (name: string, type: TypeRef, required = true) => ({
  name, kind: "reference" as const, required, accepts: [type], summary: `Selects ${name}.`,
});

const programChildren = [
  { name: "Crop", cardinality: "many" as const, summary: "Cuts one rectangular region.", fields: [
    literalField("unit", false, ["fraction", "pixel"]), literalField("x", true), literalField("y", true),
    literalField("width", true), literalField("height", true),
  ] },
  { name: "Resize", cardinality: "many" as const, summary: "Resizes to one pixel extent.", fields: [
    literalField("width", true), literalField("height", true), literalField("fit", false, ["contain", "cover", "stretch"]),
    literalField("interpolation", false, ["nearest", "linear", "cubic", "area", "lanczos"]), literalField("background"),
  ] },
  { name: "Rotate", cardinality: "many" as const, summary: "Rotates by a right angle.",
    fields: [literalField("degrees", true, ["90", "180", "270"])] },
  { name: "Flip", cardinality: "many" as const, summary: "Mirrors one axis.",
    fields: [literalField("axis", false, ["horizontal", "vertical", "both"])] },
  { name: "Denoise", cardinality: "many" as const, summary: "Applies deterministic denoising.", fields: [
    literalField("method", false, ["nlm-ycrcb"]), literalField("luma"), literalField("chroma"),
    literalField("template-window"), literalField("search-window"), literalField("saturation-recovery"),
  ] },
  { name: "Color", cardinality: "many" as const, summary: "Adjusts color channels.", fields: [
    literalField("exposure-stops"), literalField("contrast"), literalField("saturation"),
    literalField("temperature"), literalField("tint"), literalField("gamma"),
  ] },
  { name: "Sharpen", cardinality: "many" as const, summary: "Sharpens edges.",
    fields: [literalField("amount"), literalField("radius"), literalField("threshold")] },
  { name: "Blur", cardinality: "many" as const, summary: "Applies Gaussian blur.",
    fields: [literalField("sigma", true)] },
  { name: "Alpha", cardinality: "many" as const, summary: "Preserves or flattens alpha.", fields: [
    literalField("mode", false, ["preserve", "flatten"]), literalField("background"),
  ] },
  { name: "Encode", cardinality: "optional" as const, summary: "Encodes the final raster.", fields: [
    literalField("format", false, ["png", "jpeg", "webp"]), literalField("quality"), literalField("background"),
  ] },
] as const;

export const imageTransformProgramAuthorDeclaration: AuthorDeclarationCompiler = {
  module: imageOperationsModuleRef,
  declaration: "program",
  outputs: [imageTransformTypes.program],
  shape: { summary: "Authors one ordered reusable raster operation Program.", fields: [identifierField()], children: programChildren },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [recordBinding(id, imageTransformTypes.program)];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    const program = sealImageTransformProgram({ operations: declaration.children.map(operation) });
    return { records: [{ id, type: imageTransformTypes.program, value: program as unknown as CanonicalValue,
      range: declaration.range }], components: [] };
  },
};

export const imageTransformAuthorDeclaration: AuthorDeclarationCompiler = {
  module: imageOperationsModuleRef,
  declaration: "transform",
  outputs: [blobTypes.blob],
  shape: { summary: "Runs one raster Program over one image Blob.", fields: [
    identifierField(), referenceField("source", blobTypes.blob), referenceField("program", imageTransformTypes.program),
  ] },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [outputBinding(id, "image", blobTypes.blob)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const source = await reference(declaration, "source", blobTypes.blob, resolveReference);
    const program = await reference(declaration, "program", imageTransformTypes.program, resolveReference);
    return { records: [], components: [{ id, fragment: imageTransformFragment,
      inputs: { source: source.ref, program: program.ref }, outputs: { image: `${id}.image` }, range: declaration.range }] };
  },
};

export const imageComposeAuthorDeclaration: AuthorDeclarationCompiler = {
  module: imageOperationsModuleRef,
  declaration: "compose",
  outputs: [imageComposeTypes.options, imageComposeTypes.layerSpec, blobTypes.blob],
  shape: { summary: "Flattens ordered still-image Layers into one PNG Blob.", fields: [
    identifierField(), referenceField("canvas", spatialTypes.canvas), literalField("background"),
  ], children: [{ name: "Layer", cardinality: "many", summary: "Paints one image into one Frame.", fields: [
    referenceField("source", blobTypes.blob), referenceField("frame", spatialTypes.frame),
    literalField("fit", false, ["contain", "cover", "stretch"]),
    literalField("interpolation", false, ["nearest", "linear", "cubic", "area", "lanczos"]),
    literalField("opacity"),
  ] }] },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [outputBinding(id, "image", blobTypes.blob)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const canvas = await reference(declaration, "canvas", spatialTypes.canvas, resolveReference);
    const optionsId = `${id}.__options`;
    const records = [{ id: optionsId, type: imageComposeTypes.options,
      value: sealImageComposeOptions({ background: literal(declaration, "background", "#00000000") }) as unknown as CanonicalValue,
      range: declaration.range }];
    const inputs: Record<string, AuthorValueRef> = {
      canvas: canvas.ref,
      options: { kind: "record", id: optionsId },
    };
    const layers: Parameters<typeof createImageComposeFragment>[0][number][] = [];
    for (const [index, child] of declaration.children.entries()) {
      const suffix = String(index + 1).padStart(4, "0");
      const source = await reference(child, "source", blobTypes.blob, resolveReference);
      const frame = await reference(child, "frame", spatialTypes.frame, resolveReference);
      const specId = `${id}.layer.${suffix}.spec`;
      records.push({ id: specId, type: imageComposeTypes.layerSpec,
        value: sealImageComposeLayerSpec({
          fit: oneOf(literal(child, "fit", "contain"),
            ["contain", "cover", "stretch"] as const, `${child.name}.fit`),
          interpolation: oneOf(literal(child, "interpolation", "lanczos"),
            ["nearest", "linear", "cubic", "area", "lanczos"] as const, `${child.name}.interpolation`),
          opacity: numeric(child, "opacity", 1),
        }) as unknown as CanonicalValue,
        range: child.range ?? declaration.range });
      const sourceName = `layer-${suffix}-source`;
      const frameName = `layer-${suffix}-frame`;
      const specName = `layer-${suffix}-spec`;
      inputs[sourceName] = source.ref;
      inputs[frameName] = frame.ref;
      inputs[specName] = { kind: "record", id: specId };
      layers.push({ sourceName, frameName, specName });
    }
    return { records, components: [{ id, fragment: createImageComposeFragment(layers), inputs,
      outputs: { image: `${id}.image` }, range: declaration.range }] };
  },
};

export const imageOperationsAuthorDeclarations = [
  imageTransformProgramAuthorDeclaration,
  imageTransformAuthorDeclaration,
  imageComposeAuthorDeclaration,
] as const;

export const imageOperationsMarkupDeclarations = [
  { name: "program", tag: "Program" },
  { name: "transform", tag: "Transform" },
  { name: "compose", tag: "Compose" },
] as const;
