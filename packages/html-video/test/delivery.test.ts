import assert from "node:assert/strict";
import test from "node:test";

import { audioProgramSampleFrames, sealAudioProgram } from "@hypit/audio-program";
import { pictureType } from "@hypit/audiovisual";
import {
  bindAudiovisualPictureExecution,
  executeAudiovisualPicture,
  partitionAudiovisualPictureExecution,
} from "@hypit/audiovisual-execution";
import {
  visualProgramHtmlSource,
} from "@hypit/audiovisual-html";
import { preparedPictureSamplingRepresentation } from "@hypit/media";
import { htmlVisual } from "@hypit/html-program";
import {
  prepareMedia,
  sealMuxedMedia,
  sealRenderedAudio,
  sealRenderedVisual,
} from "@hypit/media";
import { compareExactTemporalValues, sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import { exactTemporalValueFromFrames } from "@hypit/temporal/sampling";
import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  applyNleTransaction,
  createNleProject,
  nleLinearTimeMapping,
} from "@hypit/nle";

import {
  executeNleAudiovisualPictureToHtmlProgram,
  createNleScaledPictureOutput,
  createNleAudiovisualLinkHost,
  linkNleProjectAudiovisual,
  prepareNleAudiovisualPictureExecution,
} from "@hypit/nle-audiovisual";
import {
  createHtmlVideoDeliveryPlan,
  executeHtmlVideoDeliveryPlan,
  htmlVideoDeliverySpec,
  lowerNleProjectToHtmlVideoDeliveryPlan,
  verifyHtmlVideoDeliveryPlan,
} from "../src/index.js";

const frameRate = { numerator: 30, denominator: 1 } as const;
const frameCount = 30;
const html = {
  frameRate,
  frameCount,
  canvas: { width: 100, height: 100 },
  artifacts: [],
  videoSources: [],
  html: "<!doctype html><html><body></body></html>",
};
const audio = sealAudioProgram({
  domain: sealLocalTemporalDomain({
    id: "delivery:time",
    duration: exactTemporalValueFromFrames(frameCount, { frameRate }),
  }),
  sampling: { sampleRate: 48_000 },
  graph: { nodes: [{ kind: "silence", id: "silence" }], output: { node: "silence" } },
});

test("terminal programmes close into one provider-independent delivery plan", () => {
  const plan = createHtmlVideoDeliveryPlan(html, audio, htmlVideoDeliverySpec("high"));
  assert.doesNotThrow(() => verifyHtmlVideoDeliveryPlan(plan));
  assert.equal(plan.visual.delivery.encoding.quality, "high");
  assert.equal(plan.audio.program.graph.output.node, "silence");
  assert.equal(audioProgramSampleFrames(plan.audio.program), 48_000);
});

test("focused delivery selects the same absolute interval from picture and audio", () => {
  const plan = createHtmlVideoDeliveryPlan(html, audio, htmlVideoDeliverySpec(), {
    range: { startFrame: 6, endFrameExclusive: 18 },
  });
  assert.doesNotThrow(() => verifyHtmlVideoDeliveryPlan(plan));
  assert.deepEqual(plan.visual.range, { startFrame: 6, endFrameExclusive: 18 });
  assert.deepEqual(plan.audio.range, {
    start: exactTemporalValueFromFrames(6, { frameRate }),
    end: exactTemporalValueFromFrames(18, { frameRate }),
  });
});

test("an upstream-focused Picture Programme aligns with one absolute Audio range", () => {
  const plan = createHtmlVideoDeliveryPlan({ ...html, frameCount: 12 }, audio, htmlVideoDeliverySpec(), {
    audioRange: {
      start: exactTemporalValueFromFrames(6, { frameRate }),
      end: exactTemporalValueFromFrames(18, { frameRate }),
    },
  });
  assert.doesNotThrow(() => verifyHtmlVideoDeliveryPlan(plan));
  assert.equal(plan.visual.range, undefined);
  assert.equal(plan.visual.program.frameCount, 12);
  assert.deepEqual(plan.audio.range, {
    start: exactTemporalValueFromFrames(6, { frameRate }),
    end: exactTemporalValueFromFrames(18, { frameRate }),
  });
});

