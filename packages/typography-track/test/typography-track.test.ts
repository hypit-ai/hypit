import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";
import { semanticTrackFixture } from "../../../test/semantic-track-fixture.js";

import { spatialComponent, videoContractManifests } from "../../../test/support/video-domain.js";
import { registerTypeValidatorFacets } from "@hypit/component-kit";
import { compositionTypes, sealComposition, sealVisualTrack } from "@hypit/composition";
import { createResolvedClosure, sealBuildRequest, start } from "@hypit/core";
import { AuthorFrontendRegistry, compileSourceClosure, resolveCompiledSourceExport } from "@hypit/elaborator";
import { compileHyperframesDocument } from "@hypit/hyperframes";
import { mediaDependency, mediaTypes } from "@hypit/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@hypit/media";
import type { NarrativeSelectionRef } from "@hypit/narrative";
import { sealProgramSpace } from "@hypit/program-space";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import type { ModuleManifest } from "@hypit/protocol";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import {
  appendSelectionTextItem,
  bindAreaTextPlacement,
  createTypographyTrackSet,
  finalizeTypographyTrack,
  assertTypographyTrackProgramIdentity,
  renderTypographyTrack,
  renderTextMaskTrack,
  sealTextItemSpec,
  sealTextStyle,
  sealTypographyTrackHeader,
  sealTypographyTrackProgram,
  stillTextMotion,
  sealTextMotion,
  sealTextMaskSpec,
  decodeTypographyMotionSurface,
  decodeTypographyMaskSurface,
  decodeTypographyStyleSurface,
  decodeTypographyTrackSurface,
  typographyTrackManifest,
  typographyTrackMarkupSurfaces,
  typographyTrackModuleRef,
  typographyTrackProducers,
  typographyTrackTypes,
} from "@hypit/typography-track";
import type { TextStyle } from "@hypit/typography-track";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { svsManifest, svsRecipeType } from "@hypit/svs";
import { sealText, textComponent, textDependency, textManifest, textTypes } from "@hypit/text";
import { MarkupSurfaceRegistry, createMarkupAuthorFrontend } from "@hypit/markup";
import { createRecordAdmitter, TypeValidatorRegistry } from "@hypit/validation";

const space = sealProgramSpace({
  durationSec: 5,
  frameRate: { numerator: 30, denominator: 1 },
});
const semantic = semanticTrackFixture(space, { anchors: [
  { identity: "selection:start", frame: 30 },
  { identity: "selection:end", frame: 60 },
] });

const exactTestFont: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob",
    digest: fixtureDigest("typography-track-test-font"),
    size: 1,
    mediaType: "font/woff2",
  } }],
  weight: 700,
  style: "normal",
};

const exactTestSurface: CompositableSurfaceRef = {
  artifact: {
    kind: "blob",
    digest: fixtureDigest("typography-track-test-surface"),
    size: 1,
    mediaType: "image/png",
  },
  width: 920,
  height: 520,
  colorSpace: "srgb",
  alphaMode: "straight",
  timing: { kind: "still" },
};

function textStyle(id: string, stackingOrder = 50): TextStyle {
  return sealTextStyle({

    id,
    stackingOrder,
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
    area: {
      inlineSize: "fixed",
      blockSize: "fixed",
      paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
      inlineAlign: "center",
      blockAlign: "center",
      wrap: "word",
      overflow: "visible",
      clipToFrame: false,
      columns: 1,
      columnGapPx: 0,
      metricEdge: "line-box",
    },
    point: { anchorInline: "center", anchorBlock: "center" },
    path: {
      side: "left",
      orientation: "follow",
      startMarginPx: 0,
      endMarginPx: 0,
      align: "start",
      reverse: false,
      overflow: "visible",
    },
  });
}

function document(text: string) {
  return { paragraphs: [{ id: "paragraph", inlines: [{ kind: "text" as const, id: "run", text }] }] };
}

