import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { AudioProgram, AudioProgramClip } from "@hypit/audio-program";
import {
  exactTemporalValueFromFrames,
  identityTemporalMap,
  sealTemporalMap,
} from "@hypit/temporal";
import type { TemporalMap, TemporalMapPiece } from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  audioRenderPlanSourceClips,
  CanonicalPcmReader,
  planAudioProgramRender,
  renderAudioProgramWav,
} from "../src/audio-render.js";

const frameRate = { numerator: 48_000, denominator: 1 } as const;
const sampleFrames = 4;
const domain = { id: "signal", duration: exactTemporalValueFromFrames(sampleFrames, { frameRate }) };
const sampling = identityTemporalMap(domain);

function wav(samples: readonly number[]): Buffer {
  const bytes = Buffer.alloc(44 + samples.length * 4);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVE", 8);
  bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(48_000, 24); bytes.writeUInt32LE(192_000, 28);
  bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length * 4, 40);
  samples.forEach((sample, index) => {
    bytes.writeInt16LE(sample, 44 + index * 4);
    bytes.writeInt16LE(sample, 46 + index * 4);
  });
  return bytes;
}

function sourceClip(id = "local-clip", targetStartSample = 0): AudioProgramClip {
  return {
    id,
    source: {
      source: { kind: "blob", resource: fixtureResource("flat-audio"), size: 1, mediaType: "audio/wav" },
      streamIndex: 0,
      presentationStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      sourceDomain: domain,
      interpretation: { sampleRate: 48_000, channels: 2 },
    },
    preparation: sampling,
    sampling,
    target: { start: exactTemporalValueFromFrames(targetStartSample, { frameRate }), end: exactTemporalValueFromFrames(targetStartSample + 4, { frameRate }) },
    targetStartSample,
    targetEndSampleExclusive: targetStartSample + 4,
    mixStartSample: targetStartSample,
    mixEndSampleExclusive: targetStartSample + 4,
    gain: 1,
    fadeInSamples: 0,
    fadeOutSamples: 0,
  };
}

function mappedSourceClip(id: string, map: TemporalMap, sourceFrames: number): AudioProgramClip {
  const sourceDomain = {
    id: `${id}:source`,
    duration: exactTemporalValueFromFrames(sourceFrames, { frameRate }),
  };
  return {
    id,
    source: {
      source: { kind: "blob", resource: fixtureResource("flat-audio"), size: 1, mediaType: "audio/wav" },
      streamIndex: 0,
      presentationStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      sourceDomain,
      interpretation: { sampleRate: 48_000, channels: 2 },
    },
    preparation: identityTemporalMap(sourceDomain),
    sampling: map,
    target: { start: exactTemporalValueFromFrames(0, { frameRate }), end: exactTemporalValueFromFrames(4, { frameRate }) },
    targetStartSample: 0,
    targetEndSampleExclusive: 4,
    mixStartSample: 0,
    mixEndSampleExclusive: 4,
    gain: 1,
    fadeInSamples: 0,
    fadeOutSamples: 0,
  };
}

function sampleMap(id: string, piece: TemporalMapPiece): TemporalMap {
  return sealTemporalMap({ stages: [{
    target: { id: `${id}:target`, duration: exactTemporalValueFromFrames(4, { frameRate }) },
    source: { id: `${id}:source`, duration: exactTemporalValueFromFrames(8, { frameRate }) },
    pieces: [piece],
  }] });
}