test("direct delivery renders terminals in parallel and muxes only their exact products", async () => {
  const plan = createHtmlVideoDeliveryPlan(html, audio, htmlVideoDeliverySpec());
  const calls: string[] = [];
  const visual = sealRenderedVisual({
    frameRate,
    frameCount,
    canvas: html.canvas,
    delivery: plan.delivery.visual,
    artifact: { kind: "blob", resource: fixtureResource("delivery:visual"), size: 1, mediaType: "video/mp4" },
  });
  const renderedAudio = sealRenderedAudio({
    sampleFrames: 48_000,
    artifact: { kind: "blob", resource: fixtureResource("delivery:audio"), size: 1, mediaType: "audio/wav" },
  });
  const result = await executeHtmlVideoDeliveryPlan(plan, {
    renderVisual: async () => { calls.push("visual"); return visual; },
    renderAudio: async () => { calls.push("audio"); return renderedAudio; },
    mux: async (request) => {
      calls.push("mux");
      assert.deepEqual(request.visual, visual);
      assert.deepEqual(request.audio, renderedAudio);
      return sealMuxedMedia({
        frameRate,
        frameCount,
        canvas: html.canvas,
        delivery: plan.delivery,
        artifact: { kind: "blob", resource: fixtureResource("delivery:video"), size: 1, mediaType: "video/mp4" },
      });
    },
  });
  assert.deepEqual(calls.slice(0, 2).sort(), ["audio", "visual"]);
  assert.equal(calls[2], "mux");
  assert.equal(result.artifact.resource, fixtureResource("delivery:video"));
});

test("delivery rejects picture and audio programmes with different durations", () => {
  const short = sealAudioProgram({
    ...audio,
    domain: sealLocalTemporalDomain({
      id: "short:time",
      duration: exactTemporalValueFromFrames(29, { frameRate }),
    }),
  });
  assert.throws(() => createHtmlVideoDeliveryPlan(html, short, htmlVideoDeliverySpec()),
    /different presentation durations/u);
});

