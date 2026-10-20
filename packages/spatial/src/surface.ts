import { sameType } from "@hypit/hypit/protocol";
import type { CanonicalValue } from "@hypit/hypit/protocol";
import type { AuthorValueRef } from "@hypit/hypit/author";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/hypit/markup";

import {
  anchoredFrameFragment,
  aspectFrameFragment,
  frameEdgesFragment,
} from "./fragment.js";
import { spatialTypes } from "./manifest.js";
import { assertSpatialPath, canvasFrame, sealCanvas, sealIntrinsicExtent, sealSpatialMap2D, sealSpatialPoint } from "./geometry.js";
import type {
  AnchoredFrameProgram,
  AspectFrameProgram,
  FrameEdgesProgram,
  SpatialAnchor,
  SpatialLength,
  SpatialPath,
  SpatialPathCommand,
} from "./types.js";

function exact(element: StructuredElement, allowed: readonly string[], required: readonly string[]): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  const missing = required.filter((name) => element.attributes[name] === undefined);
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}.`);
  if (missing.length > 0) throw new Error(`${element.name} requires ${missing.join(", ")}.`);
  for (const child of element.children) {
    if (child.kind === "element" || child.value.trim().length > 0) throw new Error(`${element.name} must be empty.`);
  }
}

function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

function number(element: StructuredElement, name: string, fallback?: number): number {
  if (element.attributes[name] === undefined && fallback !== undefined) return fallback;
  const value = Number(text(element, name));
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be finite.`);
  return value;
}

function positiveInteger(element: StructuredElement, name: string): number {
  const value = number(element, name);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${element.name}.${name} must be a positive integer.`);
  return value;
}

function length(element: StructuredElement, name: string): SpatialLength {
  const source = text(element, name);
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%)$/u.exec(source);
  if (match === null) throw new Error(`${element.name}.${name} must use px or %.`);
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be finite.`);
  return { unit: match[2] === "%" ? "percent" : "px", value };
}

function anchor(element: StructuredElement): SpatialAnchor {
  const value = text(element, "anchor") as SpatialAnchor;
  if (!["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"].includes(value)) {
    throw new Error(`${element.name}.anchor is invalid.`);
  }
  return value;
}

function reference(
  element: StructuredElement,
  name: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference.`);
  const result = resolve(value.path);
  if (result === undefined) throw new Error(`${element.name}.${name} cannot resolve ${value.path}.`);
  return result;
}

function parentFrame(
  element: StructuredElement,
  parent: SurfaceResolvedReference,
): SurfaceResolvedReference["ref"] {
  if (!sameType(parent.type, spatialTypes.frame)) throw new Error(`${element.name}.within must reference SpatialFrame.`);
  return parent.ref;
}

export const decodeCanvasSurface: StructuredSurfaceHandler = ({ element }) => {
  exact(element, ["id", "width", "height"], ["id", "width", "height"]);
  const id = text(element, "id");
  const canvas = sealCanvas({
    widthPx: positiveInteger(element, "width"), heightPx: positiveInteger(element, "height"),
  });
  const bounds = canvasFrame(canvas);
  return {
    records: [
      { id: `${id}.canvas`, type: spatialTypes.canvas, value: (canvas as unknown as CanonicalValue), range: element.range },
      { id: `${id}.bounds`, type: spatialTypes.frame, value: (bounds as unknown as CanonicalValue), range: element.range },
    ],
    components: [],
  };
};

export const decodePointSurface: StructuredSurfaceHandler = ({ element }) => {
  exact(element, ["id", "x", "y"], ["id", "x", "y"]);
  const id = text(element, "id");
  const point = sealSpatialPoint({
    xPx: number(element, "x"),
    yPx: number(element, "y"),
  });
  return {
    records: [{ id, type: spatialTypes.point, value: (point as unknown as CanonicalValue), range: element.range }],
    components: [],
  };
};

function commandNumber(element: StructuredElement, name: string): number {
  const value = element.attributes[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be finite.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${element.name}.${name} must be finite.`);
  return parsed;
}

