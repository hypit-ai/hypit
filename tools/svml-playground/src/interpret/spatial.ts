import type { StructuredElement } from "@narratage/markup";
import {
  anchoredFrame,
  aspectFrame,
  canvasFrame,
  frameFromEdges,
  sealCanvasSpace,
  sealIntrinsicExtent,
  spatialTypes,
} from "@narratage/spatial";
import type {
  CanvasSpace,
  IntrinsicExtent,
  SpatialAnchor,
  SpatialFrame,
  SpatialLength,
} from "@narratage/spatial";

import { optionalText, positiveInteger, referencePath, requireReferencePath, text } from "./attributes.js";
import { sameType, Scope } from "./scope.js";

const LENGTH = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%)$/u;
const RATIO = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/u;
const ANCHORS = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

/** The same length grammar `@narratage/spatial`'s own Surface decoder accepts. */
function length(element: StructuredElement, name: string): SpatialLength {
  const match = LENGTH.exec(text(element, name));
  if (match === null) throw new Error(`${element.name}.${name} must use px or %.`);
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be finite.`);
  return { unit: match[2] === "%" ? "percent" : "px", value };
}

function offset(element: StructuredElement, name: string): number {
  const raw = optionalText(element, name);
  if (raw === undefined) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be finite.`);
  return value;
}

function anchorOf(element: StructuredElement): SpatialAnchor {
  const value = text(element, "anchor") as SpatialAnchor;
  if (!ANCHORS.includes(value)) throw new Error(`${element.name}.anchor is invalid.`);
  return value;
}

/** `aspect` is either an IntrinsicExtent reference or a `width/height` ratio. */
function aspectExtent(element: StructuredElement, scope: Scope): IntrinsicExtent {
  const path = referencePath(element, "aspect");
  if (path !== undefined) {
    const entry = scope.require(path, `${element.name}.aspect`);
    if (!sameType(entry.type, spatialTypes.extent)) {
      throw new Error(`${element.name}.aspect must reference IntrinsicExtent.`);
    }
    return entry.value as IntrinsicExtent;
  }
  const match = RATIO.exec(text(element, "aspect"));
  if (match === null) throw new Error(`${element.name}.aspect must be IntrinsicExtent or width/height.`);
  return sealIntrinsicExtent({
    contract: "svml.intrinsic-extent@1",
    widthPx: Number(match[1]),
    heightPx: Number(match[2]),
  });
}

export function interpretCanvas(element: StructuredElement, scope: Scope): CanvasSpace {
  const canvas = sealCanvasSpace({
    contract: "svml.canvas-space@1",
    widthPx: positiveInteger(element, "width"),
    heightPx: positiveInteger(element, "height"),
    origin: "top-left",
    xDirection: "right",
    yDirection: "down",
    pixelAspect: "square",
  });
  scope.define(text(element, "id"), spatialTypes.canvas, canvas, element.range);
  return canvas;
}

/** Resolve `within`, which may name the Canvas or an earlier Frame. */
function parentFrame(element: StructuredElement, scope: Scope): SpatialFrame {
  const within = scope.require(requireReferencePath(element, "within"), `${element.name}.within`);
  if (sameType(within.type, spatialTypes.canvas)) return canvasFrame(within.value as CanvasSpace);
  if (sameType(within.type, spatialTypes.frame)) return within.value as SpatialFrame;
  throw new Error(`${element.name}.within must reference CanvasSpace or SpatialFrame.`);
}

export function interpretFrame(element: StructuredElement, scope: Scope): SpatialFrame {
  // `right` and `bottom` are edge positions, not insets: a Frame spanning the
  // middle 80% of its parent is left="10%" right="90%".
  const frame = frameFromEdges(parentFrame(element, scope), {
    contract: "svml.frame-edges-program@1",
    left: length(element, "left"),
    top: length(element, "top"),
    right: length(element, "right"),
    bottom: length(element, "bottom"),
  });
  scope.define(text(element, "id"), spatialTypes.frame, frame, element.range);
  return frame;
}

export function interpretAnchoredFrame(element: StructuredElement, scope: Scope): SpatialFrame {
  const frame = anchoredFrame(parentFrame(element, scope), {
    contract: "svml.anchored-frame-program@1",
    x: length(element, "x"),
    y: length(element, "y"),
    width: length(element, "width"),
    height: length(element, "height"),
    anchor: anchorOf(element),
    offsetPx: { x: offset(element, "offset-x"), y: offset(element, "offset-y") },
  });
  scope.define(text(element, "id"), spatialTypes.frame, frame, element.range);
  return frame;
}

export function interpretAspectFrame(element: StructuredElement, scope: Scope): SpatialFrame {
  const hasWidth = element.attributes.width !== undefined;
  const hasHeight = element.attributes.height !== undefined;
  if (hasWidth === hasHeight) {
    throw new Error(`${element.name} requires exactly one of width or height.`);
  }
  const frame = aspectFrame(parentFrame(element, scope), aspectExtent(element, scope), {
    contract: "svml.aspect-frame-program@1",
    x: length(element, "x"),
    y: length(element, "y"),
    primary: hasWidth ? "width" : "height",
    size: length(element, hasWidth ? "width" : "height"),
    anchor: anchorOf(element),
    offsetPx: { x: offset(element, "offset-x"), y: offset(element, "offset-y") },
  });
  scope.define(text(element, "id"), spatialTypes.frame, frame, element.range);
  return frame;
}
