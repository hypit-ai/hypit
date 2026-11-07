import assert from "node:assert/strict";
import test from "node:test";

import {
  audiovisualProgramSource,
  pictureType,
  pointwiseOperatorTemporalSupport,
  sealAudiovisualProgram,
  sealOccurrence,
  sealSpatialMapControl,
  type Occurrence,
  type PictureOperator,
  type ProgramSource,
} from "@hypit/audiovisual";
import {
  programSourceFromPreparedMedia,
} from "@hypit/audiovisual-media";
import {
  assertHtmlProgram,
  htmlNearestPictureReconstruction,
  htmlVisual,
  selectHtmlVideoSources,
} from "@hypit/html-program";
import { prepareMedia } from "@hypit/media";
import {
  exactTemporalValue,
  identityTemporalMap,
  sealLocalTemporalDomain,
  sealTemporalMap,
  type ExactTemporalValue,
  type LocalTemporalDomain,
} from "@hypit/temporal/algebra";
import {
  sealLocalSpatialDomain,
  sealSpatialMap,
  type LocalSpatialDomain,
  type SpatialMap,
} from "@hypit/spatial/algebra";
import { crossDissolveOperator } from "@hypit/picture-transition";
import { IDENTITY_PICTURE_FILTER, pictureFilterControlOperator } from "@hypit/picture-filter";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  audiovisualHtmlComponent,
  audiovisualHtmlProducers,
  audiovisualProgramHtmlSource,
  compileAudiovisualHtmlProgram,
  preparedMediaHtmlSource,
  lowerAudiovisualPictureProgramToHtmlProgram,
  visualProgramHtmlSource,
} from "../src/index.js";

const seconds = (value: number): ExactTemporalValue => exactTemporalValue({
  numerator: BigInt(value), denominator: 1n,
});
const time = (id: string, duration: number): LocalTemporalDomain =>
  sealLocalTemporalDomain({ id, duration: seconds(duration) });
const space = (id: string): LocalSpatialDomain => sealLocalSpatialDomain({
  id, region: { x: 0, y: 0, width: 100, height: 100 },
});
const map = (target: LocalSpatialDomain, source: LocalSpatialDomain, tx = 0): SpatialMap =>
  sealSpatialMap({ target, source,
    transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx, ty: 0 } });

const programTime = time("main:time", 2);
const pictureSpace = space("main:space");

function source(id: string): ProgramSource {
  return { id, outputs: { picture: {
    kind: "signal",
    type: pictureType,
    domain: time(id, 2),
    spatialDomain: space(`${id}:space`),
  } } };
}

function occurrence(id: string, value: ProgramSource, nearest = false): Occurrence {
  const local = time(`${id}:time`, 2);
  return sealOccurrence({
    id,
    source: value,
    domain: local,
    placement: {
      parent: programTime,
      start: seconds(0),
      active: { start: seconds(0), end: seconds(2) },
    },
    selections: { picture: { kind: "signal", mapping: sealTemporalMap({ stages: [{
      target: local,
      source: (value.outputs.picture as Extract<ProgramSource["outputs"][string], { kind: "signal" }>).domain,
      pieces: [{
        target: { start: seconds(0), end: seconds(2) },
        sourceAtStart: seconds(0),
        rate: { numerator: 1, denominator: 1 },
      }],
    }] }), ...(nearest ? { reconstruction: {
      signal: pictureType,
      program: htmlNearestPictureReconstruction(),
    } } : {}) } },
  });
}

function gradeOperator(): PictureOperator {
  return {
    id: "project:grade",
    inputs: ["picture"],
    temporalControls: {},
    temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
    program: htmlVisual({
      html: '<div data-project-grade>{{picture}}</div>',
      css: ":scope>[data-project-grade]{position:absolute;inset:0;filter:grayscale(1)}",
    }),
  };
}

