import type { CapacityReservation, OperationProgress } from "@hypit/runtime";

export type QueueLaneSummary = {
  readonly pool: string;
  readonly lane: string;
  readonly inFlight: number;
};

export function formatOperationProgress(progress: OperationProgress): string {
  if (progress.completed === undefined) return progress.phase;
  const amount = progress.total === undefined
    ? String(progress.completed)
    : `${progress.completed}/${progress.total}`;
  return `${progress.phase} · ${amount}${progress.unit === undefined ? "" : ` ${progress.unit}`}`;
}

/** Derive the Provider → capability view from generic capacity tickets. */
export function summarizeQueueLanes(capacity: readonly CapacityReservation[]): readonly QueueLaneSummary[] {
  const groups = new Map<string, QueueLaneSummary>();
  for (const ticket of capacity) {
    if (ticket.queue === undefined) continue;
    const key = `${ticket.queue.pool}\u0000${ticket.queue.lane}`;
    const previous = groups.get(key);
    groups.set(key, {
      pool: ticket.queue.pool,
      lane: ticket.queue.lane,
      inFlight: (previous?.inFlight ?? 0) + 1,
    });
  }
  return [...groups.values()].sort((left, right) =>
    left.pool.localeCompare(right.pool) || left.lane.localeCompare(right.lane));
}

export function queueLaneLines(groups: readonly QueueLaneSummary[]): readonly string[] {
  const lines: string[] = [];
  let pool: string | undefined;
  for (const group of groups) {
    if (group.pool !== pool) {
      pool = group.pool;
      lines.push(pool);
    }
    lines.push(`  ${group.lane}: ${group.inFlight} remote`);
  }
  return lines;
}

export function inlineValuePreview(value: unknown, limit = 240): string {
  const encoded = JSON.stringify(value);
  if (encoded.length <= limit) return encoded;
  return `${encoded.slice(0, Math.max(0, limit - 3))}...`;
}
