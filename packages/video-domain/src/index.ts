/**
 * Every package a video Source may name, assembled into the registries a
 * compiler needs.
 *
 * Nothing here is new behaviour. Each package already declares its own Types,
 * Surfaces, Producers and Validators in its activation; this module only
 * collects them so a caller that is not the CLI - a test, or a preview - can
 * compile and execute a Source without a package lock, a filesystem scan or a
 * Provider.
 */

import { artifactManifest } from "@narratage/artifact";
import { compositionManifest } from "@narratage/composition";
import { mediaManifest } from "@narratage/media";
import { narrativeManifest } from "@narratage/narrative";
import { programSpaceManifest } from "@narratage/program-space";
import { semanticMapManifest } from "@narratage/semantic-map";
import { spatialManifest } from "@narratage/spatial";
import { speechManifest } from "@narratage/speech";
import { speechEvidenceManifest } from "@narratage/speech-evidence";
import { temporalManifest } from "@narratage/temporal";
import { generationManifest } from "@narratage/generation";
import { speechBasisManifest } from "@narratage/speech-basis";
import { speechAlignmentManifest } from "@narratage/speech-alignment";
import { visualIrManifest } from "@narratage/visual-ir";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { registerProducerFacets, registerTypeValidatorFacets } from "@narratage/component-kit";
import type { ComponentPackage } from "@narratage/component-kit";
import { createResolvedClosure } from "@narratage/core";
import { ProducerRegistry } from "@narratage/driver-node";
import {
  AuthorFrontendRegistry, installAuthorFrontendHostFacets,
} from "@narratage/elaborator";
import { createMarkupAuthorFrontend, installMarkupSurfaceHostFacets, MarkupSurfaceRegistry } from "@narratage/markup";
import type { MarkupSurfaceRegistryLike } from "@narratage/markup";
import type { ModuleManifest, ModuleRef, ResolvedModuleClosure } from "@narratage/protocol";
import { TypeValidatorRegistry } from "@narratage/validation";

/**
 * Types with no Surface of their own. A Source never writes these tags, but
 * every Type a Surface produces has to resolve against something.
 */
export const videoContractManifests = [
  artifactManifest,
  narrativeManifest,
  mediaManifest,
  programSpaceManifest,
  speechManifest,
  speechEvidenceManifest,
  semanticMapManifest,
  spatialManifest,
  temporalManifest,
  generationManifest,
  speechBasisManifest,
  speechAlignmentManifest,
  visualIrManifest,
  compositionManifest,
] as const;

/** The shape every package's `activation.ts` default-exports. */
export type VideoDomainPackage = {
  readonly name: string;
  readonly modules?: readonly {
    readonly manifest: ModuleManifest;
    /** Absent on packages a Source reaches through another module rather than by name. */
    readonly specifiers?: readonly string[];
  }[];
  readonly components?: readonly ComponentPackage[];
  readonly hostFacets?: readonly unknown[];
  /** The directory it was discovered in; an activation does not name itself. */
  readonly from?: string;
  /** Sources that are not markup, such as a Style Sheet. */
};

/**
 * Discover every installed package, the way the package loader does: each one
 * declares where its activation lives in its own `package.json`, so this list
 * is the workspace rather than a copy of it that can fall behind.
 */
async function discover(): Promise<readonly VideoDomainPackage[]> {
  if (discovered !== undefined) return discovered;
  const root = resolve(import.meta.dirname, "../..");
  const found: VideoDomainPackage[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(root, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const declared = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      readonly svml?: { readonly activation?: string };
    };
    if (declared.svml?.activation === undefined) continue;
    const loaded = await import(pathToFileURL(join(root, entry.name, declared.svml.activation)).href) as
      { readonly default?: VideoDomainPackage };
    if (loaded.default !== undefined) found.push({ ...loaded.default, from: entry.name });
  }
  discovered = found;
  return found;
}

let discovered: readonly VideoDomainPackage[] | undefined;

/** Every package a Source may `<import from="...">`. */
export async function videoDomainPackages(): Promise<readonly VideoDomainPackage[]> {
  return await discover();
}