function pictureProgram(operator = gradeOperator()) {
  const red = occurrence("red-use", source("red"));
  const blue = occurrence("blue-use", source("blue"));
  const motion = sealSpatialMapControl({
    domain: programTime,
    segments: [{
      range: { start: seconds(0), end: seconds(2) },
      from: map(pictureSpace, blue.source.outputs.picture!.spatialDomain!, 0),
      to: map(pictureSpace, blue.source.outputs.picture!.spatialDomain!, -50),
      interpolation: { kind: "affine-linear" },
    }],
  });
  return sealAudiovisualProgram({
    id: "html-proof",
    domain: programTime,
    pictureDomain: pictureSpace,
    occurrences: { "red-use": red, "blue-use": blue },
    picture: { root: "root", nodes: {
      red: { kind: "use", occurrence: "red-use", output: "picture" },
      redPlaced: { kind: "remap", input: "red",
        mapping: map(pictureSpace, red.source.outputs.picture!.spatialDomain!) },
      blue: { kind: "use", occurrence: "blue-use", output: "picture" },
      blueMotion: { kind: "remap-control", input: "blue", control: motion,
        controlMapping: identityTemporalMap(programTime) },
      blueCrop: { kind: "crop", input: "blueMotion", region: { x: 0, y: 0, width: 75, height: 100 } },
      graded: { kind: "apply", operator,
        inputs: { picture: "blueCrop" },
        controlMappings: Object.fromEntries(Object.keys(operator.temporalControls)
          .map((name) => [name, identityTemporalMap(programTime)])) },
      root: { kind: "over", inputs: ["redPlaced", "graded"] },
    } },
  });
}

function htmlOutput(id: string, width = 100) {
  const viewport = sealLocalSpatialDomain({
    id: `${id}:viewport`, region: { x: 0, y: 0, width, height: 100 },
  });
  return {
    id,
    sampling: { frameRate: { numerator: 1, denominator: 1 } },
    canvas: { width, height: 100, clearColor: "#000000" },
    pictureMapping: sealSpatialMap({ target: viewport, source: pictureSpace, transform: {
      kind: "affine", xx: 100 / width, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0,
    } }),
  } as const;
}

function htmlSource(id: string) {
  return visualProgramHtmlSource(id, "picture", htmlVisual({
    html: `<div data-av-source="${id}"></div>`,
    css: `:scope>div{position:absolute;inset:0;background:${id}}`,
  }));
}

function htmlSources(...ids: readonly string[]) {
  return { sources: ids.map(htmlSource) };
}

function preparedPicture(value: ProgramSource) {
  const output = value.outputs.picture!;
  assert.equal(output.kind, "signal");
  const domain = output.domain;
  return prepareMedia({
    id: domain.id,
    source: { kind: "blob", resource: fixtureResource(`audiovisual-html:${value.id}`),
      size: 1, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      endPts: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } },
      width: 100, height: 100, sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0, decodedUnitCount: 2,
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    }] },
    selection: { videoStreamIndex: 0, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
    } },
  });
}

test("one AVIR Programme lowers through crop, remap, over and apply into HtmlProgram", () => {
  const document = lowerAudiovisualPictureProgramToHtmlProgram({
    program: pictureProgram(),
    output: htmlOutput("html-proof"),
    sources: htmlSources("red", "blue"),
  });

  assert.doesNotThrow(() => assertHtmlProgram(document));
  assert.equal(document.frameCount, 2);
  assert.deepEqual(document.frameRate, { numerator: 1, denominator: 1 });
  assert.deepEqual(document.canvas, { width: 100, height: 100 });
  assert.match(document.html, /data-av-source="red"/u);
  assert.match(document.html, /data-av-source="blue"/u);
  assert.match(document.html, /"tx":25/u);
  assert.match(document.html, /width:75px/u);
  assert.match(document.html, /filter:grayscale\(1\)/u);
  assert.ok(document.html.indexOf("data-av-source=\"red\"")
    < document.html.indexOf("data-av-source=\"blue\""));
});

