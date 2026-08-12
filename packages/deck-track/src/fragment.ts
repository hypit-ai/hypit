import { artifactTypes } from "@narratage/artifact";
import { compositionTypes } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";
import type { FragmentOperation, GraphFragment } from "@narratage/elaborator";
import { mediaTypes } from "@narratage/media";
import { mediaTrackProducers, mediaTrackTypes } from "@narratage/media-track";
import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import { semanticMapTypes } from "@narratage/semantic-map";
import { spatialTypes } from "@narratage/spatial";

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
  readonly momentName: string;
};

export type DepthStackFragmentTerminal =
  | { readonly kind: "program-end" }
  | { readonly kind: "moment" | "selection-start" | "selection-end"; readonly inputName: string };

function sourceInput(card: DepthStackFragmentCard): GraphFragment["inputs"][number] {
  const type = card.sourceKind === "still"
    ? artifactTypes.blob
    : card.sourceKind === "timed" ? mediaTypes.synchronized : mediaTypes.compositableSurface;
  return { name: card.sourceName, type };
}

export function createDepthStackFragment(
  cards: readonly DepthStackFragmentCard[],
  terminal: DepthStackFragmentTerminal,
  name = "@narratage/deck-track/dynamic-depth-stack@1",
) {
  if (cards.length === 0) throw new Error("DepthStack Fragment requires Cards.");
  const inputs: Array<GraphFragment["inputs"][number]> = [
    { name: "canvas", type: spatialTypes.canvas },
    { name: "frame", type: spatialTypes.frame },
    { name: "header", type: depthStackTypes.header },
    { name: "map", type: semanticMapTypes.complete },
    { name: "space", type: programSpaceTypes.programSpace },
    { name: "spec", type: depthStackTypes.spec },
  ];
  const operations: FragmentOperation[] = [{
    id: "cards",
    producer: depthStackProducers.createCards,
    inputs: {},
    result: { kind: "output", name: "set" },
  }];
  let cardSet = operation("cards");
  for (const card of cards) {
    inputs.push(sourceInput(card));
    if (card.extentName !== undefined) inputs.push({ name: card.extentName, type: spatialTypes.extent });
    inputs.push(
      { name: card.fitName, type: spatialTypes.fit },
      { name: card.sampleSpecName, type: mediaTrackTypes.sampleLayerSpec },
      { name: card.labelName, type: depthStackTypes.cardLabel },
      { name: card.cardSpecName, type: depthStackTypes.cardSpec },
      { name: card.momentName, type: narrativeTypes.moment },
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
      producer: depthStackProducers.appendMomentCard,
      inputs: {
        set: cardSet,
        material: operation(sampleId),
        label: input(card.labelName),
        spec: input(card.cardSpecName),
        map: input("map"),
        moment: input(card.momentName),
        space: input("space"),
      },
      result: { kind: "output", name: "set" },
    });
    cardSet = operation(appendId);
  }
  const terminalProducer = terminal.kind === "program-end"
    ? depthStackProducers.finalizeProgramEnd
    : terminal.kind === "moment" ? depthStackProducers.finalizeUntilMoment
      : terminal.kind === "selection-start" ? depthStackProducers.finalizeUntilSelectionStart
        : depthStackProducers.finalizeUntilSelectionEnd;
  if (terminal.kind !== "program-end") {
    inputs.push({
      name: terminal.inputName,
      type: terminal.kind === "moment" ? narrativeTypes.moment : narrativeTypes.selection,
    });
  }
  operations.push({
    id: "program",
    producer: terminalProducer,
    inputs: {
      set: cardSet,
      header: input("header"),
      frame: input("frame"),
      spec: input("spec"),
      space: input("space"),
      ...(terminal.kind === "program-end" ? {} : {
        map: input("map"),
        terminal: input(terminal.inputName),
      }),
    },
    result: { kind: "output", name: "program" },
  });
  operations.push({
    id: "track",
    producer: depthStackProducers.render,
    inputs: { canvas: input("canvas"), space: input("space"), program: operation("program") },
    result: { kind: "output", name: "track" },
  });
  return sealGraphFragment({
    name,
    inputs,
    operations,
    exports: [
      { name: "program", type: depthStackTypes.program, root: operation("program") },
      { name: "track", type: compositionTypes.visualTrack, root: operation("track") },
    ],
  });
}
