import { digestOf } from "@narratage/protocol";

import type {
  AnchoredFrameProgram,
  AspectFrameProgram,
  CanvasSpace,
  ContentFit,
  FittedContent,
  FrameEdgesProgram,
  IntrinsicExtent,
  SpatialAnchor,
  SpatialFrame,
  SpatialLength,
  SpatialPath,
  SpatialPoint,
} from "./types.js";

export const spatialImplementationDigests = {
  canvasFrame: digestOf("@narratage/spatial/canvas-frame@1"),
  frameEdges: digestOf("@narratage/spatial/frame-edges@1"),
  anchoredFrame: digestOf("@narratage/spatial/anchored-frame@1"),
  aspectFrame: digestOf("@narratage/spatial/aspect-frame@1"),
  fitContent: digestOf("@narratage/spatial/fit-content@1"),
} as const;

export const spatialValidatorDigests = {
  canvas: digestOf("@narratage/spatial/validate-canvas@1"),
  point: digestOf("@narratage/spatial/validate-point@1"),
  frame: digestOf("@narratage/spatial/validate-frame@1"),
  path: digestOf("@narratage/spatial/validate-path@1"),
  extent: digestOf("@narratage/spatial/validate-extent@1"),
  fit: digestOf("@narratage/spatial/validate-fit@1"),
  fitted: digestOf("@narratage/spatial/validate-fitted@1"),
} as const;

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function positive(value: number, label: string): void {
  finite(value, label);
  if (value <= 0) throw new Error(`${label} must be positive.`);
}

export function assertCanvasSpace(value: CanvasSpace): void {
  if (value.contract !== "svml.canvas-space@1"
    || !Number.isSafeInteger(value.widthPx) || value.widthPx <= 0
    || !Number.isSafeInteger(value.heightPx) || value.heightPx <= 0
    || value.origin !== "top-left" || value.xDirection !== "right"
    || value.yDirection !== "down" || value.pixelAspect !== "square") {
    throw new Error("CanvasSpace is invalid.");
  }
}

export function assertSpatialPoint(value: SpatialPoint): void {
  if (value.contract !== "svml.spatial-point@1") throw new Error("Unsupported SpatialPoint contract.");
  finite(value.xPx, "SpatialPoint.xPx");
  finite(value.yPx, "SpatialPoint.yPx");
}

export function assertSpatialFrame(value: SpatialFrame): void {
  if (value.contract !== "svml.spatial-frame@1") throw new Error("Unsupported SpatialFrame contract.");
  finite(value.xPx, "SpatialFrame.xPx");
  finite(value.yPx, "SpatialFrame.yPx");
  positive(value.widthPx, "SpatialFrame.widthPx");
  positive(value.heightPx, "SpatialFrame.heightPx");
}

export function assertIntrinsicExtent(value: IntrinsicExtent): void {
  if (value.contract !== "svml.intrinsic-extent@1") throw new Error("Unsupported IntrinsicExtent contract.");
  positive(value.widthPx, "IntrinsicExtent.widthPx");
  positive(value.heightPx, "IntrinsicExtent.heightPx");
}

function assertNormalizedPoint(value: { readonly x: number; readonly y: number }, label: string): void {
  finite(value.x, `${label}.x`);
  finite(value.y, `${label}.y`);
  if (value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) {
    throw new Error(`${label} must lie inside [0, 1].`);
  }
}

export function assertContentFit(value: ContentFit): void {
  if (value.contract !== "svml.content-fit@1") throw new Error("Unsupported ContentFit contract.");
  if (!["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"].includes(value.sizing)) {
    throw new Error("ContentFit.sizing is invalid.");
  }
  assertNormalizedPoint(value.framePoint, "ContentFit.framePoint");
  assertNormalizedPoint(value.contentPoint, "ContentFit.contentPoint");
  finite(value.offsetPx.x, "ContentFit.offsetPx.x");
  finite(value.offsetPx.y, "ContentFit.offsetPx.y");
  if (value.constraint !== "bounded" && value.constraint !== "free") throw new Error("ContentFit.constraint is invalid.");
}

export function assertFittedContent(value: FittedContent): void {
  if (value.contract !== "svml.fitted-content@1") throw new Error("Unsupported FittedContent contract.");
  assertSpatialFrame(value.contentFrame);
}

