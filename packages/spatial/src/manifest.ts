import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { svsRecipeType } from "@hypit/svs";
import {
  anchoredFrameProgramSchema,
  aspectFrameProgramSchema,
  canvasSpaceSchema,
  contentFitSchema,
  fittedContentSchema,
  frameEdgesProgramSchema,
  intrinsicExtentSchema,
  spatialFrameSchema,
  spatialPathSchema,
  spatialPointSchema,
  spatialRegionTimelineSchema,
} from "./schema.js";

export const spatialModuleRef = { name: "@hypit/spatial", version: "1" } as const;
export const spatialTypes = {
  canvas: { module: spatialModuleRef, name: "CanvasSpace" },
  point: { module: spatialModuleRef, name: "SpatialPoint" },
  frame: { module: spatialModuleRef, name: "SpatialFrame" },
  regionTimeline: { module: spatialModuleRef, name: "SpatialRegionTimeline" },
  path: { module: spatialModuleRef, name: "SpatialPath" },
  extent: { module: spatialModuleRef, name: "IntrinsicExtent" },
  fit: { module: spatialModuleRef, name: "ContentFit" },
  fitted: { module: spatialModuleRef, name: "FittedContent" },
  frameEdgesProgram: { module: spatialModuleRef, name: "FrameEdgesProgram" },
  anchoredFrameProgram: { module: spatialModuleRef, name: "AnchoredFrameProgram" },
  aspectFrameProgram: { module: spatialModuleRef, name: "AspectFrameProgram" },
} satisfies Record<string, TypeRef>;
export const spatialProducers = {
  canvasFrame: { module: spatialModuleRef, name: "canvas-frame" },
  frameEdges: { module: spatialModuleRef, name: "frame-edges" },
  anchoredFrame: { module: spatialModuleRef, name: "anchored-frame" },
  aspectFrame: { module: spatialModuleRef, name: "aspect-frame" },
  fitContent: { module: spatialModuleRef, name: "fit-content" },
} satisfies Record<string, ProducerRef>;

const anchors = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

const lengthNote = "A length is a number followed by `px` or `%`; a percentage resolves against the parent Frame's width on the x axis and its height on the y axis.";
const withinNote = "A Canvas written in `within` is first resolved to its own full-Canvas Frame, so every Frame is placed inside a Frame.";
const emptyNote = "The element is empty; it accepts no children and no text.";

