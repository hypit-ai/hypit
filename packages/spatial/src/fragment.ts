import { sealGraphFragment } from "@hypit/elaborator";

import { spatialProducers, spatialTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (name: string) => ({ kind: "fragment-operation" as const, operation: name });

export const canvasFrameFragment = sealGraphFragment({
  inputs: [{ name: "canvas", type: spatialTypes.canvas }],
  operations: [{ id: "resolve", producer: spatialProducers.canvasFrame, inputs: { canvas: input("canvas") }, result: { kind: "output", name: "frame" } }],
  exports: [{ name: "frame", type: spatialTypes.frame, root: operation("resolve") }],
});

export const frameEdgesFragment = sealGraphFragment({
  inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.frameEdgesProgram }],
  operations: [{ id: "resolve", producer: spatialProducers.frameEdges, inputs: { parent: input("parent"), program: input("program") }, result: { kind: "output", name: "frame" } }],
  exports: [{ name: "frame", type: spatialTypes.frame, root: operation("resolve") }],
});

export const anchoredFrameFragment = sealGraphFragment({
  inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.anchoredFrameProgram }],
  operations: [{ id: "resolve", producer: spatialProducers.anchoredFrame, inputs: { parent: input("parent"), program: input("program") }, result: { kind: "output", name: "frame" } }],
  exports: [{ name: "frame", type: spatialTypes.frame, root: operation("resolve") }],
});

export const aspectFrameFragment = sealGraphFragment({
  inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "program", type: spatialTypes.aspectFrameProgram }],
  operations: [{ id: "resolve", producer: spatialProducers.aspectFrame, inputs: { parent: input("parent"), extent: input("extent"), program: input("program") }, result: { kind: "output", name: "frame" } }],
  exports: [{ name: "frame", type: spatialTypes.frame, root: operation("resolve") }],
});

export const fitContentFragment = sealGraphFragment({
  inputs: [{ name: "frame", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "fit", type: spatialTypes.fit }],
  operations: [{ id: "resolve", producer: spatialProducers.fitContent, inputs: { frame: input("frame"), extent: input("extent"), fit: input("fit") }, result: { kind: "output", name: "fitted" } }],
  exports: [{ name: "fitted", type: spatialTypes.fitted, root: operation("resolve") }],
});