function commandNumbers(command: SpatialPath["commands"][number]): readonly number[] {
  switch (command.kind) {
    case "move":
    case "line": return [command.xPx, command.yPx];
    case "quadratic": return [command.controlX, command.controlY, command.xPx, command.yPx];
    case "cubic": return [command.control1X, command.control1Y, command.control2X, command.control2Y, command.xPx, command.yPx];
    case "close": return [];
  }
}

export function assertSpatialPath(value: SpatialPath): void {
  if (value.contract !== "svml.spatial-path@1" || value.commands.length < 2 || value.commands[0]?.kind !== "move") {
    throw new Error("SpatialPath must begin with move and contain drawable commands.");
  }
  let open = true;
  let drawable = false;
  for (const [index, command] of value.commands.entries()) {
    for (const coordinate of commandNumbers(command)) finite(coordinate, `SpatialPath command ${index}`);
    if (command.kind === "move") {
      open = true;
    } else if (command.kind === "close") {
      if (!open) throw new Error("SpatialPath cannot close an already closed subpath.");
      open = false;
    } else {
      if (!open) throw new Error("SpatialPath requires move after a closed subpath.");
      drawable = true;
    }
  }
  if (!drawable) throw new Error("SpatialPath contains no drawable segment.");
}

function length(value: SpatialLength, dimension: number, label: string): number {
  finite(value.value, label);
  if (value.unit === "px") return value.value;
  if (value.unit === "percent") return dimension * value.value / 100;
  throw new Error(`${label} uses an unsupported unit.`);
}

function anchorPoint(anchor: SpatialAnchor): { readonly x: number; readonly y: number } {
  const [vertical, horizontal] = anchor === "center" ? ["middle", "center"] : anchor.split("-");
  const x = horizontal === "left" ? 0 : horizontal === "center" ? 0.5 : horizontal === "right" ? 1 : undefined;
  const y = vertical === "top" ? 0 : vertical === "middle" ? 0.5 : vertical === "bottom" ? 1 : undefined;
  if (x === undefined || y === undefined) throw new Error(`Spatial anchor ${anchor} is invalid.`);
  return { x, y };
}

function sealFrame(value: Omit<SpatialFrame, "contract">): SpatialFrame {
  const frame = { contract: "svml.spatial-frame@1" as const, ...value };
  assertSpatialFrame(frame);
  return frame;
}

export function canvasFrame(canvas: CanvasSpace): SpatialFrame {
  assertCanvasSpace(canvas);
  return sealFrame({ xPx: 0, yPx: 0, widthPx: canvas.widthPx, heightPx: canvas.heightPx });
}

export function frameFromEdges(parent: SpatialFrame, program: FrameEdgesProgram): SpatialFrame {
  assertSpatialFrame(parent);
  if (program.contract !== "svml.frame-edges-program@1") throw new Error("Unsupported FrameEdgesProgram contract.");
  const left = parent.xPx + length(program.left, parent.widthPx, "Frame left");
  const right = parent.xPx + length(program.right, parent.widthPx, "Frame right");
  const top = parent.yPx + length(program.top, parent.heightPx, "Frame top");
  const bottom = parent.yPx + length(program.bottom, parent.heightPx, "Frame bottom");
  return sealFrame({ xPx: left, yPx: top, widthPx: right - left, heightPx: bottom - top });
}

export function anchoredFrame(parent: SpatialFrame, program: AnchoredFrameProgram): SpatialFrame {
  assertSpatialFrame(parent);
  if (program.contract !== "svml.anchored-frame-program@1") throw new Error("Unsupported AnchoredFrameProgram contract.");
  const widthPx = length(program.width, parent.widthPx, "AnchoredFrame width");
  const heightPx = length(program.height, parent.heightPx, "AnchoredFrame height");
  positive(widthPx, "AnchoredFrame width");
  positive(heightPx, "AnchoredFrame height");
  const targetX = parent.xPx + length(program.x, parent.widthPx, "AnchoredFrame x");
  const targetY = parent.yPx + length(program.y, parent.heightPx, "AnchoredFrame y");
  finite(program.offsetPx.x, "AnchoredFrame offset x");
  finite(program.offsetPx.y, "AnchoredFrame offset y");
  const anchor = anchorPoint(program.anchor);
  return sealFrame({
    xPx: targetX - widthPx * anchor.x + program.offsetPx.x,
    yPx: targetY - heightPx * anchor.y + program.offsetPx.y,
    widthPx,
    heightPx,
  });
}

