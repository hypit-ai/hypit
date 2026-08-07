import { artifactTypes } from "@svml/artifact";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  TextAttributeValue,
} from "@svml/text";
import type { CanonicalValue } from "@svml/protocol";

import { imageTransformFragment } from "./fragment.js";
import { imageTransformTypes } from "./manifest.js";
import { sealImageTransformProgram } from "./program.js";
import type { ImageTransformOperation } from "./types.js";

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function exact(element: StructuredElement, allowed: readonly string[], required: readonly string[] = []): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  if (missing.length > 0) throw new Error(`${element.name} requires ${missing.join(", ")}`);
}

function text(element: StructuredElement, name: string, fallback?: string): string {
  const value: TextAttributeValue | undefined = element.attributes[name];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be a non-empty string`);
  }
  return value.trim();
}

function numberValue(element: StructuredElement, name: string, fallback?: number): number {
  const value = element.attributes[name];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be a number`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${element.name}.${name} must be a finite number`);
  return parsed;
}

function optionalText(element: StructuredElement, name: string): string | undefined {
  return element.attributes[name] === undefined ? undefined : text(element, name);
}

function optionalNumber(element: StructuredElement, name: string): number | undefined {
  return element.attributes[name] === undefined ? undefined : numberValue(element, name);
}

function oneOf<T extends string>(value: string, values: readonly T[], subject: string): T {
  if (!values.includes(value as T)) throw new Error(`${subject} must be one of ${values.join(", ")}`);
  return value as T;
}

function integer(value: number, subject: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${subject} must be an integer`);
  return value;
}

function operation(element: StructuredElement): ImageTransformOperation {
  switch (localName(element.name)) {
    case "Crop":
      exact(element, ["unit", "x", "y", "width", "height"], ["x", "y", "width", "height"]);
      return {
        kind: "crop",
        unit: oneOf(text(element, "unit", "fraction"), ["fraction", "pixel"] as const, `${element.name}.unit`),
        x: numberValue(element, "x"), y: numberValue(element, "y"),
        width: numberValue(element, "width"), height: numberValue(element, "height"),
      };
    case "Resize":
      exact(element, ["width", "height", "fit", "interpolation", "background"], ["width", "height"]);
      return {
        kind: "resize",
        width: integer(numberValue(element, "width"), `${element.name}.width`),
        height: integer(numberValue(element, "height"), `${element.name}.height`),
        fit: oneOf(text(element, "fit", "contain"), ["contain", "cover", "stretch"] as const, `${element.name}.fit`),
        interpolation: oneOf(text(element, "interpolation", "lanczos"),
          ["nearest", "linear", "cubic", "area", "lanczos"] as const, `${element.name}.interpolation`),
        ...(optionalText(element, "background") === undefined ? {} : { background: text(element, "background") }),
      };
    case "Rotate": {
      exact(element, ["degrees"], ["degrees"]);
      const degrees = numberValue(element, "degrees");
      if (degrees !== 90 && degrees !== 180 && degrees !== 270) throw new Error(`${element.name}.degrees must be 90, 180 or 270`);
      return { kind: "rotate", degrees };
    }
    case "Flip":
      exact(element, ["axis"]);
      return { kind: "flip", axis: oneOf(text(element, "axis", "horizontal"),
        ["horizontal", "vertical", "both"] as const, `${element.name}.axis`) };
    case "Denoise":
      exact(element, ["method", "luma", "chroma", "template-window", "search-window", "saturation-recovery"]);
      return {
        kind: "denoise",
        method: oneOf(text(element, "method", "nlm-ycrcb"), ["nlm-ycrcb"] as const, `${element.name}.method`),
        lumaStrength: numberValue(element, "luma", 2),
        chromaStrength: numberValue(element, "chroma", 10),
        templateWindow: integer(numberValue(element, "template-window", 7), `${element.name}.template-window`),
        searchWindow: integer(numberValue(element, "search-window", 21), `${element.name}.search-window`),
        saturationRecovery: numberValue(element, "saturation-recovery", 1.02),
      };
    case "Color":
      exact(element, ["exposure-stops", "contrast", "saturation", "temperature", "tint", "gamma"]);
      return {
        kind: "color",
        exposureStops: numberValue(element, "exposure-stops", 0),
        contrast: numberValue(element, "contrast", 1),
        saturation: numberValue(element, "saturation", 1),
        temperature: numberValue(element, "temperature", 0),
        tint: numberValue(element, "tint", 0),
        gamma: numberValue(element, "gamma", 1),
      };
    case "Sharpen":
      exact(element, ["amount", "radius", "threshold"]);
      return {
        kind: "sharpen",
        amount: numberValue(element, "amount", 0.5),
        radius: numberValue(element, "radius", 1),
        threshold: numberValue(element, "threshold", 0),
      };
    case "Blur":
      exact(element, ["sigma"], ["sigma"]);
      return { kind: "blur", sigma: numberValue(element, "sigma") };
    case "Alpha": {
      exact(element, ["mode", "background"]);
      const background = optionalText(element, "background");
      return {
        kind: "alpha",
        mode: oneOf(text(element, "mode", "preserve"), ["preserve", "flatten"] as const, `${element.name}.mode`),
        ...(background === undefined ? {} : { background }),
      };
    }
    case "Encode": {
      exact(element, ["format", "quality", "background"]);
      const quality = optionalNumber(element, "quality");
      const background = optionalText(element, "background");
      return {
        kind: "encode",
        format: oneOf(text(element, "format", "png"), ["png", "jpeg", "webp"] as const, `${element.name}.format`),
        ...(quality === undefined ? {} : { quality }),
        ...(background === undefined ? {} : { background }),
      };
    }
    default:
      throw new Error(`${element.name} is not an ImageTransform operation`);
  }
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function ref(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const value = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference`);
  const resolved = resolve(value.path);
  if (resolved === undefined || !sameType(resolved.type, expected)) {
    throw new Error(`${element.name}.${name} cannot resolve the required type`);
  }
  return resolved;
}

function onlyTrivia(element: StructuredElement): void {
  for (const child of element.children) {
    if (child.kind === "element" || child.value.trim().length > 0) throw new Error(`${element.name} must be empty`);
  }
}

export const decodeImageTransformProgramSurface: StructuredSurfaceHandler = ({ element }) => {
  exact(element, ["id"], ["id"]);
  const id = text(element, "id");
  const operations = element.children.flatMap((child) => {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only operation elements`);
      return [];
    }
    return [operation(child)];
  });
  const program = sealImageTransformProgram({ contract: "svml.image-transform-program@1", operations });
  return {
    records: [{
      id,
      type: imageTransformTypes.program,
      value: { kind: "inline", value: program as unknown as CanonicalValue },
      range: element.range,
    }],
    components: [],
    fragments: [],
  };
};

export const decodeImageTransformSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "source", "program"], ["id", "source", "program"]);
  onlyTrivia(element);
  const id = text(element, "id");
  const source = ref(element, "source", artifactTypes.blob, resolveReference);
  const program = ref(element, "program", imageTransformTypes.program, resolveReference);
  return {
    records: [],
    components: [{
      id,
      fragment: imageTransformFragment.id,
      inputs: { source: source.ref, program: program.ref },
      outputs: { image: `${id}.image` },
      range: element.range,
    }],
    fragments: [imageTransformFragment],
  };
};
