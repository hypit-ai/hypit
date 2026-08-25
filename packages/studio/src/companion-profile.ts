import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { installDistributionPackageResolution, loadNodePackageSelection } from "@hypit/package-loader-node";
import { studioContributionFromPackage } from "@hypit/studio-adapter";
import type { StudioTrackCompanion, StudioFilmCompanion, StudioScriptCompanion } from "@hypit/studio-adapter";

import { fallbackStudioTrackCompanions } from "./fallback-companions.js";
import { StudioCompanionRegistry } from "./studio-registry.js";

export const officialStudioCompanionPackages = [
  "@hypit/audio-track-studio",
  "@hypit/caption-fine-studio",
  "@hypit/comment-sticker-studio",
  "@hypit/deck-track-studio",
  "@hypit/film-studio",
  "@hypit/media-track-studio",
  "@hypit/ranking-studio",
  "@hypit/screen-overlay-studio",
  "@hypit/script-studio",
  "@hypit/speech-track-studio",
  "@hypit/typography-track-studio",
] as const;

export const studioProfileFilename = "hypit.studio.json";

export type StudioProfile = {
  readonly format: "hypit.studio-profile@1";
  readonly companionPackages: readonly string[];
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
  if (!Array.isArray(item.companionPackages)
    || item.companionPackages.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${path}.companionPackages must be an array of installed package names`);
  }
  const companionPackages = item.companionPackages as string[];
  if (new Set(companionPackages).size !== companionPackages.length) {
    throw new Error(`${path}.companionPackages repeats a package`);
  }
  const rawReplace = item.replace === undefined ? {} : object(item.replace, `${path}.replace`);
  const replace: Record<string, string> = {};
  for (const [target, replacement] of Object.entries(rawReplace)) {
    if (target.length === 0 || typeof replacement !== "string" || replacement.length === 0) {
      throw new Error(`${path}.replace must map companion ids to companion ids`);
    }
    replace[target] = replacement;
  }
  return { format: "hypit.studio-profile@1", companionPackages, replace };
}

/** Read only the explicit project profile. A missing conventional profile means no project Companions. */
export async function loadProjectStudioCompanions(input: {
  readonly workspaceRoot: string;
  readonly packageRoot: string;
  readonly distributionPackageRoot?: string;
  readonly profile?: string;
}): Promise<{
  readonly tracks: readonly StudioTrackCompanion[];
  readonly films: readonly StudioFilmCompanion[];
  readonly scripts: readonly StudioScriptCompanion[];
  readonly replace: Readonly<Record<string, string>>;
  readonly profile?: string;
}> {
  const path = resolve(input.profile ?? resolve(input.workspaceRoot, studioProfileFilename));
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (input.profile === undefined && error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { tracks: [], films: [], scripts: [], replace: {} };
    }
    throw error;
  }
  const profile = parseStudioProfile(JSON.parse(text), path);
  const packages = await loadNodePackageSelection(profile.companionPackages, input.packageRoot, {
    ...(input.distributionPackageRoot === undefined
      ? {}
      : { fallbackRoots: [input.distributionPackageRoot] }),
  });
  const bySpecifier = new Map(packages.map((item) => [item.specifier, item] as const));
  const contributions = profile.companionPackages.map((specifier) => {
    const item = bySpecifier.get(specifier);
    if (item === undefined) throw new Error(`${path} did not resolve selected Studio companion package ${specifier}`);
    const found = studioContributionFromPackage(item.specifier, item.contribution.hostFacets ?? []);
    if (found.tracks.length + found.films.length + found.scripts.length === 0) {
      throw new Error(`${path} selects ${item.specifier}, which provides no Studio Companion facet`);
    }
    return found;
  });
  return {
    tracks: contributions.flatMap((item) => item.tracks),
    films: contributions.flatMap((item) => item.films),
    scripts: contributions.flatMap((item) => item.scripts),
    replace: profile.replace,
    profile: path,
  };
}

/** Assemble the one immutable Registry shared by preflight, snapshot and UI for this session. */
export async function loadStudioCompanionRegistry(input: {
  readonly workspaceRoot: string;
  readonly packageRoot: string;
  readonly distributionPackageRoot: string;
  readonly profile?: string;
}): Promise<StudioCompanionRegistry> {
  installDistributionPackageResolution([input.distributionPackageRoot]);
  const officialPackages = await loadNodePackageSelection(
    officialStudioCompanionPackages,
    input.distributionPackageRoot,
  );
  const official = officialPackages.map((item) =>
    studioContributionFromPackage(item.specifier, item.contribution.hostFacets ?? []));
  const project = await loadProjectStudioCompanions(input);
  return new StudioCompanionRegistry(
    [...fallbackStudioTrackCompanions, ...official.flatMap((item) => item.tracks), ...project.tracks],
    {
      replace: project.replace,
      films: [...official.flatMap((item) => item.films), ...project.films],
      scripts: [...official.flatMap((item) => item.scripts), ...project.scripts],
    },
  );
}
