import assert from "node:assert/strict";
import test from "node:test";

import { createLocalMediaProvider } from "../../src/index.js";
import { localMediaToolchainProgram } from "../../src/program.js";
import { supportsLocalAudioProgram, supportsLocalSpeechEvidenceAudio } from "../../src/support.js";
import { endpointOffers } from "@hypit/endpoint";
import { canonicalize, capabilityKey } from "@hypit/protocol";
import { audioProgramCapabilities, audioProgramGraphFromClips, audioProgramSourceClips, sealAudioProgram } from "@hypit/audio-program";
import { preservePitch } from "@hypit/audio-stretch";
import { mediaDeliveryCapabilities } from "@hypit/media-delivery";
import { mediaOperationsCapabilities } from "@hypit/media-operations";
import { speechEvidenceCapabilities } from "@hypit/speech-evidence";
import { exactTemporalZero, identityTemporalMap, sealTemporalMap } from "@hypit/temporal";
import { fixtureResource } from "../../../../test/fixture-resource.js";

test("the local media Provider declares its external toolchain without owning a second daemon", () => {
  const program = localMediaToolchainProgram({
    id: "media",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
  });
  assert.equal(program.id, "media");
  assert.equal(program.installation, undefined);
  assert.equal(program.start, undefined);
});

test("local media exposes only author-requested reusable operations as transient capabilities", () => {
  const provider = createLocalMediaProvider({});
  assert.deepEqual(endpointOffers(provider).filter((offer) => offer.transient === true)
    .map((offer) => capabilityKey(offer.capability)), [
    capabilityKey(mediaOperationsCapabilities.inspect),
    capabilityKey(mediaOperationsCapabilities.extractAudio),
    capabilityKey(mediaOperationsCapabilities.extractFrame),
    capabilityKey(mediaOperationsCapabilities.renderStill),
  ]);
  assert.deepEqual(endpointOffers(provider).filter((offer) => offer.transient !== true)
    .map((offer) => capabilityKey(offer.capability)), [
    capabilityKey(speechEvidenceCapabilities.projectAudio),
    capabilityKey(audioProgramCapabilities.render),
    capabilityKey(mediaDeliveryCapabilities.mux),
  ]);
});

test("local media accepts complete AudioProgram maps while speech evidence keeps its narrower signal boundary", () => {
  const zero = exactTemporalZero();
  const one = { ticks: "1", timeBase: { numerator: 1, denominator: 1 } } as const;
  const domain = { id: "audio", duration: one };
  const program = sealAudioProgram({
    frameRate: { numerator: 30, denominator: 1 }, frameCount: 30,
    sampleRate: 48_000, sampleFrames: 48_000,
    graph: audioProgramGraphFromClips([{
      id: "curve",
      source: {
        source: { kind: "blob", resource: fixtureResource("media-local:support"), size: 1, mediaType: "audio/wav" },
        streamIndex: 0, presentationStart: zero, sourceDomain: domain,
        interpretation: { sampleRate: 48_000, channels: 2 },
      },
      preparation: identityTemporalMap(domain),
      sampling: sealTemporalMap({ stages: [{
        target: { id: "occurrence", duration: one }, source: domain,
        pieces: [{ target: { start: zero, end: one }, sourceAtStart: zero,
          sourceControl1: zero, sourceControl2: one, sourceAtEnd: one }],
      }] }),
      target: { start: zero, end: one },
      targetStartSample: 0, targetEndSampleExclusive: 48_000,
      mixStartSample: 0, mixEndSampleExclusive: 48_000,
      gain: 1, fadeInSamples: 0, fadeOutSamples: 0,
    }]),
  });
  assert.deepEqual(supportsLocalAudioProgram(canonicalize({ program })), { status: "supported" });
  const process = "local-unsupported-process";
  const unsupportedProgram = sealAudioProgram({ ...program, graph: {
    nodes: [...program.graph.nodes, { kind: "process", id: process,
      inputs: { signal: program.graph.output },
      program: { format: "example.audio-effect@1", payload: {}, artifacts: [] } }],
    output: { node: process, port: "signal" },
  } });
  assert.deepEqual(supportsLocalAudioProgram(canonicalize({ program: unsupportedProgram })), {
    status: "unsupported",
    reason: "Audio Process is unsupported: Audio programme does not support Process format example.audio-effect@1.",
  });
  assert.deepEqual(supportsLocalSpeechEvidenceAudio(canonicalize({
    source: audioProgramSourceClips(program)[0]!.source,
    preparation: audioProgramSourceClips(program)[0]!.sampling,
  })), {
    status: "unsupported",
    reason: "Speech-evidence audio requires positive affine, non-looping Prepared Media relations.",
  });
});

test("pitch-preserving reconstruction is explicit and the local Provider reports its actual Map subset", () => {
  const zero = exactTemporalZero();
  const one = { ticks: "1", timeBase: { numerator: 1, denominator: 1 } } as const;
  const domain = { id: "audio", duration: one };
  const curve = sealAudioProgram({
    frameRate: { numerator: 30, denominator: 1 }, frameCount: 30,
    sampleRate: 48_000, sampleFrames: 48_000,
    graph: audioProgramGraphFromClips([{
      id: "curve-preserve-pitch",
      source: {
        source: { kind: "blob", resource: fixtureResource("media-local:pitch-curve"), size: 1, mediaType: "audio/wav" },
        streamIndex: 0, presentationStart: zero, sourceDomain: domain,
        interpretation: { sampleRate: 48_000, channels: 2 },
      },
      preparation: identityTemporalMap(domain),
      sampling: sealTemporalMap({ stages: [{
        target: { id: "occurrence", duration: one }, source: domain,
        pieces: [{ target: { start: zero, end: one }, sourceAtStart: zero,
          sourceControl1: zero, sourceControl2: one, sourceAtEnd: one }],
      }] }),
      reconstruction: preservePitch(),
      target: { start: zero, end: one },
      targetStartSample: 0, targetEndSampleExclusive: 48_000,
      mixStartSample: 0, mixEndSampleExclusive: 48_000,
      gain: 1, fadeInSamples: 0, fadeOutSamples: 0,
    }]),
  });
  const support = supportsLocalAudioProgram(canonicalize({ program: curve }));
  assert.equal(support.status, "unsupported");
  assert.match(support.reason, /positive affine/u);
});
