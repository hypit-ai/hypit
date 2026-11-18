import type { StudioInspectorField } from "@hypit/studio-companion";
import type { StudioSourceView } from "./shared.js";
import { parameterNumber } from "./parameter-values.js";

export type FrameResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type FrameGesture = "move" | FrameResizeHandle;

export const frameResizeHandles: readonly FrameResizeHandle[] = [
  "nw", "n", "ne", "e", "se", "s", "sw", "w",
];

export type SpatialBox = {
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
};

export type FrameLengthField = {
  readonly id: string;
  readonly binding: string;
  readonly value: number;
  readonly suffix: string;
};

export type FrameEditModel =
  | {
      readonly kind: "edges";
      readonly parent: SpatialBox;
      readonly baseBox: SpatialBox;
      readonly canMoveX: boolean;
      readonly canMoveY: boolean;
      readonly handles: ReadonlySet<FrameResizeHandle>;
      readonly left?: FrameLengthField;
      readonly top?: FrameLengthField;
      readonly right?: FrameLengthField;
      readonly bottom?: FrameLengthField;
    }
  | {
      readonly kind: "anchored";
      readonly parent: SpatialBox;
      readonly baseBox: SpatialBox;
      readonly anchor: { readonly x: number; readonly y: number };
      readonly canMoveX: boolean;
      readonly canMoveY: boolean;
      readonly handles: ReadonlySet<FrameResizeHandle>;
      readonly x?: FrameLengthField;
      readonly y?: FrameLengthField;
      readonly width?: FrameLengthField;
      readonly height?: FrameLengthField;
    }
  | {
      readonly kind: "aspect";
      readonly parent: SpatialBox;
      readonly baseBox: SpatialBox;
      readonly anchor: { readonly x: number; readonly y: number };
      readonly primary: "width" | "height";
      readonly canMoveX: boolean;
      readonly canMoveY: boolean;
      readonly handles: ReadonlySet<FrameResizeHandle>;
      readonly x?: FrameLengthField;
      readonly y?: FrameLengthField;
      readonly size: FrameLengthField;
    };

export type SnapGuide =
  | {
      readonly axis: "x";
      readonly positionPx: number;
      readonly fromPx: number;
      readonly toPx: number;
    }
  | {
      readonly axis: "y";
      readonly positionPx: number;
      readonly fromPx: number;
      readonly toPx: number;
    };

export type GapMeasurement = {
  readonly axis: "x" | "y";
  readonly crossPx: number;
  readonly fromPx: number;
  readonly toPx: number;
  readonly distancePx: number;
};

export type FrameParameterEdit = {
  readonly parameterId: string;
  readonly binding: string;
  readonly value: number;
  readonly suffix: string;
};

export type FrameGestureSolution = {
  readonly box: SpatialBox;
  readonly guides: readonly SnapGuide[];
  readonly gap?: GapMeasurement;
  readonly edits: readonly FrameParameterEdit[];
};

const MIN_FRAME_PX = 8;

export function parseSpatialAnchor(anchor: string | undefined): { readonly x: number; readonly y: number } {
  if (anchor === undefined || anchor === "top-left") return { x: 0, y: 0 };
  if (anchor === "center") return { x: 0.5, y: 0.5 };
  const [vertical, horizontal] = anchor.split("-");
  const x = horizontal === "left" ? 0 : horizontal === "center" ? 0.5 : horizontal === "right" ? 1 : 0;
  const y = vertical === "top" ? 0 : vertical === "middle" ? 0.5 : vertical === "bottom" ? 1 : 0;
  return { x, y };
}

type ParsedTag = {
  readonly attributes: Readonly<Record<string, string>>;
  readonly references: Readonly<Record<string, string>>;
};

function parseTagSlice(tagText: string): ParsedTag {
  const attributes: Record<string, string> = {};
  const references: Record<string, string> = {};
  const attrPattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/gu;
  for (const match of tagText.matchAll(attrPattern)) {
    const name = match[1];
    if (name === undefined) continue;
    const quoted = match[2] ?? match[3];
    if (quoted !== undefined) attributes[name] = quoted;
    else if (match[4] !== undefined) references[name] = match[4].trim();
  }
  return { attributes, references };
}

function findEnclosingTag(text: string, offset: number): ParsedTag | undefined {
  const start = text.lastIndexOf("<", offset);
  if (start < 0) return undefined;
  const end = text.indexOf(">", offset);
  if (end < 0) return undefined;
  return parseTagSlice(text.slice(start, end + 1));
}