export function aspectFrame(parent: SpatialFrame, extent: IntrinsicExtent, program: AspectFrameProgram): SpatialFrame {
  assertSpatialFrame(parent);
  assertIntrinsicExtent(extent);
  if (program.contract !== "svml.aspect-frame-program@1") throw new Error("Unsupported AspectFrameProgram contract.");
  const primary = length(program.size, program.primary === "width" ? parent.widthPx : parent.heightPx, "AspectFrame size");
  positive(primary, "AspectFrame size");
  const widthPx = program.primary === "width" ? primary : primary * extent.widthPx / extent.heightPx;
  const heightPx = program.primary === "height" ? primary : primary * extent.heightPx / extent.widthPx;
  return anchoredFrame(parent, {
    contract: "svml.anchored-frame-program@1",
    x: program.x,
    y: program.y,
    width: { unit: "px", value: widthPx },
    height: { unit: "px", value: heightPx },
    anchor: program.anchor,
    offsetPx: program.offsetPx,
  });
}

function boundedCoordinate(position: number, contentSize: number, frameStart: number, frameSize: number): number {
  const first = frameStart;
  const second = frameStart + frameSize - contentSize;
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  return Math.min(high, Math.max(low, position));
}

export function fitContent(frame: SpatialFrame, extent: IntrinsicExtent, fit: ContentFit): FittedContent {
  assertSpatialFrame(frame);
  assertIntrinsicExtent(extent);
  assertContentFit(fit);
  const containScale = Math.min(frame.widthPx / extent.widthPx, frame.heightPx / extent.heightPx);
  const scale = fit.sizing === "contain" ? containScale
    : fit.sizing === "cover" ? Math.max(frame.widthPx / extent.widthPx, frame.heightPx / extent.heightPx)
    : fit.sizing === "fit-width" ? frame.widthPx / extent.widthPx
    : fit.sizing === "fit-height" ? frame.heightPx / extent.heightPx
    : fit.sizing === "native" ? 1
    : fit.sizing === "scale-down" ? Math.min(1, containScale)
    : undefined;
  const widthPx = fit.sizing === "stretch" ? frame.widthPx : extent.widthPx * (scale ?? 1);
  const heightPx = fit.sizing === "stretch" ? frame.heightPx : extent.heightPx * (scale ?? 1);
  let xPx = frame.xPx + frame.widthPx * fit.framePoint.x - widthPx * fit.contentPoint.x + fit.offsetPx.x;
  let yPx = frame.yPx + frame.heightPx * fit.framePoint.y - heightPx * fit.contentPoint.y + fit.offsetPx.y;
  if (fit.constraint === "bounded") {
    xPx = boundedCoordinate(xPx, widthPx, frame.xPx, frame.widthPx);
    yPx = boundedCoordinate(yPx, heightPx, frame.yPx, frame.heightPx);
  }
  const result: FittedContent = {
    contract: "svml.fitted-content@1",
    contentFrame: sealFrame({ xPx, yPx, widthPx, heightPx }),
  };
  assertFittedContent(result);
  return result;
}

export function sealCanvasSpace(value: CanvasSpace): CanvasSpace { assertCanvasSpace(value); return structuredClone(value); }
export function sealSpatialPoint(value: SpatialPoint): SpatialPoint { assertSpatialPoint(value); return structuredClone(value); }
export function sealSpatialFrame(value: SpatialFrame): SpatialFrame { assertSpatialFrame(value); return structuredClone(value); }
export function sealSpatialPath(value: SpatialPath): SpatialPath { assertSpatialPath(value); return structuredClone(value); }
export function sealIntrinsicExtent(value: IntrinsicExtent): IntrinsicExtent { assertIntrinsicExtent(value); return structuredClone(value); }
export function sealContentFit(value: ContentFit): ContentFit { assertContentFit(value); return structuredClone(value); }
export function sealFittedContent(value: FittedContent): FittedContent { assertFittedContent(value); return structuredClone(value); }
