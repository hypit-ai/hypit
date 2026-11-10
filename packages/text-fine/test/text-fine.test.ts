import { sealTimeline, timelineDependency, timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { narrativeProjectionFixture, timelineFixture } from "../../../test/timeline-fixture.js";
import { projectProgramWindow, projectSelectionWindow } from "../../../test/temporal-fixture.js";

import { spatialComponent, videoContractManifests } from "../../../test/support/video-domain.js";
import { registerTypeValidatorFacets } from "@hypit/admission";
import { compositionTypes, sealComposition } from "@hypit/composition";
import { createResolvedClosure, sealBuildRequest, start } from "@hypit/kernel";
import { AuthorFrontendRegistry, resolveCompiledSourceExport } from "@hypit/author";
import { compileSourceClosure } from "@hypit/compiler";
import { compileHtmlProgram } from "@hypit/html-program";
import { mediaDependency, mediaTypes } from "@hypit/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@hypit/media";
import type { NarrativeSelectionRef } from "@hypit/narrative";
import type { ModuleManifest } from "@hypit/protocol";
import {
  bindAreaTextPlacement,
  bindPathTextPlacement,
  createFineTextOccurrence,
  renderFineTextOccurrence,
  renderFineTextMask,
  sealTextItemSpec,
  sealTextStyle,
  stillTextMotion,
  sealTextMotion,
  sealTextPathMotion,
  sealTextMaskSpec,
  decodeTypographyMotionSurface,
  decodeTypographyPathMotionSurface,
  decodeTypographyMaskSurface,
  decodeTypographyFlowSurface,
  decodeTypographyPointSurface,
  decodeTypographyPathSurface,
  decodeTypographyStyleSurface,
  textFineManifest,
  textFineMarkupSurfaces,
  textFineModuleRef,
  textFineProducers,
  textFineTypes,
} from "@hypit/text-fine";
import type { TextStyle } from "@hypit/text-fine";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { recipeManifest, recipeType } from "@hypit/recipe";
import { sealText, textComponent, textDependency, textManifest, textTypes } from "@hypit/text";
import { MarkupSurfaceRegistry, createMarkupAuthorFrontend } from "@hypit/markup";
import { createRecordAdmitter, TypeValidatorRegistry } from "@hypit/admission";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import { temporalDependency, temporalTypes } from "@hypit/temporal";

const space = sealTimeline({ id: "test-space", frameCount: 150, frameRate: { numerator: 30, denominator: 1 },
});
const semanticOptions = { narrativeId: "script", segments: [{ id: "line", frameCount: 150 }], anchors: [
  { identity: "selection:start", frame: 30 },
  { identity: "selection:end", frame: 60 },
] } as const;
const semantic = timelineFixture(space, semanticOptions);
const narrativeProjection = narrativeProjectionFixture(semantic, semanticOptions);

const exactTestFont: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob",
    resource: fixtureResource("text-fine-test-font"),
    size: 1,
    mediaType: "font/woff2",
  } }],
  weight: 700,
  style: "normal",
};

const exactTestSurface: CompositableSurfaceRef = {
  artifact: {
    kind: "blob",
    resource: fixtureResource("text-fine-test-surface"),
    size: 1,
    mediaType: "image/png",
  },
  width: 920,
  height: 520,
  colorSpace: "srgb",
  alphaMode: "straight",
  timing: { kind: "still" },
};