test("one request-local audio plan excludes clips outside a partial render and drives the same read", async () => {
  const first = sourceClip("first", 0);
  const second = sourceClip("second", 4);
  const program: AudioProgram = {
    frameRate, frameCount: 8, sampleRate: 48_000, sampleFrames: 8,
    graph: {
      nodes: [
        { kind: "source", id: "first-source", clip: first },
        { kind: "source", id: "second-source", clip: second },
        { kind: "mix", id: "mix", inputs: [
          { node: "first-source", port: "signal" }, { node: "second-source", port: "signal" },
        ] },
      ],
      output: { node: "mix", port: "signal" },
    },
  };
  const plan = planAudioProgramRender(program, 0, 4);
  assert.deepEqual(audioRenderPlanSourceClips(plan), [first]);
  assert.deepEqual(audioRenderPlanSourceClips(planAudioProgramRender(program, 4, 4)), [second]);
  const work = await mkdtemp(join(tmpdir(), "hypit-partial-audio-"));
  const sourcePath = join(work, "source.wav");
  const outputPath = join(work, "output.wav");
  await writeFile(sourcePath, wav([1, 2, 3, 4]));
  const source = new CanonicalPcmReader(sourcePath, sampleFrames);
  try {
    await renderAudioProgramWav({
      path: outputPath, program, plan, startSample: 0, sampleFrames: 4,
      sourceForClip: (value) => { assert.equal(value, first); return source; },
    });
    const output = await readFile(outputPath);
    assert.deepEqual([0, 1, 2, 3].map((index) => output.readInt16LE(44 + index * 4)), [1, 2, 3, 4]);
  } finally {
    source.close();
    await rm(work, { recursive: true, force: true });
  }
});

test("audio sampling delegates reverse, hold, wrap, gap and cubic boundaries to Temporal", async () => {
  const at = (sample: number) => exactTemporalValueFromFrames(sample, { frameRate });
  const cases: readonly {
    readonly name: string;
    readonly piece: TemporalMapPiece;
    readonly expected: readonly number[];
  }[] = [
    { name: "reverse", piece: {
      target: { start: at(0), end: at(4) }, sourceAtStart: at(4), rate: { numerator: -1, denominator: 1 },
    }, expected: [4, 3, 2, 1] },
    { name: "hold", piece: {
      target: { start: at(0), end: at(4) }, sourceAtStart: at(2), rate: { numerator: 0, denominator: 1 },
    }, expected: [3, 3, 3, 3] },
    { name: "wrap", piece: {
      target: { start: at(0), end: at(4) }, sourceAtStart: at(7), rate: { numerator: 1, denominator: 1 },
      wrap: { start: at(0), end: at(8) },
    }, expected: [8, 1, 2, 3] },
    { name: "gap", piece: {
      target: { start: at(0), end: at(2) }, sourceAtStart: at(0), rate: { numerator: 1, denominator: 1 },
    }, expected: [1, 2, 0, 0] },
    { name: "cubic", piece: {
      target: { start: at(0), end: at(4) }, sourceAtStart: at(0),
      sourceControl1: at(0), sourceControl2: at(0), sourceAtEnd: at(4),
    }, expected: [1, 1, 2, 3] },
  ];
  const work = await mkdtemp(join(tmpdir(), "hypit-audio-temporal-"));
  const sourcePath = join(work, "source.wav");
  await writeFile(sourcePath, wav([1, 2, 3, 4, 5, 6, 7, 8]));
  const source = new CanonicalPcmReader(sourcePath, 8);
  try {
    for (const item of cases) {
      const clip = mappedSourceClip(item.name, sampleMap(item.name, item.piece), 8);
      const program: AudioProgram = {
        frameRate, frameCount: 4, sampleRate: 48_000, sampleFrames: 4,
        graph: { nodes: [{ kind: "source", id: `${item.name}:node`, clip }],
          output: { node: `${item.name}:node`, port: "signal" } },
      };
      const outputPath = join(work, `${item.name}.wav`);
      await renderAudioProgramWav({
        path: outputPath, program, startSample: 0, sampleFrames: 4,
        sourceForClip: () => source,
      });
      const output = await readFile(outputPath);
      assert.deepEqual([0, 1, 2, 3].map((index) => output.readInt16LE(44 + index * 4)),
        item.expected, item.name);
    }
  } finally {
    source.close();
    await rm(work, { recursive: true, force: true });
  }
});
