import assert from "node:assert/strict";
import test from "node:test";

import {
  audioType,
  pictureType,
  pointwiseOperatorTemporalSupport,
  type ProgramSource,
} from "@hypit/audiovisual";
import { sealAudioProgram, verifyAudioProgram } from "@hypit/audio-program";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { assertHtmlProgram, htmlVisual, selectHtmlVideoSources } from "@hypit/html-program";
import { prepareMedia } from "@hypit/media";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import { exactTemporalValueFromFrames } from "@hypit/temporal/sampling";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  applyNleTransaction,
  createNleLoweringHost,
  createNleProject,
  lowerNleProjectToAudiovisual,
  lowerNleProjectToAudioProgram,
  lowerNleProjectToHtmlProgram,
  nlePointwisePictureEffect,
  type NleComponentItem,
  type NlePictureAppearance,
  type NleProject,
  type NleResolvedItemSource,
} from "../src/index.js";

function prepared() {
  const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 2 } });
  return prepareMedia({
    id: "camera-prepared",
    source: { kind: "blob", resource: fixtureResource("nle:camera"), size: 1, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("8"), decodedUnitCount: 8,
      width: 100, height: 100, sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0,
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    }, {
      kind: "audio", index: 1, codecName: "aac",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("8"), sampleRate: 48_000,
      channels: 2, decodedSampleFrames: 192_000,
    }] },
    selection: { videoStreamIndex: 0, audioStreamIndex: 1, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
    } },
  });
}

const full: NlePictureAppearance = {
  layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
  effects: [],
};

function visualSource(id: string, marker: string): NleResolvedItemSource {
  const spatialDomain = sealLocalSpatialDomain({
    id: `${id}:picture`, region: { x: 0, y: 0, width: 100, height: 100 },
  });
  const source: ProgramSource = {
    id,
    outputs: { picture: { kind: "constant", type: pictureType, spatialDomain } },
  };
  return {
    source,
    pictureOutput: "picture",
    html: visualProgramHtmlSource(id, "picture", htmlVisual({
      html: `<div data-nle-${marker}></div>`,
      css: ":scope>div{position:absolute;inset:0}",
    })),
  };
}

function audioComponentSource(id: string): NleResolvedItemSource {
  const domain = sealLocalTemporalDomain({
    id: `${id}:audio`,
    duration: exactTemporalValueFromFrames(4, { frameRate: { numerator: 2, denominator: 1 } }),
  });
  return {
    source: { id, outputs: { audio: { kind: "signal", type: audioType, domain } } },
    audioOutput: "audio",
    audio: (sampling) => ({
      source: id,
      output: "audio",
      program: sealAudioProgram({
        domain,
        sampling,
        graph: { nodes: [{ kind: "silence", id: "tone" }], output: { node: "tone" } },
      }),
    }),
  };
}

const captionRenderer = { module: { name: "@example/caption", version: "1" }, name: "default" };
const componentRenderer = { module: { name: "@example/title", version: "1" }, name: "card" };
const audioComponentRenderer = { module: { name: "@example/synth", version: "1" }, name: "tone" };
const effectRenderer = { module: { name: "@example/effects", version: "1" }, name: "monochrome" };
const audioEffectRenderer = { module: { name: "@example/audio", version: "1" }, name: "gain" };
const transitionRenderer = { module: { name: "@example/transition", version: "1" }, name: "dissolve" };
const matteRenderer = { module: { name: "@example/matte", version: "1" }, name: "alpha" };
const host = createNleLoweringHost([{
  components: [{ component: captionRenderer,
    resolve: (item) => visualSource(`${item.id}:source`, "caption") }, { component: componentRenderer,
    resolve: (item) => visualSource(`${item.id}:source`, "component") }, {
    component: audioComponentRenderer,
    resolve: (item) => audioComponentSource(`${item.id}:source`),
  }],
  effects: [{ effect: effectRenderer, resolve: (effect) => ({
    operator: nlePointwisePictureEffect(`effect:${effect.id}`, htmlVisual({
      html: '<div data-nle-effect="mono">{{picture}}</div>',
      css: ":scope>[data-nle-effect]{position:absolute;inset:0;filter:grayscale(1)}",
    })),
  }) }],
  audioEffects: [{ effect: audioEffectRenderer, resolve: (effect) => ({
    operator: {
      id: `audio-effect:${effect.id}`,
      inputs: ["signal"],
      temporalControls: {},
      temporalSupport: pointwiseOperatorTemporalSupport(["signal"]),
      program: { format: "hypit.test-audio@1", payload: { gain: 0.5 }, artifacts: [] },
    },
  }) }],
  transitions: [{ transition: transitionRenderer, resolve: (_transition, context) => ({
    operator: {
      id: "example:transition", inputs: ["outgoing", "incoming"],
      temporalControls: { progress: context.domain },
      temporalSupport: pointwiseOperatorTemporalSupport(["outgoing", "incoming"]),
      program: htmlVisual({
        html: '<div data-nle-transition>{{outgoing}}{{incoming}}</div>',
        css: ":scope>[data-nle-transition]{position:absolute;inset:0}",
      }),
    },
  }) }],
  mattes: [{ matte: matteRenderer, resolve: () => ({
    operator: {
      id: "example:matte", inputs: ["content", "matte"], temporalControls: {},
      temporalSupport: pointwiseOperatorTemporalSupport(["content", "matte"]),
      program: htmlVisual({
        html: '<div data-nle-matte>{{content}}{{matte}}</div>',
        css: ":scope>[data-nle-matte]{position:absolute;inset:0}",
      }),
    },
  }) }],
}]);

