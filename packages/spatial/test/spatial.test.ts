import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@hypit/component-kit";
import { createResolvedClosure, sealBuildRequest, start } from "@hypit/core";
import { AuthorFrontendRegistry, compileSourceClosure, resolveCompiledSourceExport } from "@hypit/elaborator";
import type { AuthorSourceUnit } from "@hypit/elaborator";
import {
  MarkupSurfaceRegistry,
  createMarkupAuthorFrontend,
} from "@hypit/markup";
import { createRecordAdmitter, TypeValidatorRegistry } from "@hypit/validation";
import { svsFrontend, svsManifest } from "@hypit/svs";

import {
  anchoredFrame,
  aspectFrame,
  decodeAnchoredFrameSurface,
  decodeAspectFrameSurface,
  decodeCanvasSurface,
  decodeFrameSurface,
  decodePathSurface,
  decodePointSurface,
  decodeRegionTimelineSurface,
  fitContent,
  frameFromEdges,
  sealSpatialPath,
  spatialComponent,
  spatialManifest,
  spatialMarkupSurfaces,
  spatialModuleRef,
  spatialProducers,
  spatialTypes,
} from "../src/index.js";
import type { ContentFit, IntrinsicExtent, SpatialAnchor, SpatialFrame, SpatialRegionTimeline } from "../src/index.js";

const parent: SpatialFrame = { xPx: 100, yPx: 200, widthPx: 800, heightPx: 1200 };
const portrait: IntrinsicExtent = { widthPx: 600, heightPx: 1000 };
const landscape: IntrinsicExtent = { widthPx: 1600, heightPx: 900 };
const centered = (sizing: ContentFit["sizing"], constraint: ContentFit["constraint"] = "bounded"): ContentFit => ({
  sizing,
  framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
  offsetPx: { x: 0, y: 0 }, constraint,
});

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

test("every ContentFit sizing mode resolves the independent Content Frame", () => {
  const frame: SpatialFrame = { xPx: 0, yPx: 0, widthPx: 400, heightPx: 400 };
  assert.deepEqual(fitContent(frame, landscape, centered("contain")).contentFrame,
    { xPx: 0, yPx: 87.5, widthPx: 400, heightPx: 225 });
  assert.deepEqual(fitContent(frame, landscape, centered("cover")).contentFrame,
    { xPx: -155.55555555555554, yPx: 0, widthPx: 711.1111111111111, heightPx: 400 });
  assert.equal(fitContent(frame, portrait, centered("fit-width")).contentFrame.heightPx, 666.6666666666666);
  assert.equal(fitContent(frame, portrait, centered("fit-height")).contentFrame.widthPx, 240);
  assert.deepEqual(fitContent(frame, portrait, centered("native")).contentFrame,
    { xPx: -100, yPx: -300, widthPx: 600, heightPx: 1000 });
  assert.deepEqual(fitContent({ ...frame, widthPx: 800, heightPx: 1200 }, portrait, centered("scale-down")).contentFrame,
    { xPx: 100, yPx: 100, widthPx: 600, heightPx: 1000 });
  assert.deepEqual(fitContent(frame, portrait, centered("stretch")).contentFrame, frame);
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

  const frame = { xPx: -70, yPx: 110, widthPx: 400, heightPx: 400 };
  const extent = { widthPx: 200, heightPx: 200 };
  const points = [0, 0.5, 1] as const;
  for (const x of points) {
    for (const y of points) {
      const content = fitContent(frame, extent, {
        sizing: "native",
        framePoint: { x, y }, contentPoint: { x, y }, offsetPx: { x: 0, y: 0 }, constraint: "bounded",
      }).contentFrame;
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

function source(text: string): AuthorSourceUnit {
  return { id: "/project/main.svml", name: "main.svml", text: `<?svml using="@hypit/markup@1"?>\n${text}` };
}

test("self-described Spatial Surfaces produce explicit static geometry and measured Region data", async () => {
  const closure = createResolvedClosure([spatialManifest, svsManifest]);
  const surfaces = new MarkupSurfaceRegistry();
  const register = (name: string, handler: Parameters<MarkupSurfaceRegistry["registerStructured"]>[0]["handler"]) => {
    const declaration = spatialMarkupSurfaces.find((item) => item.name === name);
    if (declaration === undefined) throw new Error(`missing Spatial Surface ${name}`);
    surfaces.registerStructured({ module: spatialModuleRef, declaration, handler });
  };
  register("canvas", decodeCanvasSurface);
  register("point", decodePointSurface);
  register("path", decodePathSurface);
  register("region-timeline", decodeRegionTimelineSurface);
  register("frame", decodeFrameSurface);
  register("anchored-frame", decodeAnchoredFrameSurface);
  register("aspect-frame", decodeAspectFrameSurface);
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({ registry: surfaces, resolveModule: () => spatialModuleRef }));
  frontends.register(svsFrontend);
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, spatialComponent.validators ?? []);
  const compiled = await compileSourceClosure({
    entry: source(`<svml>
      <import as="space" from="@hypit/spatial@1"/>
      <import as="tracking" source="./tracking.svs"/>
      <space:Canvas id="vertical" width="1080" height="1920"/>
      <space:RegionTimeline id="heads" within={vertical} recipe={tracking.heads.default}/>
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
    resolveSource(_importer, request) {
      if (request.from !== "./tracking.svs") throw new Error(`unknown Spatial fixture source ${request.from}`);
      return {
        id: "/project/tracking.svs",
        name: "tracking.svs",
        text: `<?svml using="@hypit/svs@1"?>
<sheet version="1">
heads.default {
  frame-count: 3;
  tracks: [{"id":"BOY","regions":[[0.5,0.1,0.2,0.3],null,[0.52,0.11,0.2,0.3]]}];
}
</sheet>`,
      };
    },
  });
  assert.equal(resolveCompiledSourceExport(compiled, "vertical", spatialTypes.canvas).ref.kind, "record");
  assert.equal(resolveCompiledSourceExport(compiled, "headline-origin", spatialTypes.point).ref.kind, "record");
  assert.equal(resolveCompiledSourceExport(compiled, "headline-path", spatialTypes.path).ref.kind, "record");
  const regions = resolveCompiledSourceExport(compiled, "heads", spatialTypes.regionTimeline);
  assert.equal(regions.ref.kind, "record");
  const regionRecord = compiled.program.records.find((record) =>
    regions.ref.kind === "record" && record.id === regions.ref.id);
  const timeline = regionRecord?.value.kind === "inline"
    ? regionRecord.value.value as unknown as SpatialRegionTimeline
    : undefined;
  assert.deepEqual(timeline?.tracks[0]?.frames[0], { xPx: 540, yPx: 192, widthPx: 216, heightPx: 576 });
  assert.equal(timeline?.tracks[0]?.frames[1], null);
  const sticker = resolveCompiledSourceExport(compiled, "sticker", spatialTypes.frame);
  assert.equal(sticker.ref.kind, "logical-output");
  const build = start(compiled.program, compiled.graph, sealBuildRequest({
    targets: [{ output: sticker.ref.kind === "logical-output" ? sticker.ref.id : "" }],
  }));
  assert.deepEqual(build.plan.steps.map((step) => step.producer.name).sort(), [
    spatialProducers.canvasFrame.name,
    spatialProducers.frameEdges.name,
    spatialProducers.aspectFrame.name,
  ].sort());
});
