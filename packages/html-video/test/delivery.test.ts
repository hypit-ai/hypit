import assert from "node:assert/strict";
import test from "node:test";

import { audioProgramSampleFrames, sealAudioProgram } from "@hypit/audio-program";
import { pictureType } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";
import {
  sealMuxedMedia,
  sealRenderedAudio,
  sealRenderedVisual,
} from "@hypit/media";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import { exactTemporalValueFromFrames } from "@hypit/temporal/sampling";
import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  applyNleTransaction,
  createNleProject,
  nleLinearSourceTime,
} from "@hypit/nle";

import {
  createNleTerminalLinkHost,
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

test("the downstream NLE adapter shares one lowering and supplies silence for picture-only work", () => {
  const component = { module: { name: "@example/card", version: "1" }, name: "card" } as const;
  const source = {
    id: "card-source",
    outputs: { picture: {
      kind: "constant" as const,
      type: pictureType,
      spatialDomain: { id: "card-space", region: { x: 0, y: 0, width: 100, height: 100 } },
    } },
  };
  const host = createNleTerminalLinkHost([{ components: [{
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
    id: "silent-card", name: "Silent card", editRate: frameRate,
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  const project = applyNleTransaction(base, { revision: 0, commands: [{
    kind: "track.add", track: {
      id: "picture", name: "Picture", kind: "picture", locked: false, muted: false, items: [{
        id: "card", kind: "component", component, parameters: {},
        start: exactTemporalValueFromFrames(0, { frameRate }),
        duration: exactTemporalValueFromFrames(frameCount, { frameRate }),
        sourceTime: nleLinearSourceTime(exactTemporalValueFromFrames(frameCount, { frameRate })), enabled: true,
        picture: {
          layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" }, effects: [],
        },
      }],
    },
  }] });
  const plan = lowerNleProjectToHtmlVideoDeliveryPlan(project, host, frameRate, htmlVideoDeliverySpec());
  assert.deepEqual(plan.audio.program.graph.nodes.map((node) => node.kind), ["silence"]);
  assert.equal(audioProgramSampleFrames(plan.audio.program), 48_000);
  assert.match(plan.visual.program.html, /card/u);
});
