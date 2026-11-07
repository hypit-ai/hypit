import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { pointwiseOperatorTemporalSupport, sealAudioProgram } from "@hypit/audio-program";
import type { AudioProgram, AudioProgramMediaSource } from "@hypit/audio-program";
import { audioGainControlOperator } from "@hypit/audio-gain";
import {
  exactTemporalValueFromFrames,
  identityTemporalMap,
  sealTemporalMap,
} from "@hypit/temporal";
import type { TemporalMap, TemporalMapPiece } from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  audioRenderPlanMediaSources,
  CanonicalPcmReader,
  planAudioProgramRender,
  planDirectProgrammeReconstruction,
  renderAudioProgramWav,
} from "../src/audio-render.js";

const frameRate = { numerator: 48_000, denominator: 1 } as const;
const sampleFrames = 4;
const domain = { id: "signal", duration: exactTemporalValueFromFrames(sampleFrames, { frameRate }) };
const sampling = identityTemporalMap(domain);
const programTiming = (id: string, frames: number) => ({
  domain: { id, duration: exactTemporalValueFromFrames(frames, { frameRate }) },
  sampling: { sampleRate: 48_000 },
} as const);

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

function sourceMedia(
  id = "local-media",
  mediaDomain = domain,
): AudioProgramMediaSource {
  return {
    id,
    source: {
      source: { kind: "blob", resource: fixtureResource("flat-audio"), size: 1, mediaType: "audio/wav" },
      streamIndex: 0,
      presentationStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      sourceDomain: mediaDomain,
    },
    preparation: identityTemporalMap(mediaDomain),
  };
}

function sourceProgram(id: string, sourceDomain: AudioProgram["domain"]): AudioProgram {
  return {
    domain: sourceDomain,
    sampling: { sampleRate: 48_000 },
    graph: { nodes: [{ kind: "source", id: `${id}:source`, media: sourceMedia(id, sourceDomain) }],
      output: { node: `${id}:source` } },
  };
}

function sampleMap(id: string, piece: TemporalMapPiece): TemporalMap {
  return sealTemporalMap({ stages: [{
    target: { id: `${id}:target`, duration: exactTemporalValueFromFrames(4, { frameRate }) },
    source: { id: `${id}:source`, duration: exactTemporalValueFromFrames(8, { frameRate }) },
    pieces: [piece],
  }] });
}

test("one request-local audio plan excludes Programme uses outside a partial render and drives the same read", async () => {
  const firstProgram = sourceProgram("first", programTiming("first-domain", 4).domain);
  const secondProgram = sourceProgram("second", programTiming("second-domain", 4).domain);
  const first = (firstProgram.graph.nodes[0] as Extract<typeof firstProgram.graph.nodes[number], { kind: "source" }>).media;
  const second = (secondProgram.graph.nodes[0] as Extract<typeof secondProgram.graph.nodes[number], { kind: "source" }>).media;
  const program: AudioProgram = {
    ...programTiming("partial", 8),
    graph: {
      nodes: [
        { kind: "program", id: "first-use", program: firstProgram,
          sampling: identityTemporalMap(firstProgram.domain),
          target: { start: exactTemporalValueFromFrames(0, { frameRate }),
            end: exactTemporalValueFromFrames(4, { frameRate }) } },
        { kind: "program", id: "second-use", program: secondProgram,
          sampling: identityTemporalMap(secondProgram.domain),
          target: { start: exactTemporalValueFromFrames(4, { frameRate }),
            end: exactTemporalValueFromFrames(8, { frameRate }) } },
        { kind: "mix", id: "mix", inputs: [
          { node: "first-use" }, { node: "second-use" },
        ] },
      ],
      output: { node: "mix" },
    },
  };
  const plan = planAudioProgramRender(program, 0, 4);
  assert.deepEqual(audioRenderPlanMediaSources(plan), [first]);
  assert.deepEqual(audioRenderPlanMediaSources(planAudioProgramRender(program, 4, 4)), [second]);
  const work = await mkdtemp(join(tmpdir(), "hypit-partial-audio-"));
  const sourcePath = join(work, "source.wav");
  const outputPath = join(work, "output.wav");
  await writeFile(sourcePath, wav([1, 2, 3, 4]));
  const source = new CanonicalPcmReader(sourcePath, sampleFrames);
  try {
    await renderAudioProgramWav({
      path: outputPath, program, plan, startSample: 0, sampleFrames: 4,
      sourceForMedia: (value) => { assert.equal(value, first); return source; },
    });
    const output = await readFile(outputPath);
    assert.deepEqual([0, 1, 2, 3].map((index) => output.readInt16LE(44 + index * 4)), [1, 2, 3, 4]);
  } finally {
    source.close();
    await rm(work, { recursive: true, force: true });
  }
});

