import type { BuildState, CompiledGraph } from "@hypit/protocol";

export type UnreachedGeneration = {
  /** The Producer that would have run, as the Source named it. */
  readonly name: string;
  readonly producer: string;
};

/**
 * Generations a Source declares that this Run will not perform.
 *
 * Whether anything *consumes* a declaration cannot answer this. An Author Source has no targets, so
 * "nothing needs this" has no meaning there, and a package's own expansion consumes its own
 * intermediate steps — a generated picture is read by the step that picks the primary image, which
 * makes the generation look used even when the picture it produces is read by nobody.
 *
 * A Run Source does have targets, and planning already prunes to what they reach. So the question
 * that can be answered is the one that matters: this Run declares the generation and will not run
 * it. Either nothing needs it, or a target is missing, or an accepted Record should have been
 * pinned and was not.
 */
export function unreachedGenerations(
  graph: CompiledGraph,
  state: BuildState,
  names: Readonly<Record<string, string>> = {},
): readonly UnreachedGeneration[] {
  const built = new Set<string>();
  for (const step of state.plan.steps) {
    for (const record of Object.values(step.outputs)) built.add(record);
  }
  // A satisfied output is deliberately not produced again; that is reuse working, not a leftover.
  for (const selection of state.plan.selections) built.add(selection.record);
  const found: UnreachedGeneration[] = [];
  for (const operation of graph.operations) {
    if (operation.result.kind !== "need") continue;
    if (built.has(operation.result.record)) continue;
    found.push({
      name: names[operation.id] ?? names[operation.result.record] ?? operation.result.name,
      producer: `${operation.producer.module.name}@${operation.producer.module.version}/${operation.producer.name}`,
    });
  }
  return found;
}
