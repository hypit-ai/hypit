import type { CanvasBinding, CanvasCommand, CanvasDocument, CanvasNode, CanvasSource, CanvasValue } from "@hypit/canvas";
import type { Connection } from "@xyflow/react";
import type { CanvasModel, CanvasObservation } from "../protocol.js";
import { cardSize } from "./placement.js";

export type Catalog = Extract<CanvasObservation, { kind: "catalog" }>;
type Recipe = Extract<CanvasNode, { capability: string }>;
type Field = CanvasModel["fields"][number];
export type Wire = { source: CanvasSource; target: string; input: string; index: number };

export function filename(path: string) { return (path.split("/").at(-1) ?? path).replace(/\.media\.json$/u, ""); }

export function nodeSize(node: CanvasNode, catalog?: Catalog) {
  if (!("media" in node) || !catalog) return cardSize;
  const asset = catalog.media.entries.find(entry => entry.reference.path === node.media.path);
  if (!asset || asset.state !== "available") return cardSize;
  const picture = asset.picture;
  if (!picture) return asset.mediaType.startsWith("audio/") ? { width: cardSize.width, height: 96 } : cardSize;
  const rotated = picture.rotationDegrees === 90 || picture.rotationDegrees === 270;
  const ratio = rotated ? picture.codedWidth / picture.codedHeight : picture.codedHeight / picture.codedWidth;
  return { width: cardSize.width, height: Math.max(96, Math.min(640, cardSize.width * ratio)) };
}

export function nodeTitle(node: CanvasNode, models: readonly CanvasModel[]) {
  return node.name ?? ("media" in node ? filename(node.media.path) : models.find(model => model.id === node.capability)?.title ?? node.capability);
}

export function values(binding: CanvasBinding | undefined): readonly CanvasValue[] {
  return binding === undefined ? [] : "items" in binding ? binding.items : [binding];
}

export function wires(document: CanvasDocument): Wire[] {
  return document.nodes.flatMap(node => "capability" in node ? Object.entries(node.inputs).flatMap(([input, binding]) =>
    values(binding).flatMap((value, index) => "from" in value ? [{ source: value.from, target: node.id, input, index }] : [])) : []);
}

export function resourceField(field: Field) { return field.kind === "resource" || field.kind === "resources"; }

export function supplies(node: CanvasNode, output: string, field: Field, catalog: Catalog) {
  if ("media" in node) {
    const match = catalog.media.entries.find(entry => entry.reference.path === node.media.path);
    return output === "media" && match?.state === "available" && (field.media === undefined || match.mediaType.startsWith(field.media + "/"));
  }
  const model = catalog.models.find(item => item.id === node.capability);
  const definition = model?.outputs[output];
  return model !== undefined && Object.hasOwn(model.outputs, output) && definition?.media !== undefined
    && (field.media === undefined || definition.media === field.media);
}

function inputCommand(target: Recipe, input: string, binding?: CanvasBinding): CanvasCommand {
  return binding === undefined ? { kind: "input.clear", node: target.id, input } : { kind: "input.set", node: target.id, input, binding };
}

type Link = Pick<Connection, "source" | "target"> & Partial<Pick<Connection, "sourceHandle" | "targetHandle">>;

export function activeFields(node: Recipe, model: CanvasModel) {
  const mode = node.inputs.mode;
  const active = mode !== undefined && "value" in mode ? mode.value : model.fields.find(field => field.name === "mode")?.default;
  return model.fields.filter(field => field.modes === undefined || field.modes.some(mode => mode === active));
}

export function connect(document: CanvasDocument, catalog: Catalog, link: Link): CanvasCommand | undefined {
  if (link.source === link.target || link.sourceHandle == null || link.targetHandle == null) return;
  const source = document.nodes.find(node => node.id === link.source);
  const target = document.nodes.find(node => node.id === link.target);
  if (source === undefined || target === undefined || !("capability" in target)) return;
  const model = catalog.models.find(model => model.id === target.capability);
  const field = model === undefined ? undefined : activeFields(target, model).find(field => field.name === link.targetHandle);
  if (field === undefined || !resourceField(field) || !supplies(source, link.sourceHandle, field, catalog)) return;
  const previous = values(target.inputs[field.name]);
  const output = link.sourceHandle;
  if (previous.some(value => "from" in value && value.from.node === source.id && value.from.output === output)) return;
  const value = { from: { node: source.id, output } };
  if (field.kind !== "resources") return inputCommand(target, field.name, value);
  if (field.maxItems !== undefined && previous.length >= field.maxItems) return;
  return inputCommand(target, field.name, { items: [...previous, value] });
}

export function disconnect(document: CanvasDocument, wire: Wire): CanvasCommand | undefined {
  const target = document.nodes.find(node => node.id === wire.target);
  if (target === undefined || !("capability" in target)) return;
  const binding = target.inputs[wire.input];
  const previous = values(binding);
  const value = previous[wire.index];
  if (binding === undefined || value === undefined || !("from" in value)
      || value.from.node !== wire.source.node || value.from.output !== wire.source.output) return;
  const items = previous.filter((_, index) => index !== wire.index);
  return inputCommand(target, wire.input, "items" in binding && items.length > 0 ? { items } : undefined);
}
