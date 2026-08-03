import assert from "node:assert/strict";
import test from "node:test";

import { temporalizeCaption } from "@svml/caption";
import {
  sealProgramSpace,
  sealSpeechBasis,
} from "@svml/contracts";
import type {
  AlignedTranscriptEvidence,
  CompleteSemanticMap,
  Narrative,
  SpeechBasis,
  TimedCaptionProjection,
} from "@svml/contracts";
import { digestOf, start } from "@svml/core";
import {
  HostRegistry,
  NodeDriver,
  ProviderRegistry,
  parseBuildState,
  serializeBuildState,
} from "@svml/driver-node";
import { locateSpeechTiming } from "@svml/speech-align";
import {
  normalizeWhisperXAlignment,
  sealWhisperXAlignmentEvidence,
  whisperXImplementationDigests,
  whisperXProducers,
  whisperXRequestForBasis,
} from "@svml/whisperx";
import type { WhisperXAlignmentEvidence } from "@svml/whisperx";

import {
  contractTypes,
  createVideoBuild,
  videoImplementations,
  videoProducers,
  videoTypes,
  whisperXTypes,
} from "./video-pipeline-fixture.js";
import { captionImplementationDigest, captionProducers } from "@svml/caption";
import { speechAlignProducers, speechLocatorDigest } from "@svml/speech-align";

function inlineObject(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error("expected object");
  return value as Readonly<Record<string, unknown>>;
}

function inlineValue<T>(value: unknown): T {
  return value as T;
}

