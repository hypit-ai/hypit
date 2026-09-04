import { BuildMachine } from "@hypit/core";
import type { BuildDefinition, BuildState } from "@hypit/protocol";
import { TypeValidatorRegistry } from "@hypit/validation";
import type { TypeValidatorRegistryLike } from "@hypit/validation";

import { NodeDriver } from "./driver.js";
import { EndpointRegistry, ProducerRegistry } from "./registry.js";

export type ProducerPlanEvaluation = {
  /** Disposable Build view after every currently runnable pure Producer was evaluated once. */
  readonly state: BuildState;
  /** Exact Producer Step ids that could not be evaluated, with their direct errors. */
  readonly failures: ReadonlyMap<string, string>;
};

/**
 * Evaluate the closed Build graph without installing any Endpoint.
 *
 * Component Producers are deterministic computation. External Needs remain blocked, while every
 * independent Producer keeps advancing. A failed Producer is attempted once: planning reports the
 * failure instead of looping or turning it into a Build fact.
 */
export async function evaluateProducerPlan(
  definition: BuildDefinition,
  producers: ProducerRegistry,
  validators: TypeValidatorRegistryLike = new TypeValidatorRegistry(),
): Promise<ProducerPlanEvaluation> {
  const driver = new NodeDriver({ producers, endpoints: new EndpointRegistry(), validators });
  const machine = new BuildMachine(definition);
  const attempted = new Set<string>();
  const failures = new Map<string, string>();

  while (true) {
    const prepared = driver.prepare(machine.view());
    const runnable = prepared.runnable.filter((item) =>
      item.command.kind === "invoke-producer" && !attempted.has(item.command.id));
    if (runnable.length === 0) break;

    for (const descriptor of runnable) {
      if (descriptor.command.kind !== "invoke-producer") continue;
      attempted.add(descriptor.command.id);
      try {
        const result = await driver.executeCommand(machine.view(), descriptor, { build: "plan" });
        if (result.status !== "completed") {
          failures.set(descriptor.command.step, "the Producer did not complete synchronously");
          continue;
        }
        if (result.event.kind === "command-failed") {
          failures.set(descriptor.command.step, result.event.message);
          continue;
        }
        machine.evaluate(result.event);
        machine.commit();
      } catch (error) {
        failures.set(descriptor.command.step, error instanceof Error ? error.message : String(error));
      }
    }
  }

  const final = driver.prepare(machine.view());
  for (const blocked of final.blocked) {
    if (blocked.reason !== "missing-producer" || !blocked.command.startsWith("producer:")) continue;
    failures.set(blocked.command.slice("producer:".length), `no Producer for ${blocked.subject} is loaded`);
  }

  return { state: machine.view(), failures };
}
