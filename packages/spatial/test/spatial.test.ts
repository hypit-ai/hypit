import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@narratage/component-kit";
import { createResolvedClosure, sealBuildRequest, start } from "@narratage/core";
import { AuthorFrontendRegistry, compileSourceClosure, resolveCompiledSourceExport } from "@narratage/elaborator";
import type { AuthorSourceUnit } from "@narratage/elaborator";
import {
  MarkupSurfaceRegistry,
  createMarkupAuthorFrontend,
} from "@narratage/markup";
import { createRecordAdmitter, TypeValidatorRegistry } from "@narratage/validation";

import {
  anchoredFrame,
  aspectFrame,
  decodeAnchoredFrameSurface,
  decodeAspectFrameSurface,
  decodeCanvasSurface,
  decodeFrameSurface,
  decodePathSurface,
  decodePointSurface,
  fitContent,
  frameFromEdges,
  sealSpatialPath,
  spatialComponent,
  spatialManifest,
  spatialModuleRef,
  spatialProducers,
  spatialSurfaceDigests,
  spatialTypes,
} from "../src/index.js";
import type { ContentFit, IntrinsicExtent, SpatialAnchor, SpatialFrame } from "../src/index.js";

const parent: SpatialFrame = { contract: "svml.spatial-frame@1", xPx: 100, yPx: 200, widthPx: 800, heightPx: 1200 };
const portrait: IntrinsicExtent = { contract: "svml.intrinsic-extent@1", widthPx: 600, heightPx: 1000 };
const landscape: IntrinsicExtent = { contract: "svml.intrinsic-extent@1", widthPx: 1600, heightPx: 900 };
const centered = (sizing: ContentFit["sizing"], constraint: ContentFit["constraint"] = "bounded"): ContentFit => ({
  contract: "svml.content-fit@1", sizing,
  framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
  offsetPx: { x: 0, y: 0 }, constraint,
});

test("Frame edges and anchored Frames resolve percentages against the explicit parent", () => {
  assert.deepEqual(frameFromEdges(parent, {
    contract: "svml.frame-edges-program@1",
    left: { unit: "percent", value: 10 }, top: { unit: "percent", value: 5 },
    right: { unit: "percent", value: 90 }, bottom: { unit: "percent", value: 95 },
  }), { contract: "svml.spatial-frame@1", xPx: 180, yPx: 260, widthPx: 640, heightPx: 1080 });
  assert.deepEqual(anchoredFrame(parent, {
    contract: "svml.anchored-frame-program@1",
    x: { unit: "percent", value: 50 }, y: { unit: "percent", value: 75 },
    width: { unit: "percent", value: 50 }, height: { unit: "px", value: 300 },
    anchor: "center", offsetPx: { x: 10, y: -20 },
  }), { contract: "svml.spatial-frame@1", xPx: 310, yPx: 930, widthPx: 400, heightPx: 300 });
});

test("all nine anchors are one point-attachment equation", () => {
  const expected: Record<SpatialAnchor, readonly [number, number]> = {
    "top-left": [500, 800], "top-center": [400, 800], "top-right": [300, 800],
    "middle-left": [500, 750], center: [400, 750], "middle-right": [300, 750],
    "bottom-left": [500, 700], "bottom-center": [400, 700], "bottom-right": [300, 700],
  };
  for (const [anchor, [xPx, yPx]] of Object.entries(expected) as [SpatialAnchor, readonly [number, number]][]) {
    const frame = anchoredFrame(parent, {
      contract: "svml.anchored-frame-program@1",
      x: { unit: "percent", value: 50 }, y: { unit: "percent", value: 50 },
      width: { unit: "px", value: 200 }, height: { unit: "px", value: 100 },
      anchor, offsetPx: { x: 0, y: 0 },
    });
    assert.deepEqual([frame.xPx, frame.yPx], [xPx, yPx], anchor);
  }
});

test("AspectFrame preserves explicit or connected aspect without becoming Media", () => {
  assert.deepEqual(aspectFrame(parent, portrait, {
    contract: "svml.aspect-frame-program@1",
    x: { unit: "percent", value: 100 }, y: { unit: "percent", value: 100 },
    primary: "width", size: { unit: "percent", value: 30 }, anchor: "bottom-right",
    offsetPx: { x: 0, y: 0 },
  }), { contract: "svml.spatial-frame@1", xPx: 660, yPx: 1000, widthPx: 240, heightPx: 400 });
});

