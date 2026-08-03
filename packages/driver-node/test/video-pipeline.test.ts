import assert from "node:assert/strict";
import test from "node:test";

import {
  HostRegistry,
  NodeDriver,
  ProviderRegistry,
  parseBuildState,
  serializeBuildState,
} from "@svml/driver-node";

import {
  createVideoBuild,
  videoImplementations,
  videoProducers,
  videoTypes,
} from "./video-pipeline-fixture.js";

function inlineObject(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error("expected object");
  return value as Readonly<Record<string, unknown>>;
}

function inlineString(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
}

function inlineNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("expected number");
  return value;
}

test("estimate, generation and recognition pause independently without replaying the immutable DAG", async () => {
  const host = new HostRegistry();
  const providers = new ProviderRegistry();
  const calls = { estimate: 0, generate: 0, recognize: 0, locate: 0, caption: 0 };

  host.registerProducer(videoProducers.requestEstimate, videoImplementations.requestEstimate, ({ inputs }) => {
    calls.estimate += 1;
    const narrative = inputs.narrative;
    assert.equal(narrative?.value.kind, "inline");
    return { outputs: {}, needs: { schedule: { speech: inlineString(inlineObject(narrative.value.value).speech) } } };
  });
  host.registerProducer(videoProducers.requestGeneration, videoImplementations.requestGeneration, ({ inputs }) => {
    calls.generate += 1;
    assert.equal(inputs.schedule?.value.kind, "inline");
    return { outputs: {}, needs: { basis: { durationSec: inlineNumber(inlineObject(inputs.schedule.value.value).durationSec) } } };
  });
  host.registerProducer(videoProducers.requestRecognition, videoImplementations.requestRecognition, ({ inputs }) => {
    calls.recognize += 1;
    assert.equal(inputs.basis?.value.kind, "inline");
    return { outputs: {}, needs: { evidence: { audio: inlineString(inlineObject(inputs.basis.value.value).audio) } } };
  });
  host.registerProducer(videoProducers.locateSpeech, videoImplementations.locateSpeech, ({ inputs }) => {
    calls.locate += 1;
    assert.equal(inputs.evidence?.value.kind, "inline");
    return { outputs: { map: { kind: "inline", value: { startSec: 0.1, endSec: 0.72 } } }, needs: {} };
  });
  host.registerProducer(videoProducers.temporalizeCaption, videoImplementations.temporalizeCaption, ({ inputs }) => {
    calls.caption += 1;
    assert.equal(inputs.narrative?.value.kind, "inline");
    assert.equal(inputs.map?.value.kind, "inline");
    const narrative = inlineObject(inputs.narrative.value.value);
    const map = inlineObject(inputs.map.value.value);
    return {
      outputs: {
        caption: {
          kind: "inline",
          value: {
            text: inlineString(narrative.display),
            startSec: inlineNumber(map.startSec),
            endSec: inlineNumber(map.endSec),
          },
        },
      },
      needs: {},
    };
  });

  const driver = new NodeDriver({ registry: host, providers });
  const atEstimate = await driver.run(createVideoBuild());
  assert.equal(atEstimate.blocked[0]?.reason, "missing-provider");
  assert.deepEqual(calls, { estimate: 1, generate: 0, recognize: 0, locate: 0, caption: 0 });

  providers.registerProvider("runtime:estimate", videoTypes.schedule, () => ({
    value: { kind: "inline", value: { durationSec: 1 } },
    conformance: "exact",
    delivery: "executed",
    metadata: {},
  }));
  const atGeneration = await driver.run(parseBuildState(serializeBuildState(atEstimate.state)));
  assert.equal(atGeneration.blocked[0]?.reason, "missing-provider");
  assert.deepEqual(calls, { estimate: 1, generate: 1, recognize: 0, locate: 0, caption: 0 });

  providers.registerProvider("runtime:seedance-mini", videoTypes.basis, ({ need }) => {
    assert.deepEqual(need.constraints, { durationSec: 1 });
    return {
      value: { kind: "inline", value: { audio: "artifact:audio", visual: "artifact:visual" } },
      conformance: "exact",
      delivery: "executed",
      metadata: { model: "mini" },
    };
  });
  const atRecognition = await driver.run(parseBuildState(serializeBuildState(atGeneration.state)));
  assert.equal(atRecognition.blocked[0]?.reason, "missing-provider");
  assert.deepEqual(calls, { estimate: 1, generate: 1, recognize: 1, locate: 0, caption: 0 });

  providers.registerProvider("runtime:whisperx", videoTypes.evidence, () => ({
    value: { kind: "inline", value: { transcript: "what the fuck" } },
    conformance: "exact",
    delivery: "executed",
    metadata: { adapter: "whisperx" },
  }));
  const completed = await driver.run(parseBuildState(serializeBuildState(atRecognition.state)));

  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, { estimate: 1, generate: 1, recognize: 1, locate: 1, caption: 1 });
  assert.deepEqual(completed.state.receipts.map((receipt) => receipt.fulfiller), [
    "runtime:estimate",
    "runtime:seedance-mini",
    "runtime:whisperx",
  ]);
  assert.deepEqual(
    completed.state.records.find((record) => record.id === "caption:root")?.value,
    { kind: "inline", value: { text: "that was insane", startSec: 0.1, endSec: 0.72 } },
  );
});
