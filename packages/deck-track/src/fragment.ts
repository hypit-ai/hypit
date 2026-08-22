import { artifactTypes } from "@hypit/artifact";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation, GraphFragment } from "@hypit/elaborator";
import { mediaTypes } from "@hypit/media";
import { mediaTrackProducers, mediaTrackTypes } from "@hypit/media-track";
import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";
import { temporalProducers, temporalTypes } from "@hypit/temporal";

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
  readonly windowSpecName: string;
};

export type DepthStackFragmentTerminal =
  | { readonly kind: "program-end" }
  | { readonly kind: "moment" | "selection-start" | "selection-end"; readonly inputName: string; readonly specName: string };

function sourceInput(card: DepthStackFragmentCard): GraphFragment["inputs"][number] {
  const type = card.sourceKind === "still"
    ? artifactTypes.blob
    : card.sourceKind === "timed" ? mediaTypes.synchronized : mediaTypes.compositableSurface;
  return { name: card.sourceName, type };
}

export function createDepthStackFragment(
  cards: readonly DepthStackFragmentCard[],
  terminal: DepthStackFragmentTerminal,
) {
  if (cards.length === 0) throw new Error("DepthStack Fragment requires Cards.");
  const inputs: Array<GraphFragment["inputs"][number]> = [
    { name: "canvas", type: spatialTypes.canvas },
    { name: "frame", type: spatialTypes.frame },
    { name: "header", type: depthStackTypes.header },
    { name: "semantic", type: semanticTrackTypes.track },
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
      { name: card.windowSpecName, type: temporalTypes.windowSpec },
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
    const windowId = `window-${card.suffix}`;
    operations.push({
      id: windowId,
      producer: temporalProducers.projectMoment,
      inputs: { semantic: input("semantic"), moment: input(card.momentName), spec: input(card.windowSpecName) },
      result: { kind: "output", name: "window" },
    });
    operations.push({
      id: appendId,
      producer: depthStackProducers.appendCard,
      inputs: {
        set: cardSet,
        material: operation(sampleId),
        label: input(card.labelName),
        spec: input(card.cardSpecName),
        window: operation(windowId),
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
    inputs.push({ name: terminal.specName, type: temporalTypes.windowSpec });
  }
  const terminalWindow = terminal.kind === "program-end" ? "program-window" : "terminal-window";
  if (terminal.kind === "program-end") {
    inputs.push({ name: "program-spec", type: temporalTypes.windowSpec });
    operations.push({ id: terminalWindow, producer: temporalProducers.projectProgram,
      inputs: { semantic: input("semantic"), spec: input("program-spec") }, result: { kind: "output", name: "window" } });
  } else {
    operations.push({ id: terminalWindow,
      producer: terminal.kind === "moment" ? temporalProducers.projectMoment : temporalProducers.projectSelection,
      inputs: {
        semantic: input("semantic"), spec: input(terminal.specName),
        [terminal.kind === "moment" ? "moment" : "selection"]: input(terminal.inputName),
      }, result: { kind: "output", name: "window" } });
  }
  operations.push({
    id: "program",
    producer: terminalProducer,
    inputs: {
      set: cardSet,
      header: input("header"),
      frame: input("frame"),
      spec: input("spec"),
      semantic: input("semantic"),
      terminal: operation(terminalWindow),
    },
    result: { kind: "output", name: "program" },
  });
  operations.push({
    id: "track",
    producer: depthStackProducers.render,
    inputs: { canvas: input("canvas"), semantic: input("semantic"), program: operation("program") },
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
