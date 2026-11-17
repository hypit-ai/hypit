import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createProjectPackageEnvironment,
  type HypitPackageModule,
  type ProjectManifest,
  type ProjectPackageEnvironment,
} from "../index.js";

export async function loadNodeProjectPackageEnvironment(
  root: string,
  manifest: ProjectManifest,
): Promise<ProjectPackageEnvironment> {
  const require = createRequire(resolve(root, "package.json"));
  const modules: HypitPackageModule[] = [];
  for (const selection of manifest.packages) {
    const specifier = `${selection.name}/hypit`;
    let modulePath: string;
    try {
      modulePath = require.resolve(specifier);
    } catch (error) {
      throw new Error(`Project package ${selection.name} does not provide its required ${specifier} export.`, {
        cause: error,
      });
    }
    const imported = await import(pathToFileURL(modulePath).href) as Readonly<Record<string, unknown>>;
    if (!Object.hasOwn(imported, "hypitPackage")) {
      throw new Error(`Project package ${selection.name} export ${specifier} does not declare hypitPackage.`);
    }
    modules.push(imported.hypitPackage as HypitPackageModule);
  }
  return createProjectPackageEnvironment(manifest, modules);
}
