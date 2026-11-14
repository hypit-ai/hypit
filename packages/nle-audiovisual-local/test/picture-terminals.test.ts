import assert from "node:assert/strict";
import test from "node:test";

import type { Facet } from "@hypit/facet";
import type { NleAudiovisualLink, NlePictureTerminalRuntime } from "@hypit/nle-audiovisual";
import { MemoryResourceStore } from "@hypit/resource-store";

import {
  createLocalNlePictureTerminalFacet,
  createLocalNlePictureTerminalRuntimes,
} from "../src/index.js";

function runtime(terminal: string): NlePictureTerminalRuntime {
  return {
    capability: {
      terminal,
      finalOutputs: [],
      verifyBinding() {},
      inputRepresentations: () => [],
      outputRepresentations: () => ["fixture-picture"],
    },
    executor: {
      terminal,
      async execute() { return { products: [] }; },
    },
  };
}

function link(...terminals: string[]): NleAudiovisualLink {
  return {
    pictureSources: terminals.map((terminal, index) => ({
      source: `source-${index}`,
      output: "picture",
      terminal,
      sourceAccess: { kind: "whole" as const },
      representation: "fixture-picture",
      program: { format: "fixture.program@1", payload: {}, artifacts: [] },
    })),
  } as unknown as NleAudiovisualLink;
}

test("local NLE Picture execution uses only the exact package-selected Terminal identity", () => {
  const observed: string[][] = [];
  const alpha = createLocalNlePictureTerminalFacet({
    terminal: "example.alpha",
    create(context) {
      observed.push(context.sources.map((source) => source.source));
      return runtime("example.alpha");
    },
  });
  const unrelated = createLocalNlePictureTerminalFacet({
    terminal: "example.unrelated",
    create() { throw new Error("unrelated Terminal was selected"); },
  });

  const selected = createLocalNlePictureTerminalRuntimes(
    [unrelated, alpha],
    link("example.alpha", "example.alpha"),
    new MemoryResourceStore(),
  );

  assert.deepEqual(selected.map((value) => value.executor.terminal), ["example.alpha"]);
  assert.deepEqual(observed, [["source-0", "source-1"]]);
  assert.throws(() => createLocalNlePictureTerminalRuntimes(
    [unrelated],
    link("example.alpha"),
    new MemoryResourceStore(),
  ), /no selected executor for Picture Terminal example\.alpha/u);
});

test("local NLE Picture execution rejects ambiguous or misidentified Terminal facets", () => {
  const alpha = createLocalNlePictureTerminalFacet({
    terminal: "example.alpha",
    create: () => runtime("example.alpha"),
  });
  const duplicate = createLocalNlePictureTerminalFacet({
    terminal: "example.alpha",
    create: () => runtime("example.alpha"),
  });
  assert.throws(() => createLocalNlePictureTerminalRuntimes(
    [alpha, duplicate],
    link("example.alpha"),
    new MemoryResourceStore(),
  ), /multiple executors for Picture Terminal example\.alpha/u);

  const wrongRuntime = createLocalNlePictureTerminalFacet({
    terminal: "example.alpha",
    create: () => runtime("example.beta"),
  });
  assert.throws(() => createLocalNlePictureTerminalRuntimes(
    [wrongRuntime],
    link("example.alpha"),
    new MemoryResourceStore(),
  ), /returned capability example\.beta/u);

  const wrongAddress: Facet = { ...alpha, address: "example.beta" };
  assert.throws(() => createLocalNlePictureTerminalRuntimes(
    [wrongAddress],
    link("example.alpha"),
    new MemoryResourceStore(),
  ), /address example\.beta does not match example\.alpha/u);
});
