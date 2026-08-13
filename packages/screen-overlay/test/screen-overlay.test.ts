import assert from "node:assert/strict";
import test from "node:test";

import { artifactManifest } from "@narratage/artifact";
import { registerTypeValidatorFacets } from "@narratage/component-kit";
import { compositionManifest, compositionTypes, sealComposition, sealVisualTrack } from "@narratage/composition";
import { createResolvedClosure, sealBuildRequest, start } from "@narratage/core";
import { AuthorFrontendRegistry, compileSourceClosure, resolveCompiledSourceExport } from "@narratage/elaborator";
import { compileHyperframesDocument } from "@narratage/hyperframes";
import { mediaManifest } from "@narratage/media";
import { narrativeManifest } from "@narratage/narrative";
import { programSpaceDependency, programSpaceManifest, programSpaceTypes, sealProgramSpace } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest } from "@narratage/protocol";
import {
  appendProgramScreenOverlay,
  createScreenOverlaySet,
  createScreenOverlayFragment,
  decodeScreenOverlaySurface,
  finalizeScreenOverlay,
  renderScreenOverlay,
  screenOverlayManifest,
  screenOverlayMarkupSurfaces,
  screenOverlayModuleRef,
  screenOverlayProducers,
  sealScreenOverlayHeader,
  sealScreenOverlayItemSpec,
} from "@narratage/screen-overlay";
import type { ScreenOverlayComponent } from "@narratage/screen-overlay";
import { semanticMapManifest } from "@narratage/semantic-map";
import { speechEvidenceManifest } from "@narratage/speech-evidence";
import { speechManifest } from "@narratage/speech";
import { sealCanvasSpace, spatialComponent, spatialDependency, spatialManifest, spatialTypes } from "@narratage/spatial";
import { temporalManifest } from "@narratage/temporal";
import { MarkupSurfaceRegistry, createMarkupAuthorFrontend } from "@narratage/markup";
import { createRecordAdmitter, TypeValidatorRegistry } from "@narratage/validation";
import { visualIrManifest } from "@narratage/visual-ir";

const canvas = sealCanvasSpace({
  widthPx: 1080, heightPx: 1920,
  origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
});
const space = sealProgramSpace({
  durationSec: 2, frameRate: { numerator: 30, denominator: 1 },
});
const header = sealScreenOverlayHeader({ contract: "svml.screen-overlay-header@1", id: "screen" });
const components: readonly ScreenOverlayComponent[] = [
  { kind: "flash", color: "#ffffff", intensity: 0.9, attackFrames: 2, holdFrames: 3, decayFrames: 5 },
  { kind: "color-wash", color: "#2244ff", opacity: 0.2 },
  { kind: "vignette", center: { x: 0.5, y: 0.48 }, radius: { x: 0.8, y: 0.65 }, softness: 0.3, color: "#000000", opacity: 0.4 },
  { kind: "scan-lines", spacingPx: 8, thicknessPx: 1, angleDeg: 4, opacity: 0.18, travelPx: 12 },
  { kind: "directional-matte", angleDeg: 15, coverage: 0.7, feather: 0.2, color: "#ffffff", opacity: 0.8, progress: { from: -0.4, to: 1.2 } },
  { kind: "whip-veil", direction: "left", widthPx: 320, softnessPx: 48, travelPx: 1400, opacity: 0.9 },
  { kind: "glitch-veil", bars: 8, colors: ["#ff0044", "#00ddff"], opacity: 0.6, travelPx: 90, seed: 7 },
  { kind: "grain", amount: 0.25, grainSizePx: 3, chroma: "monochrome", motionRatePxPerFrame: 0.5, seed: 11 },
  { kind: "light-leak", colors: ["#ff3300", "#ffd000"], angleDeg: 28, softness: 0.4, travelPx: 260, intensity: 0.55, seed: 13 },
  { kind: "bokeh", amount: 0.35, sizeMinPx: 12, sizeMaxPx: 70, color: "#ffe2aa", warmth: 0.4, driftPx: 80, seed: 17 },
  { kind: "tv-static", amount: 0.12, noiseSizePx: 5, scanLineOpacity: 0.16, motionRatePxPerFrame: 0.7, seed: 19 },
];

