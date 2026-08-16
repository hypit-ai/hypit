import type {
  BuildDefinition,
  BuildFact,
  BuildState,
  CoreCommand,
  CommandResult,
  TypedRecord,
} from "@narratage/protocol";

import { admitBuildResult, materializeBuild } from "./reducer.js";

/**
 * Non-serializable incremental Core machine.
 *
 * Definition + Facts are the stored form. The machine is only their disposable execution view.
 */
export class BuildMachine {
  readonly definition: BuildDefinition;
  #state: BuildState;
  #proposal: { readonly fact: BuildFact; readonly state: BuildState } | undefined;

  constructor(definition: BuildDefinition, facts: readonly BuildFact[] = []) {
    this.definition = structuredClone(definition);
    this.#state = materializeBuild(this.definition, facts);
  }

  get status(): BuildState["status"] {
    return this.#state.status;
  }

  commands(): readonly CoreCommand[] {
    return this.#state.outstanding;
  }

  record(id: string): TypedRecord | undefined {
    return this.#state.records.find((item) => item.id === id);
  }

  /** Materialized compatibility/read view. It is never the durable Store representation. */
  view(): BuildState {
    return this.#state;
  }

  /** Validate one result without mutating the machine before durable persistence succeeds. */
  evaluate(result: CommandResult): BuildFact | undefined {
    if (this.#proposal !== undefined) {
      throw new Error(`Build result ${this.#proposal.fact.command} has not been durably applied`);
    }
    const admitted = admitBuildResult(this.#state, result);
    this.#proposal = { fact: admitted.fact, state: admitted.state };
    return admitted.fact;
  }

  /** Advance memory only after BuildStore.append has committed the proposed Fact. */
  commit(): void {
    if (this.#proposal === undefined) throw new Error("Build machine has no evaluated result to commit");
    this.#state = this.#proposal.state;
    this.#proposal = undefined;
  }
}

export function restoreBuildMachine(
  definition: BuildDefinition,
  facts: readonly BuildFact[],
): BuildMachine {
  return new BuildMachine(definition, facts);
}