test("every ContentFit sizing mode resolves the independent Content Frame", () => {
  const frame: SpatialFrame = { contract: "svml.spatial-frame@1", xPx: 0, yPx: 0, widthPx: 400, heightPx: 400 };
  assert.deepEqual(fitContent(frame, landscape, centered("contain")).contentFrame,
    { contract: "svml.spatial-frame@1", xPx: 0, yPx: 87.5, widthPx: 400, heightPx: 225 });
  assert.deepEqual(fitContent(frame, landscape, centered("cover")).contentFrame,
    { contract: "svml.spatial-frame@1", xPx: -155.55555555555554, yPx: 0, widthPx: 711.1111111111111, heightPx: 400 });
  assert.equal(fitContent(frame, portrait, centered("fit-width")).contentFrame.heightPx, 666.6666666666666);
  assert.equal(fitContent(frame, portrait, centered("fit-height")).contentFrame.widthPx, 240);
  assert.deepEqual(fitContent(frame, portrait, centered("native")).contentFrame,
    { contract: "svml.spatial-frame@1", xPx: -100, yPx: -300, widthPx: 600, heightPx: 1000 });
  assert.deepEqual(fitContent({ ...frame, widthPx: 800, heightPx: 1200 }, portrait, centered("scale-down")).contentFrame,
    { contract: "svml.spatial-frame@1", xPx: 100, yPx: 100, widthPx: 600, heightPx: 1000 });
  assert.deepEqual(fitContent(frame, portrait, centered("stretch")).contentFrame, frame);
});

