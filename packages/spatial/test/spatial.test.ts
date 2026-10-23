import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeRefinements } from "@hypit/refinement";
import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
} from "@hypit/kernel";
import { AuthorFrontendRegistry, resolveCompiledSourceExport } from "@hypit/author";
import { compileSourceClosure } from "@hypit/compiler";
import type { ResolvedSource } from "@hypit/source";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import {
  MarkupSurfaceRegistry,
  createMarkupAuthorFrontend,
} from "@hypit/markup";
import { refineRecord, RefinementRegistry } from "@hypit/refinement";

function buildState(
  program: Parameters<typeof planBuild>[0],
  graph: Parameters<typeof planBuild>[1],
  targets: readonly string[],
) {
  const planned = planBuild(program, graph, {
    format: "hypit.run-graph@1",
    records: [],
    candidates: [],
    operations: [],
    satisfactions: [],
    targets,
  });
  return materializeBuild(defineBuild({
    program: link(program.closure, [...program.records, ...planned.initialRecords]),
    plan: planned.plan,
  }), []);
}

import {
  anchoredFrame,
  aspectFrame,
  decodeAnchoredFrameSurface,
  decodeAspectFrameSurface,
  decodeCanvasSurface,
  decodeFrameSurface,
  decodeMapSurface,
  decodePathSurface,
  decodePointSurface,
  composeSpatialMaps,
  mapIntrinsicExtentBounds,
  mapSpatialFrameBounds,
  mapSpatialFramePath,
  mapSpatialPoint,
  frameFromEdges,
  resolveContentFit,
  sealSpatialPath,
  spatialComponent,
  spatialManifest,
  spatialMarkupSurfaces,
  spatialModuleRef,
  spatialProducers,
  spatialTypes,
} from "../src/index.js";
import type { ContentFit, IntrinsicExtent, SpatialAnchor, SpatialFrame } from "../src/index.js";

const parent: SpatialFrame = { xPx: 100, yPx: 200, widthPx: 800, heightPx: 1200 };
const portrait: IntrinsicExtent = { widthPx: 600, heightPx: 1000 };
const landscape: IntrinsicExtent = { widthPx: 1600, heightPx: 900 };
const centered = (sizing: ContentFit["sizing"], constraint: ContentFit["constraint"] = "bounded"): ContentFit => ({
  sizing,
  framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
  offsetPx: { x: 0, y: 0 }, constraint,
});
const fittedBounds = (frame: SpatialFrame, extent: IntrinsicExtent, fit: ContentFit): SpatialFrame =>
  mapIntrinsicExtentBounds(extent, resolveContentFit(frame, extent, fit));

test("Frame edges and anchored Frames resolve percentages against the explicit parent", () => {
  assert.deepEqual(frameFromEdges(parent, {
    left: { unit: "percent", value: 10 }, top: { unit: "percent", value: 5 },
    right: { unit: "percent", value: 90 }, bottom: { unit: "percent", value: 95 },
  }), { xPx: 180, yPx: 260, widthPx: 640, heightPx: 1080 });
  assert.deepEqual(anchoredFrame(parent, {
    x: { unit: "percent", value: 50 }, y: { unit: "percent", value: 75 },
    width: { unit: "percent", value: 50 }, height: { unit: "px", value: 300 },
    anchor: "center", offsetPx: { x: 10, y: -20 },
  }), { xPx: 310, yPx: 930, widthPx: 400, heightPx: 300 });
});

test("all nine anchors are one point-attachment equation", () => {
  const expected: Record<SpatialAnchor, readonly [number, number]> = {
    "top-left": [500, 800], "top-center": [400, 800], "top-right": [300, 800],
    "middle-left": [500, 750], center: [400, 750], "middle-right": [300, 750],
    "bottom-left": [500, 700], "bottom-center": [400, 700], "bottom-right": [300, 700],
  };
  for (const [anchor, [xPx, yPx]] of Object.entries(expected) as [SpatialAnchor, readonly [number, number]][]) {
    const frame = anchoredFrame(parent, {
      x: { unit: "percent", value: 50 }, y: { unit: "percent", value: 50 },
      width: { unit: "px", value: 200 }, height: { unit: "px", value: 100 },
      anchor, offsetPx: { x: 0, y: 0 },
    });
    assert.deepEqual([frame.xPx, frame.yPx], [xPx, yPx], anchor);
  }
});