function pathCommand(element: StructuredElement): SpatialPathCommand {
  const name = element.name.slice(element.name.lastIndexOf(":") + 1);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} must be empty.`);
  }
  if (name === "Move" || name === "Line") {
    exact(element, ["x", "y"], ["x", "y"]);
    return { kind: name === "Move" ? "move" : "line", xPx: commandNumber(element, "x"), yPx: commandNumber(element, "y") };
  }
  if (name === "Quadratic") {
    exact(element, ["control-x", "control-y", "x", "y"], ["control-x", "control-y", "x", "y"]);
    return {
      kind: "quadratic",
      controlX: commandNumber(element, "control-x"), controlY: commandNumber(element, "control-y"),
      xPx: commandNumber(element, "x"), yPx: commandNumber(element, "y"),
    };
  }
  if (name === "Cubic") {
    exact(element, ["control1-x", "control1-y", "control2-x", "control2-y", "x", "y"], ["control1-x", "control1-y", "control2-x", "control2-y", "x", "y"]);
    return {
      kind: "cubic",
      control1X: commandNumber(element, "control1-x"), control1Y: commandNumber(element, "control1-y"),
      control2X: commandNumber(element, "control2-x"), control2Y: commandNumber(element, "control2-y"),
      xPx: commandNumber(element, "x"), yPx: commandNumber(element, "y"),
    };
  }
  if (name === "Close") {
    exact(element, [], []);
    return { kind: "close" };
  }
  throw new Error(`${element.name} is not a Spatial Path command.`);
}

export const decodePathSurface: StructuredSurfaceHandler = ({ element }) => {
  const unknown = Object.keys(element.attributes).filter((name) => name !== "id");
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}.`);
  const id = text(element, "id");
  const commands: SpatialPathCommand[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Path commands.`);
      continue;
    }
    commands.push(pathCommand(child));
  }
  const path: SpatialPath = { commands };
  assertSpatialPath(path);
  return {
    records: [{ id, type: spatialTypes.path, value: (path as unknown as CanonicalValue), range: element.range }],
    components: [],
  };
};

export const decodeExtentSurface: StructuredSurfaceHandler = ({ element }) => {
  exact(element, ["id", "width", "height"], ["id", "width", "height"]);
  const id = text(element, "id");
  const extent = sealIntrinsicExtent({
    widthPx: positiveInteger(element, "width"),
    heightPx: positiveInteger(element, "height"),
  });
  return { records: [{ id, type: spatialTypes.extent, value: (extent as unknown as CanonicalValue), range: element.range }], components: [] };
};

export const decodeMapSurface: StructuredSurfaceHandler = ({ element }) => {
  exact(element, ["id", "xx", "xy", "yx", "yy", "tx", "ty"], ["id", "xx", "xy", "yx", "yy", "tx", "ty"]);
  const id = text(element, "id");
  const mapping = sealSpatialMap2D({
    xx: number(element, "xx"), xy: number(element, "xy"),
    yx: number(element, "yx"), yy: number(element, "yy"),
    tx: number(element, "tx"), ty: number(element, "ty"),
  });
  return { records: [{ id, type: spatialTypes.map2D, value: (mapping as unknown as CanonicalValue), range: element.range }], components: [] };
};

function frameSurface(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
  program: FrameEdgesProgram | AnchoredFrameProgram,
  programType: SurfaceResolvedReference["type"],
  fragment: typeof frameEdgesFragment | typeof anchoredFrameFragment,
) {
  const id = text(element, "id");
  const parent = parentFrame(element, reference(element, "within", resolveReference));
  const programId = `${id}.__program`;
  return {
    records: [{ id: programId, type: programType, value: (program as unknown as CanonicalValue), range: element.range }],
    components: [
      { id, fragment, inputs: { parent, program: { kind: "record" as const, id: programId } }, outputs: { frame: id }, range: element.range },
    ],
    exports: [id],
  };
}

export const decodeFrameSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "within", "left", "top", "right", "bottom"], ["id", "within", "left", "top", "right", "bottom"]);
  return frameSurface(element, resolveReference, {
    left: length(element, "left"), top: length(element, "top"),
    right: length(element, "right"), bottom: length(element, "bottom"),
  }, spatialTypes.frameEdgesProgram, frameEdgesFragment);
};

export const decodeAnchoredFrameSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "within", "x", "y", "width", "height", "anchor", "offset-x", "offset-y"], ["id", "within", "x", "y", "width", "height", "anchor"]);
  return frameSurface(element, resolveReference, {
    x: length(element, "x"), y: length(element, "y"),
    width: length(element, "width"), height: length(element, "height"), anchor: anchor(element),
    offsetPx: { x: number(element, "offset-x", 0), y: number(element, "offset-y", 0) },
  }, spatialTypes.anchoredFrameProgram, anchoredFrameFragment);
};

function aspectExtent(
  id: string,
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): { readonly ref: AuthorValueRef; readonly records: readonly { readonly id: string; readonly type: typeof spatialTypes.extent; readonly value: CanonicalValue; readonly range: StructuredElement["range"] }[] } {
  const raw = element.attributes.aspect;
  if (typeof raw === "object" && raw.kind === "reference") {
    const resolved = resolveReference(raw.path);
    if (resolved === undefined || !sameType(resolved.type, spatialTypes.extent)) throw new Error(`${element.name}.aspect must reference IntrinsicExtent.`);
    return { ref: resolved.ref, records: [] };
  }
  const source = text(element, "aspect");
  const match = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/u.exec(source);
  if (match === null) throw new Error(`${element.name}.aspect must be IntrinsicExtent or width/height.`);
  const extent = sealIntrinsicExtent({ widthPx: Number(match[1]), heightPx: Number(match[2]) });
  const extentId = `${id}.__extent`;
  return { ref: { kind: "record", id: extentId }, records: [{ id: extentId, type: spatialTypes.extent, value: (extent as unknown as CanonicalValue), range: element.range }] };
}

export const decodeAspectFrameSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "within", "x", "y", "width", "height", "aspect", "anchor", "offset-x", "offset-y"], ["id", "within", "x", "y", "aspect", "anchor"]);
  const hasWidth = element.attributes.width !== undefined;
  const hasHeight = element.attributes.height !== undefined;
  if (hasWidth === hasHeight) throw new Error(`${element.name} requires exactly one of width or height.`);
  const id = text(element, "id");
  const parent = parentFrame(element, reference(element, "within", resolveReference));
  const extent = aspectExtent(id, element, resolveReference);
  const program: AspectFrameProgram = {
    x: length(element, "x"), y: length(element, "y"),
    primary: hasWidth ? "width" : "height", size: length(element, hasWidth ? "width" : "height"),
    anchor: anchor(element), offsetPx: { x: number(element, "offset-x", 0), y: number(element, "offset-y", 0) },
  };
  const programId = `${id}.__program`;
  return {
    records: [
      ...extent.records,
      { id: programId, type: spatialTypes.aspectFrameProgram, value: (program as unknown as CanonicalValue), range: element.range },
    ],
    components: [
      { id, fragment: aspectFrameFragment, inputs: { parent, extent: extent.ref, program: { kind: "record" as const, id: programId } }, outputs: { frame: id }, range: element.range },
    ],
    exports: [id],
  };
};