test("persistent and timed Text Items lower to ordinary VisualTrack Presents", () => {
  const style = textStyle("editorial", 55);
  const program = sealTypographyTrackProgram({

    id: "editorial-text",
    items: [
      {
        id: "watermark",
        span: { startFrame: 0, endFrameExclusive: 150 },
        tieBreak: "watermark",
        geometry: { kind: "point", point: { xPx: 900, yPx: 80 } },
        document: document("SVML"),
        style: { ...style, id: "watermark", stackingOrder: 90 },
        motion: stillTextMotion(),
      },
      {
        id: "callout",
        span: { startFrame: 30, endFrameExclusive: 90 },
        tieBreak: "callout",
        geometry: { kind: "area", frame: { xPx: 108, yPx: 1248, widthPx: 864, heightPx: 230.4 } },
        document: document("Intent, not timeline"),
        style,
        motion: stillTextMotion(),
      },
    ],
  });

  assert.doesNotThrow(() => assertTypographyTrackProgramIdentity(program, space));
  const track = renderTypographyTrack(space, program);
  assert.deepEqual(track.presents.map((present) => present.id), ["watermark", "callout"]);
  assert.equal(track.presents[0]?.elements[2]?.kind, "text-flow");

  const lower = sealVisualTrack({
    visualIr: "hypit.visual-ir@1",
    id: "lower",
    presents: [{
      id: "lower",
      span: { startFrame: 0, endFrameExclusive: 150 },
      stacking: { order: 40, tieBreak: "lower" },
      elements: [{ id: "root", kind: "box", order: 0, style: [] }],
    }],
  });
  const rendered = compileHyperframesDocument(sealComposition({
    id: "text-film",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [track, lower],
  }), space);
  assert.match(rendered.html, /data-hypit-text-run="run"/u);
  assert.match(rendered.html, /background-image:linear-gradient\(#111111,#111111\)/u);
  assert.ok(rendered.html.indexOf('data-hypit-present-id="lower"') < rendered.html.indexOf('data-hypit-present-id="callout"'));
});

test("Text Mask explicitly consumes one authored Text Program and one owned still Surface", () => {
  const program = sealTypographyTrackProgram({
    id: "mask-shape",
    items: [{
      id: "mask-title",
      span: { startFrame: 0, endFrameExclusive: 150 }, tieBreak: "mask-title",
      geometry: { kind: "area", frame: { xPx: 100, yPx: 200, widthPx: 800, heightPx: 240 } },
      document: document("OWNED MASK"),
      style: (() => {
        const style = textStyle("mask-style", 75);
        return { ...style, area: { ...style.area, wrap: "none" as const } };
      })(),
      motion: stillTextMotion(),
    }],
  });
  const material: CompositableSurfaceRef = {
    artifact: { kind: "blob", digest: fixtureDigest("text-mask-material"), size: 1, mediaType: "image/png" },
    width: 800, height: 240, colorSpace: "srgb", alphaMode: "straight", timing: { kind: "still" },
  };
  const track = renderTextMaskTrack(space, program, material, sealTextMaskSpec({
    id: "masked-title", mode: "alpha", materialFit: "cover",
  }));
  assert.equal(track.id, "masked-title");
  assert.deepEqual(track.presents[0]?.elements.map((element) => element.kind), ["mask", "text", "surface"]);
  assert.equal(track.presents[0]?.elements[2]?.parent, "mask");
  const html = compileHyperframesDocument(sealComposition({
    id: "owned-mask-composition",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" }, tracks: [track],
  }), space).html;
  assert.match(html, /<foreignObject/u);
  assert.match(html, />OWNED MASK</u);
  assert.match(html, /mask-type:alpha/u);
  assert.throws(() => renderTextMaskTrack(space, program, {
    ...material, artifact: { ...material.artifact, mediaType: "video/webm" },
    timing: { kind: "frames", frameCount: 150, frameRate: { numerator: 30, denominator: 1 } },
  }, sealTextMaskSpec({
    id: "timed-mask", mode: "alpha", materialFit: "cover",
  })), /requires one explicit still material Surface/u);
  assert.throws(() => renderTextMaskTrack(space, sealTypographyTrackProgram({
    ...program,
    id: "advanced-mask-shape",
    items: program.items.map((item) => ({
      ...item,
      style: { ...item.style, area: { ...item.style.area, overflow: "shrink", minimumScale: 0.7 } },
    })),
  }), material, sealTextMaskSpec({
    id: "advanced-mask", mode: "alpha", materialFit: "cover",
  })), /must be materialized by an independent package/u);
});

test("TypographyTrackProgram rejects a frame span outside ProgramSpace", () => {
  const program = sealTypographyTrackProgram({

    id: "invalid-text",
    items: [{
      id: "late",
      span: { startFrame: 149, endFrameExclusive: 151 },
      tieBreak: "late",
      geometry: { kind: "area", frame: { xPx: 0, yPx: 0, widthPx: 1080, heightPx: 192 } },
      document: document("Too late"),
      style: textStyle("late"),
      motion: stillTextMotion(),
    }],
  });
  assert.throws(() => renderTypographyTrack(space, program), /outside ProgramSpace/u);
});

test("Selection Text consumes explicit Selection, SemanticTrack, Style, Motion and Placement edges", () => {
  const selection: NarrativeSelectionRef = {

    id: "callout",
    occurrences: [{ occurrence: 1, startAnchorId: "selection:start", endAnchorId: "selection:end" }],
  };
  const header = sealTypographyTrackHeader({ id: "selected-text" });
  const spec = sealTextItemSpec({

    id: "meaning",
    document: document("MEANING"),
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
    expansion: { kind: "one" },
  });
  const program = finalizeTypographyTrack(header, appendSelectionTextItem(
    createTypographyTrackSet(),
    header,
    semantic,
    selection,
    bindAreaTextPlacement({ xPx: 108, yPx: 192, widthPx: 864, heightPx: 192 }),
    spec,
    textStyle("meaning", 80),
    stillTextMotion(),
  ));
  assert.deepEqual(program.items.map((item) => item.span), [{ startFrame: 30, endFrameExclusive: 60 }]);
});

test("the self-described Markup Surfaces compile Style, Motion and all three spatial forms", async () => {
  const fixtureModule = { name: "example.text-inputs", version: "1" } as const;
  const fixtureSurface = {
    name: "inputs", tag: "Inputs", mode: "structured",
    outputs: [
      svsRecipeType,
      semanticTrackTypes.track,
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
      semanticTrackDependency,
      spatialDependency,
      mediaDependency,
      {
        module: { name: svsManifest.name, version: svsManifest.version },
      },
      textDependency,
    ],
    types: [],
    capabilities: [],
    producers: [],
  };
  const closure = createResolvedClosure([
    ...videoContractManifests,
    svsManifest,
    textManifest,
    typographyTrackManifest,
    fixtureManifest,
  ]);
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      {
        id: "editorial",
        type: svsRecipeType,
        value: { kind: "inline", value: {

          path: "text.editorial",
          properties: {
            "stack-order": 70,
            size: 44,
            "line-height": 1.15,
            "inline-size": "fixed",
            "block-size": "fixed",
            wrap: "word",
            overflow: "shrink",
            "minimum-scale": 0.65,
          },
        } },
        range: element.range,
      },
      {
        id: "mask-editorial",
        type: svsRecipeType,
        value: { kind: "inline", value: {

          path: "text.mask-editorial",
          properties: {
            "stack-order": 75,
            size: 100,
            "line-height": 1,
            "inline-size": "fixed",
            "block-size": "fixed",
            wrap: "none",
            overflow: "visible",
          },
        } },
        range: element.range,
      },
      { id: "semantic", type: semanticTrackTypes.track, value: { kind: "inline", value: semantic }, range: element.range },
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
  surfaces.registerStructured({ module: typographyTrackModuleRef, declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "style")!, handler: decodeTypographyStyleSurface });
  surfaces.registerStructured({ module: typographyTrackModuleRef, declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "motion")!, handler: decodeTypographyMotionSurface });
  surfaces.registerStructured({ module: typographyTrackModuleRef, declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "track")!, handler: decodeTypographyTrackSurface });
  surfaces.registerStructured({ module: typographyTrackModuleRef, declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "mask")!, handler: decodeTypographyMaskSurface });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule: (request) => request.from === "example.text-inputs@1" ? fixtureModule : typographyTrackModuleRef,
  }));
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, spatialComponent.validators ?? []);
  registerTypeValidatorFacets(validators, textComponent.validators ?? []);
  const compiled = await compileSourceClosure({
    entry: {
      id: "/project/text.svml",
      name: "text.svml",
      text: `<?svml using="@hypit/markup@1"?>
      <svml>
        <import as="fixture" from="example.text-inputs@1"/>
        <import as="text" from="@hypit/typography-track@1"/>
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
        <text:Track id="titles" semantic={semantic}>
          <text:Point id="hook" content={copy} placement={title-point} style={poster} during="program"/>
          <text:Area id="body" placement={body-frame} style={poster} motion={arrive} during="program">
            <text:P id="first">Rich <text:Span style={poster}>inline text</text:Span><text:Break/>wraps.</text:P>
          </text:Area>
          <text:Path id="arc-title" placement={arc} style={poster} during="program">Along the path</text:Path>
        </text:Track>
        <text:Track id="mask-shape" semantic={semantic}>
          <text:Area id="mask-word" placement={body-frame} style={mask-shape-style} during="program">MASK</text:Area>
        </text:Track>
        <text:Mask id="masked-titles" semantic={semantic} text={mask-shape.program} material={material}/>
      </svml>`,
    },
    closure,
    frontends,
    admitRecord: createRecordAdmitter(validators),
    resolveSource() { throw new Error("Text fixture has no source imports."); },
  });
  const program = resolveCompiledSourceExport(compiled, "mask-shape.program", typographyTrackTypes.program);
  const ordinaryTrack = resolveCompiledSourceExport(compiled, "titles.track", compositionTypes.visualTrack);
  const track = resolveCompiledSourceExport(compiled, "masked-titles.track", compositionTypes.visualTrack);
  assert.equal(program.ref.kind, "logical-output");
  assert.equal(ordinaryTrack.ref.kind, "logical-output");
  assert.equal(track.ref.kind, "logical-output");
  const build = start(compiled.program, compiled.graph, sealBuildRequest({
    targets: [
      { output: ordinaryTrack.ref.kind === "logical-output" ? ordinaryTrack.ref.id : "" },
      { output: track.ref.kind === "logical-output" ? track.ref.id : "" },
    ],
  }));
  const producers = build.plan.steps.map((step) => step.producer.name);
  assert.equal(producers.filter((name) => name === typographyTrackProducers.bindPoint.name).length, 1);
  assert.equal(producers.filter((name) => name === typographyTrackProducers.bindArea.name).length, 2);
  assert.equal(producers.filter((name) => name === typographyTrackProducers.bindPath.name).length, 1);
  assert.equal(producers.filter((name) => name === typographyTrackProducers.render.name).length, 1);
  assert.equal(producers.filter((name) => name === typographyTrackProducers.renderMask.name).length, 1);
});

