import assert from "node:assert/strict";
import test from "node:test";

import {
  audioType,
  pictureType,
  sealAudiovisualProgram,
  sealOccurrence,
  type AudiovisualProgram,
  type ProgramSource,
} from "@hypit/audiovisual";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  exactTemporalValue,
  sealLocalTemporalDomain,
  sealTemporalMap,
  type ExactTemporalValue,
  type LocalTemporalDomain,
} from "@hypit/temporal/algebra";

import {
  bindAudiovisualExecutionProducts,
  executeAudiovisualIslands,
  expandNestedAudiovisualPrograms,
  partitionAudiovisualExecution,
  planAudiovisualDemand,
} from "../src/index.js";

const at = (value: number): ExactTemporalValue => exactTemporalValue({
  numerator: BigInt(value), denominator: 1n,
});
const domain = (id: string, duration: number): LocalTemporalDomain => sealLocalTemporalDomain({
  id, duration: at(duration),
});

function fixture(): AudiovisualProgram {
  const programme = domain("programme-time", 12);
  const local = domain("occurrence-time", 10);
  const pictureTime = domain("animation-picture-time", 10);
  const audioTime = domain("animation-audio-time", 10);
  const pictureSpace = sealLocalSpatialDomain({
    id: "picture-space", region: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  const source: ProgramSource = { id: "code-animation", outputs: {
    picture: { kind: "signal", type: pictureType, domain: pictureTime, spatialDomain: pictureSpace },
    audio: { kind: "signal", type: audioType, domain: audioTime },
  } };
  const mapping = (sourceDomain: LocalTemporalDomain) => sealTemporalMap({ stages: [{
    target: local,
    source: sourceDomain,
    pieces: [{
      target: { start: at(0), end: local.duration },
      sourceAtStart: at(0), rate: { numerator: 1, denominator: 1 },
    }],
  }] });
  const occurrence = sealOccurrence({
    id: "animation-use",
    source,
    domain: local,
    placement: {
      parent: programme,
      start: at(1),
      active: { start: at(2), end: at(10) },
    },
    selections: {
      picture: { kind: "signal", mapping: mapping(pictureTime) },
      audio: { kind: "signal", mapping: mapping(audioTime) },
    },
  });
  return sealAudiovisualProgram({
    id: "execution-fixture",
    domain: programme,
    pictureDomain: pictureSpace,
    occurrences: { "animation-use": occurrence },
    picture: { root: "effect", nodes: {
      source: { kind: "use", occurrence: occurrence.id, output: "picture" },
      effect: {
        kind: "apply",
        operator: {
          id: "temporal-effect",
          inputs: ["picture"],
          temporalControls: {},
          temporalSupport: {
            inputs: { picture: { before: at(1), after: at(2) } },
            tail: at(0),
          },
          program: { format: "example.effect@1", payload: {}, artifacts: [] },
        },
        inputs: { picture: "source" },
        controlMappings: {},
      },
    } },
    audio: { root: "source", nodes: {
      source: { kind: "use", occurrence: occurrence.id, output: "audio" },
    } },
  });
}

test("a range demand reaches exact Source-local regions and partitions one foreign Picture island", () => {
  const program = fixture();
  const demand = planAudiovisualDemand(program, {
    picture: {
      range: { start: at(5), end: at(6) },
      samples: [{ position: at(5), side: "after" }],
    },
    audio: { range: { start: at(5), end: at(6) } },
  });
  const pictureUse = demand.uses.find((use) => use.node === "picture:source")!;
  const pictureSource = demand.sourceTasks.find((source) => source.id === pictureUse.producer)!;
  assert.equal(pictureSource.temporal.kind, "signal");
  assert.deepEqual(pictureSource.temporal.kind === "signal"
    ? pictureSource.temporal.regions.regions.map((region) => [
      region.start.position.ticks, region.end.position.ticks,
    ]) : [], [["5", "9"]]);
  assert.deepEqual(pictureSource.samples?.map((sample) => sample.position.ticks), ["6"],
    "non-pointwise support expands acquisition without discarding output cadence");
  const audioUse = demand.uses.find((use) => use.node === "audio:source")!;
  const audioSource = demand.sourceTasks.find((source) => source.id === audioUse.producer)!;
  assert.equal(audioSource.temporal.kind, "signal");
  assert.deepEqual(audioSource.temporal.kind === "signal"
    ? audioSource.temporal.regions.regions.map((region) => [
      region.start.position.ticks, region.end.position.ticks,
    ]) : [], [["6", "7"]]);

  const plan = partitionAudiovisualExecution(demand, [
    { node: pictureSource.id, terminal: "manim-terminal", sourceAccess: {
      kind: "sequential", origin: at(0),
    } },
    { node: "picture:source", terminal: "html-compositor" },
    { node: "picture:effect", terminal: "html-compositor" },
    { node: audioSource.id, terminal: "audio-terminal", sourceAccess: { kind: "range" } },
    { node: "audio:source", terminal: "audio-terminal" },
  ]);
  assert.equal(plan.islands.length, 3);
  assert.equal(plan.products.length, 1);
  assert.equal(plan.products[0]?.node, pictureSource.id);
  assert.equal(plan.products[0]?.signal, "picture");
  assert.equal(plan.products[0]?.target, "source");
  assert.deepEqual(plan.products[0]?.pictureDomain, pictureSource.pictureDomain);
  assert.equal(plan.products[0]?.temporal.kind, "signal");
  assert.deepEqual(plan.products[0]?.temporal.kind === "signal"
    ? plan.products[0].temporal.regions.regions.map((region) => [
      region.start.position.ticks, region.end.position.ticks,
    ]) : [], [["5", "9"]]);
  assert.notEqual(plan.products[0]?.producer, plan.products[0]?.consumer);
  const pictureExecution = plan.sourceExecutions.find((value) => value.task === pictureSource.id)!;
  assert.equal(pictureExecution.acquisition.kind, "sequential");
  assert.deepEqual(pictureExecution.acquisition.kind === "sequential"
    ? pictureExecution.acquisition.execution.regions.map((region) => [
      region.start.position.ticks, region.end.position.ticks,
    ]) : [], [["0", "9"]]);

  const wholePlan = partitionAudiovisualExecution(demand, [
    { node: pictureSource.id, terminal: "whole-picture-terminal", sourceAccess: { kind: "whole" } },
    { node: "picture:source", terminal: "html-compositor" },
    { node: "picture:effect", terminal: "html-compositor" },
    { node: audioSource.id, terminal: "audio-terminal", sourceAccess: { kind: "range" } },
    { node: "audio:source", terminal: "audio-terminal" },
  ]);
  const wholeExecution = wholePlan.sourceExecutions.find((value) => value.task === pictureSource.id)!;
  assert.deepEqual(wholeExecution.acquisition.kind === "whole"
    ? wholeExecution.acquisition.execution.regions.map((region) => [
      region.start.position.ticks, region.end.position.ticks,
    ]) : [], [["0", "10"]]);
});

test("one terminal executes coordinated Picture and Audio outputs as one island", async () => {
  const program = fixture();
  const demand = planAudiovisualDemand(program, {
    picture: { range: { start: at(5), end: at(6) } },
    audio: { range: { start: at(5), end: at(6) } },
  });
  const plan = partitionAudiovisualExecution(demand, [
    ...demand.nodes.map((node) => ({ node: node.id, terminal: "@project/av-terminal" })),
    ...demand.sourceTasks.map((task) => ({
      node: task.id,
      terminal: "@project/av-terminal",
      sourceAccess: task.temporal.kind === "constant"
        ? { kind: "constant" as const }
        : { kind: "range" as const },
    })),
  ]);
  assert.equal(plan.islands.length, 1);
  assert.deepEqual(plan.islands[0]?.signals, ["audio", "picture"]);
  assert.equal(plan.sourceExecutions.length, 2);
  const bound = bindAudiovisualExecutionProducts(plan, []);
  const executed = await executeAudiovisualIslands<never, string>(bound, [{
    terminal: "@project/av-terminal",
    async execute(request) {
      assert.equal(request.sources.length, 2);
      assert.deepEqual(request.finalOutputs, ["picture", "audio"]);
      return { products: [], outputs: { picture: "picture-output", audio: "audio-output" } };
    },
  }]);
  assert.deepEqual(executed.outputs, {
    picture: "picture-output",
    audio: "audio-output",
  });
});

test("two Programme uses share one unioned Source-local execution task", () => {
  const programme = domain("shared-programme-time", 20);
  const local = domain("shared-occurrence-time", 10);
  const sourceTime = domain("shared-source-time", 10);
  const pictureSpace = sealLocalSpatialDomain({
    id: "shared-picture-space", region: { x: 0, y: 0, width: 1280, height: 720 },
  });
  const source: ProgramSource = { id: "shared-manim-source", outputs: {
    picture: { kind: "signal", type: pictureType, domain: sourceTime, spatialDomain: pictureSpace },
  } };
  const mapping = sealTemporalMap({ stages: [{
    target: local,
    source: sourceTime,
    pieces: [{
      target: { start: at(0), end: local.duration },
      sourceAtStart: at(0), rate: { numerator: 1, denominator: 1 },
    }],
  }] });
  const first = sealOccurrence({
    id: "first-use",
    source,
    domain: local,
    placement: { parent: programme, start: at(0), active: { start: at(2), end: at(3) } },
    selections: { picture: { kind: "signal", mapping } },
  });
  const second = sealOccurrence({
    id: "second-use",
    source,
    domain: local,
    placement: { parent: programme, start: at(10), active: { start: at(7), end: at(8) } },
    selections: { picture: { kind: "signal", mapping } },
  });
  const program = sealAudiovisualProgram({
    id: "shared-source-fixture",
    domain: programme,
    pictureDomain: pictureSpace,
    occurrences: { [first.id]: first, [second.id]: second },
    picture: { root: "composite", nodes: {
      first: { kind: "use", occurrence: first.id, output: "picture" },
      second: { kind: "use", occurrence: second.id, output: "picture" },
      composite: { kind: "over", inputs: ["first", "second"] },
    } },
  });
  const demand = planAudiovisualDemand(program, {
    picture: {
      range: { start: at(0), end: at(20) },
      samples: [
        { position: at(0), side: "after" },
        { position: at(10), side: "after" },
      ],
    },
  });

  assert.equal(demand.uses.length, 2);
  assert.equal(demand.sourceTasks.length, 1);
  const task = demand.sourceTasks[0]!;
  assert.deepEqual(task.uses, ["picture:first", "picture:second"]);
  assert.equal(task.temporal.kind, "signal");
  assert.deepEqual(task.temporal.kind === "signal"
    ? task.temporal.regions.regions.map((region) => [
      region.start.position.ticks, region.end.position.ticks,
    ]) : [], [["2", "3"], ["7", "8"]]);
  assert.deepEqual(task.samples?.map((sample) => [sample.position.ticks, sample.side]), [
    ["2", "after"], ["7", "after"],
  ]);
  assert.equal(demand.nodes.find((node) => node.id === "picture:first")?.dependencies[0], task.id);
  assert.equal(demand.nodes.find((node) => node.id === "picture:second")?.dependencies[0], task.id);

  const plan = partitionAudiovisualExecution(demand, [
    { node: task.id, terminal: "manim-terminal", sourceAccess: {
      kind: "sequential", origin: at(0),
    } },
    { node: "picture:first", terminal: "html-terminal" },
    { node: "picture:second", terminal: "html-terminal" },
    { node: "picture:composite", terminal: "html-terminal" },
  ]);
  assert.equal(plan.islands.length, 2);
  assert.equal(plan.products.length, 1);
  assert.equal(plan.products[0]?.node, task.id);
  assert.deepEqual(plan.sourceExecutions[0]?.acquisition.kind === "sequential"
    ? plan.sourceExecutions[0].acquisition.execution.regions.map((region) => [
      region.start.position.ticks, region.end.position.ticks,
    ]) : [], [["0", "8"]]);
  assert.deepEqual(plan.sourceExecutions[0]?.samples, task.samples);
});

test("an explicitly bound nested Programme expands and hands its product to the parent terminal", async () => {
  const childTime = domain("child-programme-time", 10);
  const childUseTime = domain("child-use-time", 10);
  const leafTime = domain("manim-source-time", 10);
  const pictureSpace = sealLocalSpatialDomain({
    id: "nested-picture-space", region: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  const leaf: ProgramSource = { id: "manim-leaf", outputs: {
    picture: { kind: "signal", type: pictureType, domain: leafTime, spatialDomain: pictureSpace },
  } };
  const leafUse = sealOccurrence({
    id: "manim-use",
    source: leaf,
    domain: childUseTime,
    placement: { parent: childTime, start: at(0), active: { start: at(0), end: at(10) } },
    selections: { picture: { kind: "signal", mapping: sealTemporalMap({ stages: [{
      target: childUseTime,
      source: leafTime,
      pieces: [{
        target: { start: at(0), end: at(10) },
        sourceAtStart: at(0), rate: { numerator: 1, denominator: 1 },
      }],
    }] }) } },
  });
  const child = sealAudiovisualProgram({
    id: "nested-child",
    domain: childTime,
    pictureDomain: pictureSpace,
    occurrences: { [leafUse.id]: leafUse },
    picture: { root: "manim", nodes: {
      manim: { kind: "use", occurrence: leafUse.id, output: "picture" },
    } },
  });

  const parentTime = domain("parent-programme-time", 12);
  const parentUseTime = domain("parent-use-time", 10);
  const childSource: ProgramSource = { id: "nested-child-source", outputs: {
    visual: { kind: "signal", type: pictureType, domain: childTime, spatialDomain: pictureSpace },
  } };
  const childUse = sealOccurrence({
    id: "child-use",
    source: childSource,
    domain: parentUseTime,
    placement: { parent: parentTime, start: at(1), active: { start: at(0), end: at(10) } },
    selections: { visual: { kind: "signal", mapping: sealTemporalMap({ stages: [{
      target: parentUseTime,
      source: childTime,
      pieces: [{
        target: { start: at(0), end: at(10) },
        sourceAtStart: at(0), rate: { numerator: 1, denominator: 1 },
      }],
    }] }) } },
  });
  const parent = sealAudiovisualProgram({
    id: "nested-parent",
    domain: parentTime,
    pictureDomain: pictureSpace,
    occurrences: { [childUse.id]: childUse },
    picture: { root: "child", nodes: {
      child: { kind: "use", occurrence: childUse.id, output: "visual" },
    } },
  });
  const initial = planAudiovisualDemand(parent, {
    picture: {
      range: { start: at(3), end: at(5) },
      samples: [{ position: at(3), side: "after" }],
    },
  });
  const expanded = expandNestedAudiovisualPrograms(initial, [{
    program: parent.id,
    source: childSource.id,
    implementation: child,
  }]);

  assert.equal(expanded.sourceTasks.length, 1);
  assert.equal(expanded.sourceTasks[0]?.source, leaf.id);
  assert.deepEqual(expanded.sourceTasks[0]?.temporal.kind === "signal"
    ? expanded.sourceTasks[0].temporal.regions.regions.map((region) => [
      region.start.position.ticks, region.end.position.ticks,
    ]) : [], [["2", "4"]]);
  assert.deepEqual(expanded.sourceTasks[0]?.samples?.map((sample) => [
    sample.position.ticks, sample.side,
  ]), [["2", "after"]]);
  const parentUse = expanded.nodes.find((node) => node.id === "picture:child")!;
  assert.match(parentUse.dependencies[0]!, /^nested:/u);
  assert(expanded.nodes.some((node) => node.id === parentUse.dependencies[0]));

  const plan = partitionAudiovisualExecution(expanded, [
    ...expanded.nodes.map((node) => ({ node: node.id, terminal: "html-terminal" })),
    ...expanded.sourceTasks.map((task) => ({
      node: task.id,
      terminal: "manim-terminal",
      sourceAccess: { kind: "sequential" as const, origin: at(0) },
    })),
  ]);
  assert.equal(plan.islands.length, 2);
  assert.equal(plan.products.length, 1);
  assert.equal(plan.products[0]?.node, expanded.sourceTasks[0]?.id);
  const requirement = plan.products[0]!;
  const bound = bindAudiovisualExecutionProducts(plan, [{
    product: requirement.id,
    representation: "test.rgba-frames",
  }]);
  type Representation = {
    readonly kind: "frames" | "html";
    readonly detail: string;
  };
  const order: string[] = [];
  const executed = await executeAudiovisualIslands<Representation, Representation>(bound, [{
    terminal: "manim-terminal",
    async execute(request) {
      order.push("manim");
      assert.equal(request.inputs.length, 0);
      assert.equal(request.sources.length, 1);
      assert.equal(request.products.length, 1);
      assert.equal(request.products[0]?.binding.representation, "test.rgba-frames");
      return { products: [{
        product: request.products[0]!.requirement.id,
        value: { kind: "frames", detail: "source-local 2-4" },
      }] };
    },
  }, {
    terminal: "html-terminal",
    async execute(request) {
      order.push("html");
      assert.equal(request.inputs.length, 1);
      assert.equal(request.inputs[0]?.binding.representation, "test.rgba-frames");
      assert.equal(request.inputs[0]?.value.kind, "frames");
      assert.deepEqual(request.finalOutputs, ["picture"]);
      return {
        products: [],
        outputs: { picture: { kind: "html", detail: "composited frames" } },
      };
    },
  }]);
  assert.deepEqual(order, ["manim", "html"]);
  assert.equal(executed.products.length, 1);
  assert.equal(executed.outputs.picture?.kind, "html");
});
