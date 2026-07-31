import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fail } from "./diagnostics.js";
import type { KernelRegistry } from "./kernel.js";
import type { PlanIR } from "./model.js";
import type { KernelProjection } from "./runtime-contract.js";
import { sha256, stableJson } from "./util.js";

type ArtifactOutput = {
  type: string;
  uri?: string;
  value?: unknown;
  contentDigest: string;
};

type ArtifactBinding = {
  instanceIdentity: string;
  executionDigest: string;
  outputs: Record<string, ArtifactOutput>;
};

type ArtifactFile = {
  contract: "svml.artifacts.v1";
  bindings: ArtifactBinding[];
};

export type ArtifactResolution = {
  projections: Map<string, KernelProjection>;
  outputDigests: Map<string, string>;
  bindingExecutionDigests: Map<string, string>;
  manifestHash?: string;
  verified: boolean;
};

function externalUri(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
}

async function resolveOutput(
  artifactFile: string,
  output: ArtifactOutput,
): Promise<Record<string, unknown>> {
  if (output.type === "Text") {
    if (typeof output.value !== "string" || output.uri !== undefined) {
      fail("artifact_text", "Text artifact output requires value and forbids uri.");
    }
    const digest = sha256(output.value);
    if (digest !== output.contentDigest) {
      fail("artifact_digest", "Text artifact contentDigest does not match its value.");
    }
    return { type: "Text", value: output.value, contentDigest: digest };
  }
  if (!["Image", "Video", "Audio"].includes(output.type)) {
    if (output.uri !== undefined || output.value === undefined) {
      fail("artifact_typed_value", `${output.type} artifact output requires value and forbids uri.`);
    }
    const digest = sha256(stableJson(output.value));
    if (digest !== output.contentDigest) {
      fail("artifact_digest", `${output.type} artifact contentDigest does not match its value.`);
    }
    return output.value as Record<string, unknown>;
  }
  if (typeof output.uri !== "string" || output.value !== undefined) {
    fail("artifact_media", `${output.type} artifact output requires uri and forbids value.`);
  }
  const uri = externalUri(output.uri)
    ? output.uri
    : pathToFileURL(resolve(dirname(artifactFile), output.uri)).href;
  if (!uri.startsWith("file:")) {
    fail(
      "artifact_unverifiable_uri",
      `Prototype artifact binding requires a local file URI, received "${uri}".`,
    );
  }
  let content: Buffer;
  try {
    content = await readFile(fileURLToPath(uri));
  } catch (error) {
    fail(
      "artifact_read",
      `Could not read bound artifact "${uri}": ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  const digest = sha256(content);
  if (digest !== output.contentDigest) {
    fail("artifact_digest", `Artifact "${uri}" does not match contentDigest.`);
  }
  return {
    type: output.type,
    source: uri,
    absoluteSource: uri,
    contentDigest: digest,
  };
}

export async function resolveArtifactFile(
  file: string | undefined,
  plan: PlanIR,
  kernels: KernelRegistry,
): Promise<ArtifactResolution> {
  const capabilityInstances = plan.instances.filter(
    (instance) => kernels.get(instance.kernel)?.profile === "capability-v1",
  );
  if (!capabilityInstances.length) {
    if (file) {
      fail("artifact_unexpected", "An artifact file was provided, but the Plan has no capability instances.");
    }
    return {
      projections: new Map(),
      outputDigests: new Map(),
      bindingExecutionDigests: new Map(),
      verified: true,
    };
  }
  if (!file) {
    fail(
      "artifact_file_required",
      `Plan contains ${capabilityInstances.length} capability instance(s); provide --artifacts. No provider is invoked implicitly.`,
    );
  }
  const absolute = resolve(file);
  let source: string;
  let parsed: unknown;
  try {
    source = await readFile(absolute, "utf8");
    parsed = JSON.parse(source);
  } catch (error) {
    fail(
      "artifact_file_read",
      `Could not read artifact bindings ${absolute}: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  if (
    !parsed
    || typeof parsed !== "object"
    || (parsed as { contract?: string }).contract !== "svml.artifacts.v1"
    || !Array.isArray((parsed as { bindings?: unknown }).bindings)
  ) {
    fail("artifact_contract", `${absolute} is not an svml.artifacts.v1 document.`);
  }
  const artifactFile = parsed as ArtifactFile;
  const byIdentity = new Map<string, ArtifactBinding>();
  for (const binding of artifactFile.bindings) {
    if (byIdentity.has(binding.instanceIdentity)) {
      fail("artifact_duplicate_binding", `Artifact identity "${binding.instanceIdentity}" is repeated.`);
    }
    byIdentity.set(binding.instanceIdentity, binding);
  }
  const projections = new Map<string, KernelProjection>();
  const outputDigests = new Map<string, string>();
  const bindingExecutionDigests = new Map<string, string>();
  for (const instance of capabilityInstances) {
    const manifest = kernels.get(instance.kernel)!;
    const binding = byIdentity.get(instance.identity);
    if (!binding) {
      fail("artifact_binding_missing", `Capability instance "${instance.id}" has no artifact binding.`);
    }
    const outputPorts = manifest.ports.filter((port) => port.direction === "output");
    const unknown = Object.keys(binding.outputs).find(
      (name) => !outputPorts.some((port) => port.name === name),
    );
    if (unknown) {
      fail("artifact_output_unknown", `Capability "${instance.id}" has no output port "${unknown}".`);
    }
    const outputs: Record<string, unknown> = {};
    for (const port of outputPorts) {
      const descriptor = binding.outputs[port.name];
      if (!descriptor) {
        if (port.cardinality === "one" || port.cardinality === "one-or-more") {
          fail("artifact_output_missing", `Capability "${instance.id}" requires output "${port.name}".`);
        }
        continue;
      }
      if (descriptor.type !== port.type) {
        fail(
          "artifact_output_type",
          `Capability "${instance.id}.${port.name}" requires ${port.type}, received ${descriptor.type}.`,
        );
      }
      outputs[port.name] = await resolveOutput(absolute, descriptor);
    }
    projections.set(instance.id, { outputs });
    outputDigests.set(
      instance.id,
      sha256(stableJson(Object.fromEntries(Object.entries(binding.outputs)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, descriptor]) => [
          name,
          { type: descriptor.type, contentDigest: descriptor.contentDigest },
        ])))),
    );
    bindingExecutionDigests.set(instance.id, binding.executionDigest);
    byIdentity.delete(instance.identity);
  }
  if (byIdentity.size) {
    fail(
      "artifact_binding_stale",
      `Artifact file contains ${byIdentity.size} binding(s) outside the reachable capability Plan.`,
    );
  }
  return {
    projections,
    outputDigests,
    bindingExecutionDigests,
    manifestHash: sha256(source),
    verified: true,
  };
}

export function verifyArtifactExecutionDigests(
  artifacts: ArtifactResolution,
  plan: PlanIR,
): void {
  for (const [id, expected] of artifacts.bindingExecutionDigests) {
    const instance = plan.instances.find((candidate) => candidate.id === id);
    if (!instance || instance.executionDigest !== expected) {
      fail(
        "artifact_execution_digest",
        `Artifact binding for "${id}" was produced for a different executionDigest.`,
      );
    }
  }
}
