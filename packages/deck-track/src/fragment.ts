import { artifactTypes } from "@hypit/artifact";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation, GraphFragment } from "@hypit/elaborator";
import { mediaTypes } from "@hypit/media";
import { mediaTrackProducers, mediaTrackTypes } from "@hypit/media-track";
import { semanticTrackProducers, semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";

import { depthStackProducers, depthStackTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export type DepthStackFragmentCard = {
  readonly suffix: string;
  readonly sourceKind: "still" | "timed" | "surface";
  readonly sourceName: string;
  readonly extentName?: string;
  readonly fitName: string;
  readonly sampleSpecName: string;
  readonly framePaintSpecName?: string;
  readonly labelName: string;
  readonly cardSpecName: string;
  readonly activationName: string;
};

function sourceInput(card: DepthStackFragmentCard): GraphFragment["inputs"][number] {
  const type = card.sourceKind === "still"
    ? artifactTypes.blob
    : card.sourceKind === "timed" ? mediaTypes.synchronized : mediaTypes.compositableSurface;
  return { name: card.sourceName, type };
}

export function createDepthStackFragment(
  cards: readonly DepthStackFragmentCard[],
  terminalName: string,
) {
  if (cards.length === 0) throw new Error("DepthStack Fragment requires Cards.");
  const inputs: Array<GraphFragment["inputs"][number]> = [
    { name: "canvas", type: spatialTypes.canvas },
    { name: "frame", type: spatialTypes.frame },
    { name: "header", type: depthStackTypes.header },
    { name: "semantic", type: semanticTrackTypes.track },
    { name: "spec", type: depthStackTypes.spec },
  ];
  const operations: FragmentOperation[] = [
    {
      id: "space",
      producer: semanticTrackProducers.projectProgramSpace,
      inputs: { track: input("semantic") },
      result: { kind: "output", name: "space" },
    },
    {
      id: "cards",
      producer: depthStackProducers.createCards,
      inputs: {},
      result: { kind: "output", name: "set" },
    },
  ];
  let cardSet = operation("cards");
  for (const card of cards) {
    inputs.push(sourceInput(card));
    if (card.extentName !== undefined) inputs.push({ name: card.extentName, type: spatialTypes.extent });
    inputs.push(
      { name: card.fitName, type: spatialTypes.fit },
      { name: card.sampleSpecName, type: mediaTrackTypes.sampleLayerSpec },
      { name: card.labelName, type: depthStackTypes.cardLabel },
      { name: card.cardSpecName, type: depthStackTypes.cardSpec },
      { name: card.activationName, type: temporalTypes.instant },
    );
    if (card.framePaintSpecName !== undefined) {
      inputs.push({ name: card.framePaintSpecName, type: mediaTrackTypes.paintLayerSpec });
    }
    const layersId = `layers-${card.suffix}`;
    operations.push({
      id: layersId,
      producer: mediaTrackProducers.createLayers,
      inputs: {},
      result: { kind: "output", name: "layers" },
    });
    let layers = operation(layersId);
    if (card.framePaintSpecName !== undefined) {
      const paintId = `paint-${card.suffix}`;
      operations.push({
        id: paintId,
        producer: mediaTrackProducers.appendPaintLayer,
        inputs: { layers, spec: input(card.framePaintSpecName) },
        result: { kind: "output", name: "layers" },
      });
      layers = operation(paintId);
    }
    const sampleId = `sample-${card.suffix}`;
    const producer = card.sourceKind === "still"
      ? mediaTrackProducers.appendStillLayer
      : card.sourceKind === "timed" ? mediaTrackProducers.appendTimedLayer : mediaTrackProducers.appendSurfaceLayer;
    operations.push({
      id: sampleId,
      producer,
      inputs: {
        layers,
        source: input(card.sourceName),
        ...(card.extentName === undefined ? {} : { extent: input(card.extentName) }),
        fit: input(card.fitName),
        spec: input(card.sampleSpecName),
      },
      result: { kind: "output", name: "layers" },
    });
    const appendId = `append-${card.suffix}`;
    operations.push({
      id: appendId,
      producer: depthStackProducers.appendCard,
      inputs: {
        set: cardSet,
        space: operation("space"),
        material: operation(sampleId),
        label: input(card.labelName),
        spec: input(card.cardSpecName),
        activation: input(card.activationName),
      },
      result: { kind: "output", name: "set" },
    });
    cardSet = operation(appendId);
  }
  inputs.push({ name: terminalName, type: temporalTypes.instant });
  operations.push({
    id: "program",
    producer: depthStackProducers.finalize,
    inputs: {
      set: cardSet,
      header: input("header"),
      frame: input("frame"),
      spec: input("spec"),
      space: operation("space"),
      terminal: input(terminalName),
    },
    result: { kind: "output", name: "program" },
  });
  operations.push({
    id: "track",
    producer: depthStackProducers.render,
    inputs: { canvas: input("canvas"), space: operation("space"), program: operation("program") },
    result: { kind: "output", name: "track" },
  });
  return sealGraphFragment({
    inputs,
    operations,
    exports: [
      { name: "program", type: depthStackTypes.program, root: operation("program") },
      { name: "track", type: compositionTypes.visualTrack, root: operation("track") },
    ],
  });
}