function textStyle(id: string): TextStyle {
  return sealTextStyle({

    id,
    typography: {
      fonts: [exactTestFont],
      sizePx: 48,
      weight: 700,
      style: "normal",
      axes: [],
      features: [],
      synthesis: "none",
      kerning: "auto",
      trackingPx: 0,
      wordSpacingPx: 0,
      lineHeight: 1.2,
      direction: "auto",
      writingMode: "horizontal-tb",
      baselineShiftPx: 0,
      tabSize: 4,
      indentationPx: 0,
      paragraphBeforePx: 0,
      paragraphAfterPx: 0,
      transform: "none",
      variantCaps: "normal",
      verticalAlign: "baseline",
      decorations: [],
      cjk: { textSpacing: "normal", punctuationTrim: "none" },
    },
    paints: [
      { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
      {
        kind: "box",
        target: "content",
        continuity: "isolated",
        decoration: {
          fill: { kind: "solid", color: "#111111" },
          paddingPx: { top: 8, right: 12, bottom: 8, left: 12 },
          radiiPx: { topLeft: 12, topRight: 12, bottomRight: 12, bottomLeft: 12 },
          shadows: [],
        },
      },
    ],
  });
}

const flowPolicy = (z: number, overrides: Partial<import("@hypit/text-fine").TextAreaFlow> = {}) => ({
  z,
  flow: {
    inlineSize: "fixed" as const, blockSize: "fixed" as const,
    paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
    inlineAlign: "center" as const, blockAlign: "center" as const, wrap: "word" as const,
    overflow: "visible" as const, clipToFrame: false, columns: 1, columnGapPx: 0,
    metricEdge: "line-box" as const,
    ...overrides,
  },
});

const pathPolicy = (z: number) => ({
  z, side: "left" as const, orientation: "follow" as const,
  startMarginPx: 0, endMarginPx: 0, align: "start" as const,
  reverse: false, overflow: "visible" as const,
});

function document(text: string) {
  return { paragraphs: [{ id: "paragraph", inlines: [{ kind: "text" as const, id: "run", text }] }] };
}

function absoluteWindow(subjectId: string, startFrame: number, endFrameExclusive: number) {
  return {
    id: `${subjectId}-window`, subjectId,
    start: { id: `${subjectId}-window.start`, subjectId, timelineId: space.id, frame: startFrame },
    end: { id: `${subjectId}-window.end`, subjectId, timelineId: space.id, frame: endFrameExclusive },
    span: { startFrame, endFrameExclusive },
  };
}

test("one fine Text occurrence renders without an aggregate Typography program", () => {
  const occurrence = createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 80, yPx: 220, widthPx: 920, heightPx: 520 }, flowPolicy(60)),
    sealTextItemSpec({ id: "standalone", document: document("One truthful occurrence") }),
    textStyle("standalone-style"),
    stillTextMotion("standalone-motion"),
    absoluteWindow("standalone", 30, 90),
  );
  assert.equal(occurrence.timelineId, space.id);
  assert.deepEqual(occurrence.span, { startFrame: 30, endFrameExclusive: 90 });
  const visual = renderFineTextOccurrence(space, occurrence);
  assert.equal(visual.id, "standalone");
  assert.equal(visual.presents.length, 1);
  assert.equal(visual.presents[0]?.elements[2]?.kind, "text-flow");
});

test("Text Mask explicitly consumes one fine Text occurrence and one owned still Surface", () => {
  const baseStyle = textStyle("mask-style");
  const occurrence = createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 100, yPx: 200, widthPx: 800, heightPx: 240 }, flowPolicy(75, { wrap: "none" })),
    sealTextItemSpec({ id: "mask-title", document: document("OWNED MASK") }),
    baseStyle,
    stillTextMotion(),
    absoluteWindow("mask-title", 0, 150),
  );
  const material: CompositableSurfaceRef = {
    artifact: { kind: "blob", resource: fixtureResource("text-mask-material"), size: 1, mediaType: "image/png" },
    width: 400, height: 240, colorSpace: "srgb", alphaMode: "straight", timing: { kind: "still" },
  };
  const track = renderFineTextMask(space, occurrence, material, sealTextMaskSpec({
    id: "masked-title", mode: "alpha", materialFit: "cover",
  }));
  assert.equal(track.id, "masked-title");
  assert.deepEqual(track.presents[0]?.elements.map((element) => element.kind), ["mask", "text", "surface"]);
  assert.equal(track.presents[0]?.elements[2]?.parent, "mask");
  assert.ok(track.presents[0]?.elements[2]?.style.some((entry) =>
    entry.name === "transform" && entry.value === "matrix(2,0,0,2,0,-120)"));
  assert.equal(track.presents[0]?.elements[2]?.style.some((entry) => entry.name === "object-fit"), false);
  const html = compileHtmlProgram(sealComposition({
    id: "owned-mask-composition",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" }, tracks: [track],
  }), space).html;
  assert.match(html, /<foreignObject/u);
  assert.match(html, />OWNED MASK</u);
  assert.match(html, /mask-type:alpha/u);
  assert.throws(() => renderFineTextMask(space, occurrence, {
    ...material, artifact: { ...material.artifact, mediaType: "video/webm" },
    timing: { kind: "frames", frameCount: 150, frameRate: { numerator: 30, denominator: 1 } },
  }, sealTextMaskSpec({
    id: "timed-mask", mode: "alpha", materialFit: "cover",
  })), /requires one explicit still material Surface/u);
  assert.throws(() => renderFineTextMask(space, {
    ...occurrence,
    placement: occurrence.placement.kind === "flow"
      ? { ...occurrence.placement, flow: { ...occurrence.placement.flow, overflow: "shrink", minimumScale: 0.7 } }
      : occurrence.placement,
  }, material, sealTextMaskSpec({
    id: "advanced-mask", mode: "alpha", materialFit: "cover",
  })), /must be materialized by an independent package/u);
});

