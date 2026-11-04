import assert from "node:assert/strict";
import test from "node:test";
import { pointwiseOperatorTemporalSupport } from "@hypit/audiovisual";

import { fixtureResource } from "../../../test/fixture-resource.js";
import { frameRangeFixture } from "../../../test/exact-temporal-fixture.js";
import {
  audioProgramMediaSources,
  sealAudioProgram,
  verifyAudioProgram,
} from "../src/index.js";
import type { AudioProgram, AudioProgramMediaSource } from "../src/index.js";
import { exactTemporalZero, identityTemporalMap } from "@hypit/temporal/algebra";

const samplingRate = { numerator: 48_000, denominator: 1 } as const;
const domain = { id: "programme", duration: frameRangeFixture(0, 48_000, samplingRate).end };

function mediaSource(id: string): AudioProgramMediaSource {
  return {
    id,
    source: {
      source: { kind: "blob", resource: fixtureResource(`audio-program:${id}`), size: 1, mediaType: "audio/wav" },
      streamIndex: 0,
      presentationStart: exactTemporalZero(),
      sourceDomain: domain,
    },
    preparation: identityTemporalMap(domain),
  };
}

function sourceProgram(): AudioProgram {
  const source = mediaSource("line");
  return {
    domain,
    sampling: { sampleRate: 48_000 },
    graph: { nodes: [{ kind: "source", id: "source", media: source }], output: { node: "source" } },
  };
}

test("AudioProgram validates explicit identities without deriving them from Track paths", () => {
  const program = sealAudioProgram({
    domain,
    sampling: { sampleRate: 48_000 },
    graph: {
      nodes: [
        { kind: "source", id: "a:b", media: mediaSource("c:d") },
        { kind: "source", id: "a", media: mediaSource("d") },
        { kind: "mix", id: "root", inputs: [{ node: "a:b" }, { node: "a" }] },
      ],
      output: { node: "root" },
    },
  });
  assert.equal(new Set(audioProgramMediaSources(program).map((item) => item.id)).size, 2);
});

test("AudioProgram preserves one shared source across package-owned Process branches", () => {
  const base = sourceProgram();
  const program = sealAudioProgram({ ...base, graph: {
    nodes: [
      ...base.graph.nodes,
      { kind: "process", id: "dry", inputs: { signal: { node: "source" } },
        program: { format: "example.dry@1", payload: {}, artifacts: [] },
        temporalSupport: pointwiseOperatorTemporalSupport(["signal"]), controlMappings: {} },
      { kind: "process", id: "send", inputs: { signal: { node: "source" } },
        program: { format: "example.send@1", payload: {}, artifacts: [] },
        temporalSupport: pointwiseOperatorTemporalSupport(["signal"]), controlMappings: {} },
      { kind: "mix", id: "return", inputs: [{ node: "dry" }, { node: "send" }] },
    ],
    output: { node: "return" },
  } });
  assert.equal(audioProgramMediaSources(program).length, 1);
  assert.deepEqual(program.graph.nodes.filter((node) => node.kind === "process")
    .map((node) => node.program.format).sort(), ["example.dry@1", "example.send@1"]);
});

test("AudioProgram retains opaque Process programmes for endpoint capability decisions", () => {
  const base = sourceProgram();
  const program = sealAudioProgram({ ...base, graph: {
    nodes: [...base.graph.nodes, {
      kind: "process", id: "effect", inputs: { signal: base.graph.output },
      program: { format: "example.audio-effect@1", payload: { amount: 0.5 }, artifacts: [] },
      temporalSupport: pointwiseOperatorTemporalSupport(["signal"]),
      controlMappings: {},
    }],
    output: { node: "effect" },
  } });
  assert.equal(program.graph.nodes.find((node) => node.kind === "process")?.program.format,
    "example.audio-effect@1");
});

test("AudioProgram preserves general Operator support windows without effect-specific fields", () => {
  const base = sourceProgram();
  const look = frameRangeFixture(0, 480, samplingRate).end;
  const temporalSupport = pointwiseOperatorTemporalSupport(["signal"]);
  const support = {
    ...temporalSupport,
    inputs: { signal: { before: look, after: look } },
    state: { kind: "sequential" as const, preRoll: look },
    latency: look,
    tail: look,
  };
  const program = sealAudioProgram({ ...base, graph: {
    nodes: [...base.graph.nodes, {
      kind: "process", id: "windowed", inputs: { signal: base.graph.output },
      program: { format: "example.windowed@1", payload: {}, artifacts: [] },
      temporalSupport: support,
      controlMappings: {},
    }],
    output: { node: "windowed" },
  } });
  assert.deepEqual(program.graph.nodes.find((node) => node.kind === "process")?.temporalSupport, support);
});

test("AudioProgram closes arbitrary named Process ports and exact signal restriction", () => {
  const base = sourceProgram();
  const process = { kind: "process" as const, id: "sidechain", inputs: {
    programme: base.graph.output,
    detector: base.graph.output,
  }, program: { format: "example.sidechain@1", payload: {}, artifacts: [] },
  temporalSupport: pointwiseOperatorTemporalSupport(["programme", "detector"]), controlMappings: {} };
  const restricted = { kind: "restrict" as const, id: "window", input: { node: process.id },
    range: frameRangeFixture(6_000, 24_000, samplingRate) };
  const program = sealAudioProgram({ ...base, graph: {
    nodes: [...base.graph.nodes, process, restricted], output: { node: restricted.id },
  } });
  assert.doesNotThrow(() => verifyAudioProgram(program));
  assert.throws(() => verifyAudioProgram({ ...program, graph: { ...program.graph,
    nodes: program.graph.nodes.map((node) => node.kind === "restrict"
      ? { ...node, range: frameRangeFixture(0, 48_001, samplingRate) } : node) } }),
  /range lies outside Programme domain/u);
});