test("AspectFrame preserves explicit or connected aspect without becoming Media", () => {
  assert.deepEqual(aspectFrame(parent, portrait, {
    x: { unit: "percent", value: 100 }, y: { unit: "percent", value: 100 },
    primary: "width", size: { unit: "percent", value: 30 }, anchor: "bottom-right",
    offsetPx: { x: 0, y: 0 },
  }), { xPx: 660, yPx: 1000, widthPx: 240, heightPx: 400 });
});

test("every ContentFit sizing mode resolves one source-to-picture mapping", () => {
  const frame: SpatialFrame = { xPx: 0, yPx: 0, widthPx: 400, heightPx: 400 };
  assert.deepEqual(fittedBounds(frame, landscape, centered("contain")),
    { xPx: 0, yPx: 87.5, widthPx: 400, heightPx: 225 });
  assert.deepEqual(fittedBounds(frame, landscape, centered("cover")),
    { xPx: -155.55555555555554, yPx: 0, widthPx: 711.1111111111111, heightPx: 400 });
  assert.ok(Math.abs(fittedBounds(frame, portrait, centered("fit-width")).heightPx - 666.6666666666666) < 1e-9);
  assert.equal(fittedBounds(frame, portrait, centered("fit-height")).widthPx, 240);
  assert.deepEqual(fittedBounds(frame, portrait, centered("native")),
    { xPx: -100, yPx: -300, widthPx: 600, heightPx: 1000 });
  assert.deepEqual(fittedBounds({ ...frame, widthPx: 800, heightPx: 1200 }, portrait, centered("scale-down")),
    { xPx: 100, yPx: 100, widthPx: 600, heightPx: 1000 });
  assert.deepEqual(fittedBounds(frame, portrait, centered("stretch")), frame);
});

test("SpatialMap2D composes local geometry without attaching Canvas identity", () => {
  const rotateQuarter = { xx: 0, xy: -1, yx: 1, yy: 0, tx: 0, ty: 0 };
  const translate = { xx: 1, xy: 0, yx: 0, yy: 1, tx: 100, ty: 200 };
  const mapping = composeSpatialMaps(rotateQuarter, translate);
  assert.deepEqual(mapSpatialPoint({ xPx: 10, yPx: 20 }, mapping), { xPx: 80, yPx: 210 });
  assert.deepEqual(mapSpatialFrameBounds({ xPx: 0, yPx: 0, widthPx: 30, heightPx: 20 }, mapping),
    { xPx: 80, yPx: 200, widthPx: 20, heightPx: 30 });
  assert.deepEqual(mapSpatialFramePath({ xPx: 0, yPx: 0, widthPx: 30, heightPx: 20 }, mapping).commands[1],
    { kind: "line", xPx: 100, yPx: 230 });
});

