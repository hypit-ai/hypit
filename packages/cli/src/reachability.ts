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
  outputNames: Readonly<Record<string, string>> = {},
): readonly UnreachedGeneration[] {
  const built = new Set<string>();
  for (const step of state.plan.steps) {
    for (const record of Object.values(step.outputs)) built.add(record);
    // A Need's result lands through the binding rather than the step's outputs, so a plan that
    // performs a generation shows it here and nowhere else.
    for (const binding of Object.values(step.needs)) built.add(binding.result);
  }
  // A satisfied output is deliberately not produced again; that is reuse working, not a leftover.
  for (const selection of state.plan.selections) built.add(selection.record);

  // The author's name for a generation sits on the Logical Output, which selects a Candidate, which
  // roots at the Operation. Reporting the Operation's internal name instead would be accurate and
  // useless: nobody searches a Source for "request-nano-banana-2".
  const candidateById = new Map(graph.candidates.map((item) => [item.id, item]));
  const namedOperation = new Map<string, string>();
  for (const output of graph.outputs) {
    const name = outputNames[output.id];
    if (name === undefined) continue;
    const root = candidateById.get(output.primary)?.root;
    if (root?.kind === "operation") namedOperation.set(root.result.operation, name);
  }

  // A package expands one authored element into several Operations, and the author's name usually
  // sits on the last of them — `gpt:Image` generates, then picks the primary image, and the name is
  // on the pick. Reporting "generation" would be true and unusable, so follow the chain forward to
  // the first Operation anyone named.
  const consumers = new Map<string, string[]>();
  for (const operation of graph.operations) {
    for (const input of Object.values(operation.inputs)) {
      const from = input.kind === "operation-result" ? input.operation : input.id;
      consumers.set(from, [...consumers.get(from) ?? [], operation.id]);
      if (operation.result.kind === "output" || operation.result.kind === "need") {
        consumers.set(operation.result.record, [...consumers.get(operation.result.record) ?? [], operation.id]);
      }
    }
  }
  const authoredName = (start: string, startRecord: string): string | undefined => {
    const seen = new Set<string>([start]);
    let frontier = [...consumers.get(start) ?? [], ...consumers.get(startRecord) ?? []];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const name = namedOperation.get(id);
        if (name !== undefined) return name;
        next.push(...consumers.get(id) ?? []);
      }
      frontier = next;
    }
    return undefined;
  };

  const found: UnreachedGeneration[] = [];
  for (const operation of graph.operations) {
    if (operation.result.kind !== "need") continue;
    if (built.has(operation.result.record)) continue;
    found.push({
      name: namedOperation.get(operation.id)
        ?? authoredName(operation.id, operation.result.record)
        ?? operation.result.name,
      producer: `${operation.producer.module.name}@${operation.producer.module.version}/${operation.producer.name}`,
    });
  }
  return found;
}
