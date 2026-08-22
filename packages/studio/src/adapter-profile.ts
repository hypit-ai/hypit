import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { installDistributionPackageResolution, loadNodePackageSelection } from "@hypit/package-loader-node";
import { studioAdaptersFromPackage } from "@hypit/studio-adapter";
import type { StudioAdapter } from "@hypit/studio-adapter";

import { StudioAdapterRegistry } from "./studio-registry.js";

export const studioProfileFilename = "hypit.studio.json";

export type StudioProfile = {
  readonly format: "hypit.studio-profile@1";
  readonly adapterPackages: readonly string[];
  readonly replace: Readonly<Record<string, string>>;
};

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseStudioProfile(value: unknown, path: string): StudioProfile {
  const item = object(value, path);
  if (item.format !== "hypit.studio-profile@1") {
    throw new Error(`${path} has unsupported format ${String(item.format)}`);
  }
  if (!Array.isArray(item.adapterPackages)
    || item.adapterPackages.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${path}.adapterPackages must be an array of installed package names`);
  }
  const adapterPackages = item.adapterPackages as string[];
  if (new Set(adapterPackages).size !== adapterPackages.length) {
    throw new Error(`${path}.adapterPackages repeats a package`);
  }
  const rawReplace = item.replace === undefined ? {} : object(item.replace, `${path}.replace`);
  const replace: Record<string, string> = {};
  for (const [target, replacement] of Object.entries(rawReplace)) {
    if (target.length === 0 || typeof replacement !== "string" || replacement.length === 0) {
      throw new Error(`${path}.replace must map adapter ids to adapter ids`);
    }
    replace[target] = replacement;
  }
  return { format: "hypit.studio-profile@1", adapterPackages, replace };
}

/** Read only the explicit project profile. A missing conventional profile means no project adapters. */
export async function loadProjectStudioAdapters(input: {
  readonly workspaceRoot: string;
  readonly packageRoot: string;
  readonly distributionPackageRoot?: string;
  readonly profile?: string;
}): Promise<{
  readonly adapters: readonly StudioAdapter[];
  readonly replace: Readonly<Record<string, string>>;
  readonly profile?: string;
}> {
  const path = resolve(input.profile ?? resolve(input.workspaceRoot, studioProfileFilename));
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (input.profile === undefined && error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { adapters: [], replace: {} };
    }
    throw error;
  }
  const profile = parseStudioProfile(JSON.parse(text), path);
  const packages = await loadNodePackageSelection(profile.adapterPackages, input.packageRoot, {
    ...(input.distributionPackageRoot === undefined
      ? {}
      : { fallbackRoots: [input.distributionPackageRoot] }),
  });
  const bySpecifier = new Map(packages.map((item) => [item.specifier, item] as const));
  const adapters = profile.adapterPackages.flatMap((specifier) => {
    const item = bySpecifier.get(specifier);
    if (item === undefined) throw new Error(`${path} did not resolve selected Studio adapter package ${specifier}`);
    const found = studioAdaptersFromPackage(item.specifier, item.contribution.hostFacets ?? []);
    if (found.length === 0) throw new Error(`${path} selects ${item.specifier}, which provides no hypit.studio-adapter@1 facet`);
    return found;
  });
  return { adapters, replace: profile.replace, profile: path };
}

/** Assemble the one immutable Registry shared by preflight, snapshot and UI for this session. */
export async function loadStudioAdapterRegistry(input: {
  readonly workspaceRoot: string;
  readonly packageRoot: string;
  readonly distributionPackageRoot: string;
  readonly profile?: string;
}): Promise<StudioAdapterRegistry> {
  installDistributionPackageResolution([input.distributionPackageRoot]);
  const officialPackages = await loadNodePackageSelection(
    ["@hypit/studio-video-adapters"],
    input.distributionPackageRoot,
  );
  const officialAdapters = officialPackages.flatMap((item) =>
    studioAdaptersFromPackage(item.specifier, item.contribution.hostFacets ?? []));
  const project = await loadProjectStudioAdapters(input);
  return new StudioAdapterRegistry(
    [...officialAdapters, ...project.adapters],
    { replace: project.replace },
  );
}