test("the complete aspect, sizing and equal-point matrix preserves the two-frame equations", () => {
  const frames = [
    { xPx: -120, yPx: 40, widthPx: 600, heightPx: 1_000 },
    { xPx: 15, yPx: -80, widthPx: 1_000, heightPx: 600 },
    { xPx: 200, yPx: 300, widthPx: 800, heightPx: 800 },
  ];
  const extents = [
    { widthPx: 600, heightPx: 1_000 },
    { widthPx: 1_000, heightPx: 600 },
    { widthPx: 800, heightPx: 800 },
  ];
  const sizings = ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"] as const;
  const close = (actual: number, expected: number, label: string): void => {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
  };

  for (const frame of frames) {
    for (const extent of extents) {
      for (const sizing of sizings) {
        const content = fittedBounds(frame, extent, centered(sizing));
        close(content.xPx + content.widthPx / 2, frame.xPx + frame.widthPx / 2, `${sizing} center x`);
        close(content.yPx + content.heightPx / 2, frame.yPx + frame.heightPx / 2, `${sizing} center y`);
        if (sizing !== "stretch") {
          close(content.widthPx / content.heightPx, extent.widthPx / extent.heightPx, `${sizing} aspect`);
        }
        if (sizing === "contain") {
          assert.ok(content.widthPx <= frame.widthPx + 1e-9 && content.heightPx <= frame.heightPx + 1e-9);
          assert.ok(Math.abs(content.widthPx - frame.widthPx) < 1e-9 || Math.abs(content.heightPx - frame.heightPx) < 1e-9);
        } else if (sizing === "cover") {
          assert.ok(content.widthPx + 1e-9 >= frame.widthPx && content.heightPx + 1e-9 >= frame.heightPx);
          assert.ok(Math.abs(content.widthPx - frame.widthPx) < 1e-9 || Math.abs(content.heightPx - frame.heightPx) < 1e-9);
        } else if (sizing === "fit-width") {
          close(content.widthPx, frame.widthPx, "fit-width width");
        } else if (sizing === "fit-height") {
          close(content.heightPx, frame.heightPx, "fit-height height");
        } else if (sizing === "native") {
          close(content.widthPx, extent.widthPx, "native width");
          close(content.heightPx, extent.heightPx, "native height");
        } else if (sizing === "scale-down") {
          assert.ok(content.widthPx <= extent.widthPx + 1e-9 && content.heightPx <= extent.heightPx + 1e-9);
          assert.ok(content.widthPx <= frame.widthPx + 1e-9 && content.heightPx <= frame.heightPx + 1e-9);
        } else {
          close(content.widthPx, frame.widthPx, "stretch width");
          close(content.heightPx, frame.heightPx, "stretch height");
        }
      }
    }
  }

  const frame = { xPx: -70, yPx: 110, widthPx: 400, heightPx: 400 };
  const extent = { widthPx: 200, heightPx: 200 };
  const points = [0, 0.5, 1] as const;
  for (const x of points) {
    for (const y of points) {
      const content = fittedBounds(frame, extent, {
        sizing: "native",
        framePoint: { x, y }, contentPoint: { x, y }, offsetPx: { x: 0, y: 0 }, constraint: "bounded",
      });
      close(content.xPx + content.widthPx * x, frame.xPx + frame.widthPx * x, `equal point ${x},${y} x`);
      close(content.yPx + content.heightPx * y, frame.yPx + frame.heightPx * y, `equal point ${x},${y} y`);
    }
  }
});

test("unequal focal points and bounded/free policies remain explicit", () => {
  const frame: SpatialFrame = { xPx: 10, yPx: 20, widthPx: 400, heightPx: 300 };
  const fit: ContentFit = {
    sizing: "cover",
    framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.8, y: 0.35 },
    offsetPx: { x: 20, y: -10 }, constraint: "free",
  };
  const free = fittedBounds(frame, landscape, fit);
  const bounded = fittedBounds(frame, landscape, { ...fit, constraint: "bounded" });
  assert.ok(Math.abs(free.xPx - (-196.66666666666666)) < 1e-9);
  assert.ok(Math.abs(free.widthPx - 533.3333333333333) < 1e-9);
  assert.deepEqual([free.yPx, free.heightPx], [55, 300]);
  assert.ok(Math.abs(bounded.xPx - (-123.33333333333333)) < 1e-9);
  assert.ok(Math.abs(bounded.widthPx - 533.3333333333333) < 1e-9);
  assert.deepEqual([bounded.yPx, bounded.heightPx], [20, 300]);
});

test("Frames may deliberately remain partially or fully off Canvas", () => {
  const frame = anchoredFrame(parent, {
    x: { unit: "percent", value: 50 }, y: { unit: "percent", value: 100 },
    width: { unit: "px", value: 300 }, height: { unit: "px", value: 200 },
    anchor: "top-center", offsetPx: { x: 0, y: 500 },
  });
  assert.equal(frame.yPx, 1900);
});

