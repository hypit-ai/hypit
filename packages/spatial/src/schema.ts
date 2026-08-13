import type { ValueSchema } from "@narratage/protocol";

const number = { kind: "number" } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const point = object({ x: { schema: { kind: "number", minimum: 0, maximum: 1 } }, y: { schema: { kind: "number", minimum: 0, maximum: 1 } } });
const pixelPoint = object({ x: { schema: number }, y: { schema: number } });
const length = object({ unit: { schema: { kind: "string", enum: ["px", "percent"] } }, value: { schema: number } });

export const canvasSpaceSchema = object({
  widthPx: { schema: positiveInteger }, heightPx: { schema: positiveInteger },
  origin: { schema: { kind: "literal", value: "top-left" } },
  xDirection: { schema: { kind: "literal", value: "right" } },
  yDirection: { schema: { kind: "literal", value: "down" } },
  pixelAspect: { schema: { kind: "literal", value: "square" } },
});
export const spatialPointSchema = object({ xPx: { schema: number }, yPx: { schema: number } });
export const spatialFrameSchema = object({ xPx: { schema: number }, yPx: { schema: number }, widthPx: { schema: number }, heightPx: { schema: number } });
const pathCommand: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "move" } }, xPx: { schema: number }, yPx: { schema: number } }),
  object({ kind: { schema: { kind: "literal", value: "line" } }, xPx: { schema: number }, yPx: { schema: number } }),
  object({ kind: { schema: { kind: "literal", value: "quadratic" } }, controlX: { schema: number }, controlY: { schema: number }, xPx: { schema: number }, yPx: { schema: number } }),
  object({ kind: { schema: { kind: "literal", value: "cubic" } }, control1X: { schema: number }, control1Y: { schema: number }, control2X: { schema: number }, control2Y: { schema: number }, xPx: { schema: number }, yPx: { schema: number } }),
  object({ kind: { schema: { kind: "literal", value: "close" } } }),
] };
export const spatialPathSchema = object({ commands: { schema: { kind: "array", minItems: 2, items: pathCommand } } });
export const intrinsicExtentSchema = object({ widthPx: { schema: number }, heightPx: { schema: number } });
export const contentFitSchema = object({
  sizing: { schema: { kind: "string", enum: ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"] } },
  framePoint: { schema: point }, contentPoint: { schema: point }, offsetPx: { schema: pixelPoint },
  constraint: { schema: { kind: "string", enum: ["bounded", "free"] } },
});
export const fittedContentSchema = object({ contentFrame: { schema: spatialFrameSchema } });
export const frameEdgesProgramSchema = object({ left: { schema: length }, top: { schema: length }, right: { schema: length }, bottom: { schema: length } });
const anchor = { kind: "string", enum: ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"] } as const;
export const anchoredFrameProgramSchema = object({ x: { schema: length }, y: { schema: length }, width: { schema: length }, height: { schema: length }, anchor: { schema: anchor }, offsetPx: { schema: pixelPoint } });
export const aspectFrameProgramSchema = object({ x: { schema: length }, y: { schema: length }, primary: { schema: { kind: "string", enum: ["width", "height"] } }, size: { schema: length }, anchor: { schema: anchor }, offsetPx: { schema: pixelPoint } });
