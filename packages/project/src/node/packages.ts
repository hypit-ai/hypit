import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createProjectPackageEnvironment,
  assertNpmPackageName,
  type HypitPackageModule,
  type ProjectManifest,
  type ProjectPackageEnvironment,
} from "../index.js";

export function createNodeProjectPackageResolver(root: string): (name: string, entry: string, subject: string) => string {
  const path = resolve(root, "package.json");
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Project package.json must be an object at ${path}.`);
  const declared = value as {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const require = createRequire(path);
  return (name, subpath, subject) => {
    assertNpmPackageName(name);
    const specifier = `${name}/${subpath}`;
    if (![declared.dependencies, declared.optionalDependencies, declared.devDependencies]
      .some(group => typeof group === "object" && group !== null && Object.hasOwn(group, name))) {
      throw new Error(`${subject} requires ${name}. Declare it in the Project package.json.`);
    }
    try {
      const installed = realpathSync(resolve(root, "node_modules", name));
      const modulePath = realpathSync(require.resolve(specifier));
      const entry = relative(installed, modulePath);
      if (entry === "" || isAbsolute(entry) || entry === ".." || entry.startsWith(`..${sep}`)) {
        throw new Error(`The ${specifier} export resolves outside the Project's installed package.`);
      }
      return modulePath;
    } catch (error) {
      throw new Error(`${subject} requires ${specifier} from the Project installation.`, {
        cause: error,
      });
    }
  };
}

export async function loadNodeProjectPackageEnvironment(
  root: string,
  manifest: ProjectManifest,
): Promise<ProjectPackageEnvironment> {
  const installed = createNodeProjectPackageResolver(root);
  const modules: HypitPackageModule[] = [];
  for (const selection of manifest.packages) {
    const modulePath = installed(selection.name, "hypit", "Project manifest activation");
    const imported = await import(pathToFileURL(modulePath).href) as Readonly<Record<string, unknown>>;
    if (!Object.hasOwn(imported, "hypitPackage")) {
      throw new Error(`Project package ${selection.name} export ./hypit does not declare hypitPackage.`);
    }
    modules.push(imported.hypitPackage as HypitPackageModule);
  }
  return createProjectPackageEnvironment(manifest, modules);
}
