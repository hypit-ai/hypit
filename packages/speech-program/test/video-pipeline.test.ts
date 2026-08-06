import assert from "node:assert/strict";
import test from "node:test";

import {
  captionImplementationDigest,
  captionProducers,
  temporalizeCaption,
} from "@svml/caption";
import type { TimedCaptionProjection } from "@svml/caption";
import {
  contractTypes,
  sealProgramSpace,
  sealSpeechBasis,
  sealSpeechEvidenceAudio,
  sealVisualTrack,
} from "@svml/contracts";
import type {
  AlignedTranscriptEvidence,
  CompleteSemanticMap,
  Narrative,
  SpeechAudioBasis,
  SpeechBasis,
  SpeechEvidenceAudio,
  VisualTrack,
} from "@svml/contracts";
import { digestOf, sealBuildRequest, start } from "@svml/core";
import {
  HostRegistry,
  NodeDriver,
  ProviderRegistry,
  parseBuildState,
  serializeBuildState,
} from "@svml/driver-node";
import type { BuildState, CapabilityRef, ProducerRef } from "@svml/protocol";
import {
  createProvidedCandidate,
  resolveRealization,
  sealRealizationOverlay,
} from "@svml/realization";
import { locateSpeechTiming, speechAlignProducers, speechLocatorDigest } from "@svml/speech-align";
import {
  mediaPipelineCapabilities,
  mediaPipelineImplementationDigests,
  mediaPipelineProducers,
} from "@svml/media-pipeline";
import type { ProjectSpeechEvidenceAudioNeed } from "@svml/media-pipeline";
import {
  projectSpeechAudio,
  projectSpeechAudioImplementationDigest,
  projectSpeechVisual,
  projectSpeechVisualImplementationDigest,
  speechTakeProducers,
} from "@svml/speech-take";
import {
  normalizeWhisperXAlignment,
  sealWhisperXAlignmentEvidence,
  whisperXCapabilities,
  whisperXImplementationDigests,
  whisperXProducers,
  whisperXRequestForEvidenceAudio,
} from "@svml/whisperx";
import type { WhisperXAlignmentEvidence } from "@svml/whisperx";

import {
  createVideoBuild,
  createVideoFixture,
  videoCapabilities,
  videoImplementations,
  videoOutputs,
  videoProducers,
  videoTypes,
  whisperXTypes,
} from "./video-pipeline-fixture.js";

function inlineObject(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error("expected object");
  return value as Readonly<Record<string, unknown>>;
}

function inlineValue<T>(value: unknown): T {
  return value as T;
}

function sameCapability(left: CapabilityRef, right: CapabilityRef): boolean {
  return left.name === right.name
    && left.module.name === right.module.name
    && left.module.version === right.module.version;
}

function selectedRecord(state: BuildState, output: string): string {
  const selection = state.plan.selections.find((item) => item.output === output);
  assert(selection, `missing selection for ${output}`);
  return selection.record;
}

function producerCount(state: BuildState, producer: ProducerRef): number {
  return state.plan.steps.filter((step) =>
    step.producer.name === producer.name
      && step.producer.module.name === producer.module.name
      && step.producer.module.version === producer.module.version).length;
}

