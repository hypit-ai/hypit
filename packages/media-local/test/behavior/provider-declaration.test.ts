import assert from "node:assert/strict";
import test from "node:test";
import { pointwiseOperatorTemporalSupport } from "@hypit/audio-program";

import { createLocalMediaProvider } from "../../src/index.js";
import { localMediaToolchainProgram } from "../../src/program.js";
import { supportsLocalAudioProgram, supportsLocalSpeechEvidenceAudio } from "../../src/support.js";
import { endpointOffers } from "@hypit/endpoint";
import { canonicalize, capabilityKey } from "@hypit/protocol";
import { audioProgramCapabilities, audioProgramGraphFromMediaSources, audioProgramMediaSources, sealAudioProgram } from "@hypit/audio-program";
import { preservePitch } from "@hypit/audio-preserve-pitch";
import { mediaDeliveryCapabilities } from "@hypit/media-delivery";
import { mediaCapabilities } from "@hypit/media";
import { mediaExtractionCapabilities } from "@hypit/media-extraction";
import { stillVideoCapabilities } from "@hypit/still-video";
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
    capabilityKey(mediaCapabilities.inspect),
    capabilityKey(mediaExtractionCapabilities.audio),
    capabilityKey(mediaExtractionCapabilities.frame),
    capabilityKey(stillVideoCapabilities.render),
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
  const child = sealAudioProgram({
    domain, sampling: { sampleRate: 48_000 },
    graph: audioProgramGraphFromMediaSources([{
      id: "curve",
      source: {
        source: { kind: "blob", resource: fixtureResource("media-local:support"), size: 1, mediaType: "audio/wav" },
        streamIndex: 0, presentationStart: zero, sourceDomain: domain,
      },
      preparation: identityTemporalMap(domain),
    }]),
  });
  const occurrenceSampling = sealTemporalMap({ stages: [{
        target: { id: "occurrence", duration: one }, source: domain,
        pieces: [{ target: { start: zero, end: one }, sourceAtStart: zero,
          sourceControl1: zero, sourceControl2: one, sourceAtEnd: one }],
      }] });
  const program = sealAudioProgram({
    domain: { id: "support-program", duration: one }, sampling: { sampleRate: 48_000 },
    graph: { nodes: [{ kind: "program", id: "curve-use", program: child,
      sampling: occurrenceSampling, target: { start: zero, end: one } }],
    output: { node: "curve-use" } },
  });
  assert.deepEqual(supportsLocalAudioProgram(canonicalize({ program })), { status: "supported" });
  const process = "local-unsupported-process";
  const unsupportedProgram = sealAudioProgram({ ...program, graph: {
    nodes: [...program.graph.nodes, { kind: "process", id: process,
      inputs: { signal: program.graph.output },
      program: { format: "example.audio-effect@1", payload: {}, artifacts: [] },
      temporalSupport: pointwiseOperatorTemporalSupport(["signal"]),
      controlMappings: {} }],
    output: { node: process },
  } });
  assert.deepEqual(supportsLocalAudioProgram(canonicalize({ program: unsupportedProgram })), {
    status: "unsupported",
    reason: "AudioProgram capability is unsupported: Audio Gain does not support Process format example.audio-effect@1.",
  });
  const windowedProgram = sealAudioProgram({ ...unsupportedProgram, graph: {
    ...unsupportedProgram.graph,
    nodes: unsupportedProgram.graph.nodes.map((node) => node.kind !== "process" ? node : ({
      ...node,
      temporalSupport: {
        ...node.temporalSupport,
        inputs: { signal: { before: one, after: zero } },
      },
    })),
  } });
  assert.deepEqual(supportsLocalAudioProgram(canonicalize({ program: windowedProgram })), {
    status: "unsupported",
    reason: "AudioProgram capability is unsupported: Audio Process local-unsupported-process requires non-pointwise temporal support.",
  });
  assert.deepEqual(supportsLocalSpeechEvidenceAudio(canonicalize({
    source: audioProgramMediaSources(program)[0]!.source,
    preparation: occurrenceSampling,
  })), {
    status: "unsupported",
    reason: "Speech-evidence audio requires positive affine, non-looping Prepared Media relations.",
  });
});

test("pitch-preserving reconstruction is explicit and the local Provider reports its actual Map subset", () => {
  const zero = exactTemporalZero();
  const one = { ticks: "1", timeBase: { numerator: 1, denominator: 1 } } as const;
  const domain = { id: "audio", duration: one };
  const child = sealAudioProgram({
    domain, sampling: { sampleRate: 48_000 },
    graph: audioProgramGraphFromMediaSources([{
      id: "curve-preserve-pitch",
      source: {
        source: { kind: "blob", resource: fixtureResource("media-local:pitch-curve"), size: 1, mediaType: "audio/wav" },
        streamIndex: 0, presentationStart: zero, sourceDomain: domain,
      },
      preparation: identityTemporalMap(domain),
    }]),
  });
  const curve = sealAudioProgram({
    domain: { id: "pitch-program", duration: one }, sampling: { sampleRate: 48_000 },
    graph: { nodes: [{
      kind: "program", id: "curve-use", program: child,
      sampling: sealTemporalMap({ stages: [{
        target: { id: "occurrence", duration: one }, source: domain,
        pieces: [{ target: { start: zero, end: one }, sourceAtStart: zero,
          sourceControl1: zero, sourceControl2: one, sourceAtEnd: one }],
      }] }),
      reconstruction: preservePitch().program,
      target: { start: zero, end: one },
    }], output: { node: "curve-use" } },
  });
  const support = supportsLocalAudioProgram(canonicalize({ program: curve }));
  assert.equal(support.status, "unsupported");
  assert.match(support.reason, /positive affine/u);
});