test("a nested AudioProgram stays closed while the terminal finds and reads its media leaf", async () => {
  const media = sourceMedia("nested-leaf", programTiming("nested-child", 4).domain);
  const child: AudioProgram = {
    ...programTiming("nested-child", 4),
    graph: { nodes: [{ kind: "source", id: "child-source", media }],
      output: { node: "child-source" } },
  };
  const parent: AudioProgram = {
    ...programTiming("nested-parent", 4),
    graph: { nodes: [{
      kind: "program",
      id: "child-use",
      program: child,
      sampling: identityTemporalMap(child.domain),
      target: { start: exactTemporalValueFromFrames(0, { frameRate }),
        end: exactTemporalValueFromFrames(4, { frameRate }) },
    }], output: { node: "child-use" } },
  };
  const plan = planAudioProgramRender(parent, 0, 4);
  assert.deepEqual(audioRenderPlanMediaSources(plan), [media]);

  const work = await mkdtemp(join(tmpdir(), "hypit-nested-audio-"));
  const sourcePath = join(work, "source.wav");
  const outputPath = join(work, "output.wav");
  await writeFile(sourcePath, wav([11, 22, 33, 44]));
  const source = new CanonicalPcmReader(sourcePath, sampleFrames);
  try {
    await renderAudioProgramWav({
      path: outputPath, program: parent, plan, startSample: 0, sampleFrames: 4,
      sourceForMedia: (value) => { assert.equal(value, media); return source; },
    });
    const output = await readFile(outputPath);
    assert.deepEqual([0, 1, 2, 3].map((index) => output.readInt16LE(44 + index * 4)),
      [11, 22, 33, 44]);
  } finally {
    source.close();
    await rm(work, { recursive: true, force: true });
  }
});

test("a package-owned Gain Control is evaluated continuously by the audio terminal", async () => {
  const timing = programTiming("controlled-gain-program", sampleFrames);
  const media = sourceMedia("controlled-gain", timing.domain);
  const control = {
    domain: timing.domain,
    segments: [{
      range: { start: exactTemporalValueFromFrames(0, { frameRate }), end: timing.domain.duration },
      from: 0,
      to: 1,
      interpolation: { kind: "linear" as const },
    }],
  };
  const operator = audioGainControlOperator(control);
  const program: AudioProgram = {
    ...timing,
    graph: {
      nodes: [
        { kind: "source", id: "source", media },
        {
          kind: "process",
          id: "gain",
          inputs: { signal: { node: "source" } },
          program: operator.program,
          temporalSupport: pointwiseOperatorTemporalSupport(["signal"]),
          controlMappings: { gain: identityTemporalMap(timing.domain) },
        },
      ],
      output: { node: "gain" },
    },
  };
  const work = await mkdtemp(join(tmpdir(), "hypit-controlled-gain-"));
  const sourcePath = join(work, "source.wav");
  const outputPath = join(work, "output.wav");
  await writeFile(sourcePath, wav([100, 100, 100, 100]));
  const source = new CanonicalPcmReader(sourcePath, sampleFrames);
  try {
    await renderAudioProgramWav({
      path: outputPath,
      program,
      startSample: 0,
      sampleFrames,
      sourceForMedia: () => source,
    });
    const output = await readFile(outputPath);
    assert.deepEqual([0, 1, 2, 3].map((index) => output.readInt16LE(44 + index * 4)),
      [0, 25, 50, 75]);
  } finally {
    source.close();
    await rm(work, { recursive: true, force: true });
  }
});