function findTagById(files: readonly StudioSourceView[], id: string): ParsedTag | undefined {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`<[^>]+\\bid\\s*=\\s*["']${escaped}["'][^>]*>`, "u");
  for (const file of files) {
    if (file.language !== "svml") continue;
    const match = pattern.exec(file.text);
    if (match !== null) return parseTagSlice(match[0]);
  }
  return undefined;
}

function evalLength(raw: string | undefined, spanPx: number): number | undefined {
  if (raw === undefined) return undefined;
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%)$/u.exec(raw.trim());
  if (match === null) return undefined;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return undefined;
  return match[2] === "%" ? spanPx * num / 100 : num;
}

function resolveBoxFromTag(
  tag: ParsedTag,
  files: readonly StudioSourceView[],
  canvas: { readonly width: number; readonly height: number },
  seen: ReadonlySet<string>,
): SpatialBox {
  const fullCanvas: SpatialBox = { xPx: 0, yPx: 0, widthPx: canvas.width, heightPx: canvas.height };
  const within = tag.references.within;
  const parent = (() => {
    if (within === undefined || within.endsWith(".bounds") || seen.has(within)) return fullCanvas;
    const parentTag = findTagById(files, within);
    if (parentTag === undefined) return fullCanvas;
    return resolveBoxFromTag(parentTag, files, canvas, new Set([...seen, within]));
  })();
  const left = evalLength(tag.attributes.left, parent.widthPx);
  const top = evalLength(tag.attributes.top, parent.heightPx);
  const right = evalLength(tag.attributes.right, parent.widthPx);
  const bottom = evalLength(tag.attributes.bottom, parent.heightPx);
  if (left !== undefined && top !== undefined && right !== undefined && bottom !== undefined && right > left && bottom > top) {
    return { xPx: parent.xPx + left, yPx: parent.yPx + top, widthPx: right - left, heightPx: bottom - top };
  }
  const x = evalLength(tag.attributes.x, parent.widthPx);
  const y = evalLength(tag.attributes.y, parent.heightPx);
  const width = evalLength(tag.attributes.width, parent.widthPx);
  const height = evalLength(tag.attributes.height, parent.heightPx);
  const anchor = parseSpatialAnchor(tag.attributes.anchor);
  const offsetX = tag.attributes["offset-x"] === undefined ? 0 : Number(tag.attributes["offset-x"]) || 0;
  const offsetY = tag.attributes["offset-y"] === undefined ? 0 : Number(tag.attributes["offset-y"]) || 0;
  if (x !== undefined && y !== undefined && width !== undefined && height !== undefined && width > 0 && height > 0) {
    return {
      xPx: parent.xPx + x - width * anchor.x + offsetX,
      yPx: parent.yPx + y - height * anchor.y + offsetY,
      widthPx: width,
      heightPx: height,
    };
  }
  return fullCanvas;
}

function inspectSourceFrameMeta(
  fields: readonly StudioInspectorField[],
  files: readonly StudioSourceView[] | undefined,
  canvas: { readonly width: number; readonly height: number },
): { readonly anchor?: string; readonly parent: SpatialBox } {
  const fullCanvas: SpatialBox = { xPx: 0, yPx: 0, widthPx: canvas.width, heightPx: canvas.height };
  if (files === undefined || files.length === 0) return { parent: fullCanvas };
  const frameField = fields.find((field) => field.binding?.startsWith("frame.") && field.edit !== undefined);
  const editSource = frameField?.edit?.source;
  if (editSource === undefined) return { parent: fullCanvas };
  const file = files.find((candidate) => candidate.path === editSource.path);
  if (file === undefined) return { parent: fullCanvas };
  const tag = findEnclosingTag(file.text, editSource.range.start);
  if (tag === undefined) return { parent: fullCanvas };
  const within = tag.references.within;
  const parent = within !== undefined && !within.endsWith(".bounds")
    ? (() => {
        const parentTag = findTagById(files, within);
        return parentTag === undefined ? fullCanvas : resolveBoxFromTag(parentTag, files, canvas, new Set([within]));
      })()
    : fullCanvas;
  return {
    parent,
    ...(tag.attributes.anchor === undefined ? {} : { anchor: tag.attributes.anchor }),
  };
}

function writableLengthField(fields: readonly StudioInspectorField[], binding: string): FrameLengthField | undefined {
  const field = fields.find((candidate) => candidate.binding === binding);
  if (field?.edit === undefined || field.control !== "number") return undefined;
  try {
    const parsed = parameterNumber(field.value, field.number);
    if (parsed.suffix !== "px" && parsed.suffix !== "%") return undefined;
    return { id: field.id, binding, value: parsed.value, suffix: parsed.suffix };
  } catch {
    return undefined;
  }
}