test("the downstream NLE adapter shares one lowering and supplies silence for picture-only work", async () => {
  const component = { module: { name: "@example/card" }, name: "card" } as const;
  const source = {
    id: "card-source",
    outputs: { picture: {
      kind: "constant" as const,
      type: pictureType,
      spatialDomain: { id: "card-space", region: { x: 0, y: 0, width: 100, height: 100 } },
    } },
  };
  const host = createNleAudiovisualLinkHost([{ components: [{
    component,
    resolve: () => ({ source, pictureOutput: "picture" }),
  }] }], [{ components: [{
    component,
    resolve: () => ({
      html: visualProgramHtmlSource(source.id, "picture", htmlVisual({
        html: "<div>card</div>", css: ":scope>div{position:absolute;inset:0}",
      })),
    }),
  }] }]);
  const base = createNleProject({
    id: "silent-card", name: "Silent card",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const project = applyNleTransaction(base, { revision: 0, commands: [{
    kind: "track.add", track: {
      id: "picture", name: "Picture", kind: "picture", muted: false, items: [{
        id: "card", kind: "present", source: "component", component, parameters: {},
        start: exactTemporalValueFromFrames(0, { frameRate }),
        duration: exactTemporalValueFromFrames(frameCount, { frameRate }),
        sourceTime: nleLinearTimeMapping(exactTemporalValueFromFrames(frameCount, { frameRate })), enabled: true,
        picture: {
          layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
        },
      }],
    },
  }] });
  const output = createNleScaledPictureOutput(project, frameRate, {
    width: 200, height: 200, clearColor: "#101010",
  });
  const plan = lowerNleProjectToHtmlVideoDeliveryPlan(project, host, output, htmlVideoDeliverySpec());
  assert.deepEqual(plan.audio.program.graph.nodes.map((node) => node.kind), ["silence"]);
  assert.equal(audioProgramSampleFrames(plan.audio.program), 48_000);
  assert.deepEqual(plan.visual.program.canvas, { width: 200, height: 200 });
  assert.match(plan.visual.program.html, /transform:matrix\(2,0,0,2,0,0\)/u);
  assert.match(plan.visual.program.html, /card/u);
  assert.throws(() => createNleScaledPictureOutput(project, frameRate, {
    width: 200, height: 100, clearColor: "#101010",
  }), /changes Programme aspect/u);

  const explicitlyMapped = lowerNleProjectToHtmlVideoDeliveryPlan(project, host, {
    sampling: { frameRate },
    canvas: { width: 200, height: 100, clearColor: "#101010" },
    pictureTransform: { kind: "affine", xx: 0.5, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
  }, htmlVideoDeliverySpec());
  assert.deepEqual(explicitlyMapped.visual.program.canvas, { width: 200, height: 100 });
  assert.match(explicitlyMapped.visual.program.html, /transform:matrix\(2,0,0,1,0,0\)/u);

  const linked = linkNleProjectAudiovisual(project, host);
  const prepared = prepareNleAudiovisualPictureExecution(linked, output);
  const rootCapability = {
    terminal: "example-picture-root",
    finalOutputs: ["picture" as const],
    verifyBinding() {},
    inputRepresentations: () => [] as readonly string[],
    outputRepresentations: () => [] as readonly string[],
  };
  const partitioned = partitionAudiovisualPictureExecution(prepared, [
    ...prepared.demandPlan.nodes.map(node => ({ node: node.id, terminal: "example-picture-root" })),
    ...prepared.demandPlan.sourceTasks.map(task => ({
      node: task.id,
      terminal: "example-picture-root",
      sourceAccess: task.temporal.kind === "constant"
        ? { kind: "constant" as const }
        : { kind: "point" as const },
    })),
  ], [rootCapability]);
  const selected = bindAudiovisualPictureExecution(partitioned, []);
  const root = await executeAudiovisualPicture<never, { readonly renderer: string }>(selected, [{
    capability: rootCapability,
    executor: {
      terminal: "example-picture-root",
      async execute(request) {
        assert.deepEqual(request.finalOutputs, ["picture"]);
        assert.equal(request.products.length, 0);
        return { products: [], outputs: { picture: { renderer: "example-picture-root" } } };
      },
    },
  }]);
  assert.deepEqual(root, { renderer: "example-picture-root" });
});

test("Media, HTML and one external Picture Source share the ordinary HTML compositor", async () => {
  const component = { module: { name: "@example/sequential" }, name: "scene" } as const;
  const card = { module: { name: "@example/card" }, name: "card" } as const;
  const domain = sealLocalTemporalDomain({
    id: "external-scene-time",
    duration: exactTemporalValueFromFrames(frameCount, { frameRate }),
  });
  const source = {
    id: "external-scene",
    outputs: { picture: {
      kind: "signal" as const,
      type: pictureType,
      domain,
      spatialDomain: { id: "external-space", region: { x: 0, y: 0, width: 100, height: 100 } },
    } },
  };
  const cardSource = {
    id: "card-source",
    outputs: { picture: {
      kind: "constant" as const,
      type: pictureType,
      spatialDomain: { id: "card-space", region: { x: 0, y: 0, width: 100, height: 100 } },
    } },
  };
  const media = prepareMedia({
    id: "prepared-media",
    source: { kind: "blob", resource: fixtureResource("prepared-media"), size: 1, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      endPts: { ticks: "1", timeBase: { numerator: 1, denominator: 1 } },
      decodedUnitCount: frameCount,
      width: 100, height: 100,
      sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    }] },
    selection: {
      videoStreamIndex: 0,
      spanAuthority: "video",
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    },
  });
  const host = createNleAudiovisualLinkHost([{ components: [{
    component,
    resolve: () => ({ source, pictureOutput: "picture" }),
  }, {
    component: card,
    resolve: () => ({ source: cardSource, pictureOutput: "picture" }),
  }] }], [{ components: [{
    component,
    resolve: () => ({ picture: {
      terminal: "sequential-terminal",
      sourceAccess: { kind: "sequential", origin: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } } },
      representation: preparedPictureSamplingRepresentation,
      program: { format: "example.sequential@1", payload: {}, artifacts: [] },
    } }),
  }, {
    component: card,
    resolve: () => ({
      html: visualProgramHtmlSource(cardSource.id, "picture", htmlVisual({
        html: "<div>mixed-card</div>", css: ":scope>div{position:absolute;inset:0}",
      })),
    }),
  }] }], () => media);
  const project = applyNleTransaction(createNleProject({
    id: "external-picture", name: "External Picture",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  }), { revision: 0, commands: [{
    kind: "track.add", track: {
      id: "external-track", name: "External Picture", kind: "picture", muted: false, items: [{
        id: "external", kind: "present", source: "component", component, parameters: {},
        start: exactTemporalValueFromFrames(0, { frameRate }),
        duration: exactTemporalValueFromFrames(frameCount, { frameRate }),
        sourceTime: nleLinearTimeMapping(exactTemporalValueFromFrames(frameCount, { frameRate })), enabled: true,
        picture: { layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" } },
      }],
    },
  }, {
    kind: "track.add", track: {
      id: "media-picture", name: "Media Picture", kind: "picture", muted: false, items: [{
        id: "media", kind: "present", source: "media", asset: { path: "./clip.media.json" },
        start: exactTemporalValueFromFrames(0, { frameRate }),
        duration: exactTemporalValueFromFrames(frameCount, { frameRate }),
        sourceTime: nleLinearTimeMapping(exactTemporalValueFromFrames(frameCount, { frameRate })), enabled: true,
        picture: { layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" } },
      }],
    },
  }, {
    kind: "track.add", track: {
      id: "html-picture", name: "HTML Picture", kind: "picture", muted: false, items: [{
        id: "card", kind: "present", source: "component", component: card, parameters: {},
        start: exactTemporalValueFromFrames(0, { frameRate }),
        duration: exactTemporalValueFromFrames(frameCount, { frameRate }),
        sourceTime: nleLinearTimeMapping(exactTemporalValueFromFrames(frameCount, { frameRate })), enabled: true,
        picture: { layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" } },
      }],
    },
  }] });
  const linked = linkNleProjectAudiovisual(project, host);
  let executions = 0;
  const focusedRange = {
    start: exactTemporalValueFromFrames(6, { frameRate }),
    end: exactTemporalValueFromFrames(18, { frameRate }),
  };
  const document = await executeNleAudiovisualPictureToHtmlProgram(
    linked,
    createNleScaledPictureOutput(project, frameRate),
    [{
      capability: {
        terminal: "sequential-terminal",
        finalOutputs: [],
        verifyBinding(context) {
          assert.equal(context.target.kind, "source");
          assert.equal(context.binding.sourceAccess?.kind, "sequential");
        },
        inputRepresentations: () => [],
        outputRepresentations: () => [preparedPictureSamplingRepresentation],
      },
      executor: {
        terminal: "sequential-terminal",
        async execute(request) {
          executions += 1;
          assert.equal(request.sources.length, 1);
          assert.equal(request.sources[0]?.acquisition.kind, "sequential");
          const acquisition = request.sources[0]!.acquisition;
          assert(acquisition.kind === "sequential");
          assert.equal(compareExactTemporalValues(acquisition.execution.regions[0]!.end.position,
            focusedRange.end), 0);
          return { products: request.products.map(({ requirement }) => ({
            product: requirement.id,
            value: {
            source: {
              source: { kind: "blob", resource: fixtureResource("external-picture"), size: 1, mediaType: "video/webm" },
              kind: "signal" as const,
              streamIndex: 0,
              presentationStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
              sourceDomain: domain,
              interpretation: {
                codedWidth: 100, codedHeight: 100,
                sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 as const,
                picture: { colorPrimaries: "bt709" as const, colorTransfer: "bt709" as const,
                  colorMatrix: "bt709" as const, colorRange: "limited" as const,
                  bitDepth: 8 as const, alphaMode: "straight" as const },
              },
            },
            sampling: { stages: [{ target: domain, source: domain, pieces: [{
              target: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, end: domain.duration },
              sourceAtStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
              rate: { numerator: 1, denominator: 1 },
            }] }] },
            },
          })) };
        },
      },
    }],
    focusedRange,
  );
  assert.equal(executions, 1);
  assert.equal(document.frameCount, 12);
  assert.equal(document.videoSources.length, 2);
  assert.deepEqual(new Set(document.videoSources.map((value) => value.source.source.resource)), new Set([
    fixtureResource("external-picture"),
    fixtureResource("prepared-media"),
  ]));
  assert.match(document.html, /mixed-card/u);
});