test("FineTextOccurrence rejects a frame span outside Timeline", () => {
  assert.throws(() => createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 0, yPx: 0, widthPx: 1080, heightPx: 192 }, flowPolicy(50)),
    sealTextItemSpec({ id: "late", document: document("Too late") }),
    textStyle("late"), stillTextMotion(), absoluteWindow("late", 149, 151),
  ), /outside/u);
});

test("Selection Text consumes explicit Selection, Timeline, Style, Motion and Placement edges", () => {
  const selection: NarrativeSelectionRef = {
    narrativeId: "script",
    id: "callout",
    startAnchorId: "selection:start",
    endAnchorId: "selection:end",
  };
  const spec = sealTextItemSpec({

    id: "meaning",
    document: document("MEANING"),
  });
  const occurrence = createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 108, yPx: 192, widthPx: 864, heightPx: 192 }, flowPolicy(80)),
    spec,
    textStyle("meaning"),
    stillTextMotion(),
    projectSelectionWindow({
      itemId: spec.id,
      semantic,
      narrative: narrativeProjection,
      selection,
      projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
    }),
  );
  assert.deepEqual(occurrence.span, { startFrame: 30, endFrameExclusive: 60 });
});

test("the self-described Markup Surfaces compile Style, Motion and all three spatial forms", async () => {
  const fixtureModule = { name: "example.text-inputs", version: "1" } as const;
  const fixtureSurface = {
    name: "inputs", tag: "Inputs", mode: "structured",
    outputs: [
      recipeType,
      timelineTypes.timeline,
      temporalTypes.window,
      spatialTypes.point,
      spatialTypes.frame,
      spatialTypes.path,
      mediaTypes.fontArtifact,
      mediaTypes.compositableSurface,
      textTypes.text,
    ],
  } as const;
  const fixtureManifest: ModuleManifest = {
    format: "hypit.module@1",
    name: fixtureModule.name,
    version: fixtureModule.version,
    dependencies: [
      timelineDependency,
      temporalDependency,
      spatialDependency,
      mediaDependency,
      {
        module: { name: recipeManifest.name, version: recipeManifest.version },
      },
      textDependency,
    ],
    types: [],
    capabilities: [],
    producers: [],
  };
  const closure = createResolvedClosure([
    ...videoContractManifests,
    textManifest,
    textFineManifest,
    fixtureManifest,
  ]);
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      {
        id: "editorial",
        type: recipeType,
        value: { kind: "inline", value: {

          path: "text.editorial",
          properties: {
            size: 44,
            "line-height": 1.15,
          },
        } },
        range: element.range,
      },
      {
        id: "mask-editorial",
        type: recipeType,
        value: { kind: "inline", value: {

          path: "text.mask-editorial",
          properties: {
            size: 100,
            "line-height": 1,
          },
        } },
        range: element.range,
      },
      { id: "semantic", type: timelineTypes.timeline, value: { kind: "inline", value: semantic }, range: element.range },
      { id: "whole-window", type: temporalTypes.window, value: { kind: "inline", value: projectProgramWindow({ itemId: "whole-window", semantic,
        projection: { start: { ref: "timeline.start" }, end: { ref: "timeline.end" } } }) }, range: element.range },
      { id: "point-window", type: temporalTypes.window, value: { kind: "inline", value: projectProgramWindow({ itemId: "point-window", semantic,
        projection: { start: { ref: "absolute", at: { unit: "frames", value: 30 } }, end: { ref: "absolute", at: { unit: "frames", value: 60 } } } }) }, range: element.range },
      { id: "title-point", type: spatialTypes.point, value: { kind: "inline", value: { xPx: 540, yPx: 120 } }, range: element.range },
      { id: "body-frame", type: spatialTypes.frame, value: { kind: "inline", value: { xPx: 80, yPx: 220, widthPx: 920, heightPx: 520 } }, range: element.range },
      { id: "arc", type: spatialTypes.path, value: { kind: "inline", value: { commands: [
        { kind: "move", xPx: 120, yPx: 900 },
        { kind: "cubic", control1X: 360, control1Y: 760, control2X: 720, control2Y: 1_040, xPx: 960, yPx: 900 },
      ] } }, range: element.range },
      { id: "exact-font", type: mediaTypes.fontArtifact, value: { kind: "inline", value: exactTestFont }, range: element.range },
      { id: "material", type: mediaTypes.compositableSurface, value: { kind: "inline", value: exactTestSurface }, range: element.range },
      { id: "copy", type: textTypes.text, value: { kind: "inline", value: sealText("Hello from a Text edge") }, range: element.range },
    ],
    components: [],
    fragments: [],
  }) });
  surfaces.registerStructured({ module: textFineModuleRef, declaration: textFineMarkupSurfaces.find((item) => item.name === "style")!, handler: decodeTypographyStyleSurface });
  surfaces.registerStructured({ module: textFineModuleRef, declaration: textFineMarkupSurfaces.find((item) => item.name === "motion")!, handler: decodeTypographyMotionSurface });
  surfaces.registerStructured({ module: textFineModuleRef, declaration: textFineMarkupSurfaces.find((item) => item.name === "path-motion")!, handler: decodeTypographyPathMotionSurface });
  surfaces.registerStructured({ module: textFineModuleRef, declaration: textFineMarkupSurfaces.find((item) => item.name === "flow")!, handler: decodeTypographyFlowSurface });
  surfaces.registerStructured({ module: textFineModuleRef, declaration: textFineMarkupSurfaces.find((item) => item.name === "point")!, handler: decodeTypographyPointSurface });
  surfaces.registerStructured({ module: textFineModuleRef, declaration: textFineMarkupSurfaces.find((item) => item.name === "path")!, handler: decodeTypographyPathSurface });
  surfaces.registerStructured({ module: textFineModuleRef, declaration: textFineMarkupSurfaces.find((item) => item.name === "mask")!, handler: decodeTypographyMaskSurface });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule: (request) => request.from === "example.text-inputs@1" ? fixtureModule : textFineModuleRef,
  }));
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, spatialComponent.validators ?? []);
  registerTypeValidatorFacets(validators, textComponent.validators ?? []);
  const compiled = await compileSourceClosure({
    entry: resolveSelfDescribedTextSource({
      id: "/project/text.svml",
      name: "text.svml",
      text: `<?svml using="@hypit/markup@1"?>
      <svml>
        <import as="fixture" from="example.text-inputs@1"/>
        <import as="text" from="@hypit/text-fine@1"/>
        <fixture:Inputs/>
        <text:Style id="poster" recipe={editorial} font={exact-font}>
          <text:Fill color="#f8fafc"/>
          <text:Stroke color="#111827" width="3" placement="outside"/>
          <text:Box target="line" continuity="isolated" color="#2563eb" padding="5 10" radius="8"/>
        </text:Style>
        <text:Style id="mask-shape-style" recipe={mask-editorial} font={exact-font}>
          <text:Fill color="#ffffff"/>
        </text:Style>
        <text:Motion id="arrive">
          <text:ItemKeyframe at="0" y="24" opacity="0"/>
          <text:ItemKeyframe at="150" y="0" opacity="1"/>
          <text:Sequence id="words" unit="word" start-index="0" end-index="2" duration-frames="12" stagger-frames="3">
            <text:Keyframe at="0" opacity="0"/>
            <text:Keyframe at="1" opacity="1"/>
          </text:Sequence>
        </text:Motion>
        <text:PathMotion id="orbit-travel">
          <text:Keyframe at="0" margin="0"/>
          <text:Keyframe at="150" margin="120" easing="ease-in-out"/>
        </text:PathMotion>
        <text:Flow id="standalone-flow" timeline={semantic} within={body-frame} style={poster} z="70" overflow="shrink" minimum-scale="0.65" during={whole-window}>
          Independent flow
        </text:Flow>
        <text:Point id="standalone-point" timeline={semantic} point={title-point} style={poster} z="70" content={copy} during={point-window}/>
        <text:Path id="standalone-path" timeline={semantic} path={arc} style={poster} z="70" motion={arrive} path-motion={orbit-travel} during={whole-window}>
          Independent path
        </text:Path>
        <text:Point id="hook" timeline={semantic} content={copy} point={title-point} style={poster} z="70" during={whole-window}/>
        <text:Flow id="body" timeline={semantic} within={body-frame} style={poster} z="70" overflow="shrink" minimum-scale="0.65" motion={arrive} during={whole-window}>
          <text:P id="first">Rich <text:Span style={poster}>inline text</text:Span><text:Break/>wraps.</text:P>
        </text:Flow>
        <text:Path id="arc-title" timeline={semantic} path={arc} style={poster} z="70" during={whole-window}>Along the path</text:Path>
        <text:Flow id="mask-shape" timeline={semantic} within={body-frame} style={mask-shape-style} z="75" wrap="none" during={whole-window}>MASK</text:Flow>
        <text:Mask id="masked-titles" timeline={semantic} text={mask-shape.occurrence} material={material}/>
      </svml>`,
    }),
    closure,
    frontends,
    admitRecord: createRecordAdmitter(validators),
    resolveSource() { throw new Error("Text fixture has no source imports."); },
  });
  const maskOccurrence = resolveCompiledSourceExport(compiled, "mask-shape.occurrence", textFineTypes.occurrence);
  const flowOccurrence = resolveCompiledSourceExport(compiled, "standalone-flow.occurrence", textFineTypes.occurrence);
  const flowVisual = resolveCompiledSourceExport(compiled, "standalone-flow.visual", compositionTypes.visualTrack);
  const pointVisual = resolveCompiledSourceExport(compiled, "standalone-point.visual", compositionTypes.visualTrack);
  const pathVisual = resolveCompiledSourceExport(compiled, "standalone-path.visual", compositionTypes.visualTrack);
  const track = resolveCompiledSourceExport(compiled, "masked-titles.visual", compositionTypes.visualTrack);
  assert.equal(maskOccurrence.ref.kind, "logical-output");
  assert.equal(flowOccurrence.ref.kind, "logical-output");
  assert.equal(flowVisual.ref.kind, "logical-output");
  assert.equal(pointVisual.ref.kind, "logical-output");
  assert.equal(pathVisual.ref.kind, "logical-output");
  assert.equal(track.ref.kind, "logical-output");
  const occurrenceBuild = start(compiled.program, compiled.graph, sealBuildRequest({
    targets: [flowVisual, pointVisual, pathVisual].map((value) => ({
      output: value.ref.kind === "logical-output" ? value.ref.id : "",
    })),
  }));
  const occurrenceProducers = occurrenceBuild.plan.steps.map((step) => step.producer.name);
  assert.equal(occurrenceProducers.filter((name) => name === textFineProducers.createOccurrence.name).length, 3);
  assert.equal(occurrenceProducers.filter((name) => name === textFineProducers.renderOccurrence.name).length, 3);
  assert.equal(occurrenceProducers.includes("create-text-fine-set"), false);
  assert.equal(occurrenceProducers.includes("append-text-item"), false);
  assert.equal(occurrenceProducers.includes("finalize-text-fine"), false);
  const build = start(compiled.program, compiled.graph, sealBuildRequest({
    targets: [{ output: track.ref.kind === "logical-output" ? track.ref.id : "" }],
  }));
  const producers = build.plan.steps.map((step) => step.producer.name);
  assert.equal(producers.filter((name) => name === textFineProducers.bindArea.name).length, 1);
  assert.equal(producers.filter((name) => name === textFineProducers.renderOccurrenceMask.name).length, 1);
});