test("the Speech Program pipeline resumes without repeating paid calls", async () => {
  const host = new HostRegistry();
  const providers = new ProviderRegistry();
  const calls = {
    estimate: 0,
    seedance: 0,
    assemble: 0,
    projectAudio: 0,
    projectVisual: 0,
    evidenceAudioRequest: 0,
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
    assert.equal(inputs.narrative?.value.kind, "inline");
    assert.equal(inputs.media?.value.kind, "inline");
    const narrative = inlineValue<Narrative>(inputs.narrative.value.value);
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
      narrativeDigest: narrative.semanticIndex.digest,
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
  host.registerProducer(
    speechTakeProducers.projectAudio,
    projectSpeechAudioImplementationDigest,
    ({ inputs }) => {
      calls.projectAudio += 1;
      assert.equal(inputs.basis?.value.kind, "inline");
      return {
        outputs: {
          audio: {
            kind: "inline",
            value: projectSpeechAudio(inlineValue<SpeechBasis>(inputs.basis.value.value)),
          },
        },
        needs: {},
      };
    },
  );
  host.registerProducer(
    mediaPipelineProducers.projectSpeechEvidenceAudio,
    mediaPipelineImplementationDigests.projectSpeechEvidenceAudio,
    ({ inputs }) => {
      calls.evidenceAudioRequest += 1;
      assert.equal(inputs.audio?.value.kind, "inline");
      const audio = inlineValue<SpeechAudioBasis>(inputs.audio.value.value);
      const sourceSampleFrames = Math.round(audio.programSpace.durationSec * 48_000);
      const need: ProjectSpeechEvidenceAudioNeed = {
        contract: "svml.project-speech-evidence-audio-request@1",
        basisDigest: audio.basisDigest,
        narrativeDigest: audio.narrativeDigest,
        programSpaceDigest: audio.programSpace.digest,
        source: {
          kind: "blob",
          digest: audio.audio.digest,
          size: audio.audio.size,
          mediaType: audio.audio.mediaType,
        },
        sourceSampleRate: 48_000,
        sourceChannels: 2,
        sourceCodec: "pcm_s16le",
        sourceSampleFrames,
        evidenceSampleRate: 16_000,
        evidenceChannels: 1,
        evidenceCodec: "pcm_s16le",
        evidenceSampleFrames: Math.round(sourceSampleFrames / 3),
        durationSec: audio.programSpace.durationSec,
        segments: audio.segments,
      };
      return { outputs: {}, needs: { evidenceAudio: need } };
    },
  );
  host.registerProducer(
    speechTakeProducers.projectVisual,
    projectSpeechVisualImplementationDigest,
    ({ inputs }) => {
      calls.projectVisual += 1;
      assert.equal(inputs.basis?.value.kind, "inline");
      return {
        outputs: {
          visual: {
            kind: "inline",
            value: projectSpeechVisual(inlineValue<SpeechBasis>(inputs.basis.value.value)),
          },
        },
        needs: {},
      };
    },
  );
  host.registerProducer(whisperXProducers.request, whisperXImplementationDigests.request, ({ inputs }) => {
    calls.whisperRequest += 1;
    assert.equal(inputs.audio?.value.kind, "inline");
    return {
      outputs: {},
      needs: {
        alignment: whisperXRequestForEvidenceAudio(
          inlineValue<SpeechEvidenceAudio>(inputs.audio.value.value),
          { language: "en" },
        ),
      },
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
    assert.equal(inputs.audio?.value.kind, "inline");
    assert.equal(inputs.evidence?.value.kind, "inline");
    const map = locateSpeechTiming(
      inlineValue<Narrative>(inputs.narrative.value.value),
      inlineValue<SpeechAudioBasis>(inputs.audio.value.value),
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

  providers.registerProvider("runtime:official-estimate", videoCapabilities.estimate, videoTypes.estimate, () => ({
    value: { kind: "inline", value: { durationSec: 1 } },
    conformance: "exact",
    delivery: "executed",
    metadata: {},
  }));
  const atSeedance = await driver.run(parseBuildState(serializeBuildState(atEstimate.state)));
  assert.equal(atSeedance.blocked[0]?.reason, "missing-provider");
  assert.match(atSeedance.blocked[0]?.subject ?? "", /SeedanceMiniSpeechMedia/u);

  providers.registerProvider(
    "runtime:kie-seedance-mini",
    videoCapabilities.seedanceMini,
    videoTypes.seedanceMiniMedia,
    ({ need }) => {
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
    },
  );
  const atEvidenceAudio = await driver.run(parseBuildState(serializeBuildState(atSeedance.state)));
  assert.equal(atEvidenceAudio.blocked[0]?.reason, "missing-provider");
  assert.match(atEvidenceAudio.blocked[0]?.subject ?? "", /SpeechEvidenceAudio/u);

  providers.registerProvider(
    "runtime:media-local",
    mediaPipelineCapabilities.projectSpeechEvidenceAudio,
    contractTypes.speechEvidenceAudio,
    ({ need }) => {
      const request = inlineValue<ProjectSpeechEvidenceAudioNeed>(need.constraints);
      return {
        value: { kind: "inline", value: sealSpeechEvidenceAudio({
          contract: "svml.speech-evidence-audio@1",
          basisDigest: request.basisDigest,
          narrativeDigest: request.narrativeDigest,
          programSpaceDigest: request.programSpaceDigest,
          sourceAudioArtifactDigest: request.source.digest,
          artifact: {
            kind: "blob",
            digest: digestOf("artifact:evidence-audio"),
            size: 32_044,
            mediaType: "audio/wav",
          },
          codec: "pcm_s16le",
          sampleRate: 16_000,
          channels: 1,
          sampleFrames: request.evidenceSampleFrames,
          durationSec: request.durationSec,
          segments: request.segments,
          sampleMap: {
            algorithm: "rational-boundary-round@1",
            sourceSampleRate: 48_000,
            evidenceSampleRate: 16_000,
            sourceSampleFrames: request.sourceSampleFrames,
            evidenceSampleFrames: request.evidenceSampleFrames,
            sourceOriginSample: 0,
            evidenceOriginSample: 0,
            resamplerImplementation: "fixture",
          },
        }) },
        conformance: "exact",
        delivery: "executed",
        metadata: {},
      };
    },
  );
  const atWhisperX = await driver.run(parseBuildState(serializeBuildState(atEvidenceAudio.state)));
  assert.equal(atWhisperX.blocked[0]?.reason, "missing-provider");
  assert.match(atWhisperX.blocked[0]?.subject ?? "", /WhisperXAlignmentEvidence/u);

  const wrongBasisProviders = new ProviderRegistry();
  wrongBasisProviders.registerProvider(
    "runtime:wrong-basis-whisperx",
    whisperXCapabilities.alignment,
    whisperXTypes.alignmentEvidence,
    () => ({
      value: {
        kind: "inline",
        value: sealWhisperXAlignmentEvidence({
          contract: "svml.whisperx-alignment-evidence@2",
          engine: "whisperx",
          basisDigest: digestOf("another-project:basis"),
          audioArtifactDigest: digestOf("another-project:audio"),
          evidenceAudioDigest: digestOf("another-project:evidence-audio"),
          programSpaceDigest: digestOf("another-project:program-space"),
          rawEvidenceArtifactDigest: digestOf("another-project:whisperx-json"),
          durationSec: 1,
          segments: [{ sourceSegmentId: "line", startSec: 0, endSec: 1, words: [], chars: [] }],
        }),
      },
      conformance: "exact",
      delivery: "executed",
      metadata: {},
    }),
  );
  const rejectedEvidence = await new NodeDriver({ registry: host, providers: wrongBasisProviders }).run(
    parseBuildState(serializeBuildState(atWhisperX.state)),
  );
  assert.equal(rejectedEvidence.status, "paused");
  assert.match(rejectedEvidence.journal.at(-1)?.message ?? "", /different SpeechBasis|does not match/u);
  const rejectedWhisperNeed = rejectedEvidence.state.needs.find((need) =>
    sameCapability(need.capability, whisperXCapabilities.alignment));
  assert(rejectedWhisperNeed);
  assert.equal(
    rejectedEvidence.state.records.some((record) =>
      record.id === rejectedWhisperNeed.result),
    false,
    "Evidence for another same-duration audio projection must not enter BuildState",
  );

  providers.registerProvider(
    "runtime:whisperx-local",
    whisperXCapabilities.alignment,
    whisperXTypes.alignmentEvidence,
    ({ need }) => {
      const request = inlineObject(need.constraints);
      return {
        value: {
          kind: "inline",
          value: sealWhisperXAlignmentEvidence({
            contract: "svml.whisperx-alignment-evidence@2",
            engine: "whisperx",
            basisDigest: request.basisDigest as WhisperXAlignmentEvidence["basisDigest"],
            audioArtifactDigest: request.sourceAudioArtifactDigest as WhisperXAlignmentEvidence["audioArtifactDigest"],
            evidenceAudioDigest: request.evidenceAudioDigest as WhisperXAlignmentEvidence["evidenceAudioDigest"],
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
    },
  );
  const completed = await driver.run(parseBuildState(serializeBuildState(atWhisperX.state)));

  assert.equal(completed.status, "complete");
  assert.deepEqual(calls, {
    estimate: 1,
    seedance: 1,
    assemble: 1,
    projectAudio: 1,
    projectVisual: 0,
    evidenceAudioRequest: 1,
    whisperRequest: 1,
    whisperNormalize: 1,
    locate: 1,
    caption: 1,
  });
  assert.deepEqual(completed.state.receipts.map((receipt) => receipt.fulfiller), [
    "runtime:official-estimate",
    "runtime:kie-seedance-mini",
    "runtime:media-local",
    "runtime:whisperx-local",
  ]);
  const captionRecord = completed.state.records.find((record) =>
    record.id === selectedRecord(completed.state, videoOutputs.caption));
  assert.equal(captionRecord?.value.kind, "inline");
  const value = inlineValue<TimedCaptionProjection>(
    captionRecord?.value.kind === "inline" ? captionRecord.value.value : {},
  );
  assert.deepEqual(
    [value.text, value.regions[0]?.display, value.regions[0]?.startSec, value.regions[0]?.endSec],
    ["that was insane", "that was insane", 0.1, 0.72],
  );
});

test("Targets prune official Fragments while shared SpeechTake generation stays singular", () => {
  const visual = createVideoBuild({ targets: ["visual"] });
  assert.equal(producerCount(visual, videoProducers.requestEstimate), 1);
  assert.equal(producerCount(visual, videoProducers.requestSeedanceMini), 1);
  assert.equal(producerCount(visual, videoProducers.assembleBasis), 1);
  assert.equal(producerCount(visual, speechTakeProducers.projectVisual), 1);
  assert.equal(producerCount(visual, speechTakeProducers.projectAudio), 0);
  assert.equal(producerCount(visual, whisperXProducers.request), 0);
  assert.equal(producerCount(visual, captionProducers.temporalize), 0);

  const map = createVideoBuild({ targets: ["map"] });
  assert.equal(producerCount(map, speechTakeProducers.projectAudio), 1);
  assert.equal(producerCount(map, speechTakeProducers.projectVisual), 0);
  assert.equal(producerCount(map, whisperXProducers.request), 1);
  assert.equal(producerCount(map, whisperXProducers.normalize), 1);
  assert.equal(producerCount(map, speechAlignProducers.locate), 1);
  assert.equal(producerCount(map, captionProducers.temporalize), 0);

  const bothTakeProjections = createVideoBuild({ targets: ["audio", "visual"] });
  assert.equal(producerCount(bothTakeProjections, videoProducers.requestSeedanceMini), 1);
  assert.equal(producerCount(bothTakeProjections, videoProducers.assembleBasis), 1);
  assert.equal(producerCount(bothTakeProjections, speechTakeProducers.projectAudio), 1);
  assert.equal(producerCount(bothTakeProjections, speechTakeProducers.projectVisual), 1);

  const bothEvidenceExports = createVideoBuild({ targets: ["rawEvidence", "map"] });
  assert.equal(producerCount(bothEvidenceExports, whisperXProducers.request), 1);
  assert.equal(producerCount(bothEvidenceExports, whisperXProducers.normalize), 1);
  assert.equal(producerCount(bothEvidenceExports, speechAlignProducers.locate), 1);
});

test("an Existing SpeechTake cuts generation while a visual substitute cuts the whole upstream", () => {
  const fixture = createVideoFixture();
  const narrativeRecord = fixture.program.records.find((record) => record.id === "narrative:root");
  assert.equal(narrativeRecord?.value.kind, "inline");
  const narrative = inlineValue<Narrative>(
    narrativeRecord?.value.kind === "inline" ? narrativeRecord.value.value : {},
  );
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec: 1,
    frameRate: { numerator: 1_000, denominator: 1 },
  });
  const visualDigest = digestOf("existing-take:visual");
  const existingTake = sealSpeechBasis({
    contract: "svml.speech-basis@1",
    narrativeDigest: narrative.semanticIndex.digest,
    programSpace,
    audio: {
      digest: digestOf("existing-take:audio"),
      size: 1,
      mediaType: "audio/wav",
      durationSec: 1,
    },
    visualTrack: { clips: [{
      segmentId: "line",
      artifact: { digest: visualDigest, size: 1, mediaType: "video/mp4", durationSec: 1 },
      startSec: 0,
      endSec: 1,
    }] },
    segments: [{ segmentId: "line", startSec: 0, endSec: 1, sourceArtifactDigest: visualDigest }],
  });
  const takeCandidate = createProvidedCandidate({
    output: videoOutputs.take,
    value: { kind: "inline", value: existingTake },
    fidelity: "exact",
    provenance: { source: "approved-library", name: "opening-v3" },
  });
  const takeOverlay = sealRealizationOverlay({
    sourceGraph: fixture.source.id,
    candidates: [takeCandidate],
    operations: [],
  });
  const withExistingTake = resolveRealization(fixture.program, fixture.source, [takeOverlay]);
  const captionFromExisting = start(fixture.program, withExistingTake.graph, sealBuildRequest({
    graph: withExistingTake.graph.id,
    targets: [{ output: videoOutputs.caption, accepts: "exact" }],
    bindings: [{ output: videoOutputs.take, candidate: takeCandidate.id }],
  }));
  assert.equal(producerCount(captionFromExisting, videoProducers.requestEstimate), 0);
  assert.equal(producerCount(captionFromExisting, videoProducers.requestSeedanceMini), 0);
  assert.equal(producerCount(captionFromExisting, videoProducers.assembleBasis), 0);
  assert.equal(producerCount(captionFromExisting, speechTakeProducers.projectAudio), 1);
  assert.equal(producerCount(captionFromExisting, whisperXProducers.request), 1);
  assert.equal(producerCount(captionFromExisting, captionProducers.temporalize), 1);

  const blackProgram = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const black: VisualTrack = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: "preview:black",
    programSpaceDigest: blackProgram.digest,
    sources: [
      { name: "basis", digest: digestOf("preview:black-basis") },
      { name: "narrative", digest: narrative.semanticIndex.digest },
    ],
    presents: [],
  });
  const blackCandidate = createProvidedCandidate({
    output: videoOutputs.visual,
    value: { kind: "inline", value: black },
    fidelity: "substitute",
    provenance: { method: "black-preview" },
  });
  const blackOverlay = sealRealizationOverlay({
    sourceGraph: fixture.source.id,
    candidates: [blackCandidate],
    operations: [],
  });
  const withBlack = resolveRealization(fixture.program, fixture.source, [blackOverlay]);
  const preview = start(fixture.program, withBlack.graph, sealBuildRequest({
    graph: withBlack.graph.id,
    targets: [{ output: videoOutputs.visual, accepts: "substitute" }],
    bindings: [{ output: videoOutputs.visual, candidate: blackCandidate.id }],
  }));
  assert.deepEqual(preview.plan.steps, []);
  assert.equal(preview.plan.initialValues.length, 1);
});

test("an exact Provider result cannot wash a substitute input back to exact", async () => {
  const initial = createVideoBuild({
    estimateRealization: "placeholder",
    goalAccepts: "substitute",
  });
  const host = new HostRegistry();
  host.registerProducer(
    videoProducers.placeholderEstimate,
    videoImplementations.placeholderEstimate,
    () => ({ outputs: { estimate: { kind: "inline", value: { durationSec: 1 } } }, needs: {} }),
  );
  host.registerProducer(videoProducers.requestSeedanceMini, videoImplementations.requestSeedanceMini, () => ({
    outputs: {},
    needs: { media: { model: "mini" } },
  }));
  const providers = new ProviderRegistry();
  providers.registerProvider(
    "runtime:exact-seedance",
    videoCapabilities.seedanceMini,
    videoTypes.seedanceMiniMedia,
    () => ({
      value: { kind: "inline", value: {
        model: "mini",
        audioDigest: digestOf("floor:audio"),
        visualDigest: digestOf("floor:visual"),
        durationSec: 1,
      } },
      conformance: "exact",
      delivery: "executed",
      metadata: {},
    }),
  );

  const result = await new NodeDriver({ registry: host, providers }).run(initial);
  assert.equal(result.status, "paused", "the unregistered Basis assembler should pause after Seedance");
  const seedanceNeed = result.state.needs.find((need) =>
    sameCapability(need.capability, videoCapabilities.seedanceMini));
  const seedanceReceipt = result.state.receipts.find((receipt) => receipt.need === seedanceNeed?.id);
  const media = result.state.records.find((record) => record.id === seedanceReceipt?.output);
  assert.equal(seedanceNeed?.conformanceFloor, "substitute");
  assert.equal(seedanceReceipt?.fulfillmentConformance, "exact");
  assert.equal(seedanceReceipt?.conformance, "substitute");
  assert.equal(media?.conformance, "substitute");
});

test("an exact Target rejects an explicitly selected substitute realization", () => {
  assert.throws(
    () => createVideoBuild({ estimateRealization: "placeholder" }),
    /selects a substitute path/u,
  );
});
