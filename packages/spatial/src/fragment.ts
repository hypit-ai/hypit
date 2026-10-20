import { sealGraphFragment } from "@hypit/hypit/author";
import { spatialProducers, spatialTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (name: string) => ({ kind: "fragment-operation" as const, operation: name });

export const frameEdgesFragment = sealGraphFragment({
  inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.frameEdgesProgram }],
  operations: [{ id: "resolve", producer: spatialProducers.frameEdges, inputs: { parent: input("parent"), program: input("program") }, result: { kind: "output" as const, name: "frame" } }],
  exports: [{ name: "frame", type: spatialTypes.frame, root: operation("resolve") }],
});

export const anchoredFrameFragment = sealGraphFragment({
  inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "program", type: spatialTypes.anchoredFrameProgram }],
  operations: [{ id: "resolve", producer: spatialProducers.anchoredFrame, inputs: { parent: input("parent"), program: input("program") }, result: { kind: "output" as const, name: "frame" } }],
  exports: [{ name: "frame", type: spatialTypes.frame, root: operation("resolve") }],
});

export const aspectFrameFragment = sealGraphFragment({
  inputs: [{ name: "parent", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "program", type: spatialTypes.aspectFrameProgram }],
  operations: [{ id: "resolve", producer: spatialProducers.aspectFrame, inputs: { parent: input("parent"), extent: input("extent"), program: input("program") }, result: { kind: "output" as const, name: "frame" } }],
  exports: [{ name: "frame", type: spatialTypes.frame, root: operation("resolve") }],
});

export const contentFitFragment = sealGraphFragment({
  inputs: [{ name: "frame", type: spatialTypes.frame }, { name: "extent", type: spatialTypes.extent }, { name: "fit", type: spatialTypes.fit }],
  operations: [{ id: "resolve", producer: spatialProducers.resolveContentFit, inputs: { frame: input("frame"), extent: input("extent"), fit: input("fit") }, result: { kind: "output" as const, name: "mapping" } }],
  exports: [{ name: "mapping", type: spatialTypes.map2D, root: operation("resolve") }],
});