function project(): NleProject {
  const document = createNleProject({
    id: "html-editorial",
    name: "HTML Editorial",
    frameRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#101010" },
  });
  const caption: NleComponentItem = {
    id: "subtitle-one", kind: "component", startFrame: 1, durationFrames: 2, localStartFrame: 0,
    enabled: true,
    component: captionRenderer,
    parameters: { text: "A direct caption block", color: "white" },
    picture: { layout: { x: 10, y: 70, width: 80, height: 20, fit: "contain" }, effects: [] },
  };
  const component: NleComponentItem = {
    id: "title", kind: "component", startFrame: 0, durationFrames: 4, localStartFrame: 0,
    enabled: true,
    component: componentRenderer,
    parameters: { title: "HTML component" }, picture: full,
  };
  return applyNleTransaction(document, { revision: 0, commands: [
    { kind: "media.add", media: { id: "camera", name: "Camera", prepared: prepared() } },
    { kind: "track.add", track: { id: "main", name: "Main picture", kind: "picture",
      locked: false, muted: false, items: [] } },
    { kind: "item.add", track: "main", item: {
      id: "camera-use", kind: "media", media: "camera", startFrame: 0, durationFrames: 4,
      localStartFrame: 0, enabled: true, audio: { effects: [{
        id: "quiet", effect: audioEffectRenderer, parameters: { gain: 0.5 },
      }] },
      picture: { ...full, effects: [{ id: "mono", effect: {
        ...effectRenderer,
      }, parameters: { amount: 1 } }] },
    } },
    { kind: "item.add", track: "main", item: caption },
    { kind: "item.add", track: "main", item: component },
  ] });
}

test("Media, caption Component and Effect lower into one audiovisual Programme", () => {
  const lowering = lowerNleProjectToAudiovisual(project(), host);

  assert.deepEqual(Object.keys(lowering.program.occurrences), ["camera-use", "subtitle-one", "title"]);
  assert.equal(lowering.program.picture?.nodes["camera-use:effect:mono"]?.kind, "apply");
  assert.equal(lowering.program.picture?.nodes["html-editorial:picture-root"]?.kind, "over");
  assert.equal(lowering.program.audio?.nodes["camera-use:audio"]?.kind, "use");
  assert.equal(lowering.program.audio?.nodes["camera-use:audio-effect:quiet"]?.kind, "apply");
  assert.deepEqual(lowering.htmlSources.sources.map((source) => source.source),
    ["camera-prepared", "subtitle-one:source", "title:source"]);
});

test("the same project lowers directly to a browser HtmlProgram without Build execution", () => {
  const html = lowerNleProjectToHtmlProgram(project(), host);

  assert.doesNotThrow(() => assertHtmlProgram(html));
  assert.equal(html.frameCount, 4);
  assert.deepEqual(html.frameRate, { numerator: 2, denominator: 1 });
  assert.deepEqual(html.canvas, { width: 100, height: 100 });
  assert.equal(selectHtmlVideoSources(html).length, 1);
  assert.match(html.html, /data-nle-caption/u);
  assert.match(html.html, /data-nle-component/u);
  assert.match(html.html, /data-nle-effect="mono"/u);
  assert.match(html.html, /filter:grayscale\(1\)/u);
});