test("external methods are fixed by the BuildPlan while Runtime binds only exact execution endpoints", async () => {
  const host = new HostRegistry();
  const providers = new ProviderRegistry();
  const calls = {
    estimate: 0,
    seedance: 0,
    assemble: 0,
    whisperRequest: 0,
    whisperNormalize: 0,
    locate: 0,
    caption: 0,
  };

  host.registerProducer(videoProducers.requestEstimate, videoImplementations.requestEstimate, ({ inputs }) => {
    calls.estimate += 1;
    assert.equal(inputs.narrative?.value.kind, "inline");
    const narrative = inlineValue<Narrative>(inputs.narrative.value.value);
    return {
      outputs: {},
      needs: {
        estimate: {
          contract: "example.official-speech-estimate-request@1",
          speech: narrative.serializations.speech,
        },
      },
    };
  });
  host.registerProducer(videoProducers.requestSeedanceMini, videoImplementations.requestSeedanceMini, ({ inputs }) => {
    calls.seedance += 1;
    assert.equal(inputs.narrative?.value.kind, "inline");
    assert.equal(inputs.estimate?.value.kind, "inline");
    const narrative = inlineValue<Narrative>(inputs.narrative.value.value);
    const estimate = inlineObject(inputs.estimate.value.value);
    return {
      outputs: {},
      needs: {
        media: {
          contract: "example.seedance-mini-speech-request@1",
          model: "mini",
          script: narrative.serializations.speech,
          durationSec: estimate.durationSec as number,
        },
      },
    };
  });
  host.registerProducer(videoProducers.assembleBasis, videoImplementations.assembleBasis, ({ inputs }) => {
    calls.assemble += 1;
    assert.equal(inputs.media?.value.kind, "inline");
    const media = inlineObject(inputs.media.value.value);
    const durationSec = media.durationSec as number;
    const programSpace = sealProgramSpace({
      contract: "svml.program-space@0",
      durationSec,
      frameRate: { numerator: 1_000, denominator: 1 },
    });
    const audioDigest = media.audioDigest as SpeechBasis["audio"]["digest"];
    const visualDigest = media.visualDigest as SpeechBasis["audio"]["digest"];
    const basis = sealSpeechBasis({
      contract: "svml.speech-basis@1",
      programSpace,
      audio: { digest: audioDigest, size: 1, mediaType: "audio/wav", durationSec },
      visualTrack: { clips: [{
        segmentId: "line",
        artifact: { digest: visualDigest, size: 1, mediaType: "video/mp4", durationSec },
        startSec: 0,
        endSec: durationSec,
      }] },
      segments: [{ segmentId: "line", startSec: 0, endSec: durationSec, sourceArtifactDigest: visualDigest }],
    });
    return { outputs: { basis: { kind: "inline", value: basis } }, needs: {} };
  });
  host.registerProducer(whisperXProducers.request, whisperXImplementationDigests.request, ({ inputs }) => {
    calls.whisperRequest += 1;
    assert.equal(inputs.basis?.value.kind, "inline");
    return {
      outputs: {},
      needs: { alignment: whisperXRequestForBasis(inlineValue<SpeechBasis>(inputs.basis.value.value), { language: "en" }) },
    };
  });
  host.registerProducer(whisperXProducers.normalize, whisperXImplementationDigests.normalize, ({ inputs }) => {
    calls.whisperNormalize += 1;
    assert.equal(inputs.whisperx?.value.kind, "inline");
    const evidence = normalizeWhisperXAlignment(
      inlineValue<WhisperXAlignmentEvidence>(inputs.whisperx.value.value),
    );
    return { outputs: { evidence: { kind: "inline", value: evidence } }, needs: {} };
  });
  host.registerProducer(speechAlignProducers.locate, speechLocatorDigest, ({ inputs }) => {
    calls.locate += 1;
    assert.equal(inputs.narrative?.value.kind, "inline");
    assert.equal(inputs.basis?.value.kind, "inline");
    assert.equal(inputs.evidence?.value.kind, "inline");
    const map = locateSpeechTiming(
      inlineValue<Narrative>(inputs.narrative.value.value),
      inlineValue<SpeechBasis>(inputs.basis.value.value),
      inlineValue<AlignedTranscriptEvidence>(inputs.evidence.value.value),
    );
    return { outputs: { map: { kind: "inline", value: map } }, needs: {} };
  });
  host.registerProducer(captionProducers.temporalize, captionImplementationDigest, ({ inputs }) => {
    calls.caption += 1;
    assert.equal(inputs.narrative?.value.kind, "inline");
    assert.equal(inputs.map?.value.kind, "inline");
    const caption = temporalizeCaption(
      inlineValue<Narrative>(inputs.narrative.value.value),
      inlineValue<CompleteSemanticMap>(inputs.map.value.value),
    );
    return { outputs: { caption: { kind: "inline", value: caption } }, needs: {} };
  });

  const driver = new NodeDriver({ registry: host, providers });
  const atEstimate = await driver.run(createVideoBuild());
  assert.equal(atEstimate.blocked[0]?.reason, "missing-provider");
  assert.match(atEstimate.blocked[0]?.subject ?? "", /OfficialSpeechDurationEstimate/u);

  providers.registerProvider("runtime:official-estimate", videoTypes.estimate, () => ({
    value: { kind: "inline", value: { durationSec: 1 } },
    conformance: "exact",
    delivery: "executed",
    metadata: {},
  }));
  const atSeedance = await driver.run(parseBuildState(serializeBuildState(atEstimate.state)));
  assert.equal(atSeedance.blocked[0]?.reason, "missing-provider");
  assert.match(atSeedance.blocked[0]?.subject ?? "", /SeedanceMiniSpeechMedia/u);

  providers.registerProvider("runtime:kie-seedance-mini", videoTypes.seedanceMiniMedia, ({ need }) => {
    assert.deepEqual(need.constraints, {
      contract: "example.seedance-mini-speech-request@1",
      durationSec: 1,
      model: "mini",
      script: "what the fuck",
    });
    return {
      value: { kind: "inline", value: {
        model: "mini",
        audioDigest: digestOf("artifact:audio"),
        visualDigest: digestOf("artifact:visual"),
        durationSec: 1,
      } },
      conformance: "exact",
      delivery: "executed",
      metadata: { provider: "kie", model: "seedance-mini" },
    };
  });
  // A generic Evidence provider cannot satisfy the explicit WhisperX Need.
  providers.registerProvider("runtime:generic-stt", contractTypes.alignedTranscriptEvidence, () => {
    throw new Error("generic STT must never run for an explicit WhisperX Need");
  });
  const atWhisperX = await driver.run(parseBuildState(serializeBuildState(atSeedance.state)));
  assert.equal(atWhisperX.blocked[0]?.reason, "missing-provider");
  assert.match(atWhisperX.blocked[0]?.subject ?? "", /WhisperXAlignmentEvidence/u);

  providers.registerProvider("runtime:whisperx-local", whisperXTypes.alignmentEvidence, ({ need }) => {
    const request = inlineObject(need.constraints);
    const audio = inlineObject(request.audio);
    return {
      value: {
        kind: "inline",
        value: sealWhisperXAlignmentEvidence({
          contract: "svml.whisperx-alignment-evidence@1",
          engine: "whisperx",
          basisDigest: request.basisDigest as WhisperXAlignmentEvidence["basisDigest"],
          audioArtifactDigest: audio.digest as WhisperXAlignmentEvidence["audioArtifactDigest"],
          programSpaceDigest: request.programSpaceDigest as WhisperXAlignmentEvidence["programSpaceDigest"],
          rawEvidenceArtifactDigest: digestOf("artifact:whisperx-json"),
          durationSec: 1,
          segments: [{
            sourceSegmentId: "line",
            startSec: 0,
            endSec: 1,
            words: [
              { text: "what", startSec: 0.1, endSec: 0.25, score: 0.98 },
              { text: "the", startSec: 0.3, endSec: 0.42, score: 0.98 },
              { text: "fuck", startSec: 0.48, endSec: 0.72, score: 0.97 },
            ],
            chars: [],
          }],
        }),
      },
      conformance: "exact",
      delivery: "executed",
      metadata: { adapter: "whisperx.local", model: "fixture" },
    };
  });
  const completed = await driver.run(parseBuildState(serializeBuildState(atWhisperX.state)));

  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, {
    estimate: 1,
    seedance: 1,
    assemble: 1,
    whisperRequest: 1,
    whisperNormalize: 1,
    locate: 1,
    caption: 1,
  });
  assert.deepEqual(completed.state.receipts.map((receipt) => receipt.fulfiller), [
    "runtime:official-estimate",
    "runtime:kie-seedance-mini",
    "runtime:whisperx-local",
  ]);
  const caption = completed.state.records.find((record) => record.id === "caption:root");
  assert.equal(caption?.value.kind, "inline");
  const value = inlineValue<TimedCaptionProjection>(caption?.value.kind === "inline" ? caption.value.value : {});
  assert.deepEqual(
    [value.text, value.regions[0]?.display, value.regions[0]?.startSec, value.regions[0]?.endSec],
    ["that was insane", "that was insane", 0.1, 0.72],
  );
});