test("the complete aspect, sizing and equal-point matrix preserves the two-frame equations", () => {
  const frames = [
    { contract: "svml.spatial-frame@1" as const, xPx: -120, yPx: 40, widthPx: 600, heightPx: 1_000 },
    { contract: "svml.spatial-frame@1" as const, xPx: 15, yPx: -80, widthPx: 1_000, heightPx: 600 },
    { contract: "svml.spatial-frame@1" as const, xPx: 200, yPx: 300, widthPx: 800, heightPx: 800 },
  ];
  const extents = [
    { contract: "svml.intrinsic-extent@1" as const, widthPx: 600, heightPx: 1_000 },
    { contract: "svml.intrinsic-extent@1" as const, widthPx: 1_000, heightPx: 600 },
    { contract: "svml.intrinsic-extent@1" as const, widthPx: 800, heightPx: 800 },
  ];
  const sizings = ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"] as const;
  const close = (actual: number, expected: number, label: string): void => {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
  };

  for (const frame of frames) {
    for (const extent of extents) {
      for (const sizing of sizings) {
        const content = fitContent(frame, extent, centered(sizing)).contentFrame;
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

  const frame = { contract: "svml.spatial-frame@1" as const, xPx: -70, yPx: 110, widthPx: 400, heightPx: 400 };
  const extent = { contract: "svml.intrinsic-extent@1" as const, widthPx: 200, heightPx: 200 };
  const points = [0, 0.5, 1] as const;
  for (const x of points) {
    for (const y of points) {
      const content = fitContent(frame, extent, {
        contract: "svml.content-fit@1", sizing: "native",
        framePoint: { x, y }, contentPoint: { x, y }, offsetPx: { x: 0, y: 0 }, constraint: "bounded",
      }).contentFrame;
      close(content.xPx + content.widthPx * x, frame.xPx + frame.widthPx * x, `equal point ${x},${y} x`);
      close(content.yPx + content.heightPx * y, frame.yPx + frame.heightPx * y, `equal point ${x},${y} y`);
    }
  }
});

test("unequal focal points and bounded/free policies remain explicit", () => {
  const frame: SpatialFrame = { contract: "svml.spatial-frame@1", xPx: 10, yPx: 20, widthPx: 400, heightPx: 300 };
  const fit: ContentFit = {
    contract: "svml.content-fit@1", sizing: "cover",
    framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.8, y: 0.35 },
    offsetPx: { x: 20, y: -10 }, constraint: "free",
  };
  const free = fitContent(frame, landscape, fit).contentFrame;
  const bounded = fitContent(frame, landscape, { ...fit, constraint: "bounded" }).contentFrame;
  assert.ok(Math.abs(free.xPx - (-196.66666666666666)) < 1e-9);
  assert.ok(Math.abs(free.widthPx - 533.3333333333333) < 1e-9);
  assert.deepEqual([free.yPx, free.heightPx], [55, 300]);
  assert.ok(Math.abs(bounded.xPx - (-123.33333333333333)) < 1e-9);
  assert.ok(Math.abs(bounded.widthPx - 533.3333333333333) < 1e-9);
  assert.deepEqual([bounded.yPx, bounded.heightPx], [20, 300]);
});

test("Frames may deliberately remain partially or fully off Canvas", () => {
  const frame = anchoredFrame(parent, {
    contract: "svml.anchored-frame-program@1",
    x: { unit: "percent", value: 50 }, y: { unit: "percent", value: 100 },
    width: { unit: "px", value: 300 }, height: { unit: "px", value: 200 },
    anchor: "top-center", offsetPx: { x: 0, y: 500 },
  });
  assert.equal(frame.yPx, 1900);
});

test("SpatialPath is typed geometry and rejects an empty or stateful command stream", () => {
  assert.deepEqual(sealSpatialPath({
    contract: "svml.spatial-path@1",
    commands: [{ kind: "move", xPx: 0, yPx: 0 }, { kind: "line", xPx: 100, yPx: 100 }],
  }).commands.length, 2);
  assert.throws(() => sealSpatialPath({ contract: "svml.spatial-path@1", commands: [{ kind: "move", xPx: 0, yPx: 0 }, { kind: "close" }] }), /no drawable/u);
});

function source(text: string): AuthorSourceUnit {
  return { id: "/project/main.svml", name: "main.svml", text: `<?svml using="@narratage/markup@1"?>\n${text}` };
}

test("self-described Spatial Surfaces produce an explicit Canvas edge and finite Frame graph", async () => {
  const closure = createResolvedClosure([spatialManifest]);
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured(spatialModuleRef, "canvas", spatialSurfaceDigests.canvas, decodeCanvasSurface);
  surfaces.registerStructured(spatialModuleRef, "point", spatialSurfaceDigests.point, decodePointSurface);
  surfaces.registerStructured(spatialModuleRef, "path", spatialSurfaceDigests.path, decodePathSurface);
  surfaces.registerStructured(spatialModuleRef, "frame", spatialSurfaceDigests.frame, decodeFrameSurface);
  surfaces.registerStructured(spatialModuleRef, "anchored-frame", spatialSurfaceDigests.anchoredFrame, decodeAnchoredFrameSurface);
  surfaces.registerStructured(spatialModuleRef, "aspect-frame", spatialSurfaceDigests.aspectFrame, decodeAspectFrameSurface);
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({ registry: surfaces, resolveModule: () => spatialModuleRef }));
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, spatialComponent.validators ?? []);
  const compiled = await compileSourceClosure({
    entry: source(`<svml>
      <import as="space" from="@narratage/spatial@1"/>
      <space:Canvas id="vertical" width="1080" height="1920"/>
      <space:Point id="headline-origin" x="120" y="280"/>
      <space:Path id="headline-path">
        <space:Move x="120" y="280"/>
        <space:Cubic control1-x="360" control1-y="180" control2-x="720" control2-y="380" x="960" y="280"/>
      </space:Path>
      <space:Frame id="safe" within={vertical} left="6%" top="4%" right="94%" bottom="96%"/>
      <space:AnchoredFrame id="card" within={safe} x="50%" y="78%" width="82%" height="28%" anchor="center"/>
      <space:AspectFrame id="sticker" within={safe} x="100%" y="100%" width="32%" aspect="9/16" anchor="bottom-right"/>
    </svml>`),
    closure,
    frontends,
    admitRecord: createRecordAdmitter(validators),
    resolveSource() { throw new Error("Spatial fixture has no source imports."); },
  });
  assert.equal(resolveCompiledSourceExport(compiled, "vertical", spatialTypes.canvas).ref.kind, "record");
  assert.equal(resolveCompiledSourceExport(compiled, "headline-origin", spatialTypes.point).ref.kind, "record");
  assert.equal(resolveCompiledSourceExport(compiled, "headline-path", spatialTypes.path).ref.kind, "record");
  const sticker = resolveCompiledSourceExport(compiled, "sticker", spatialTypes.frame);
  assert.equal(sticker.ref.kind, "logical-output");
  const build = start(compiled.program, compiled.elaboration.graph, sealBuildRequest({
    graph: compiled.elaboration.graph.id,
    targets: [{ output: sticker.ref.kind === "logical-output" ? sticker.ref.id : "", accepts: "exact" }],
    satisfactions: [],
  }));
  assert.deepEqual(build.plan.steps.map((step) => step.producer.name).sort(), [
    spatialProducers.canvasFrame.name,
    spatialProducers.frameEdges.name,
    spatialProducers.aspectFrame.name,
  ].sort());
});
