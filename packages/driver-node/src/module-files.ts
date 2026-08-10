import { readFile } from "node:fs/promises";

import { createResolvedClosure } from "@narratage/core";
import { parseModuleManifestText } from "@narratage/protocol";
import type { ModuleManifest, ResolvedModuleClosure } from "@narratage/protocol";

export async function loadModuleManifest(path: string): Promise<ModuleManifest> {
  return parseModuleManifestText(await readFile(path, "utf8"));
}

export async function loadResolvedClosure(paths: readonly string[]): Promise<ResolvedModuleClosure> {
  const manifests = await Promise.all(paths.map(async (path) => loadModuleManifest(path)));
  return createResolvedClosure(manifests);
}
