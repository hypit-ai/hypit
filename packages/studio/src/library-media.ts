import type { StudioArtifactView } from "./shared.js";

/** Merge known references, without reading or comparing media bytes. */
export function mergeStudioArtifacts(items: readonly StudioArtifactView[]): StudioArtifactView[] {
  const files = new Map<string, StudioArtifactView>();
  for (const item of items) {
    const prior = files.get(item.id);
    if (prior === undefined) {
      files.set(item.id, item);
      continue;
    }
    const latest = item.createdAt > prior.createdAt ? item : prior;
    const origins = new Map([...prior.origins, ...item.origins].map((origin) =>
      [JSON.stringify([origin.build, origin.output]), origin]));
    files.set(item.id, { ...latest, highlighted: prior.highlighted || item.highlighted, origins: [...origins.values()] });
  }
  return [...files.values()].sort((left, right) => Number(right.highlighted) - Number(left.highlighted)
    || right.createdAt - left.createdAt || left.output.localeCompare(right.output));
}
