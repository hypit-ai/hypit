import type { ValueSchema } from "@narratage/protocol";

const number = (minimum?: number, maximum?: number): ValueSchema => ({
  kind: "number", ...(minimum === undefined ? {} : { minimum }), ...(maximum === undefined ? {} : { maximum }),
});
const integer = (minimum: number, maximum: number): ValueSchema => ({ kind: "number", integer: true, minimum, maximum });
const stringEnum = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const color: ValueSchema = { kind: "string", minLength: 7, maxLength: 9 };

/** Declarative mirror of the closed transform vocabulary, shared by every author Surface. */
export const rasterTransformOperationSchema: ValueSchema = {
  kind: "oneOf",
  variants: [
    object({
      kind: { schema: { kind: "literal", value: "crop" } }, unit: { schema: stringEnum(["fraction", "pixel"]) },
      x: { schema: number(0) }, y: { schema: number(0) }, width: { schema: number(Number.EPSILON) }, height: { schema: number(Number.EPSILON) },
    }),
    object({
      kind: { schema: { kind: "literal", value: "resize" } }, width: { schema: integer(1, 16_384) }, height: { schema: integer(1, 16_384) },
      fit: { schema: stringEnum(["contain", "cover", "stretch"]) },
      interpolation: { schema: stringEnum(["nearest", "linear", "cubic", "area", "lanczos"]) },
      background: { schema: color, optional: true },
    }),
    object({ kind: { schema: { kind: "literal", value: "rotate" } }, degrees: { schema: { kind: "oneOf", variants: [
      { kind: "literal", value: 90 }, { kind: "literal", value: 180 }, { kind: "literal", value: 270 },
    ] } } }),
    object({ kind: { schema: { kind: "literal", value: "flip" } }, axis: { schema: stringEnum(["horizontal", "vertical", "both"]) } }),
    object({
      kind: { schema: { kind: "literal", value: "denoise" } }, method: { schema: { kind: "literal", value: "nlm-ycrcb" } },
      lumaStrength: { schema: number(0, 50) }, chromaStrength: { schema: number(0, 50) },
      templateWindow: { schema: integer(1, 31) }, searchWindow: { schema: integer(1, 63) }, saturationRecovery: { schema: number(0, 4) },
    }),
    object({
      kind: { schema: { kind: "literal", value: "color" } }, exposureStops: { schema: number(-8, 8) },
      contrast: { schema: number(0, 4) }, saturation: { schema: number(0, 4) }, temperature: { schema: number(-1, 1) },
      tint: { schema: number(-1, 1) }, gamma: { schema: number(0.1, 10) },
    }),
    object({
      kind: { schema: { kind: "literal", value: "sharpen" } }, amount: { schema: number(0, 5) },
      radius: { schema: number(0.1, 20) }, threshold: { schema: number(0, 255) },
    }),
    object({ kind: { schema: { kind: "literal", value: "blur" } }, sigma: { schema: number(0.1, 100) } }),
    object({
      kind: { schema: { kind: "literal", value: "alpha" } }, mode: { schema: stringEnum(["preserve", "flatten"]) },
      background: { schema: color, optional: true },
    }),
    object({
      kind: { schema: { kind: "literal", value: "encode" } }, format: { schema: stringEnum(["png", "jpeg", "webp"]) },
      quality: { schema: number(1, 100), optional: true }, background: { schema: color, optional: true },
    }),
  ],
};