test("fine Text occurrences expose only absolute timing vocabulary", () => {
  for (const name of ["flow", "point", "path"] as const) {
    const surface = textFineMarkupSurfaces.find((item) => item.name === name);
    assert.ok(surface);
    const attributes: readonly string[] = surface.vocabulary.attributes.map((attribute) => attribute.name);
    assert.equal(attributes.includes("semantic"), false);
    assert.equal(attributes.includes("selection"), false);
    assert.equal(attributes.includes("segment"), false);
    assert.equal(attributes.includes("moment"), false);
    assert.deepEqual(attributes.filter((attribute) => ["during", "from", "until", "for"].includes(attribute)),
      ["during"]);
  }
  const mask = textFineMarkupSurfaces.find((item) => item.name === "mask");
  assert.ok(mask);
  const maskAttributes: readonly string[] = mask.vocabulary.attributes.map((attribute) => attribute.name);
  assert.equal(maskAttributes.includes("semantic"), false);
});

test("rich Text lowers ordered glyph layers, boxes, bounded flow, sequences and Path Text", () => {
  const base = textStyle("rich");
  const rich = sealTextStyle({
    ...base,
    typography: {
      ...base.typography,
      language: "en",
      trackingPx: 1.5,
      decorations: [{
        line: "underline", paint: { kind: "solid", color: "#facc15" },
        style: "wavy", thicknessPx: 2, offsetPx: 4, skipInk: true,
      }],
    },
    paints: [
      { kind: "shadow", paint: { kind: "solid", color: "#2563eb" }, offsetX: 7, offsetY: 6, blurPx: 3, spreadPx: 1 },
      { kind: "stroke", paint: { kind: "solid", color: "#ef4444" }, widthPx: 5, placement: "outside" },
      { kind: "fill", paint: { kind: "linear-gradient", angleDeg: 30, stops: [
        { offset: 0, color: "#ffffff", opacity: 1 },
        { offset: 1, color: "#a7f3d0", opacity: 1 },
      ] } },
      { kind: "stroke", paint: { kind: "solid", color: "#fde047" }, widthPx: 2, placement: "inside" },
      { kind: "shadow", paint: { kind: "solid", color: "#16a34a" }, offsetX: -4, offsetY: 3, blurPx: 0, spreadPx: 0 },
      { kind: "glow", paint: { kind: "solid", color: "#e879f9" }, blurPx: 8, spreadPx: 2 },
      {
        kind: "box", target: "line", continuity: "isolated",
        decoration: {
          fill: { kind: "radial-gradient", center: { x: 0.5, y: 0.5 }, stops: [
            { offset: 0, color: "#172554", opacity: 0.9 },
            { offset: 1, color: "#020617", opacity: 0.9 },
          ] },
          paddingPx: { top: 4, right: 8, bottom: 4, left: 8 },
          radiiPx: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
          shadows: [],
        },
      },
      {
        kind: "box", target: "word", continuity: "isolated",
        decoration: {
          paddingPx: { top: 1, right: 2, bottom: 1, left: 2 },
          radiiPx: { topLeft: 2, topRight: 2, bottomRight: 2, bottomLeft: 2 },
          shadows: [],
        },
      },
    ],
  });
  const pathStyle = sealTextStyle({
    ...base,
    id: "path",
    paints: [{ kind: "fill", paint: { kind: "radial-gradient", center: { x: 0.5, y: 0.5 }, stops: [
      { offset: 0, color: "#ffffff", opacity: 1 },
      { offset: 1, color: "#38bdf8", opacity: 1 },
    ] } }],
  });
  const motion = sealTextMotion({

    id: "sequenced",
    item: { keyframes: [
      { atFrame: 0, style: [{ name: "opacity", value: 0 }, { name: "transform", value: "translateY(20px)" }] },
      { atFrame: 10, easing: "ease-out", style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0px)" }] },
    ] },
    sequences: [
      {
        id: "words", unit: "word", range: { start: 0, endExclusive: 3 }, order: "reverse",
        startFrame: 0, unitDurationFrames: 20, staggerFrames: 4, cycles: 1,
        keyframes: [
          { atProgress: 0, style: [{ name: "opacity", value: 0 }, { name: "transform", value: "scale(0.7)" }] },
          { atProgress: 1, easing: "ease-out", style: [{ name: "opacity", value: 1 }, { name: "transform", value: "scale(1)" }] },
        ],
      },
      {
        id: "lines", unit: "line", range: { start: 0, endExclusive: 2 }, order: "forward",
        startFrame: 20, unitDurationFrames: 15, staggerFrames: 5, cycles: 1,
        keyframes: [
          { atProgress: 0, style: [{ name: "opacity", value: 0 }] },
          { atProgress: 1, style: [{ name: "opacity", value: 1 }] },
        ],
      },
    ],
  });
  const pathMotion = sealTextPathMotion({
    id: "path-motion",
    keyframes: [{ atFrame: 0, startMarginPx: 0 }, { atFrame: 180, startMarginPx: 120, easing: "ease-in-out" }],
  });
  const area = createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 80, yPx: 200, widthPx: 720, heightPx: 320 }, flowPolicy(75, { overflow: "shrink", maxLines: 3, minimumScale: 0.6 })),
    sealTextItemSpec({
      id: "area",
      document: { paragraphs: [{
          id: "p1",
          inlines: [
            { kind: "text", id: "latin", text: "Intent stays " },
            { kind: "text", id: "cjk", text: "可见", language: "zh-Hans", style: { typography: { weight: 400 } } },
            { kind: "break", id: "break" },
            { kind: "text", id: "rtl", text: "مرحبا 👩🏽‍💻 e\u0301", language: "ar", direction: "rtl" },
          ],
        }] },
    }),
    rich, motion, absoluteWindow("area", 0, 150),
  );
  const path = createFineTextOccurrence(
    space,
    bindPathTextPlacement({ commands: [
      { kind: "move", xPx: 100, yPx: 700 },
      { kind: "quadratic", controlX: 540, controlY: 520, xPx: 980, yPx: 700 },
    ] }, pathPolicy(75), pathMotion),
    sealTextItemSpec({ id: "path", document: document("Renderer-neutral Path Text") }),
    pathStyle, stillTextMotion("path-still"), absoluteWindow("path", 0, 150),
  );
  const rendered = compileHtmlProgram(sealComposition({
    id: "rich-text-film", canvas: { width: 1080, height: 900, clearColor: "#000000" },
    tracks: [renderFineTextOccurrence(space, area), renderFineTextOccurrence(space, path)],
  }), space);
  assert.match(rendered.html, /data-hypit-text-paint-layer="5"/u);
  assert.match(rendered.html, /feMorphology/u);
  assert.match(rendered.html, /linear-gradient\(30deg/u);
  assert.match(rendered.html, /radial-gradient/u);
  assert.match(rendered.html, /data-hypit-text-overflow="shrink"/u);
  assert.match(rendered.html, /data-hypit-text-line-sequences/u);
  assert.match(rendered.html, /<textPath/u);
  assert.match(rendered.html, /data-hypit-text-path-margin/u);
});