let cachedManifests: readonly ModuleManifest[] | undefined;

async function manifests(): Promise<readonly ModuleManifest[]> {
  const seen = new Map<string, ModuleManifest>();
  for (const manifest of videoContractManifests) seen.set(manifest.name, manifest);
  for (const item of await discover()) {
    for (const declared of item.modules ?? []) seen.set(declared.manifest.name, declared.manifest);
  }
  cachedManifests = [...seen.values()];
  return cachedManifests;
}

async function components(): Promise<readonly ComponentPackage[]> {
  // Every package that carries a Validator activates itself, so the discovery
  // scan is the whole list; keyed by where it was found, because two packages
  // may each contribute a Component at the same index.
  const seen = new Map<string, ComponentPackage>();
  for (const item of await discover()) {
    for (const [index, component] of (item.components ?? []).entries()) {
      seen.set(`${item.from}:${index}`, component);
    }
  }
  return [...seen.values()];
}

/** The Types every Source in this domain may name. */
export async function videoDomainClosure(): Promise<ResolvedModuleClosure> {
  return createResolvedClosure(await manifests());
}

/** The Surfaces that decode authored markup, keyed as the frontend looks them up. */
export async function videoDomainSurfaces(): Promise<MarkupSurfaceRegistry> {
  const registry = new MarkupSurfaceRegistry();
  for (const item of await discover()) {
    installMarkupSurfaceHostFacets((item.hostFacets ?? []) as never, registry);
  }
  return registry;
}

/**
 * Every Author Frontend a Source closure can reach: the markup frontend built
 * over the Surfaces above, plus the packages that read a Source of their own
 * rather than markup.
 */
export async function videoDomainFrontends(
  resolveModule: (request: { readonly from: string }) => ModuleRef,
  /**
   * The Surfaces the markup Frontend decodes with. A caller that wants to watch
   * a decode passes its own registry over the discovered one; the Frontend is
   * built the same way either way.
   */
  surfaces?: MarkupSurfaceRegistryLike,
): Promise<AuthorFrontendRegistry> {
  const registry = new AuthorFrontendRegistry();
  registry.register(createMarkupAuthorFrontend({
    registry: surfaces ?? await videoDomainSurfaces(), resolveModule,
  }) as never);
  // A Frontend travels as a Host Facet, the same way a Surface does, so a
  // package that publishes one is never asked to name it twice.
  for (const item of await discover()) {
    installAuthorFrontendHostFacets((item.hostFacets ?? []) as never, registry as never);
  }
  return registry;
}

/** The implementations behind every Producer a fragment can name. */
export async function videoDomainProducers(): Promise<ProducerRegistry> {
  const registry = new ProducerRegistry();
  for (const component of await components()) registerProducerFacets(registry, component.producers ?? []);
  return registry;
}

/** The checks a Record must pass before it is admitted. */
export async function videoDomainValidators(): Promise<TypeValidatorRegistry> {
  const registry = new TypeValidatorRegistry();
  for (const component of await components()) registerTypeValidatorFacets(registry, component.validators ?? []);
  return registry;
}

/**
 * Resolve an `<import from="...">` specifier to the module that declares it.
 * The specifiers are the ones each package publishes, so a Source that names a
 * module this domain does not carry fails by name rather than silently.
 */
export function videoDomainModule(specifier: string): ModuleRef | undefined {
  if (discovered === undefined) {
    throw new Error("videoDomainModule needs the domain discovered first; await videoDomainClosure().");
  }
  for (const item of discovered) {
    for (const declared of item.modules ?? []) {
      if ((declared.specifiers ?? []).includes(specifier)) {
        return { name: declared.manifest.name, version: declared.manifest.version };
      }
    }
  }
  // A Source may also name a contract module directly, to write a Type it holds
  // rather than a tag it declares.
  for (const manifest of cachedManifests ?? []) {
    if (specifier === manifest.name || specifier === `${manifest.name}@${manifest.version}`) {
      return { name: manifest.name, version: manifest.version };
    }
  }
  return undefined;
}
