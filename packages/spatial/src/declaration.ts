import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
  type AuthorValueRef,
  type Awaitable,
} from "@hypit/hypit/author";
import type { CanonicalValue, TypeRef } from "@hypit/hypit/protocol";

import { anchoredFrameFragment, aspectFrameFragment, frameEdgesFragment } from "./fragment.js";
import {
  assertSpatialPath,
  canvasFrame,
  sealCanvas,
  sealIntrinsicExtent,
  sealSpatialMap2D,
  sealSpatialPoint,
} from "./geometry.js";
import { spatialModuleRef, spatialTypes } from "./manifest.js";
import type {
  AnchoredFrameProgram,
  AspectFrameProgram,
  FrameEdgesProgram,
  SpatialAnchor,
  SpatialLength,
  SpatialPath,
  SpatialPathCommand,
} from "./types.js";

const anchors = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

function literal(declaration: AuthorDeclaration | AuthorDeclarationChild, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal") throw new Error(`Spatial ${name} must be literal.`);
  return value.value;
}

function optionalLiteral(declaration: AuthorDeclaration | AuthorDeclarationChild, name: string): string | undefined {
  const value = declarationField(declaration, name);
  if (value === undefined) return undefined;
  if (value.kind !== "literal") throw new Error(`Spatial ${name} must be literal.`);
  return value.value;
}

function finiteNumber(declaration: AuthorDeclaration | AuthorDeclarationChild, name: string, fallback?: number): number {
  const source = optionalLiteral(declaration, name);
  if (source === undefined && fallback !== undefined) return fallback;
  const value = Number(source);
  if (!Number.isFinite(value)) throw new Error(`Spatial ${name} must be finite.`);
  return value;
}

