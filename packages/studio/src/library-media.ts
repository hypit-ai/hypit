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
    files.set(item.id, { ...latest, origins: [...origins.values()] });
  }
  return [...files.values()].sort((left, right) => right.createdAt - left.createdAt
    || left.output.localeCompare(right.output));
}