export const spatialMarkupSurfaces = [
    {
      name: "canvas", tag: "Canvas", mode: "structured", outputs: [spatialTypes.canvas],
      vocabulary: {
        summary: "Declares one Canvas: the pixel extent every Frame is measured inside.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the CanvasSpace Record this element publishes." },
          { name: "width", kind: "literal", required: true,
            summary: "States how many pixels wide the Canvas is." },
          { name: "height", kind: "literal", required: true,
            summary: "States how many pixels tall the Canvas is." },
        ],
        example: `<space:Canvas id="vertical" width="1080" height="1920"/>`,
        notes: [
          emptyNote,
          "`width` and `height` are positive whole numbers of pixels.",
          "The coordinate system is fixed: the origin is top-left, x increases to the right, y increases downward and pixels are square.",
          "The CanvasSpace is published under the bare `id`.",
        ],
      },
    },
    {
      name: "point", tag: "Point", mode: "structured", outputs: [spatialTypes.point],
      vocabulary: {
        summary: "Names one position on the Canvas in pixels.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the SpatialPoint Record this element publishes." },
          { name: "x", kind: "literal", required: true,
            summary: "Places the Point this many pixels along the Canvas x axis." },
          { name: "y", kind: "literal", required: true,
            summary: "Places the Point this many pixels down the Canvas y axis." },
        ],
        example: `<space:Point id="headline-origin" x="120" y="280"/>`,
        notes: [
          emptyNote,
          "`x` and `y` are finite pixel numbers, so a Point may be fractional, negative or outside the Canvas.",
          "The SpatialPoint is published under the bare `id`.",
        ],
      },
    },
    {
      name: "path", tag: "Path", mode: "structured", outputs: [spatialTypes.path],
      vocabulary: {
        summary: "Draws one Path in Canvas pixels from an ordered list of commands.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the SpatialPath Record this element publishes." },
        ],
        children: [
          { tag: "Move", cardinality: "many", summary: "Lifts the pen and starts a new subpath at a point.",
            attributes: [
              { name: "x", kind: "literal", required: true,
                summary: "Starts the subpath this many pixels along the Canvas x axis." },
              { name: "y", kind: "literal", required: true,
                summary: "Starts the subpath this many pixels down the Canvas y axis." },
            ] },
          { tag: "Line", cardinality: "many", summary: "Draws a straight segment to a point.",
            attributes: [
              { name: "x", kind: "literal", required: true,
                summary: "Ends the segment this many pixels along the Canvas x axis." },
              { name: "y", kind: "literal", required: true,
                summary: "Ends the segment this many pixels down the Canvas y axis." },
            ] },
          { tag: "Quadratic", cardinality: "many", summary: "Draws a quadratic curve to a point through one control point.",
            attributes: [
              { name: "control-x", kind: "literal", required: true,
                summary: "Places the control point this many pixels along the Canvas x axis." },
              { name: "control-y", kind: "literal", required: true,
                summary: "Places the control point this many pixels down the Canvas y axis." },
              { name: "x", kind: "literal", required: true,
                summary: "Ends the curve this many pixels along the Canvas x axis." },
              { name: "y", kind: "literal", required: true,
                summary: "Ends the curve this many pixels down the Canvas y axis." },
            ] },
          { tag: "Cubic", cardinality: "many", summary: "Draws a cubic curve to a point through two control points.",
            attributes: [
              { name: "control1-x", kind: "literal", required: true,
                summary: "Places the control point leaving the current point this many pixels along the Canvas x axis." },
              { name: "control1-y", kind: "literal", required: true,
                summary: "Places the control point leaving the current point this many pixels down the Canvas y axis." },
              { name: "control2-x", kind: "literal", required: true,
                summary: "Places the control point entering the end point this many pixels along the Canvas x axis." },
              { name: "control2-y", kind: "literal", required: true,
                summary: "Places the control point entering the end point this many pixels down the Canvas y axis." },
              { name: "x", kind: "literal", required: true,
                summary: "Ends the curve this many pixels along the Canvas x axis." },
              { name: "y", kind: "literal", required: true,
                summary: "Ends the curve this many pixels down the Canvas y axis." },
            ] },
          { tag: "Close", cardinality: "many", summary: "Closes the open subpath back to where it began.",
            attributes: [] },
        ],
        example: `<space:Path id="headline-path">
  <space:Move x="120" y="280"/>
  <space:Cubic control1-x="360" control1-y="180" control2-x="720" control2-y="380" x="960" y="280"/>
</space:Path>`,
        notes: [
          "The Path accepts only command children and no text.",
          "Every command is written empty, and every coordinate is a finite pixel number.",
          "A Path begins with `<Move>`, carries at least one drawable segment, and reopens with `<Move>` after a `<Close>`.",
          "The SpatialPath is published under the bare `id`.",
        ],
      },
    },
    {
      name: "extent", tag: "Extent", mode: "structured", outputs: [spatialTypes.extent],
      vocabulary: {
        summary: "States the intrinsic pixel extent of content, independent of the Frame it is placed in.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the IntrinsicExtent Record this element publishes." },
          { name: "width", kind: "literal", required: true,
            summary: "States how many pixels wide the content is." },
          { name: "height", kind: "literal", required: true,
            summary: "States how many pixels tall the content is." },
        ],
        example: `<space:Extent id="portrait" width="540" height="960"/>`,
        notes: [
          emptyNote,
          "`width` and `height` are positive whole numbers of pixels.",
          "The IntrinsicExtent is published under the bare `id`.",
        ],
      },
    },
    {
      name: "region-timeline", tag: "RegionTimeline", mode: "structured", outputs: [spatialTypes.regionTimeline],
      vocabulary: {
        summary: "Resolves externally measured, normalized AABB sequences into one frame-exact set of named Canvas-space region tracks.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the SpatialRegionTimeline Record this element publishes." },
          { name: "within", kind: "reference", required: true, accepts: [spatialTypes.canvas],
            summary: "Chooses the Canvas that normalized regions are measured inside." },
          { name: "recipe", kind: "reference", required: true, accepts: [svsRecipeType],
            summary: "Chooses the external frame-indexed region data.",
            recipe: [
              { name: "frame-count", required: true,
                summary: "States the exact number of ProgramSpace Frames covered by every named track." },
              { name: "tracks", required: true,
                summary: "Lists objects shaped as {id, regions}; each regions array contains frame-count normalized [x, y, width, height] AABBs or null when the region is absent." },
            ] },
        ],
        example: `<space:RegionTimeline id="heads" within={vertical} recipe={tracking.heads.default}/>` ,
        notes: [
          emptyNote,
          "The array index is the ProgramSpace Frame; the Surface performs no timestamp conversion, interpolation, smoothing or identity inference.",
          "Each normalized AABB lies inside [0, 1] and is resolved into Canvas pixels during author compilation; null remains explicit absence.",
          "Track ids are ordinary external labels; a consumer may interpret them as Script Roles without Spatial knowing what a Role is.",
        ],
      },
    },
    {
      name: "frame", tag: "Frame", mode: "structured", outputs: [spatialTypes.frame, spatialTypes.frameEdgesProgram],
      vocabulary: {
        summary: "Places one Frame by its four edges inside a Canvas or a parent Frame.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the Frame this element publishes." },
          { name: "within", kind: "reference", required: true, accepts: [spatialTypes.canvas, spatialTypes.frame],
            summary: "Chooses the Canvas or parent Frame the four edges are measured against." },
          { name: "left", kind: "literal", required: true,
            summary: "Places the left edge, measured from the parent's left." },
          { name: "top", kind: "literal", required: true,
            summary: "Places the top edge, measured from the parent's top." },
          { name: "right", kind: "literal", required: true,
            summary: "Places the right edge, measured from the parent's left." },
          { name: "bottom", kind: "literal", required: true,
            summary: "Places the bottom edge, measured from the parent's top." },
        ],
        ports: [
          { name: "", type: spatialTypes.frame,
            summary: "The resolved Frame, addressed by the element's own id." },
        ],
        example: `<space:Frame id="safe" within={vertical} left="6%" top="4%" right="94%" bottom="96%"/>`,
        notes: [
          emptyNote,
          lengthNote,
          "`right` must resolve past `left` and `bottom` past `top`, because a Frame has positive width and height.",
          withinNote,
        ],
      },
    },
    {
      name: "anchored-frame", tag: "AnchoredFrame", mode: "structured", outputs: [spatialTypes.frame, spatialTypes.anchoredFrameProgram],
      vocabulary: {
        summary: "Places one Frame of a stated size by pinning one of its nine anchor points to a position in the parent.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the Frame this element publishes." },
          { name: "within", kind: "reference", required: true, accepts: [spatialTypes.canvas, spatialTypes.frame],
            summary: "Chooses the Canvas or parent Frame the position and size are measured against." },
          { name: "x", kind: "literal", required: true,
            summary: "Places the anchor point along the parent's width." },
          { name: "y", kind: "literal", required: true,
            summary: "Places the anchor point down the parent's height." },
          { name: "width", kind: "literal", required: true,
            summary: "Sizes the Frame across the parent's width." },
          { name: "height", kind: "literal", required: true,
            summary: "Sizes the Frame down the parent's height." },
          { name: "anchor", kind: "literal", required: true, values: anchors,
            summary: "Chooses which point of the Frame lands on `x` and `y`." },
          { name: "offset-x", kind: "literal", required: false,
            summary: "Nudges the placed Frame this many pixels along x; defaults to `0`." },
          { name: "offset-y", kind: "literal", required: false,
            summary: "Nudges the placed Frame this many pixels along y; defaults to `0`." },
        ],
        ports: [
          { name: "", type: spatialTypes.frame,
            summary: "The resolved Frame, addressed by the element's own id." },
        ],
        example: `<space:AnchoredFrame id="card" within={safe} x="50%" y="78%" width="82%" height="28%" anchor="center"/>`,
        notes: [
          emptyNote,
          lengthNote,
          "`offset-x` and `offset-y` are finite pixel numbers, and a Frame may deliberately sit partly or wholly outside its parent.",
          withinNote,
        ],
      },
    },
    {
      name: "aspect-frame", tag: "AspectFrame", mode: "structured", outputs: [spatialTypes.frame, spatialTypes.extent, spatialTypes.aspectFrameProgram],
      vocabulary: {
        summary: "Places one Frame that keeps a stated aspect ratio, sized on one axis and anchored in the parent.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names the Frame this element publishes." },
          { name: "within", kind: "reference", required: true, accepts: [spatialTypes.canvas, spatialTypes.frame],
            summary: "Chooses the Canvas or parent Frame the position and size are measured against." },
          { name: "x", kind: "literal", required: true,
            summary: "Places the anchor point along the parent's width." },
          { name: "y", kind: "literal", required: true,
            summary: "Places the anchor point down the parent's height." },
          { name: "aspect", kind: "expression", required: true, accepts: [spatialTypes.extent],
            summary: "Fixes the ratio the Frame keeps, as a referenced IntrinsicExtent or a written `width/height` ratio." },
          { name: "anchor", kind: "literal", required: true, values: anchors,
            summary: "Chooses which point of the Frame lands on `x` and `y`." },
          { name: "width", kind: "literal", required: false,
            summary: "Sizes the Frame across the parent's width and derives its height from the ratio." },
          { name: "height", kind: "literal", required: false,
            summary: "Sizes the Frame down the parent's height and derives its width from the ratio." },
          { name: "offset-x", kind: "literal", required: false,
            summary: "Nudges the placed Frame this many pixels along x; defaults to `0`." },
          { name: "offset-y", kind: "literal", required: false,
            summary: "Nudges the placed Frame this many pixels along y; defaults to `0`." },
        ],
        ports: [
          { name: "", type: spatialTypes.frame,
            summary: "The resolved Frame, addressed by the element's own id." },
        ],
        example: `<space:AspectFrame id="sticker" within={safe} x="100%" y="100%" width="32%" aspect="9/16" anchor="bottom-right"/>`,
        notes: [
          emptyNote,
          "Exactly one of `width` or `height` is written; the other axis follows from the ratio.",
          lengthNote,
          "A written `aspect` is two positive numbers separated by `/`, such as `9/16`; a referenced `aspect` must be an IntrinsicExtent.",
          withinNote,
        ],
      },
    },
  ] as const;