test("an exact Provider result cannot wash a substitute input back to exact", async () => {
  const initial = createVideoBuild();
  const plan = {
    ...initial.plan,
    steps: initial.plan.steps.map((step) => {
      if (step.id === "request-estimate") {
        return { ...step, needs: { estimate: { ...step.needs.estimate!, accepts: "substitute" as const } } };
      }
      if (step.id === "request-seedance-mini") {
        return { ...step, needs: { media: { ...step.needs.media!, accepts: "substitute" as const } } };
      }
      return step;
    }),
    goals: initial.plan.goals.map((goal) => ({ ...goal, accepts: "substitute" as const })),
  };
  const host = new HostRegistry();
  host.registerProducer(videoProducers.requestEstimate, videoImplementations.requestEstimate, () => ({
    outputs: {},
    needs: { estimate: { speech: "what the fuck" } },
  }));
  host.registerProducer(videoProducers.requestSeedanceMini, videoImplementations.requestSeedanceMini, () => ({
    outputs: {},
    needs: { media: { model: "mini" } },
  }));
  const providers = new ProviderRegistry();
  providers.registerProvider("runtime:estimated-duration", videoTypes.estimate, () => ({
    value: { kind: "inline", value: { durationSec: 1 } },
    conformance: "substitute",
    delivery: "provided",
    metadata: {},
  }));
  providers.registerProvider("runtime:exact-seedance", videoTypes.seedanceMiniMedia, () => ({
    value: { kind: "inline", value: {
      model: "mini",
      audioDigest: digestOf("floor:audio"),
      visualDigest: digestOf("floor:visual"),
      durationSec: 1,
    } },
    conformance: "exact",
    delivery: "executed",
    metadata: {},
  }));

  const result = await new NodeDriver({ registry: host, providers }).run(start(initial.program, plan));
  assert.equal(result.status, "paused", "the unregistered Basis assembler should pause the test after both Needs");
  const seedanceNeed = result.state.needs.find((need) => need.id === "need:seedance-mini");
  const seedanceReceipt = result.state.receipts.find((receipt) => receipt.need === "need:seedance-mini");
  const media = result.state.records.find((record) => record.id === "seedance-media:root");
  assert.equal(seedanceNeed?.conformanceFloor, "substitute");
  assert.equal(seedanceReceipt?.fulfillmentConformance, "exact");
  assert.equal(seedanceReceipt?.conformance, "substitute");
  assert.equal(media?.conformance, "substitute");
});

test("Core rejects an impossible exact downstream Need before an expensive Provider can run", async () => {
  const initial = createVideoBuild();
  const plan = {
    ...initial.plan,
    steps: initial.plan.steps.map((step) => step.id === "request-estimate"
      ? { ...step, needs: { estimate: { ...step.needs.estimate!, accepts: "substitute" as const } } }
      : step),
  };
  const host = new HostRegistry();
  host.registerProducer(videoProducers.requestEstimate, videoImplementations.requestEstimate, () => ({
    outputs: {}, needs: { estimate: { speech: "what the fuck" } },
  }));
  host.registerProducer(videoProducers.requestSeedanceMini, videoImplementations.requestSeedanceMini, () => ({
    outputs: {}, needs: { media: { model: "mini" } },
  }));
  const providers = new ProviderRegistry();
  providers.registerProvider("runtime:estimated-duration", videoTypes.estimate, () => ({
    value: { kind: "inline", value: { durationSec: 1 } },
    conformance: "substitute",
    delivery: "provided",
    metadata: {},
  }));
  let expensiveCalls = 0;
  providers.registerProvider("runtime:paid-seedance", videoTypes.seedanceMiniMedia, () => {
    expensiveCalls += 1;
    throw new Error("must not run");
  });

  const result = await new NodeDriver({ registry: host, providers }).run(start(initial.program, plan));
  assert.equal(result.status, "failed");
  assert.equal(result.state.diagnostics.at(-1)?.code, "CONFORMANCE_FLOOR_UNSATISFIABLE");
  assert.equal(expensiveCalls, 0);
});