test("the complete AVIR Output sampling keeps one stable DOM instance per graph path", () => {
  const document = lowerAudiovisualPictureProgramToHtmlProgram({
    program: pictureProgram(),
    output: htmlOutput("html-sequence-proof"),
    sources: htmlSources("red", "blue"),
  });

  assert.doesNotThrow(() => assertHtmlProgram(document));
  assert.equal(document.frameCount, 2);
  assert.deepEqual(document.frameRate, { numerator: 1, denominator: 1 });
  assert.match(document.html, /"tx":0/u);
  assert.match(document.html, /"tx":25/u);
  assert.equal([...document.html.matchAll(/data-av-source="red"/gu)].length, 1);
  assert.equal([...document.html.matchAll(/data-av-source="blue"/gu)].length, 1);
});

test("PreparedMedia and an official Transition close through the real HTML terminal", () => {
  const red = occurrence("real-red-use", source("real-red"));
  const blue = occurrence("real-blue-use", source("real-blue"));
  const realProgram = sealAudiovisualProgram({
    id: "real-html-proof",
    domain: programTime,
    pictureDomain: pictureSpace,
    occurrences: { [red.id]: red, [blue.id]: blue },
    picture: { root: "transition", nodes: {
      red: { kind: "use", occurrence: red.id, output: "picture" },
      redPlaced: { kind: "remap", input: "red",
        mapping: map(pictureSpace, red.source.outputs.picture!.spatialDomain!) },
      blue: { kind: "use", occurrence: blue.id, output: "picture" },
      bluePlaced: { kind: "remap", input: "blue",
        mapping: map(pictureSpace, blue.source.outputs.picture!.spatialDomain!) },
      transition: { kind: "apply", operator: {
        ...crossDissolveOperator(programTime),
      }, inputs: { outgoing: "redPlaced", incoming: "bluePlaced" },
      controlMappings: { progress: identityTemporalMap(programTime) } },
    } },
  });
  const document = lowerAudiovisualPictureProgramToHtmlProgram({
    program: realProgram,
    output: htmlOutput("real-html-proof"),
    sources: { sources: [
      preparedMediaHtmlSource(preparedPicture(red.source)),
      preparedMediaHtmlSource(preparedPicture(blue.source)),
    ] },
  });
  assert.doesNotThrow(() => assertHtmlProgram(document));
  assert.equal(selectHtmlVideoSources(document).length, 2);
  assert.ok(selectHtmlVideoSources(document).every((source) =>
    source.startFrame === 0 && source.endFrameExclusive === 2));
  assert.equal([...document.html.matchAll(/data-hypit-video-source="media"/gu)].length, 2);
  for (const source of selectHtmlVideoSources(document)) {
    assert.ok(document.html.includes(`id="${source.elementId}"`),
      `media display plane ${source.elementId} must be directly addressable`);
  }
  assert.match(document.html, /"durationFrames":2/u);
  assert.match(document.html, /"controlPositions":\{"progress":/u);
  assert.match(document.html, /hypit-visual-process|cross/u);
});

test("package-owned Picture reconstruction survives AVIR lowering into the executable terminal", () => {
  const mediaUse = occurrence("nearest-use", source("nearest"), true);
  const program = sealAudiovisualProgram({
    id: "nearest-program",
    domain: programTime,
    pictureDomain: pictureSpace,
    occurrences: { [mediaUse.id]: mediaUse },
    picture: { root: "placed", nodes: {
      media: { kind: "use", occurrence: mediaUse.id, output: "picture" },
      placed: { kind: "remap", input: "media",
        mapping: map(pictureSpace, mediaUse.source.outputs.picture!.spatialDomain!) },
    } },
  });
  const document = lowerAudiovisualPictureProgramToHtmlProgram({
    program,
    output: htmlOutput("nearest-output"),
    sources: { sources: [preparedMediaHtmlSource(preparedPicture(mediaUse.source))] },
  });
  assert.deepEqual(selectHtmlVideoSources(document)[0]?.reconstruction, { kind: "nearest" });
});

test("a package-owned Picture Filter closes through AVIR apply and the HTML terminal", () => {
  const document = lowerAudiovisualPictureProgramToHtmlProgram({
    program: pictureProgram(pictureFilterControlOperator({
      domain: programTime,
      segments: [{
        range: { start: seconds(0), end: seconds(2) },
        from: { ...IDENTITY_PICTURE_FILTER, opacity: 0.25 },
        to: IDENTITY_PICTURE_FILTER,
        interpolation: { kind: "linear" },
      }],
    })),
    output: htmlOutput("picture-filter-html-proof"),
    sources: htmlSources("red", "blue"),
  });
  assert.doesNotThrow(() => assertHtmlProgram(document));
  assert.match(document.html, /data-hypit-picture-filter-layer/u);
  assert.match(document.html, /controlPosition\('filter'/u);
});

test("terminal lowering refuses unsupported Operator programmes and closes an explicit viewport conversion", () => {
  assert.throws(() => lowerAudiovisualPictureProgramToHtmlProgram({
    program: pictureProgram({
      id: "project:unsupported",
      inputs: ["picture"],
      temporalControls: {},
      temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
      program: { format: "project.unsupported@1", payload: {}, artifacts: [] },
    }),
    output: htmlOutput("unsupported-operator"),
    sources: htmlSources("red", "blue"),
  }), /unsupported|format/iu);

  const windowed = gradeOperator();
  assert.throws(() => lowerAudiovisualPictureProgramToHtmlProgram({
    program: pictureProgram({
      ...windowed,
      temporalSupport: {
        ...windowed.temporalSupport,
        inputs: { picture: { before: seconds(1), after: seconds(0) } },
      },
    }),
    output: htmlOutput("windowed-operator"),
    sources: htmlSources("red", "blue"),
  }), /non-pointwise temporal support/u);

  const viewport = lowerAudiovisualPictureProgramToHtmlProgram({
    program: pictureProgram(),
    output: htmlOutput("wrong-viewport", 200),
    sources: htmlSources("red", "blue"),
  });
  assert.equal(viewport.canvas.width, 200);
  assert.match(viewport.html, /transform:matrix\(2,0,0,1,0,0\)/u);

  const projectiveOutput = htmlOutput("projective-viewport");
  const projective = lowerAudiovisualPictureProgramToHtmlProgram({
    program: pictureProgram(),
    output: { ...projectiveOutput, pictureMapping: sealSpatialMap({
      target: projectiveOutput.pictureMapping.target,
      source: pictureSpace,
      transform: {
        kind: "projective",
        xx: 1, xy: 0, tx: 0,
        yx: 0, yy: 1, ty: 0,
        wx: 0.001, wy: 0.001, ww: 1,
      },
    }) },
    sources: htmlSources("red", "blue"),
  });
  assert.match(projective.html, /transform:matrix3d\(/u);
});

test("a constant Picture Source renders for its Occurrence without a fabricated Source clock", () => {
  const media = prepareMedia({
    id: "poster",
    source: { kind: "blob", resource: fixtureResource("audiovisual-html:poster"),
      size: 1, mediaType: "image/png" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "png",
      disposition: { default: true, attachedPicture: false }, decodedUnitCount: 1,
      width: 100, height: 100, sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0, picture: { colorPrimaries: "bt709", colorTransfer: "srgb",
        colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" },
    }] },
    selection: { videoStreamIndex: 0, picture: { colorPrimaries: "bt709", colorTransfer: "srgb",
      colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } },
  });
  const still = programSourceFromPreparedMedia(media);
  const use = sealOccurrence({
    id: "poster-use",
    source: still,
    domain: programTime,
    placement: {
      parent: programTime,
      start: seconds(0),
      active: { start: seconds(0), end: seconds(2) },
    },
    selections: { picture: { kind: "constant" } },
  });
  const program = sealAudiovisualProgram({
    id: "poster-program",
    domain: programTime,
    pictureDomain: pictureSpace,
    occurrences: { [use.id]: use },
    picture: { root: "placed", nodes: {
      poster: { kind: "use", occurrence: use.id, output: "picture" },
      placed: { kind: "remap", input: "poster",
        mapping: map(pictureSpace, still.outputs.picture!.spatialDomain!) },
    } },
  });
  const document = compileAudiovisualHtmlProgram(program, { sources: [
    preparedMediaHtmlSource(media),
  ] }, htmlOutput("poster-html"));
  assert.equal(document.frameCount, 2);
  assert.equal(selectHtmlVideoSources(document).length, 0);
  assert.equal(document.artifacts.length, 1);
  assert.equal(document.artifacts[0]?.kind, "picture");
  assert.deepEqual(document.artifacts[0]?.usage, {
    kind: "frames",
    spans: [{ startFrame: 0, endFrameExclusive: 2 }],
  });
  assert.match(document.html, /hypit-artifact:\/\//u);
});

test("a child AudiovisualProgram stays a recursive terminal Source without materialization", () => {
  const red = occurrence("nested-red-use", source("nested-red"));
  const child = sealAudiovisualProgram({
    id: "nested-child",
    domain: programTime,
    pictureDomain: pictureSpace,
    occurrences: { [red.id]: red },
    picture: { root: "placed", nodes: {
      red: { kind: "use", occurrence: red.id, output: "picture" },
      placed: { kind: "remap", input: "red",
        mapping: map(pictureSpace, red.source.outputs.picture!.spatialDomain!) },
    } },
  });
  const childSource = audiovisualProgramSource(child);
  const childUse = occurrence("nested-child-use", childSource);
  const parent = sealAudiovisualProgram({
    id: "nested-parent",
    domain: programTime,
    pictureDomain: pictureSpace,
    occurrences: { [childUse.id]: childUse },
    picture: { root: "placed", nodes: {
      child: { kind: "use", occurrence: childUse.id, output: "picture" },
      placed: { kind: "remap", input: "child",
        mapping: map(pictureSpace, childSource.outputs.picture!.spatialDomain!) },
    } },
  });
  const document = compileAudiovisualHtmlProgram(parent, { sources: [
    audiovisualProgramHtmlSource(child, htmlSources("nested-red")),
  ] }, htmlOutput("nested-html"));
  assert.doesNotThrow(() => assertHtmlProgram(document));
  assert.equal(document.frameCount, 2);
  assert.match(document.html, /data-av-source="nested-red"/u);
  assert.equal(selectHtmlVideoSources(document).length, 0);
});

test("typed terminal Producers fold Source implementations into HtmlProgram", async () => {
  const facet = (name: string) => audiovisualHtmlComponent.producers.find((candidate) =>
    candidate.producer.name === name)!;
  let set = await facet(audiovisualHtmlProducers.createSources.name).handler({ inputs: {} } as never);
  assert.equal(set.kind, "output");
  for (const source of htmlSources("red", "blue").sources) {
    set = await facet(audiovisualHtmlProducers.appendSource.name).handler({ inputs: {
      sources: { value: set.value },
      source: { value: source as never },
    } } as never);
    assert.equal(set.kind, "output");
  }
  const compiled = await facet(audiovisualHtmlProducers.compile.name).handler({ inputs: {
    program: { value: pictureProgram() as never },
    sources: { value: set.value },
    output: { value: htmlOutput("typed-html") as never },
  } } as never);
  assert.equal(compiled.kind, "output");
  assert.doesNotThrow(() => assertHtmlProgram(compiled.value as never));
});
