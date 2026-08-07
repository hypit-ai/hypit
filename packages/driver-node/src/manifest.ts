import { readFile } from "node:fs/promises";

import { createResolvedClosure } from "@svml/core";
import {
  parseModuleManifest,
  parseModuleManifestText,
} from "@svml/protocol";
import type { ModuleManifest, ResolvedModuleClosure } from "@svml/protocol";

export { parseModuleManifest, parseModuleManifestText } from "@svml/protocol";

export async function loadModuleManifest(path: string): Promise<ModuleManifest> {
  return parseModuleManifestText(await readFile(path, "utf8"));
}

export async function loadResolvedClosure(paths: readonly string[]): Promise<ResolvedModuleClosure> {
  const manifests = await Promise.all(paths.map(async (path) => loadModuleManifest(path)));
  return createResolvedClosure(manifests);
}