test("rich Text lowers ordered glyph layers, boxes, bounded flow, sequences and Path Text", () => {
  const base = textStyle("rich", 75);
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
    area: { ...base.area, overflow: "shrink", maxLines: 3, minimumScale: 0.6 },
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
  const pathMotion = sealTextMotion({
    id: "path-motion", sequences: [],
    pathMargin: { keyframes: [{ atFrame: 0, startMarginPx: 0 }, { atFrame: 180, startMarginPx: 120, easing: "ease-in-out" }] },
  });
  const track = renderTypographyTrack(space, sealTypographyTrackProgram({

    id: "rich-text",
    items: [
      {
        id: "area", span: { startFrame: 0, endFrameExclusive: 150 }, tieBreak: "area",
        geometry: { kind: "area", frame: { xPx: 80, yPx: 200, widthPx: 720, heightPx: 320 } },
        document: { paragraphs: [{
          id: "p1",
          inlines: [
            { kind: "text", id: "latin", text: "Intent stays " },
            { kind: "text", id: "cjk", text: "可见", language: "zh-Hans", style: { typography: { weight: 400 } } },
            { kind: "break", id: "break" },
            { kind: "text", id: "rtl", text: "مرحبا 👩🏽‍💻 e\u0301", language: "ar", direction: "rtl" },
          ],
        }] },
        style: rich,
        motion,
      },
      {
        id: "path", span: { startFrame: 0, endFrameExclusive: 150 }, tieBreak: "path",
        geometry: { kind: "path", path: { commands: [
          { kind: "move", xPx: 100, yPx: 700 },
          { kind: "quadratic", controlX: 540, controlY: 520, xPx: 980, yPx: 700 },
        ] } },
        document: document("Renderer-neutral Path Text"),
        style: pathStyle,
        motion: pathMotion,
      },
    ],
  }));
  const rendered = compileHyperframesDocument(sealComposition({
    id: "rich-text-film",
    canvas: { width: 1080, height: 900, clearColor: "#000000" }, tracks: [track],
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
      svsRecipeType, semanticTrackTypes.track, spatialTypes.frame,
      mediaTypes.fontArtifact, textTypes.text,
    ],
  } as const;
  const fixtureManifest: ModuleManifest = {
    format: "hypit.module@1", name: fixtureModule.name, version: fixtureModule.version,
    dependencies: [semanticTrackDependency, spatialDependency, mediaDependency,
      { module: { name: svsManifest.name, version: svsManifest.version } }, textDependency],
    types: [], capabilities: [], producers: [],
  };
  const closure = createResolvedClosure([
    ...videoContractManifests, svsManifest, textManifest, typographyTrackManifest, fixtureManifest,
  ]);
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({ module: fixtureModule, declaration: fixtureSurface, handler: ({ element }) => ({
    records: [
      { id: "editorial", type: svsRecipeType, value: { kind: "inline", value: {
          path: "text.editorial", properties: { "stack-order": 70, size: 44, "line-height": 1.15,
            "inline-size": "fixed", "block-size": "fixed", wrap: "word", overflow: "shrink", "minimum-scale": 0.65 } } },
        range: element.range },
      { id: "semantic", type: semanticTrackTypes.track, value: { kind: "inline", value: semantic }, range: element.range },
      { id: "body-frame", type: spatialTypes.frame, value: { kind: "inline", value: { xPx: 80, yPx: 220, widthPx: 920, heightPx: 520 } }, range: element.range },
      { id: "exact-font", type: mediaTypes.fontArtifact, value: { kind: "inline", value: exactTestFont }, range: element.range },
    ],
    components: [], fragments: [],
  }) });
  surfaces.registerStructured({ module: typographyTrackModuleRef, declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "style")!, handler: decodeTypographyStyleSurface });
  surfaces.registerStructured({ module: typographyTrackModuleRef, declaration: typographyTrackMarkupSurfaces.find((item) => item.name === "track")!, handler: decodeTypographyTrackSurface });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule: (request) => request.from === "example.text-inputs@1" ? fixtureModule : typographyTrackModuleRef,
  }));
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, spatialComponent.validators ?? []);
  registerTypeValidatorFacets(validators, textComponent.validators ?? []);
  const compiled = await compileSourceClosure({
    entry: {
      id: "/project/text.svml", name: "text.svml",
      text: `<?svml using="@hypit/markup@1"?>
        <svml>
          <import as="fixture" from="example.text-inputs@1"/>
          <import as="text" from="@hypit/typography-track@1"/>
          <fixture:Inputs/>
          <text:Style id="poster" recipe={editorial} font={exact-font}>
            <text:Fill color="#f8fafc"/>
          </text:Style>
          <text:Track id="titles" semantic={semantic}>
            <text:Area id="body" placement={body-frame} style={poster} during="program">
              <text:P id="first">
                Top 5 Most Popular
                Ways to <text:Span style={poster}>learn AI</text:Span>
              </text:P>
            </text:Area>
          </text:Track>
        </svml>`,
    },
    closure, frontends,
    admitRecord: createRecordAdmitter(validators),
    resolveSource() { throw new Error("Text fixture has no source imports."); },
  });
  const track = resolveCompiledSourceExport(compiled, "titles.track", compositionTypes.visualTrack);
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
});