test("terminal Audio restrict gates any upstream signal before source planning", () => {
  const timing = programTiming("restricted-program", 4);
  const media = sourceMedia("restricted", timing.domain);
  const program: AudioProgram = {
    ...timing,
    graph: {
      nodes: [
        { kind: "source", id: "source", media },
        { kind: "restrict", id: "gate", input: { node: "source" },
          range: { start: exactTemporalValueFromFrames(2, { frameRate }),
            end: exactTemporalValueFromFrames(4, { frameRate }) } },
      ],
      output: { node: "gate" },
    },
  };
  assert.deepEqual(audioRenderPlanMediaSources(planAudioProgramRender(program, 0, 2)), []);
  assert.deepEqual(audioRenderPlanMediaSources(planAudioProgramRender(program, 2, 2)), [media]);
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
      const map = sampleMap(item.name, item.piece);
      const child = sourceProgram(item.name, map.stages.at(-1)!.source);
      const program: AudioProgram = {
        ...programTiming(item.name, 4),
        graph: { nodes: [{ kind: "program", id: `${item.name}:node`, program: child,
          sampling: map,
          target: { start: exactTemporalValueFromFrames(0, { frameRate }),
            end: exactTemporalValueFromFrames(4, { frameRate }) } }],
          output: { node: `${item.name}:node` } },
      };
      const outputPath = join(work, `${item.name}.wav`);
      await renderAudioProgramWav({
        path: outputPath, program, startSample: 0, sampleFrames: 4,
        sourceForMedia: () => source,
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

test("Programme-use reconstruction resolves exact half-sample boundaries with Temporal's one integer rule", () => {
  const preparedDomain = { id: "half-prepared", duration: exactTemporalValueFromFrames(2, { frameRate }) };
  const sourceDomain = { id: "half-source", duration: exactTemporalValueFromFrames(3, { frameRate }) };
  const preparation = sealTemporalMap({ stages: [{ target: preparedDomain, source: sourceDomain, pieces: [{
    target: { start: exactTemporalValueFromFrames(0, { frameRate }), end: preparedDomain.duration },
    sourceAtStart: { ticks: "1", timeBase: { numerator: 1, denominator: 96_000 } },
    rate: { numerator: 1, denominator: 1 },
  }] }] });
  const media: AudioProgramMediaSource = {
    ...sourceMedia("half-sample", preparedDomain),
    source: { ...sourceMedia("half-sample", preparedDomain).source, sourceDomain },
    preparation,
  };
  const child = sealAudioProgram({
    domain: preparedDomain,
    sampling: { sampleRate: 48_000 },
    graph: { nodes: [{ kind: "source", id: "source", media }], output: { node: "source" } },
  });
  const node = {
    kind: "program" as const,
    id: "half-use",
    program: child,
    sampling: identityTemporalMap(preparedDomain),
    target: { start: exactTemporalValueFromFrames(0, { frameRate }),
      end: exactTemporalValueFromFrames(2, { frameRate }) },
  };
  const planned = planDirectProgrammeReconstruction(node, { sampleRate: 48_000 });
  assert.deepEqual({
    sourceStartSample: planned.sourceStartSample,
    sourceEndSampleExclusive: planned.sourceEndSampleExclusive,
    rate: planned.rate,
    targetSampleFrames: planned.targetSampleFrames,
  }, {
    sourceStartSample: 1,
    sourceEndSampleExclusive: 3,
    rate: 1,
    targetSampleFrames: 2,
  });
});

test("audio rendering observes a task cancellation before writing its output", async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-audio-cancel-"));
  const controller = new AbortController();
  controller.abort(new Error("cancel audio render"));
  const program = sealAudioProgram({
    ...programTiming("cancelled", 4),
    graph: { nodes: [{ kind: "silence", id: "silence" }], output: { node: "silence" } },
  });
  try {
    await assert.rejects(renderAudioProgramWav({
      path: join(work, "output.wav"),
      program,
      startSample: 0,
      sampleFrames: 4,
      sourceForMedia: () => { throw new Error("cancelled render must not request media"); },
      signal: controller.signal,
    }), /cancel audio render/u);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
