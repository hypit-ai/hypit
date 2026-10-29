import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { installEndpoint } from "@hypit/endpoint";
import { sealSpeechEvidenceAudio, speechEvidenceTypes } from "@hypit/speech-evidence";
import assert from "node:assert/strict";
import { MemoryResourceStore, EndpointRegistry } from "@hypit/executor";
import type { Need } from "@hypit/protocol";
import {
  whisperXCapabilities,
  whisperXRequestForEvidenceAudio,
} from "@hypit/whisperx";
import { createLocalWhisperXProvider } from "../../src/index.js";

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

for (const language of ["en", "ko"]) test(`local Provider preserves ${language} and stages canonical evidence bytes unchanged`, async () => {
  const expected = wav(32_000);
  let stagedMatches = false;
  const server = createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      void (async () => {
        outgoing.setHeader("content-type", "application/json");
        if (incoming.url === "/health") {
          outgoing.end(JSON.stringify({
            ok: true,
            protocol: "hypit.whisperx-service@1",
            serviceVersion: "0.1.0",
            whisperxVersion: "3.8.6",
            model: "small",
            device: "cpu",
            compute: "int8",
            batchSize: 8,
          }));
          return;
        }
        assert.equal(incoming.url, "/transcribe");
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          readonly audio_path: string;
          readonly language: string;
        };
        assert.equal(body.language, language);
        stagedMatches = Buffer.compare(Buffer.from(await readFile(body.audio_path)), Buffer.from(expected)) === 0;
        outgoing.end(JSON.stringify({
          language,
          segments: [{ start: 0, end: 2, words: [
            { text: "hello", start: 0.1, end: 0.4 },
            { text: "world", start: 1.2, end: 1.6 },
          ] }],
        }));
      })();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const resources = new MemoryResourceStore();
    const artifact = await resources.put(expected, "audio/wav");
    const evidenceAudio = sealSpeechEvidenceAudio({
      artifact,
      sampleFrames: 32_000,
    });
    const constraints = whisperXRequestForEvidenceAudio(evidenceAudio, { language });
    const request: Need = {
      id: "need:whisperx-loopback",
      capability: whisperXCapabilities.transcription,
      returns: speechEvidenceTypes.transcript,
      constraints,
      result: "record:whisperx-loopback",
    };
    const registry = new EndpointRegistry();
    await installEndpoint(createLocalWhisperXProvider({
      baseUrl: `http://127.0.0.1:${port}`,
      expectedModel: "small",
      expectedDevice: "cpu",
    }), registry);
    const resolved = registry.select(request);
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.registration.kind, "immediate");
    const output = await resolved.registration.handler({

      request,
      resources,
      credentials: {},
    });
    assert.equal(stagedMatches, true);
    const value = output;
    assert.equal((value as { readonly passages?: readonly unknown[] }).passages?.length, 1);
    assert.equal((value as { readonly sampleFrames?: number }).sampleFrames, evidenceAudio.sampleFrames);
    assert.equal(speechEvidenceTypes.audio.name, "SpeechEvidenceAudio");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