test("a paragraph's source indentation is not part of its words", async () => {
  const fixtureModule = { name: "example.text-inputs", version: "1" } as const;
  const fixtureSurface = {
    name: "inputs", tag: "Inputs", mode: "structured",
    outputs: [
      recipeType, timelineTypes.timeline, temporalTypes.window, spatialTypes.frame,
      mediaTypes.fontArtifact, textTypes.text,
    ],
  } as const;
  const fixtureManifest: ModuleManifest = {
    format: "hypit.module@1", name: fixtureModule.name, version: fixtureModule.version,
    dependencies: [timelineDependency, temporalDependency, spatialDependency, mediaDependency,
      { module: { name: recipeManifest.name, version: recipeManifest.version } }, textDependency],
    types: [], capabilities: [], producers: [],
  };
  const closure = createResolvedClosure([
    ...videoContractManifests, textManifest, textFineManifest, fixtureManifest,
  ]);
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "editorial", type: recipeType, value: { kind: "inline", value: {
          path: "text.editorial", properties: { size: 44, "line-height": 1.15 } } },
        range: element.range },
      { id: "semantic", type: timelineTypes.timeline, value: { kind: "inline", value: semantic }, range: element.range },
      { id: "whole-window", type: temporalTypes.window, value: { kind: "inline", value: projectProgramWindow({ itemId: "whole-window", semantic,
        projection: { start: { ref: "timeline.start" }, end: { ref: "timeline.end" } } }) }, range: element.range },
      { id: "body-frame", type: spatialTypes.frame, value: { kind: "inline", value: { xPx: 80, yPx: 220, widthPx: 920, heightPx: 520 } }, range: element.range },
      { id: "exact-font", type: mediaTypes.fontArtifact, value: { kind: "inline", value: exactTestFont }, range: element.range },
    ],
    components: [], fragments: [],
  }) });
  surfaces.registerStructured({ module: textFineModuleRef, declaration: textFineMarkupSurfaces.find((item) => item.name === "style")!, handler: decodeTypographyStyleSurface });
  surfaces.registerStructured({ module: textFineModuleRef, declaration: textFineMarkupSurfaces.find((item) => item.name === "flow")!, handler: decodeTypographyFlowSurface });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule: (request) => request.from === "example.text-inputs@1" ? fixtureModule : textFineModuleRef,
  }));
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, spatialComponent.validators ?? []);
  registerTypeValidatorFacets(validators, textComponent.validators ?? []);
  const source = `<?svml using="@hypit/markup@1"?>
        <svml>
          <import as="fixture" from="example.text-inputs@1"/>
          <import as="text" from="@hypit/text-fine@1"/>
          <fixture:Inputs/>
          <text:Style id="poster" recipe={editorial} font={exact-font}>
            <text:Fill color="#f8fafc"/>
          </text:Style>
          <text:Flow id="body" timeline={semantic} within={body-frame} style={poster} z="70" overflow="shrink" minimum-scale="0.65" during={whole-window}>
            <text:P id="first">
              Top 5 Most Popular
              Ways to <text:Span style={poster}>learn AI</text:Span>
            </text:P>
          </text:Flow>
        </svml>`;
  // Windows checkouts can carry CRLF line endings; the words must read the same.
  for (const newline of ["\n", "\r\n"]) {
    const compiled = await compileSourceClosure({
      entry: resolveSelfDescribedTextSource({
        id: "/project/text.svml", name: "text.svml",
        text: source.replaceAll("\n", newline),
      }),
      closure, frontends,
      admitRecord: createRecordAdmitter(validators),
      resolveSource() { throw new Error("Text fixture has no source imports."); },
    });
    const track = resolveCompiledSourceExport(compiled, "body.visual", compositionTypes.visualTrack);
    assert.equal(track.ref.kind, "logical-output");
    // The paragraph's words are the copy, not the indentation the file put around it.
    const runs: unknown[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) { for (const item of value) visit(item); return; }
      if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.text === "string") runs.push(record.text);
        for (const key of Object.keys(record)) visit(record[key]);
      }
    };
    visit(compiled.program);
    assert.ok(runs.length >= 2, "the compiled program holds the track's text runs");
    const clean = runs.join("|");
    // The paragraph's runs read as the copy written across two lines, not the file's layout.
    assert.match(clean, /Top 5 Most Popular\nWays to /u,
      "the two source lines remain one paragraph with a line break");
    assert.match(clean, /learn AI/u, "the Span run keeps its words");
    assert.doesNotMatch(clean, /\n +/u, "no line begins with indentation");
    assert.doesNotMatch(clean, /\\n +Top 5/u, "leading indentation must not be part of the words");
    assert.doesNotMatch(clean, /\r/u, "line endings are not part of the words");
  }
});