function trackFor(content: ScreenOverlayComponent, stackingOrder = 50) {
  const spec = sealScreenOverlayItemSpec({
    contract: "svml.screen-overlay-item-spec@1", id: content.kind,
    content, projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
    expansion: { kind: "one" }, stackingOrder,
  });
  return renderScreenOverlay(canvas, space, finalizeScreenOverlay(
    appendProgramScreenOverlay(createScreenOverlaySet(), header, space, spec), header,
  ));
}

test("every declared Screen Overlay component lowers to a self-contained deterministic Present", () => {
  for (const content of components) {
    const first = trackFor(content);
    const second = trackFor(structuredClone(content));
    assert.deepEqual(first, second, `${content.kind} must be deterministic`);
    assert.equal(first.presents.length, 1);
    assert.equal(first.presents[0]?.span.endFrameExclusive, 60);
    assert.ok(first.presents[0]!.elements.length >= 1);
    for (const element of first.presents[0]!.elements) {
      assert.equal(element.attributes, undefined, `${content.kind} must not smuggle an external selector or input`);
    }
  }
});

test("Flash owns its exact envelope instead of inheriting a universal peak", () => {
  const flash = trackFor(components[0]!);
  assert.deepEqual(flash.presents[0]?.elements[0]?.animation?.keyframes.map((frame) => frame.atFrame), [0, 2, 5, 10, 60]);
  const clipped = trackFor({ kind: "flash", color: "#ffffff", intensity: 1, attackFrames: 30, holdFrames: 30, decayFrames: 30 });
  assert.deepEqual(clipped.presents[0]?.elements[0]?.animation?.keyframes.map((frame) => frame.atFrame), [0, 30, 60, 90]);
});

test("explicit seeds control stochastic component identity", () => {
  const grain = components.find((item) => item.kind === "grain")! as Extract<ScreenOverlayComponent, { kind: "grain" }>;
  assert.notDeepEqual(trackFor(grain), trackFor({ ...grain, seed: grain.seed + 1 }));
  const bokeh = components.find((item) => item.kind === "bokeh")! as Extract<ScreenOverlayComponent, { kind: "bokeh" }>;
  assert.notDeepEqual(trackFor(bokeh), trackFor({ ...bokeh, seed: bokeh.seed + 1 }));
});

test("overlay Tracks interleave with peer Tracks only through absolute stacking", () => {
  const below = trackFor(components[1]!, 20);
  const above = { ...trackFor(components[0]!, 80), id: "screen-above" };
  const middle = sealVisualTrack({
    visualIr: "svml.visual-ir@1", id: "middle",
    presents: [{ id: "middle", span: { startFrame: 0, endFrameExclusive: 60 }, stacking: { order: 50, tieBreak: "middle" },
      elements: [{ id: "root", order: 0, kind: "box", style: [{ name: "background-color", value: "#112233" }] }] }],
  });
  const document = compileHyperframesDocument(sealComposition({
    id: "stack", canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [above, middle, below],
  }), space);
  const belowAt = document.html.indexOf('data-svml-track-id="screen"');
  const middleAt = document.html.indexOf('data-svml-track-id="middle"');
  const aboveAt = document.html.indexOf('data-svml-track-id="screen-above"');
  assert.ok(belowAt < middleAt && middleAt < aboveAt);
});

