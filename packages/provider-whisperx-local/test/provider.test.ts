import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sealSpeechEvidenceAudio, speechTypes } from "@narratage/speech";
import type { SpeechEvidenceAudio } from "@narratage/speech";
import assert from "node:assert/strict";
import { MemoryArtifactStore, EndpointRegistry } from "@narratage/driver-node";
import { digestOf } from "@narratage/protocol";
import type { Need } from "@narratage/protocol";
import {
  whisperXCapabilities,
  whisperXRequestForEvidenceAudio,
  whisperXTypes,
} from "@narratage/whisperx";

import {
  createLocalWhisperXProvider,
  interpretWhisperXResponse,
} from "../src/index.js";

const sourceSegments = [
  { segmentId: "opening", startSec: 0, endSec: 1 },
  { segmentId: "answer", startSec: 1, endSec: 2 },
];
const loopbackEnabled = process.env.SVML_LOOPBACK_TESTS === "1";

function wav(sampleFrames: number): Uint8Array {
  const bytes = new Uint8Array(44 + sampleFrames * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, sampleFrames * 2, true);
  return bytes;
}

test("local WhisperX Provider pins the complete sidecar runtime and is independently queued", () => {
  const provider = createLocalWhisperXProvider({ expectedModel: "small", defaultConcurrency: 2 });
  assert.equal(provider.name, "whisperx.local");
  const facet = provider.manifest.facets[0];
  assert.equal(facet?.role, "capability-endpoint");
  assert(facet?.role === "capability-endpoint");
  assert.equal(facet.defaultConcurrency, 2);
  assert.deepEqual(facet.permissions, ["filesystem:whisperx-staging", "network:whisperx-loopback"]);
  assert.throws(
    () => createLocalWhisperXProvider({ baseUrl: "https://whisper.example.com" }),
    /loopback/u,
  );
});

test("sidecar pauses are projected onto authored Segments without clipping a crossing word into fake evidence", () => {
  const evidence = interpretWhisperXResponse({
    language: "en",
    segments: [{
      start: 0.1,
      end: 1.8,
      words: [
        { text: "hello", start: 0.1, end: 0.4, score: 0.99 },
        { text: "crossing", start: 0.9, end: 1.1, score: 0.8 },
        { text: "world", start: 1.2, end: 1.6 },
      ],
    }],
  }, sourceSegments, 2);
  assert.deepEqual(evidence.map((segment) => [segment.sourceSegmentId, segment.startSec, segment.endSec]), [
    ["opening", 0, 1],
    ["answer", 1, 2],
  ]);
  assert.deepEqual(evidence[0]!.words[0], { text: "hello", startSec: 0.1, endSec: 0.4, score: 0.99 });
  assert.deepEqual(evidence[1]!.words[0], { text: "crossing", score: 0.8 });
  assert.deepEqual(evidence[1]!.words[1], { text: "world", startSec: 1.2, endSec: 1.6 });
});

test("local Provider stages canonical evidence bytes unchanged and binds sidecar output to both audio identities", {
  skip: !loopbackEnabled,
}, async () => {
  const expected = wav(32_000);
  let stagedMatches = false;
  const server = createServer((request, response) => {
    void (async () => {
      if (request.url === "/health") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          ok: true,
          protocol: "svml.whisperx-sidecar@1",
          serviceVersion: "0.1.0",
          whisperxVersion: "3.8.6",
          model: "small",
          device: "cpu",
          compute: "int8",
          batchSize: 8,
          punktTabDigest: "e57f64187974277726a3417ca6f181ec5403676c717672eef6a748a7b20e0106",
        }));
        return;
      }
      assert.equal(request.url, "/transcribe");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { readonly audio_path: string };
      stagedMatches = Buffer.compare(Buffer.from(await readFile(body.audio_path)), Buffer.from(expected)) === 0;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        language: "en",
        segments: [{ start: 0, end: 2, words: [
          { text: "hello", start: 0.1, end: 0.4 },
          { text: "world", start: 1.2, end: 1.6 },
        ] }],
      }));
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert(address !== null && typeof address === "object");
    const artifacts = new MemoryArtifactStore();
    const artifact = await artifacts.put(expected, "audio/wav");
    const evidenceAudio = sealSpeechEvidenceAudio({
      contract: "svml.speech-evidence-audio@1",
      artifact,
      codec: "pcm_s16le",
      sampleRate: 16_000,
      channels: 1,
      sampleFrames: 32_000,
      durationSec: 2,
      segments: sourceSegments,
      sampleMap: {
        algorithm: "rational-boundary-round@1",
        sourceSampleRate: 48_000,
        evidenceSampleRate: 16_000,
        sourceSampleFrames: 96_000,
        evidenceSampleFrames: 32_000,
        sourceOriginSample: 0,
        evidenceOriginSample: 0,
      },
    });
    const constraints = whisperXRequestForEvidenceAudio(evidenceAudio, { language: "en" });
    const need: Need = {
      id: "need:whisperx-loopback",
      capability: whisperXCapabilities.alignment,
      returns: whisperXTypes.alignmentEvidence,
      constraints,
      requestedBy: "derivation:whisperx-loopback",
      result: "record:whisperx-loopback",
      accepts: "exact",
      conformanceFloor: "exact",
      requestDigest: digestOf({
        capability: whisperXCapabilities.alignment,
        returns: whisperXTypes.alignmentEvidence,
        constraints,
      }),
    };
    const registry = new EndpointRegistry();
    await createLocalWhisperXProvider({
      baseUrl: `http://127.0.0.1:${address.port}`,
      expectedModel: "small",
      expectedDevice: "cpu",
    }).install(registry);
    const resolved = registry.resolve(need);
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.registration.kind, "immediate");
    const output = await resolved.registration.handler({
      command: { kind: "fulfill-need", id: "command:whisperx-loopback", need },
      need,
      artifacts,
      credentials: {},
    });
    assert.equal(stagedMatches, true);
    assert.equal(output.value.kind, "inline");
    const value = output.value.kind === "inline" ? output.value.value : null;
    assert.equal((value as { readonly audioArtifactDigest?: unknown }).audioArtifactDigest,
      evidenceAudio.artifact.digest);
    assert.equal((value as { readonly segments?: readonly unknown[] }).segments?.length, 2);
    assert.equal((value as { readonly contract?: unknown }).contract, "svml.whisperx-alignment-evidence@1");
    assert.equal(speechTypes.evidenceAudio.name, "SpeechEvidenceAudio");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