test("Transition, matte and editing Group remain direct NLE relations", () => {
  const empty = createNleProject({
    id: "relations", name: "Relations", frameRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const component = (id: string, startFrame: number, durationFrames: number): NleComponentItem => ({
    id, kind: "component", component: componentRenderer, parameters: { title: id },
    startFrame, durationFrames, localStartFrame: 0, enabled: true, picture: full,
  });
  const document = applyNleTransaction(empty, { revision: 0, commands: [{
    kind: "track.add", track: { id: "main", name: "Main", kind: "picture",
      locked: false, muted: false, items: [
        component("outgoing", 0, 4), component("incoming", 3, 4),
        component("content", 0, 7), component("matte-source", 0, 7),
      ] },
  }, {
    kind: "transition.add", transition: {
      id: "join", outgoing: "outgoing", incoming: "incoming",
      operator: transitionRenderer, parameters: {},
    },
  }, {
    kind: "matte.add", matte: {
      id: "content-alpha", content: "content", matte: "matte-source",
      operator: matteRenderer, parameters: {},
    },
  }, {
    kind: "group.add", group: { id: "pair", name: "Pair", items: ["outgoing", "incoming"] },
  }] });
  const lowering = lowerNleProjectToAudiovisual(document, host);
  assert.equal(lowering.program.picture?.nodes["join:apply"]?.kind, "apply");
  assert.equal(lowering.program.picture?.nodes["content:matte:content-alpha"]?.kind, "apply");
  assert.equal(Object.hasOwn(lowering.program.picture?.nodes ?? {}, "pair"), false);
  const html = lowerNleProjectToHtmlProgram(document, host);
  assert.match(html.html, /data-nle-transition/u);
  assert.match(html.html, /data-nle-matte/u);
  assert.throws(() => applyNleTransaction(document, { revision: document.revision, commands: [{
    kind: "item.move", ids: ["incoming"], deltaFrames: 3,
  }] }), /canonical outgoing\/incoming overlap/u);
  assert.equal(document.tracks[0]?.items.find((item) => item.id === "incoming")?.startFrame, 3);
});

test("the NLE Audio DAG lowers directly to a continuous AudioProgram", () => {
  const audio = lowerNleProjectToAudioProgram(project(), host, { sampleRate: 48_000 });
  assert.doesNotThrow(() => verifyAudioProgram(audio));
  assert.equal(audio.sampling.sampleRate, 48_000);
  assert.ok(audio.graph.nodes.some((node) => node.kind === "program"));
  assert.ok(audio.graph.nodes.some((node) => node.kind === "process"
    && node.program.format === "hypit.test-audio@1"));
});

test("an Audio-only package Component closes through the same NLE and terminal chain", () => {
  const base = createNleProject({
    id: "synth-project", name: "Synth project", frameRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const document = applyNleTransaction(base, { revision: 0, commands: [{
    kind: "track.add", track: {
      id: "audio", name: "Audio", kind: "audio", locked: false, muted: false, items: [{
        id: "tone", kind: "component", component: audioComponentRenderer, parameters: { frequency: 440 },
        startFrame: 0, durationFrames: 4, localStartFrame: 0, enabled: true,
        audio: { effects: [{
          id: "quiet", effect: audioEffectRenderer, parameters: { gain: 0.5 },
        }] },
      }],
    },
  }] });
  const lowering = lowerNleProjectToAudiovisual(document, host);
  assert.equal(lowering.program.picture, undefined);
  assert.equal(lowering.program.audio?.nodes["tone:audio-effect:quiet"]?.kind, "apply");
  const audio = lowerNleProjectToAudioProgram(document, host, { sampleRate: 48_000 });
  assert.doesNotThrow(() => verifyAudioProgram(audio));
  assert.ok(audio.graph.nodes.some((node) => node.kind === "process"));
});

test("a Compound Item closes one child NLE Project as an ordinary nested Source", () => {
  const childBase = createNleProject({
    id: "child", name: "Child", frameRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const child = applyNleTransaction(childBase, { revision: 0, commands: [
    { kind: "media.add", media: { id: "camera", name: "Camera", prepared: prepared() } },
    { kind: "track.add", track: { id: "child-main", name: "Child main", kind: "picture",
      locked: false, muted: false, items: [{
        id: "child-camera", kind: "media", media: "camera", startFrame: 0, durationFrames: 4,
        localStartFrame: 0, enabled: true, picture: full, audio: { effects: [] },
      }] } },
  ] });
  const parentBase = createNleProject({
    id: "parent", name: "Parent", frameRate: { numerator: 2, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const parent = applyNleTransaction(parentBase, { revision: 0, commands: [{
    kind: "track.add", track: { id: "parent-main", name: "Parent main", kind: "picture",
      locked: false, muted: false, items: [{
        id: "nested", kind: "compound", project: child, startFrame: 0, durationFrames: 4,
        localStartFrame: 0, enabled: true, picture: full, audio: { effects: [] },
      }] },
  }] });
  const lowering = lowerNleProjectToAudiovisual(parent, host);
  assert.equal(lowering.program.occurrences.nested?.source.id, "child");
  const html = lowerNleProjectToHtmlProgram(parent, host);
  assert.equal(selectHtmlVideoSources(html).length, 1);
  const audio = lowerNleProjectToAudioProgram(parent, host, { sampleRate: 48_000 });
  assert.doesNotThrow(() => verifyAudioProgram(audio));
  assert.ok(audio.graph.nodes.some((node) => node.kind === "program"));
});