export const spatialManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: spatialModuleRef.name,
  version: spatialModuleRef.version,
  dependencies: [{ module: svsRecipeType.module }],
  types: [
    { name: spatialTypes.canvas.name },
    { name: spatialTypes.point.name },
    { name: spatialTypes.frame.name },
    { name: spatialTypes.regionTimeline.name },
    { name: spatialTypes.path.name },
    { name: spatialTypes.extent.name },
    { name: spatialTypes.fit.name },
    { name: spatialTypes.fitted.name },
    { name: spatialTypes.frameEdgesProgram.name },
    { name: spatialTypes.anchoredFrameProgram.name },
    { name: spatialTypes.aspectFrameProgram.name },
  ],
  capabilities: [],
  producers: [
    { name: spatialProducers.canvasFrame.name, inputs: [{ name: "canvas", type: spatialTypes.canvas }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [] },
    { name: spatialProducers.frameEdges.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.frameEdgesProgram }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [] },
    { name: spatialProducers.anchoredFrame.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.anchoredFrameProgram }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [] },
    { name: spatialProducers.aspectFrame.name, inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "program", type: spatialTypes.aspectFrameProgram }], outputs: [{ name: "frame", type: spatialTypes.frame }], needs: [] },
    { name: spatialProducers.fitContent.name, inputs: [{ name: "frame", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "fit", type: spatialTypes.fit }], outputs: [{ name: "fitted", type: spatialTypes.fitted }], needs: [] },
  ],
};
export const spatialDependency = { module: spatialModuleRef } as const;
