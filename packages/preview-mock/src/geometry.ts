import type { CompiledGraph, StoredValue } from "@hypit/protocol";
import { findLogicalOutput, findCandidate } from "@hypit/compiler-node";
import { spatialTypes } from "@hypit/spatial";

function inline(value: StoredValue | undefined): unknown {
  return value?.kind === "inline" ? value.value : undefined;
}

export type MockGeometry = { readonly width: number; readonly height: number };

/** Geometry is a graph fact; resolution labels are intentionally not interpreted as pixels. */
export function deriveGeometry(graph: CompiledGraph, outputs: readonly string[]): MockGeometry {
  const candidates = outputs.flatMap((id) => {
    const output = findLogicalOutput(graph, id);
    return output === undefined ? [] : [findCandidate(graph, output.primary)];
  }).filter((item): item is NonNullable<typeof item> => item !== undefined);
  const canvas = graph.outputs
    .filter((output) => output.type.module.name === spatialTypes.canvas.module.name && output.type.name === spatialTypes.canvas.name)
    .map((output) => findCandidate(graph, output.primary))
    .find((candidate) => candidate?.root.kind === "value");
  const value = canvas?.root.kind === "value" ? inline(canvas.root.value.value) as { widthPx?: unknown; heightPx?: unknown } : undefined;
  if (value !== undefined && Number.isSafeInteger(value.widthPx) && Number.isSafeInteger(value.heightPx)
    && (value.widthPx as number) > 0 && (value.heightPx as number) > 0) {
    return { width: value.widthPx as number, height: value.heightPx as number };
  }
  const ratios = candidates.flatMap((candidate) => {
    if (candidate.root.kind !== "value") return [];
    const item = inline(candidate.root.value.value) as { aspectRatio?: unknown; width?: unknown; height?: unknown };
    if (typeof item.aspectRatio === "number" && item.aspectRatio > 0) return [item.aspectRatio];
    if (typeof item.width === "number" && typeof item.height === "number" && item.width > 0 && item.height > 0) return [item.width / item.height];
    return [];
  });
  if (ratios.length > 0 && ratios.every((ratio) => Math.abs(ratio - ratios[0]!) < 1e-9)) {
    const width = 1920;
    return { width, height: Math.max(1, Math.round(width / ratios[0]!)) };
  }
  if (ratios.length > 1) throw new Error("Preview mock geometry has conflicting aspect-ratio declarations");
  return { width: 1920, height: 1080 };
}