test("SpatialPath is typed geometry and rejects an empty or stateful command stream", () => {
  assert.deepEqual(sealSpatialPath({
    commands: [{ kind: "move", xPx: 0, yPx: 0 }, { kind: "line", xPx: 100, yPx: 100 }],
  }).commands.length, 2);
  assert.throws(() => sealSpatialPath({ commands: [{ kind: "move", xPx: 0, yPx: 0 }, { kind: "close" }] }), /no drawable/u);
});

function source(text: string): ResolvedSource {
  return resolveSelfDescribedTextSource({ id: "/project/main.svml", name: "main.svml", text: `<?svml using="@hypit/markup@1"?>\n${text}` });
}

test("self-described Spatial Surfaces produce explicit static geometry", async () => {
  const closure = createResolvedClosure([spatialManifest]);
  const surfaces = new MarkupSurfaceRegistry();
  const register = (name: string, handler: Parameters<MarkupSurfaceRegistry["registerStructured"]>[0]["handler"]) => {
    const declaration = spatialMarkupSurfaces.find((item) => item.name === name);
    if (declaration === undefined) throw new Error(`missing Spatial Surface ${name}`);
    surfaces.registerStructured({ module: spatialModuleRef, declaration, handler });
  };
  register("canvas", decodeCanvasSurface);
  register("point", decodePointSurface);
  register("path", decodePathSurface);
  register("map", decodeMapSurface);
  register("frame", decodeFrameSurface);
  register("anchored-frame", decodeAnchoredFrameSurface);
  register("aspect-frame", decodeAspectFrameSurface);
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({ registry: surfaces, resolveModule: () => spatialModuleRef }));
  const refinements = new RefinementRegistry();
  registerTypeRefinements(refinements, spatialComponent.refinements ?? []);
  const compiled = await compileSourceClosure({
    entry: source(`<svml>
      <import as="space" from="@hypit/spatial@1"/>
      <space:Canvas id="vertical" width="1080" height="1920"/>
      <space:Point id="headline-origin" x="120" y="280"/>
      <space:Path id="headline-path">
        <space:Move x="120" y="280"/>
        <space:Cubic control1-x="360" control1-y="180" control2-x="720" control2-y="380" x="960" y="280"/>
      </space:Path>
      <space:Map id="turned" xx="0" xy="-0.5" yx="0.5" yy="0" tx="920" ty="180"/>
      <space:Frame id="safe" within={vertical.bounds} left="6%" top="4%" right="94%" bottom="96%"/>
      <space:AnchoredFrame id="card" within={safe} x="50%" y="78%" width="82%" height="28%" anchor="center"/>
      <space:AspectFrame id="sticker" within={safe} x="100%" y="100%" width="32%" aspect="9/16" anchor="bottom-right"/>
    </svml>`),
    closure,
    frontends,
    refineRecord: async (record) => await refineRecord(record, refinements),
    resolveSource() { throw new Error("Spatial fixture imports no Source files."); },
  });
  assert.equal(resolveCompiledSourceExport(compiled, "vertical.canvas", spatialTypes.canvas).ref.kind, "record");
  assert.equal(resolveCompiledSourceExport(compiled, "vertical.bounds", spatialTypes.frame).ref.kind, "record");
  assert.equal(resolveCompiledSourceExport(compiled, "headline-origin", spatialTypes.point).ref.kind, "record");
  assert.equal(resolveCompiledSourceExport(compiled, "headline-path", spatialTypes.path).ref.kind, "record");
  assert.equal(resolveCompiledSourceExport(compiled, "turned", spatialTypes.map2D).ref.kind, "record");
  const sticker = resolveCompiledSourceExport(compiled, "sticker", spatialTypes.frame);
  assert.equal(sticker.ref.kind, "logical-output");
  const build = buildState(compiled.program, compiled.graph, [
    sticker.ref.kind === "logical-output" ? sticker.ref.id : "",
  ]);
  assert.deepEqual(build.plan.steps.map((step) => step.producer.name).sort(), [
    spatialProducers.frameEdges.name,
    spatialProducers.aspectFrame.name,
  ].sort());
});
