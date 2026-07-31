import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail } from "./diagnostics.js";
import type { KernelManifest } from "./kernel.js";
import type { PlanIR, SourceDocument } from "./model.js";
import { portableFileIdentity, stableJson } from "./util.js";

export type SvmlLock = {
  contract: "svml.lock.v1";
  compiler: {
    package: "@svml/compiler";
    version: "0.0.1";
  };
  language: {
    document: "1";
    scriptSurface: "1";
    plan: "svml.plan.v1";
  };
  target: {
    name: "hyperframes";
    version: "0.7.84";
  };
  reproducible: boolean;
  modules: NonNullable<SourceDocument["modules"]>;
  materials: Array<{
    identity: string;
    type: string;
    uri?: string;
    contentDigest: string;
    status: "content" | "unresolved-source";
  }>;
  kernels: Array<{
    name: string;
    abi: string;
    manifestUri: string;
    manifestHash: string;
    implementationUri?: string;
    implementationHash: string;
    capability?: string;
    permissions: string[];
    profile: string;
  }>;
};

export function createLock(
  document: SourceDocument,
  manifests: KernelManifest[],
  plan: PlanIR,
): SvmlLock {
  const lockUri = (uri: string): string =>
    uri.startsWith("file:")
      ? portableFileIdentity(document.file, fileURLToPath(uri))
      : uri;
  const materials = plan.values.map((value) => {
    const source = value.source;
    const absolute = source
      ? /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(source)
        ? source
        : isAbsolute(source) ? source : resolve(dirname(value.module), source)
      : undefined;
    const uri = absolute
      ? absolute.startsWith("file:")
        ? lockUri(absolute)
        : /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(absolute)
          ? absolute
          : portableFileIdentity(document.file, absolute)
      : undefined;
    return {
      identity: value.identity,
      type: value.type,
      ...(uri ? { uri } : {}),
      contentDigest: value.contentDigest ?? "",
      status: value.digestStatus ?? "unresolved-source",
    };
  }).sort((left, right) => left.identity.localeCompare(right.identity));
  return {
    contract: "svml.lock.v1",
    compiler: {
      package: "@svml/compiler",
      version: "0.0.1",
    },
    language: {
      document: "1",
      scriptSurface: "1",
      plan: "svml.plan.v1",
    },
    target: {
      name: "hyperframes",
      version: "0.7.84",
    },
    reproducible: materials.every((material) => material.status === "content"),
    modules: (document.modules ?? []).map((module) => ({
      ...module,
      uri: lockUri(module.uri),
      dependencies: module.dependencies.map(lockUri),
    })).sort((left, right) => left.uri.localeCompare(right.uri)),
    materials,
    kernels: manifests.map((manifest) => ({
      name: manifest.name,
      abi: manifest.abiVersion,
      manifestUri: portableFileIdentity(document.file, manifest.sourcePath),
      manifestHash: manifest.sourceHash,
      ...(manifest.implementationPath
        ? { implementationUri: portableFileIdentity(document.file, manifest.implementationPath) }
        : {}),
      implementationHash: manifest.implementationHash,
      ...(manifest.capability ? { capability: manifest.capability } : {}),
      permissions: manifest.permissions,
      profile: manifest.profile,
    })).sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export async function verifyLockFile(
  file: string,
  expected: SvmlLock,
): Promise<void> {
  let actual: unknown;
  try {
    actual = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(
      "lock_read",
      `Could not read SVML lock ${file}: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  if (!actual || typeof actual !== "object" || (actual as { contract?: string }).contract !== "svml.lock.v1") {
    fail("lock_contract", `${file} is not an svml.lock.v1 document.`);
  }
  if (stableJson(actual) !== stableJson(expected)) {
    fail(
      "lock_mismatch",
      `${file} does not match the resolved source closure; regenerate it with "svml lock".`,
    );
  }
}
