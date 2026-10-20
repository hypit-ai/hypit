import { ProducerRegistry } from "@hypit/executor";
import type { CanonicalValue, CapabilityRef, TypeRef } from "@hypit/protocol";
import type { RuntimeHostEndpointQuery } from "@hypit/runtime-local";

import {
  producers as greetingProducerRefs,
} from "../execution-scenario.js";

export function inlineString(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected inline string");
  return value;
}

export function greetingProducers(): ProducerRegistry {
  const producers = new ProducerRegistry();
  producers.registerProducer(greetingProducerRefs.makePrompt, ({ inputs }) => {
    const intent = inputs.intent;
    if (intent === undefined || intent.value === null
      || Array.isArray(intent.value) || typeof intent.value !== "object") {
      throw new Error("intent must be an object");
    }
    return { kind: "output", value: (`Greet ${inlineString((intent.value as Readonly<Record<string, unknown>>).name)}`) };
  });
  producers.registerProducer(greetingProducerRefs.requestText, ({ inputs }) => {
    const prompt = inputs.prompt;
    if (prompt === undefined) throw new Error("prompt is missing");
    return { kind: "need", constraints: { prompt: inlineString(prompt.value) } };
  });
  return producers;
}
export function profile(config: {
  readonly dataRoot?: string;
  readonly credentials?: Readonly<Record<string, unknown>>;
  readonly endpoints?: Readonly<Record<string, unknown>>;
  readonly bindings?: Readonly<Record<string, string>>;
} = {}) {
  return {
    format: "hypit.runtime-local@1",
    dataRoot: config.dataRoot ?? ".hypit/runtimes/local",
    credentials: config.credentials ?? {},
    endpoints: config.endpoints ?? {},
    ...(config.bindings === undefined ? {} : { bindings: config.bindings }),
  };
}

export function endpointQuery(
  need: string,
  capability: CapabilityRef,
  returns: TypeRef,
  constraints: CanonicalValue = null,
): RuntimeHostEndpointQuery {
  return { kind: "concrete", need, capability, returns, constraints };
}

export function endpointDemand(
  need: string,
  capability: CapabilityRef,
  returns: TypeRef,
): RuntimeHostEndpointQuery {
  return { kind: "demand", need, capability, returns };
}