test("the package has no lower-composite, sibling Track, backdrop-filter or hidden audio port", () => {
  const fragment = createScreenOverlayFragment([{ kind: "program", specName: "spec" }]);
  assert.deepEqual(fragment.inputs.map((input) => input.name), ["canvas", "header", "space", "spec"]);
  assert.equal(fragment.exports.some((output) => output.type.name === "AudioTrack"), false);
  assert.throws(() => sealScreenOverlayItemSpec({
    contract: "svml.screen-overlay-item-spec@1", id: "blur",
    content: { kind: "gaussian-blur" } as unknown as ScreenOverlayComponent,
    projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
    expansion: { kind: "one" }, stackingOrder: 1,
  }), /unsupported|undefined|kind/iu);
});

test("the self-described Screen Surface parses into a finite peer-Track graph", async () => {
  const fixtureModule = { name: "example.screen-inputs", version: "1" } as const;
  const fixtureSurfaceDigest = digestOf("example.screen-inputs/surface@1");
  const fixtureSurface = {
    name: "inputs", tag: "Inputs", mode: "structured",
    outputs: [spatialTypes.canvas, programSpaceTypes.programSpace],
    implementation: { digest: fixtureSurfaceDigest },
  } as const;
  const fixtureManifest: ModuleManifest = {
    format: "svml.module@1",
    name: fixtureModule.name,
    version: fixtureModule.version,
    dependencies: [spatialDependency, programSpaceDependency],
    types: [],
    capabilities: [],
    producers: [],
  };
  const closure = createResolvedClosure([
    artifactManifest,
    mediaManifest,
    narrativeManifest,
    programSpaceManifest,
    speechManifest,
    speechEvidenceManifest,
    semanticMapManifest,
    spatialManifest,
    temporalManifest,
    visualIrManifest,
    compositionManifest,
    screenOverlayManifest,
    fixtureManifest,
  ]);
  const registry = new MarkupSurfaceRegistry();
  registry.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "canvas", type: spatialTypes.canvas, value: { kind: "inline", value: canvas }, range: element.range },
      { id: "space", type: programSpaceTypes.programSpace, value: { kind: "inline", value: space }, range: element.range },
    ],
    components: [],
    fragments: [],
  }) });
  registry.registerStructured({
    module: screenOverlayModuleRef,
    declaration: screenOverlayMarkupSurfaces.find((item) => item.name === "track")!,
    handler: decodeScreenOverlaySurface,
  });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry,
    resolveModule: (request) => request.from === "example.screen-inputs@1" ? fixtureModule : screenOverlayModuleRef,
  }));
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, spatialComponent.validators ?? []);
  const compiled = await compileSourceClosure({
    entry: {
      id: "/project/screen.svml",
      name: "screen.svml",
      text: `<?svml using="@narratage/markup@1"?>
      <svml>
        <import as="fixture" from="example.screen-inputs@1"/>
        <import as="screen" from="@narratage/screen-overlay@1"/>
        <fixture:Inputs/>
        <screen:Track id="screen-fx" canvas={canvas} space={space}>
          <screen:Flash during="program" z="70" color="#ffffff" intensity="0.9" attack="2" hold="3" decay="5"/>
        </screen:Track>
      </svml>`,
    },
    closure,
    frontends,
    admitRecord: createRecordAdmitter(validators),
    resolveSource() { throw new Error("Screen fixture has no source imports."); },
  });
  const trackExport = resolveCompiledSourceExport(compiled, "screen-fx.track", compositionTypes.visualTrack);
  assert.equal(trackExport.ref.kind, "logical-output");
  const build = start(compiled.program, compiled.graph, sealBuildRequest({
    graph: compiled.graph.id,
    targets: [{ output: trackExport.ref.kind === "logical-output" ? trackExport.ref.id : "" }],
  }));
  assert.deepEqual(build.plan.steps.map((step) => step.producer.name).sort(), [
    screenOverlayProducers.createSet.name,
    screenOverlayProducers.appendProgram.name,
    screenOverlayProducers.finalize.name,
    screenOverlayProducers.render.name,
  ].sort());
});
