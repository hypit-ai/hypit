export type NodeFileObservation = {
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
};

/** Opaque invocation-local comparison token; never persisted or used as content identity. */
export function nodeFileObservationRevision(value: NodeFileObservation): string {
  return JSON.stringify([value.size, value.mtimeMs, value.ctimeMs]);
}