function hasDeclaredBinding(fields: readonly StudioInspectorField[], binding: string): boolean {
  return fields.some((candidate) => candidate.binding === binding);
}

export function resolveFrameEditModel(input: {
  readonly inspector: readonly StudioInspectorField[];
  readonly canvas: { readonly width: number; readonly height: number };
  readonly sourceFiles?: readonly StudioSourceView[];
  readonly drawnBox?: SpatialBox;
  readonly anchor?: string;
  readonly parent?: SpatialBox;
}): FrameEditModel | undefined {
  const { inspector, canvas, drawnBox } = input;
  if (drawnBox === undefined || drawnBox.widthPx <= 0 || drawnBox.heightPx <= 0) return undefined;
  const meta = inspectSourceFrameMeta(inspector, input.sourceFiles, canvas);
  const parent = input.parent ?? meta.parent;
  const baseBox = drawnBox;

  const left = writableLengthField(inspector, "frame.left");
  const top = writableLengthField(inspector, "frame.top");
  const right = writableLengthField(inspector, "frame.right");
  const bottom = writableLengthField(inspector, "frame.bottom");

  const hasEdges = hasDeclaredBinding(inspector, "frame.left")
    || hasDeclaredBinding(inspector, "frame.top")
    || hasDeclaredBinding(inspector, "frame.right")
    || hasDeclaredBinding(inspector, "frame.bottom");

  if (hasEdges) {
    const handles = new Set<FrameResizeHandle>();
    if (left !== undefined) handles.add("w");
    if (right !== undefined) handles.add("e");
    if (top !== undefined) handles.add("n");
    if (bottom !== undefined) handles.add("s");
    if (left !== undefined && top !== undefined) handles.add("nw");
    if (right !== undefined && top !== undefined) handles.add("ne");
    if (right !== undefined && bottom !== undefined) handles.add("se");
    if (left !== undefined && bottom !== undefined) handles.add("sw");
    const canMoveX = left !== undefined && right !== undefined;
    const canMoveY = top !== undefined && bottom !== undefined;
    if (!canMoveX && !canMoveY && handles.size === 0) return undefined;
    return {
      kind: "edges",
      parent,
      baseBox,
      canMoveX,
      canMoveY,
      handles,
      ...(left === undefined ? {} : { left }),
      ...(top === undefined ? {} : { top }),
      ...(right === undefined ? {} : { right }),
      ...(bottom === undefined ? {} : { bottom }),
    };
  }

  const x = writableLengthField(inspector, "frame.x");
  const y = writableLengthField(inspector, "frame.y");
  const width = writableLengthField(inspector, "frame.width");
  const height = writableLengthField(inspector, "frame.height");
  const hasWidth = hasDeclaredBinding(inspector, "frame.width");
  const hasHeight = hasDeclaredBinding(inspector, "frame.height");

  const inspectorAnchor = inspector.find((field) => field.binding === "frame.anchor")?.value;
  const anchorText = input.anchor ?? meta.anchor ?? (typeof inspectorAnchor === "string" ? inspectorAnchor : undefined);
  const anchor = parseSpatialAnchor(anchorText);

  if (hasWidth !== hasHeight) {
    const primary = hasWidth ? "width" : "height";
    const size = primary === "width" ? width : height;
    const canMoveX = x !== undefined;
    const canMoveY = y !== undefined;
    const handles = new Set<FrameResizeHandle>();
    if (size !== undefined) {
      const canPinX = (pin: number): boolean => Math.abs(anchor.x - pin) < 1e-6 || x !== undefined;
      const canPinY = (pin: number): boolean => Math.abs(anchor.y - pin) < 1e-6 || y !== undefined;
      if (canPinX(1) && canPinY(1)) handles.add("nw");
      if (canPinX(0) && canPinY(1)) handles.add("ne");
      if (canPinX(0) && canPinY(0)) handles.add("se");
      if (canPinX(1) && canPinY(0)) handles.add("sw");
      if (canPinX(0)) handles.add("e");
      if (canPinX(1)) handles.add("w");
      if (canPinY(0)) handles.add("s");
      if (canPinY(1)) handles.add("n");
      return {
        kind: "aspect",
        parent,
        baseBox,
        anchor,
        primary,
        canMoveX,
        canMoveY,
        handles,
        ...(x === undefined ? {} : { x }),
        ...(y === undefined ? {} : { y }),
        size,
      };
    }
    if (!canMoveX && !canMoveY) return undefined;
    return {
      kind: "anchored",
      parent,
      baseBox,
      anchor,
      canMoveX,
      canMoveY,
      handles,
      ...(x === undefined ? {} : { x }),
      ...(y === undefined ? {} : { y }),
    };
  }

  const handles = new Set<FrameResizeHandle>();
  const canEast = width !== undefined && (Math.abs(anchor.x - 0) < 1e-6 || x !== undefined);
  const canWest = width !== undefined && (Math.abs(anchor.x - 1) < 1e-6 || x !== undefined);
  const canSouth = height !== undefined && (Math.abs(anchor.y - 0) < 1e-6 || y !== undefined);
  const canNorth = height !== undefined && (Math.abs(anchor.y - 1) < 1e-6 || y !== undefined);
  if (canEast) handles.add("e");
  if (canWest) handles.add("w");
  if (canSouth) handles.add("s");
  if (canNorth) handles.add("n");
  if (canWest && canNorth) handles.add("nw");
  if (canEast && canNorth) handles.add("ne");
  if (canEast && canSouth) handles.add("se");
  if (canWest && canSouth) handles.add("sw");
  const canMoveX = x !== undefined;
  const canMoveY = y !== undefined;
  if (!canMoveX && !canMoveY && handles.size === 0) return undefined;
  return {
    kind: "anchored",
    parent,
    baseBox,
    anchor,
    canMoveX,
    canMoveY,
    handles,
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
}

type SnapCandidateLine = {
  readonly value: number;
  readonly spanStart: number;
  readonly spanEnd: number;
};

function buildSnapLines(
  canvas: { readonly width: number; readonly height: number },
  parent: SpatialBox,
  siblings: readonly SpatialBox[],
): { readonly xLines: readonly SnapCandidateLine[]; readonly yLines: readonly SnapCandidateLine[] } {
  const xLines: SnapCandidateLine[] = [
    { value: 0, spanStart: 0, spanEnd: canvas.height },
    { value: canvas.width / 2, spanStart: 0, spanEnd: canvas.height },
    { value: canvas.width, spanStart: 0, spanEnd: canvas.height },
  ];
  const yLines: SnapCandidateLine[] = [
    { value: 0, spanStart: 0, spanEnd: canvas.width },
    { value: canvas.height / 2, spanStart: 0, spanEnd: canvas.width },
    { value: canvas.height, spanStart: 0, spanEnd: canvas.width },
  ];
  if (parent.xPx !== 0 || parent.yPx !== 0 || parent.widthPx !== canvas.width || parent.heightPx !== canvas.height) {
    xLines.push(
      { value: parent.xPx, spanStart: parent.yPx, spanEnd: parent.yPx + parent.heightPx },
      { value: parent.xPx + parent.widthPx / 2, spanStart: parent.yPx, spanEnd: parent.yPx + parent.heightPx },
      { value: parent.xPx + parent.widthPx, spanStart: parent.yPx, spanEnd: parent.yPx + parent.heightPx },
    );
    yLines.push(
      { value: parent.yPx, spanStart: parent.xPx, spanEnd: parent.xPx + parent.widthPx },
      { value: parent.yPx + parent.heightPx / 2, spanStart: parent.xPx, spanEnd: parent.xPx + parent.widthPx },
      { value: parent.yPx + parent.heightPx, spanStart: parent.xPx, spanEnd: parent.xPx + parent.widthPx },
    );
  }
  for (const box of siblings) {
    if (Math.abs(box.xPx) < 0.5 && Math.abs(box.yPx) < 0.5
      && Math.abs(box.widthPx - canvas.width) < 0.5 && Math.abs(box.heightPx - canvas.height) < 0.5) {
      continue;
    }
    xLines.push(
      { value: box.xPx, spanStart: box.yPx, spanEnd: box.yPx + box.heightPx },
      { value: box.xPx + box.widthPx / 2, spanStart: box.yPx, spanEnd: box.yPx + box.heightPx },
      { value: box.xPx + box.widthPx, spanStart: box.yPx, spanEnd: box.yPx + box.heightPx },
    );
    yLines.push(
      { value: box.yPx, spanStart: box.xPx, spanEnd: box.xPx + box.widthPx },
      { value: box.yPx + box.heightPx / 2, spanStart: box.xPx, spanEnd: box.xPx + box.widthPx },
      { value: box.yPx + box.heightPx, spanStart: box.xPx, spanEnd: box.xPx + box.widthPx },
    );
  }
  return { xLines, yLines };
}

function snapCoordinate(
  queries: readonly number[],
  lines: readonly SnapCandidateLine[],
  thresholdPx: number,
): { readonly delta: number; readonly matched?: SnapCandidateLine } {
  if (thresholdPx <= 0) return { delta: 0 };
  let bestDelta = 0;
  let bestDistance = thresholdPx + 1e-9;
  let matched: SnapCandidateLine | undefined;
  for (const query of queries) {
    for (const line of lines) {
      const delta = line.value - query;
      const distance = Math.abs(delta);
      if (distance <= thresholdPx && distance < bestDistance) {
        bestDistance = distance;
        bestDelta = delta;
        matched = line;
      }
    }
  }
  return matched === undefined ? { delta: 0 } : { delta: bestDelta, matched };
}

function nearestGapMeasurement(
  box: SpatialBox,
  siblings: readonly SpatialBox[],
  canvas: { readonly width: number; readonly height: number },
): GapMeasurement | undefined {
  let best: GapMeasurement | undefined;
  for (const sibling of siblings) {
    if (Math.abs(sibling.xPx) < 0.5 && Math.abs(sibling.yPx) < 0.5
      && Math.abs(sibling.widthPx - canvas.width) < 0.5 && Math.abs(sibling.heightPx - canvas.height) < 0.5) {
      continue;
    }
    const overlapXStart = Math.max(box.xPx, sibling.xPx);
    const overlapXEnd = Math.min(box.xPx + box.widthPx, sibling.xPx + sibling.widthPx);
    if (overlapXEnd > overlapXStart) {
      const crossPx = (overlapXStart + overlapXEnd) / 2;
      const aboveGap = box.yPx - (sibling.yPx + sibling.heightPx);
      if (aboveGap >= 0.5 && (best === undefined || aboveGap < best.distancePx)) {
        best = { axis: "y", crossPx, fromPx: sibling.yPx + sibling.heightPx, toPx: box.yPx, distancePx: Math.round(aboveGap) };
      }
      const belowGap = sibling.yPx - (box.yPx + box.heightPx);
      if (belowGap >= 0.5 && (best === undefined || belowGap < best.distancePx)) {
        best = { axis: "y", crossPx, fromPx: box.yPx + box.heightPx, toPx: sibling.yPx, distancePx: Math.round(belowGap) };
      }
    }
    const overlapYStart = Math.max(box.yPx, sibling.yPx);
    const overlapYEnd = Math.min(box.yPx + box.heightPx, sibling.yPx + sibling.heightPx);
    if (overlapYEnd > overlapYStart) {
      const crossPx = (overlapYStart + overlapYEnd) / 2;
      const leftGap = box.xPx - (sibling.xPx + sibling.widthPx);
      if (leftGap >= 0.5 && (best === undefined || leftGap < best.distancePx)) {
        best = { axis: "x", crossPx, fromPx: sibling.xPx + sibling.widthPx, toPx: box.xPx, distancePx: Math.round(leftGap) };
      }
      const rightGap = sibling.xPx - (box.xPx + box.widthPx);
      if (rightGap >= 0.5 && (best === undefined || rightGap < best.distancePx)) {
        best = { axis: "x", crossPx, fromPx: box.xPx + box.widthPx, toPx: sibling.xPx, distancePx: Math.round(rightGap) };
      }
    }
  }
  return best !== undefined && best.distancePx <= 240 ? best : undefined;
}

function roundLengthValue(field: FrameLengthField, deltaPx: number, parentSpanPx: number, minimumPositive = false): number {
  if (field.suffix === "px") {
    const raw = field.value + deltaPx;
    const rounded = Number.isInteger(field.value) ? Math.round(raw) : Math.round(raw * 100) / 100;
    return minimumPositive ? Math.max(1, rounded) : rounded;
  }
  const raw = field.value + (deltaPx / Math.max(1, parentSpanPx)) * 100;
  const nearestInt = Math.round(raw);
  const rounded = Math.abs(raw - nearestInt) < 0.005 ? nearestInt : Math.round(raw * 100) / 100;
  return minimumPositive ? Math.max(0.01, rounded) : rounded;
}

function pushLengthEdit(
  edits: FrameParameterEdit[],
  field: FrameLengthField | undefined,
  deltaPx: number,
  parentSpanPx: number,
  minimumPositive = false,
): void {
  if (field === undefined || Math.abs(deltaPx) < 1e-4) return;
  const next = roundLengthValue(field, deltaPx, parentSpanPx, minimumPositive);
  if (next !== field.value) {
    edits.push({ parameterId: field.id, binding: field.binding, value: next, suffix: field.suffix });
  }
}

export function solveFrameGesture(input: {
  readonly model: FrameEditModel;
  readonly initialBox: SpatialBox;
  readonly gesture: FrameGesture;
  readonly deltaXPx: number;
  readonly deltaYPx: number;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly siblings?: readonly SpatialBox[];
  readonly snapThresholdPx?: number;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly disableSnap?: boolean;
}): FrameGestureSolution {
  const { model, initialBox, gesture, canvas } = input;
  const siblings = input.siblings ?? [];
  const threshold = input.disableSnap ? 0 : (input.snapThresholdPx ?? 6);
  const { xLines, yLines } = buildSnapLines(canvas, model.parent, siblings);
  const guides: SnapGuide[] = [];

  let nextBox = initialBox;

  if (gesture === "move") {
    let dx = model.canMoveX ? input.deltaXPx : 0;
    let dy = model.canMoveY ? input.deltaYPx : 0;
    if (input.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    let matchedX: SnapCandidateLine | undefined;
    let matchedY: SnapCandidateLine | undefined;
    if (model.canMoveX && threshold > 0) {
      const snapX = snapCoordinate(
        [initialBox.xPx + dx, initialBox.xPx + dx + initialBox.widthPx / 2, initialBox.xPx + dx + initialBox.widthPx],
        xLines,
        threshold,
      );
      dx += snapX.delta;
      matchedX = snapX.matched;
    }
    if (model.canMoveY && threshold > 0) {
      const snapY = snapCoordinate(
        [initialBox.yPx + dy, initialBox.yPx + dy + initialBox.heightPx / 2, initialBox.yPx + dy + initialBox.heightPx],
        yLines,
        threshold,
      );
      dy += snapY.delta;
      matchedY = snapY.matched;
    }
    nextBox = {
      xPx: initialBox.xPx + dx,
      yPx: initialBox.yPx + dy,
      widthPx: initialBox.widthPx,
      heightPx: initialBox.heightPx,
    };
    if (matchedX !== undefined) {
      guides.push({
        axis: "x",
        positionPx: matchedX.value,
        fromPx: Math.min(matchedX.spanStart, nextBox.yPx),
        toPx: Math.max(matchedX.spanEnd, nextBox.yPx + nextBox.heightPx),
      });
    }
    if (matchedY !== undefined) {
      guides.push({
        axis: "y",
        positionPx: matchedY.value,
        fromPx: Math.min(matchedY.spanStart, nextBox.xPx),
        toPx: Math.max(matchedY.spanEnd, nextBox.xPx + nextBox.widthPx),
      });
    }
  } else {
    const dirX = gesture.includes("w") ? -1 : gesture.includes("e") ? 1 : 0;
    const dirY = gesture.includes("n") ? -1 : gesture.includes("s") ? 1 : 0;
    const minW = MIN_FRAME_PX;
    const minH = MIN_FRAME_PX;
    const lockAspect = model.kind === "aspect" || Boolean(input.shiftKey);
    const canSymmetricX = model.canMoveX || (model.kind !== "edges" && Math.abs(model.anchor.x - 0.5) < 1e-6);
    const canSymmetricY = model.canMoveY || (model.kind !== "edges" && Math.abs(model.anchor.y - 0.5) < 1e-6);
    const fromCenter = Boolean(input.altKey) && (dirX === 0 || canSymmetricX) && (dirY === 0 || canSymmetricY);

    if (lockAspect) {
      const ratio = model.baseBox.widthPx / Math.max(1e-6, model.baseBox.heightPx);
      const pinX = fromCenter ? 0.5 : dirX === 1 ? 0 : dirX === -1 ? 1 : model.kind === "edges" ? 0.5 : model.anchor.x;
      const pinY = fromCenter ? 0.5 : dirY === 1 ? 0 : dirY === -1 ? 1 : model.kind === "edges" ? 0.5 : model.anchor.y;
      const factorX = dirX !== 0 && fromCenter ? 2 : 1;
      const factorY = dirY !== 0 && fromCenter ? 2 : 1;
      const minAspectW = Math.max(minW, minH * ratio);
      const minAspectH = minAspectW / ratio;

      let nextW = initialBox.widthPx;
      let nextH = initialBox.heightPx;
      const xDominates = dirY === 0 || (dirX !== 0
        && Math.abs(input.deltaXPx) / Math.max(1, initialBox.widthPx) >= Math.abs(input.deltaYPx) / Math.max(1, initialBox.heightPx));

      if (xDominates && dirX !== 0) {
        nextW = Math.max(minAspectW, initialBox.widthPx + dirX * input.deltaXPx * factorX);
        nextH = nextW / ratio;
      } else if (dirY !== 0) {
        nextH = Math.max(minAspectH, initialBox.heightPx + dirY * input.deltaYPx * factorY);
        nextW = nextH * ratio;
      }

      const anchorWorldX = initialBox.xPx + initialBox.widthPx * pinX;
      const anchorWorldY = initialBox.yPx + initialBox.heightPx * pinY;

      if (threshold > 0 && dirX !== 0) {
        const activeEdgeX = dirX === 1 ? anchorWorldX + nextW * (1 - pinX) : anchorWorldX - nextW * pinX;
        const snapX = snapCoordinate([activeEdgeX], xLines, threshold);
        if (snapX.matched !== undefined) {
          const snappedEdgeX = activeEdgeX + snapX.delta;
          const candidateW = dirX === 1
            ? (snappedEdgeX - anchorWorldX) / Math.max(1e-6, 1 - pinX)
            : (anchorWorldX - snappedEdgeX) / Math.max(1e-6, pinX);
          if (candidateW >= minAspectW) {
            nextW = candidateW;
            nextH = nextW / ratio;
            const topPx = anchorWorldY - nextH * pinY;
            guides.push({
              axis: "x",
              positionPx: snapX.matched.value,
              fromPx: Math.min(snapX.matched.spanStart, topPx),
              toPx: Math.max(snapX.matched.spanEnd, topPx + nextH),
            });
          }
        }
      } else if (threshold > 0 && dirY !== 0) {
        const activeEdgeY = dirY === 1 ? anchorWorldY + nextH * (1 - pinY) : anchorWorldY - nextH * pinY;
        const snapY = snapCoordinate([activeEdgeY], yLines, threshold);
        if (snapY.matched !== undefined) {
          const snappedEdgeY = activeEdgeY + snapY.delta;
          const candidateH = dirY === 1
            ? (snappedEdgeY - anchorWorldY) / Math.max(1e-6, 1 - pinY)
            : (anchorWorldY - snappedEdgeY) / Math.max(1e-6, pinY);
          if (candidateH >= minAspectH) {
            nextH = candidateH;
            nextW = nextH * ratio;
            const leftPx = anchorWorldX - nextW * pinX;
            guides.push({
              axis: "y",
              positionPx: snapY.matched.value,
              fromPx: Math.min(snapY.matched.spanStart, leftPx),
              toPx: Math.max(snapY.matched.spanEnd, leftPx + nextW),
            });
          }
        }
      }

      nextBox = {
        xPx: anchorWorldX - nextW * pinX,
        yPx: anchorWorldY - nextH * pinY,
        widthPx: nextW,
        heightPx: nextH,
      };
    } else {
      let left = initialBox.xPx;
      let right = initialBox.xPx + initialBox.widthPx;
      let top = initialBox.yPx;
      let bottom = initialBox.yPx + initialBox.heightPx;
      let matchedX: SnapCandidateLine | undefined;
      let matchedY: SnapCandidateLine | undefined;

      if (dirX === 1) {
        let candidateRight = right + input.deltaXPx;
        const snapX = snapCoordinate([candidateRight], xLines, threshold);
        candidateRight += snapX.delta;
        if (fromCenter) {
          const half = Math.max(minW / 2, candidateRight - (initialBox.xPx + initialBox.widthPx / 2));
          left = initialBox.xPx + initialBox.widthPx / 2 - half;
          right = initialBox.xPx + initialBox.widthPx / 2 + half;
        } else {
          right = Math.max(left + minW, candidateRight);
        }
        if (Math.abs(right - (initialBox.xPx + initialBox.widthPx + input.deltaXPx + snapX.delta)) < 0.5) {
          matchedX = snapX.matched;
        }
      } else if (dirX === -1) {
        let candidateLeft = left + input.deltaXPx;
        const snapX = snapCoordinate([candidateLeft], xLines, threshold);
        candidateLeft += snapX.delta;
        if (fromCenter) {
          const half = Math.max(minW / 2, initialBox.xPx + initialBox.widthPx / 2 - candidateLeft);
          left = initialBox.xPx + initialBox.widthPx / 2 - half;
          right = initialBox.xPx + initialBox.widthPx / 2 + half;
        } else {
          left = Math.min(right - minW, candidateLeft);
        }
        if (Math.abs(left - (initialBox.xPx + input.deltaXPx + snapX.delta)) < 0.5) {
          matchedX = snapX.matched;
        }
      }

      if (dirY === 1) {
        let candidateBottom = bottom + input.deltaYPx;
        const snapY = snapCoordinate([candidateBottom], yLines, threshold);
        candidateBottom += snapY.delta;
        if (fromCenter) {
          const half = Math.max(minH / 2, candidateBottom - (initialBox.yPx + initialBox.heightPx / 2));
          top = initialBox.yPx + initialBox.heightPx / 2 - half;
          bottom = initialBox.yPx + initialBox.heightPx / 2 + half;
        } else {
          bottom = Math.max(top + minH, candidateBottom);
        }
        if (Math.abs(bottom - (initialBox.yPx + initialBox.heightPx + input.deltaYPx + snapY.delta)) < 0.5) {
          matchedY = snapY.matched;
        }
      } else if (dirY === -1) {
        let candidateTop = top + input.deltaYPx;
        const snapY = snapCoordinate([candidateTop], yLines, threshold);
        candidateTop += snapY.delta;
        if (fromCenter) {
          const half = Math.max(minH / 2, initialBox.yPx + initialBox.heightPx / 2 - candidateTop);
          top = initialBox.yPx + initialBox.heightPx / 2 - half;
          bottom = initialBox.yPx + initialBox.heightPx / 2 + half;
        } else {
          top = Math.min(bottom - minH, candidateTop);
        }
        if (Math.abs(top - (initialBox.yPx + input.deltaYPx + snapY.delta)) < 0.5) {
          matchedY = snapY.matched;
        }
      }

      nextBox = {
        xPx: left,
        yPx: top,
        widthPx: right - left,
        heightPx: bottom - top,
      };
      if (matchedX !== undefined) {
        guides.push({
          axis: "x",
          positionPx: matchedX.value,
          fromPx: Math.min(matchedX.spanStart, nextBox.yPx),
          toPx: Math.max(matchedX.spanEnd, nextBox.yPx + nextBox.heightPx),
        });
      }
      if (matchedY !== undefined) {
        guides.push({
          axis: "y",
          positionPx: matchedY.value,
          fromPx: Math.min(matchedY.spanStart, nextBox.xPx),
          toPx: Math.max(matchedY.spanEnd, nextBox.xPx + nextBox.widthPx),
        });
      }
    }
  }

  const dLeftPx = nextBox.xPx - initialBox.xPx;
  const dTopPx = nextBox.yPx - initialBox.yPx;
  const dWidthPx = nextBox.widthPx - initialBox.widthPx;
  const dHeightPx = nextBox.heightPx - initialBox.heightPx;
  const dRightPx = dLeftPx + dWidthPx;
  const dBottomPx = dTopPx + dHeightPx;

  const edits: FrameParameterEdit[] = [];
  if (model.kind === "edges") {
    // Emit expanding outer edges before inward edges so sequential parameter.adjust
    // mutations never cross left >= right or top >= bottom mid-gesture.
    if (dRightPx > 0) {
      pushLengthEdit(edits, model.right, dRightPx, model.parent.widthPx);
      pushLengthEdit(edits, model.left, dLeftPx, model.parent.widthPx);
    } else {
      pushLengthEdit(edits, model.left, dLeftPx, model.parent.widthPx);
      pushLengthEdit(edits, model.right, dRightPx, model.parent.widthPx);
    }
    if (dBottomPx > 0) {
      pushLengthEdit(edits, model.bottom, dBottomPx, model.parent.heightPx);
      pushLengthEdit(edits, model.top, dTopPx, model.parent.heightPx);
    } else {
      pushLengthEdit(edits, model.top, dTopPx, model.parent.heightPx);
      pushLengthEdit(edits, model.bottom, dBottomPx, model.parent.heightPx);
    }
  } else if (model.kind === "aspect") {
    const dTargetX = dLeftPx + dWidthPx * model.anchor.x;
    const dTargetY = dTopPx + dHeightPx * model.anchor.y;
    if (model.primary === "width") {
      pushLengthEdit(edits, model.size, dWidthPx, model.parent.widthPx, true);
    } else {
      pushLengthEdit(edits, model.size, dHeightPx, model.parent.heightPx, true);
    }
    pushLengthEdit(edits, model.x, dTargetX, model.parent.widthPx);
    pushLengthEdit(edits, model.y, dTargetY, model.parent.heightPx);
  } else {
    const dTargetX = dLeftPx + dWidthPx * model.anchor.x;
    const dTargetY = dTopPx + dHeightPx * model.anchor.y;
    pushLengthEdit(edits, model.width, dWidthPx, model.parent.widthPx, true);
    pushLengthEdit(edits, model.height, dHeightPx, model.parent.heightPx, true);
    pushLengthEdit(edits, model.x, dTargetX, model.parent.widthPx);
    pushLengthEdit(edits, model.y, dTargetY, model.parent.heightPx);
  }

  const gap = nearestGapMeasurement(nextBox, siblings, canvas);
  return {
    box: nextBox,
    guides,
    ...(gap === undefined ? {} : { gap }),
    edits,
  };
}