function positiveInteger(declaration: AuthorDeclaration, name: string): number {
  const value = finiteNumber(declaration, name);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Spatial ${name} must be a positive integer.`);
  return value;
}

function length(declaration: AuthorDeclaration, name: string): SpatialLength {
  const source = literal(declaration, name);
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%)$/u.exec(source);
  if (match === null) throw new Error(`Spatial ${name} must use px or %.`);
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error(`Spatial ${name} must be finite.`);
  return { unit: match[2] === "%" ? "percent" : "px", value };
}

function anchor(declaration: AuthorDeclaration): SpatialAnchor {
  return literal(declaration, "anchor") as SpatialAnchor;
}

async function reference(
  declaration: AuthorDeclaration,
  name: string,
  resolve: (path: string) => Awaitable<AuthorResolvedReference | undefined>,
): Promise<AuthorResolvedReference> {
  const value = declarationField(declaration, name);
  if (value?.kind !== "reference") throw new Error(`Spatial ${name} must be a reference.`);
  const resolved = await resolve(value.path);
  if (resolved === undefined) throw new Error(`Spatial ${name} cannot resolve ${value.path}.`);
  return resolved;
}

function recordBinding(id: string, type: TypeRef) {
  return { name: id, ref: { kind: "record" as const, id }, type };
}

function componentBinding(id: string, type: TypeRef) {
  return { name: id, ref: { kind: "component-output" as const, component: id, output: "frame" }, type };
}

const idField = {
  name: "id", kind: "identifier" as const, required: true,
  summary: "Names the value this declaration publishes.",
};
const xField = {
  name: "x", kind: "literal" as const, required: true,
  summary: "Places the value along the picture-plane x axis.",
};
const yField = {
  name: "y", kind: "literal" as const, required: true,
  summary: "Places the value down the picture-plane y axis.",
};

export const spatialCanvasAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialModuleRef,
  declaration: "canvas",
  outputs: [spatialTypes.canvas, spatialTypes.frame],
  shape: {
    summary: "Declares the final raster viewport and publishes its full-picture Frame.",
    fields: [
      idField,
      { name: "width", kind: "literal", required: true, summary: "States how many pixels wide the Canvas is." },
      { name: "height", kind: "literal", required: true, summary: "States how many pixels tall the Canvas is." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [recordBinding(`${id}.canvas`, spatialTypes.canvas), recordBinding(`${id}.bounds`, spatialTypes.frame)];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    const canvas = sealCanvas({ widthPx: positiveInteger(declaration, "width"), heightPx: positiveInteger(declaration, "height") });
    return {
      records: [
        { id: `${id}.canvas`, type: spatialTypes.canvas, value: canvas as unknown as CanonicalValue, range: declaration.range },
        { id: `${id}.bounds`, type: spatialTypes.frame, value: canvasFrame(canvas) as unknown as CanonicalValue, range: declaration.range },
      ],
      components: [],
    };
  },
};

export const spatialPointAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialModuleRef,
  declaration: "point",
  outputs: [spatialTypes.point],
  shape: { summary: "Names one position in the program picture plane, in pixels.", fields: [idField, xField, yField] },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [recordBinding(id, spatialTypes.point)];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    const point = sealSpatialPoint({ xPx: finiteNumber(declaration, "x"), yPx: finiteNumber(declaration, "y") });
    return { records: [{ id, type: spatialTypes.point, value: point as unknown as CanonicalValue, range: declaration.range }], components: [] };
  },
};

const pathPointFields = [xField, yField];
const pathChildren = [
  { name: "Move", cardinality: "many" as const, summary: "Starts a new subpath.", fields: pathPointFields },
  { name: "Line", cardinality: "many" as const, summary: "Draws a straight segment.", fields: pathPointFields },
  {
    name: "Quadratic", cardinality: "many" as const, summary: "Draws a quadratic curve.",
    fields: [
      { name: "control-x", kind: "literal" as const, required: true, summary: "Places the control point along x." },
      { name: "control-y", kind: "literal" as const, required: true, summary: "Places the control point along y." },
      ...pathPointFields,
    ],
  },
  {
    name: "Cubic", cardinality: "many" as const, summary: "Draws a cubic curve.",
    fields: [
      { name: "control1-x", kind: "literal" as const, required: true, summary: "Places the first control point along x." },
      { name: "control1-y", kind: "literal" as const, required: true, summary: "Places the first control point along y." },
      { name: "control2-x", kind: "literal" as const, required: true, summary: "Places the second control point along x." },
      { name: "control2-y", kind: "literal" as const, required: true, summary: "Places the second control point along y." },
      ...pathPointFields,
    ],
  },
  { name: "Close", cardinality: "many" as const, summary: "Closes the current subpath.", fields: [] },
];

function pathCommand(child: AuthorDeclarationChild): SpatialPathCommand {
  if (child.name === "Move" || child.name === "Line") {
    return { kind: child.name === "Move" ? "move" : "line", xPx: finiteNumber(child, "x"), yPx: finiteNumber(child, "y") };
  }
  if (child.name === "Quadratic") {
    return {
      kind: "quadratic", controlX: finiteNumber(child, "control-x"), controlY: finiteNumber(child, "control-y"),
      xPx: finiteNumber(child, "x"), yPx: finiteNumber(child, "y"),
    };
  }
  if (child.name === "Cubic") {
    return {
      kind: "cubic", control1X: finiteNumber(child, "control1-x"), control1Y: finiteNumber(child, "control1-y"),
      control2X: finiteNumber(child, "control2-x"), control2Y: finiteNumber(child, "control2-y"),
      xPx: finiteNumber(child, "x"), yPx: finiteNumber(child, "y"),
    };
  }
  return { kind: "close" };
}

export const spatialPathAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialModuleRef,
  declaration: "path",
  outputs: [spatialTypes.path],
  shape: { summary: "Draws one ordered picture-plane path.", fields: [idField], children: pathChildren },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [recordBinding(id, spatialTypes.path)];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    const path: SpatialPath = { commands: declaration.children.map(pathCommand) };
    assertSpatialPath(path);
    return { records: [{ id, type: spatialTypes.path, value: path as unknown as CanonicalValue, range: declaration.range }], components: [] };
  },
};

export const spatialExtentAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialModuleRef,
  declaration: "extent",
  outputs: [spatialTypes.extent],
  shape: {
    summary: "Names one intrinsic source extent.",
    fields: [
      idField,
      { name: "width", kind: "literal", required: true, summary: "States the intrinsic width in pixels." },
      { name: "height", kind: "literal", required: true, summary: "States the intrinsic height in pixels." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [recordBinding(id, spatialTypes.extent)];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    const extent = sealIntrinsicExtent({ widthPx: positiveInteger(declaration, "width"), heightPx: positiveInteger(declaration, "height") });
    return { records: [{ id, type: spatialTypes.extent, value: extent as unknown as CanonicalValue, range: declaration.range }], components: [] };
  },
};

export const spatialMapAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialModuleRef,
  declaration: "map",
  outputs: [spatialTypes.map2D],
  shape: {
    summary: "Names one affine mapping into the program picture plane.",
    fields: [idField, ...["xx", "xy", "yx", "yy", "tx", "ty"].map((name) => ({
      name, kind: "literal" as const, required: true, summary: `States affine coefficient ${name}.`,
    }))],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [recordBinding(id, spatialTypes.map2D)];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    const mapping = sealSpatialMap2D({
      xx: finiteNumber(declaration, "xx"), xy: finiteNumber(declaration, "xy"),
      yx: finiteNumber(declaration, "yx"), yy: finiteNumber(declaration, "yy"),
      tx: finiteNumber(declaration, "tx"), ty: finiteNumber(declaration, "ty"),
    });
    return { records: [{ id, type: spatialTypes.map2D, value: mapping as unknown as CanonicalValue, range: declaration.range }], components: [] };
  },
};

const withinField = {
  name: "within", kind: "reference" as const, required: true, accepts: [spatialTypes.frame],
  summary: "Chooses the parent Frame.",
};
const lengthField = (name: string, summary: string, required = true) => ({ name, kind: "literal" as const, required, summary });
const anchorField = {
  name: "anchor", kind: "literal" as const, required: true, values: anchors,
  summary: "Chooses which point of the Frame lands on x and y.",
};
const offsetFields = [
  lengthField("offset-x", "Offsets the placed Frame along x in pixels.", false),
  lengthField("offset-y", "Offsets the placed Frame along y in pixels.", false),
];

function frameOutput(
  declaration: AuthorDeclaration,
  parent: AuthorValueRef,
  program: FrameEdgesProgram | AnchoredFrameProgram,
  programType: TypeRef,
  fragment: typeof frameEdgesFragment | typeof anchoredFrameFragment,
) {
  const id = literal(declaration, "id");
  const programId = `${id}.__program`;
  return {
    records: [{ id: programId, type: programType, value: program as unknown as CanonicalValue, range: declaration.range }],
    components: [{
      id, fragment, inputs: { parent, program: { kind: "record" as const, id: programId } },
      outputs: { frame: id }, range: declaration.range,
    }],
  };
}

export const spatialFrameAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialModuleRef,
  declaration: "frame",
  outputs: [spatialTypes.frame, spatialTypes.frameEdgesProgram],
  shape: {
    summary: "Places one Frame by its four edges inside a parent Frame.",
    fields: [idField, withinField, lengthField("left", "Places the left edge."), lengthField("top", "Places the top edge."),
      lengthField("right", "Places the right edge."), lengthField("bottom", "Places the bottom edge.")],
  },
  bindings(declaration) { return [componentBinding(literal(declaration, "id"), spatialTypes.frame)]; },
  async compile({ declaration, resolveReference }) {
    const parent = await reference(declaration, "within", resolveReference);
    return frameOutput(declaration, parent.ref, {
      left: length(declaration, "left"), top: length(declaration, "top"),
      right: length(declaration, "right"), bottom: length(declaration, "bottom"),
    }, spatialTypes.frameEdgesProgram, frameEdgesFragment);
  },
};

export const spatialAnchoredFrameAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialModuleRef,
  declaration: "anchored-frame",
  outputs: [spatialTypes.frame, spatialTypes.anchoredFrameProgram],
  shape: {
    summary: "Places one sized Frame by pinning an anchor point inside a parent Frame.",
    fields: [idField, withinField, lengthField("x", "Places the anchor along the parent width."),
      lengthField("y", "Places the anchor along the parent height."), lengthField("width", "Sizes the Frame across the parent width."),
      lengthField("height", "Sizes the Frame down the parent height."), anchorField, ...offsetFields],
  },
  bindings(declaration) { return [componentBinding(literal(declaration, "id"), spatialTypes.frame)]; },
  async compile({ declaration, resolveReference }) {
    const parent = await reference(declaration, "within", resolveReference);
    return frameOutput(declaration, parent.ref, {
      x: length(declaration, "x"), y: length(declaration, "y"), width: length(declaration, "width"),
      height: length(declaration, "height"), anchor: anchor(declaration),
      offsetPx: { x: finiteNumber(declaration, "offset-x", 0), y: finiteNumber(declaration, "offset-y", 0) },
    }, spatialTypes.anchoredFrameProgram, anchoredFrameFragment);
  },
};

export const spatialAspectFrameAuthorDeclaration: AuthorDeclarationCompiler = {
  module: spatialModuleRef,
  declaration: "aspect-frame",
  outputs: [spatialTypes.frame, spatialTypes.extent, spatialTypes.aspectFrameProgram],
  shape: {
    summary: "Places one Frame that keeps a stated aspect ratio inside a parent Frame.",
    fields: [
      idField, withinField, lengthField("x", "Places the anchor along the parent width."),
      lengthField("y", "Places the anchor along the parent height."),
      { name: "aspect", kind: "expression", required: true, accepts: [spatialTypes.extent], summary: "Chooses an IntrinsicExtent or width/height ratio." },
      anchorField, lengthField("width", "Sizes the Frame across the parent width.", false),
      lengthField("height", "Sizes the Frame down the parent height.", false), ...offsetFields,
    ],
  },
  bindings(declaration) { return [componentBinding(literal(declaration, "id"), spatialTypes.frame)]; },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const parent = await reference(declaration, "within", resolveReference);
    const hasWidth = declarationField(declaration, "width") !== undefined;
    const hasHeight = declarationField(declaration, "height") !== undefined;
    if (hasWidth === hasHeight) throw new Error("Spatial AspectFrame requires exactly one of width or height.");
    const aspect = declarationField(declaration, "aspect");
    let extentRef: AuthorValueRef;
    const records: { id: string; type: TypeRef; value: CanonicalValue; range: AuthorDeclaration["range"] }[] = [];
    if (aspect?.kind === "reference") {
      const resolved = await resolveReference(aspect.path);
      if (resolved === undefined) throw new Error(`Spatial aspect cannot resolve ${aspect.path}.`);
      extentRef = resolved.ref;
    } else if (aspect?.kind === "literal") {
      const match = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/u.exec(aspect.value);
      if (match === null) throw new Error("Spatial aspect must be IntrinsicExtent or width/height.");
      const extent = sealIntrinsicExtent({ widthPx: Number(match[1]), heightPx: Number(match[2]) });
      const extentId = `${id}.__extent`;
      records.push({ id: extentId, type: spatialTypes.extent, value: extent as unknown as CanonicalValue, range: declaration.range });
      extentRef = { kind: "record", id: extentId };
    } else {
      throw new Error("Spatial aspect is required.");
    }
    const program: AspectFrameProgram = {
      x: length(declaration, "x"), y: length(declaration, "y"), primary: hasWidth ? "width" : "height",
      size: length(declaration, hasWidth ? "width" : "height"), anchor: anchor(declaration),
      offsetPx: { x: finiteNumber(declaration, "offset-x", 0), y: finiteNumber(declaration, "offset-y", 0) },
    };
    const programId = `${id}.__program`;
    records.push({ id: programId, type: spatialTypes.aspectFrameProgram, value: program as unknown as CanonicalValue, range: declaration.range });
    return {
      records,
      components: [{
        id, fragment: aspectFrameFragment,
        inputs: { parent: parent.ref, extent: extentRef, program: { kind: "record", id: programId } },
        outputs: { frame: id }, range: declaration.range,
      }],
    };
  },
};

export const spatialAuthorDeclarations = [
  spatialCanvasAuthorDeclaration,
  spatialPointAuthorDeclaration,
  spatialPathAuthorDeclaration,
  spatialExtentAuthorDeclaration,
  spatialMapAuthorDeclaration,
  spatialFrameAuthorDeclaration,
  spatialAnchoredFrameAuthorDeclaration,
  spatialAspectFrameAuthorDeclaration,
] as const;

/** Markup spellings are independent of package-owned author semantics. */
export const spatialMarkupDeclarations = [
  { name: "canvas", tag: "Canvas" },
  { name: "point", tag: "Point" },
  { name: "path", tag: "Path" },
  { name: "extent", tag: "Extent" },
  { name: "map", tag: "Map" },
  { name: "frame", tag: "Frame" },
  { name: "anchored-frame", tag: "AnchoredFrame" },
  { name: "aspect-frame", tag: "AspectFrame" },
] as const;

export const spatialPointMarkupDeclaration = spatialMarkupDeclarations[1];
