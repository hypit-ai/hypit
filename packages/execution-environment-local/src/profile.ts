import { resolve } from "node:path";

import { canonicalize, compareCodeUnits } from "@hypit/protocol";
import { parseCapabilityKey } from "@hypit/module";
import type { CanonicalValue } from "@hypit/protocol";

export type LocalExecutionEnvironmentAdapterSelection = {
  readonly use: string;
  readonly instance: string;
  readonly pool?: string;
  readonly config?: CanonicalValue;
};

export type LocalExecutionEnvironmentProfile = {
  readonly format: "hypit.execution-environment-local@1";
  readonly dataRoot: string;
  readonly credentials: readonly LocalExecutionEnvironmentAdapterSelection[];
  readonly endpoints: readonly LocalExecutionEnvironmentAdapterSelection[];
  /** Capability key (`name@version#capability`) to Endpoint instance. */
  readonly bindings: Readonly<Record<string, string>>;
};

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${subject} does not accept ${unknown.join(", ")}; it accepts ${allowed.join(", ")}`);
  }
}

function requiredString(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${subject} must be a non-empty string`);
  }
  return value;
}

function entry(
  value: unknown,
  instance: string,
  subject: string,
  poolAllowed = false,
): LocalExecutionEnvironmentAdapterSelection {
  const item = object(value, subject);
  exactKeys(item, poolAllowed ? ["use", "pool", "config"] : ["use", "config"], subject);
  const pool = item.pool === undefined ? undefined : requiredString(item.pool, `${subject}.pool`);
  return {
    use: requiredString(item.use, `${subject}.use`),
    instance,
    ...(pool === undefined ? {} : { pool }),
    ...(item.config === undefined ? {} : { config: canonicalize(item.config) }),
  };
}

function entries(
  value: unknown,
  subject: string,
  poolAllowed = false,
): readonly LocalExecutionEnvironmentAdapterSelection[] {
  const values = object(value ?? {}, subject);
  return Object.entries(values)
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([instance, item]) => {
      requiredString(instance, `${subject} instance`);
      return entry(item, instance, `${subject}.${instance}`, poolAllowed);
    });
}

function bindings(
  value: unknown,
  endpoints: readonly LocalExecutionEnvironmentAdapterSelection[],
): Readonly<Record<string, string>> {
  const values = object(value ?? {}, "$environment.bindings");
  const instances = new Set(endpoints.map((item) => item.instance));
  const result: Record<string, string> = {};
  for (const [key, target] of Object.entries(values)
    .sort(([left], [right]) => compareCodeUnits(left, right))) {
    parseCapabilityKey(key);
    const instance = requiredString(target, `$environment.bindings.${key}`);
    if (!instances.has(instance)) {
      throw new Error(`$environment.bindings.${key} names ${instance}, which is not an Endpoint instance of this Profile (${[...instances].sort().join(", ")})`);
    }
    result[key] = instance;
  }
  return result;
}

export function parseLocalExecutionEnvironmentProfile(value: unknown): LocalExecutionEnvironmentProfile {
  const item = object(value, "$environment");
  exactKeys(item, ["format", "dataRoot", "credentials", "endpoints", "bindings"], "$environment");
  if (item.format !== "hypit.execution-environment-local@1") {
    throw new Error("$environment.format must be hypit.execution-environment-local@1");
  }
  const credentials = entries(item.credentials, "$environment.credentials");
  const endpoints = entries(item.endpoints, "$environment.endpoints", true);
  const ids = [...credentials, ...endpoints].map((selection) => selection.instance);
  if (new Set(ids).size !== ids.length) {
    throw new Error("$environment repeats an Environment instance id");
  }
  return {
    format: "hypit.execution-environment-local@1",
    dataRoot: requiredString(item.dataRoot, "$environment.dataRoot"),
    credentials,
    endpoints,
    bindings: bindings(item.bindings, endpoints),
  };
}

/** Resolve only the Environment-owned state root. Package selection remains a Host concern. */
export function resolveLocalExecutionEnvironmentDataRoot(
  profileDirectory: string,
  profile: LocalExecutionEnvironmentProfile,
): string {
  return resolve(profileDirectory, profile.dataRoot);
}

export function localExecutionEnvironmentProfileValue(
  profile: LocalExecutionEnvironmentProfile,
  dataRoot: string,
): CanonicalValue {
  const selections = (items: readonly LocalExecutionEnvironmentAdapterSelection[]) =>
    Object.fromEntries(items.map(({ instance, ...selection }) => [instance, selection]));
  return {
    format: profile.format,
    dataRoot,
    credentials: selections(profile.credentials),
    endpoints: selections(profile.endpoints),
    bindings: profile.bindings,
  };
}
