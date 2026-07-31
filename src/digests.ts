import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  AttributeValue,
  PlanIR,
  SourceNode,
} from "./model.js";
import type { KernelRegistry } from "./kernel.js";
import { topologicalInstances } from "./plan.js";
import { sha256, stableJson } from "./util.js";

function externalUri(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
}

function materialUri(module: string, source: string): string {
  if (source.startsWith("file:")) return source;
  if (externalUri(source)) return source;
  return pathToFileURL(isAbsolute(source) ? source : resolve(dirname(module), source)).href;
}

async function materialDigest(
  module: string,
  source: string,
): Promise<{ digest: string; status: "content" | "unresolved-source" }> {
  const uri = materialUri(module, source);
  if (!uri.startsWith("file:")) {
    return {
      digest: sha256(`unresolved\0${uri}`),
      status: "unresolved-source",
    };
  }
  try {
    return {
      digest: sha256(await readFile(fileURLToPath(uri))),
      status: "content",
    };
  } catch {
    return {
      digest: sha256(`unresolved\0${uri}`),
      status: "unresolved-source",
    };
  }
}

function canonicalNodes(
  nodes: SourceNode[],
  canonicalValue: (value: AttributeValue) => unknown,
): unknown[] {
  return nodes.map((node) => node.kind === "text"
    ? { kind: "text", value: node.value }
    : {
        kind: "element",
        name: node.name,
        attributes: Object.fromEntries(Object.entries(node.attributes)
          .filter(([name]) => name !== "class")
          .map(([name, value]) => [name, canonicalValue(value)])),
        children: canonicalNodes(node.children, canonicalValue),
      });
}

export async function attachExecutionDigests(
  plan: PlanIR,
  kernels: KernelRegistry,
  dependencyDigestOverrides: ReadonlyMap<string, string> = new Map(),
): Promise<void> {
  for (const value of plan.values) {
    if (value.type === "Text") {
      value.contentDigest = sha256(value.value ?? "");
      value.digestStatus = "content";
      continue;
    }
    const material = await materialDigest(value.module, value.source ?? "");
    value.contentDigest = material.digest;
    value.digestStatus = material.status;
  }

  const values = new Map(plan.values.map((value) => [value.id, value]));
  const instances = new Map(plan.instances.map((instance) => [instance.id, instance]));
  const declarationIds = [...values.keys(), ...instances.keys()]
    .sort((left, right) => right.length - left.length);
  for (const instance of topologicalInstances(plan)) {
    const manifest = kernels.get(instance.kernel);
    if (!manifest) continue;
    const canonicalValue = (value: AttributeValue): unknown => {
      if (!value || typeof value !== "object" || value.kind !== "reference") return value;
      if (value.path.startsWith("script.")) return { script: value.path };
      const owner = declarationIds.find(
        (id) => value.path === id || value.path.startsWith(`${id}.`),
      );
      if (!owner) return { unresolved: value.path };
      const dependency = values.get(owner) ?? instances.get(owner);
      const identity = dependency?.identity ?? owner;
      const tail = value.path === owner ? "" : value.path.slice(owner.length + 1);
      return { identity, tail };
    };
    const dependencyDigests = instance.dependencies.map((id) => {
      const dependency = values.get(id) ?? instances.get(id);
      return {
        identity: dependency?.identity ?? id,
        digest: dependencyDigestOverrides.get(id) ?? ("contentDigest" in (dependency ?? {})
          ? (dependency as { contentDigest?: string }).contentDigest
          : (dependency as { executionDigest?: string } | undefined)?.executionDigest),
      };
    }).sort((left, right) => left.identity.localeCompare(right.identity));
    instance.executionDigest = sha256(stableJson({
      abi: manifest.abiVersion,
      manifest: manifest.sourceHash,
      implementation: manifest.implementationHash,
      expansion: instance.expansionDigest,
      attributes: Object.fromEntries(Object.entries(instance.attributes)
        .filter(([name]) => !["id", "class"].includes(name))
        .map(([name, value]) => [name, canonicalValue(value)])),
      children: canonicalNodes(instance.children, canonicalValue),
      dependencies: dependencyDigests,
    }));
  }
}
