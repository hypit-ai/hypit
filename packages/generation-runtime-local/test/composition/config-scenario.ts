import { ProducerRegistry } from "@hypit/executor";
import type { CanonicalValue } from "@hypit/protocol";
import type { CapabilityRef, TypeRef } from "@hypit/module";
import type { RuntimeHostEndpointQuery } from "@hypit/generation-runtime-local";
import { writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

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
  readonly environment?: string;
  readonly worker?: { readonly executionMemoryMb: number };
  readonly execution?: { readonly producerInlineValueBytes: number };
} = {}) {
  return {
    format: "hypit.generation-runtime-local@1",
    dataRoot: config.dataRoot ?? ".hypit/generation/runtime/local",
    environment: config.environment ?? "./hypit.environment.json",
    ...(config.worker === undefined ? {} : { worker: config.worker }),
    ...(config.execution === undefined ? {} : { execution: config.execution }),
  };
}

export function environmentProfile(config: {
  readonly dataRoot?: string;
  readonly credentials?: Readonly<Record<string, unknown>>;
  readonly endpoints?: Readonly<Record<string, unknown>>;
  readonly bindings?: Readonly<Record<string, string>>;
} = {}) {
  return {
    format: "hypit.execution-environment-local@1",
    dataRoot: config.dataRoot ?? ".hypit/environment/local",
    credentials: config.credentials ?? {},
    endpoints: config.endpoints ?? {},
    ...(config.bindings === undefined ? {} : { bindings: config.bindings }),
  };
}

export async function writeProfilePair(path: string, config: {
  readonly dataRoot?: string;
  readonly environmentDataRoot?: string;
  readonly worker?: { readonly executionMemoryMb: number };
  readonly execution?: { readonly producerInlineValueBytes: number };
  readonly credentials?: Readonly<Record<string, unknown>>;
  readonly endpoints?: Readonly<Record<string, unknown>>;
  readonly bindings?: Readonly<Record<string, string>>;
} = {}): Promise<{ readonly runtime: string; readonly environment: string }> {
  const environment = join(dirname(path), `${basename(path)}.environment.json`);
  await writeFile(environment, JSON.stringify(environmentProfile({
    dataRoot: config.environmentDataRoot ?? config.dataRoot ?? ".hypit/environment/local",
    ...(config.credentials === undefined ? {} : { credentials: config.credentials }),
    ...(config.endpoints === undefined ? {} : { endpoints: config.endpoints }),
    ...(config.bindings === undefined ? {} : { bindings: config.bindings }),
  })));
  await writeFile(path, JSON.stringify(profile({
    ...(config.dataRoot === undefined ? {} : { dataRoot: config.dataRoot }),
    environment: relative(dirname(path), environment),
    ...(config.worker === undefined ? {} : { worker: config.worker }),
    ...(config.execution === undefined ? {} : { execution: config.execution }),
  })));
  return { runtime: path, environment };
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
