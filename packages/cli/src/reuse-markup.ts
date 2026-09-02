export type PinnedRecord = {
  readonly output: string;
  readonly build: string;
  readonly candidate: string;
  readonly markup: readonly string[];
};

/** Emit explicit Run markup for the newest occurrence of each requested public Output. */
export function pinnedRecords(
  entries: readonly { readonly build: string; readonly output: { readonly name: string } }[],
): readonly PinnedRecord[] {
  const seen = new Set<string>();
  const pinned: PinnedRecord[] = [];
  for (const entry of entries) {
    if (seen.has(entry.output.name)) continue;
    seen.add(entry.output.name);
    const candidate = `record-${entry.output.name.replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`;
    pinned.push({
      output: entry.output.name,
      build: entry.build,
      candidate,
      markup: [
        `<build-record id="${candidate}" build="${entry.build}" output="${entry.output.name}"/>`,
        `<satisfy output="${entry.output.name}" candidate="${candidate}"/>`,
      ],
    });
  }
  return pinned;
}
