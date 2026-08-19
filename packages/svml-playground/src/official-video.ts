/**
 * The official video packages understood by this preview application.
 *
 * This is deliberately application-local composition. Hypit packages do
 * not register themselves with a central video catalogue and do not know that
 * the Playground exists. The Playground chooses the packages it previews,
 * then reads the activation each package already publishes for normal Hosts.
 */
import { registerProducerFacets, registerTypeValidatorFacets } from "@hypit/component-kit";
import { createResolvedClosure } from "@hypit/core";
import { ProducerRegistry } from "@hypit/driver-node";
import {
  AuthorFrontendRegistry,
  installAuthorFrontendHostFacets,
} from "@hypit/elaborator";
import {
  createMarkupAuthorFrontend,
  installMarkupSurfaceHostFacets,
  MarkupSurfaceRegistry,
} from "@hypit/markup";
import type { MarkupSurfaceRegistryLike } from "@hypit/markup";
import { loadNodePackageSelection } from "@hypit/package-loader-node";
import type { ModuleRef, ResolvedModuleClosure } from "@hypit/protocol";
import { TypeValidatorRegistry } from "@hypit/validation";

const OFFICIAL_VIDEO_PACKAGES = [
  "@hypit/audio-track",
  "@hypit/background-removal",
  "@hypit/caption",
  "@hypit/caption-fine",
  "@hypit/caption-gemini",
  "@hypit/comment-sticker",
  "@hypit/deck-track",
  "@hypit/estimate",
  "@hypit/film",
  "@hypit/fonts-open",
  "@hypit/gemini-omni",
  "@hypit/gpt-image",
  "@hypit/grok-imagine",
  "@hypit/image-compose",
  "@hypit/image-transform",
  "@hypit/media",
  "@hypit/media-pipeline",
  "@hypit/media-track",
  "@hypit/mimo-tts",
  "@hypit/minimax-h3",
  "@hypit/nano-banana",
  "@hypit/ranking",
  "@hypit/render-hyperframes",
  "@hypit/screen-overlay",
  "@hypit/script",
  "@hypit/seedance",
  "@hypit/seedream",
  "@hypit/spatial",
  "@hypit/speech-spine",
  "@hypit/svs",
  "@hypit/text",
  "@hypit/typography-track",
  "@hypit/whisperx",
] as const;

/**
 * Packages a previewed Source declares that the official list does not carry,
 * and the directory they are installed under.
 *
 * A Source is free to import a package this application has never heard of —
 * a project-local component is the normal case, not an exception — so the
 * preview loads what the Source actually names in addition to the official
 * list, resolved from the project rather than from this application.
 */
let projectPackages: readonly string[] = [];
let projectRoot: string | undefined;

export function usePreviewPackages(packages: readonly string[], root: string): void {
  // The domain is built once, and the packages a Source imports are stable across its edits. Once
  // the domain is loading (or loaded), a later reading of the same Source must not re-specify them:
  // the first call wins, and later ones are ignored rather than throwing, because a watcher-driven
  // re-read is the normal path rather than an error.
  if (loading !== undefined) return;
  projectPackages = packages;
  projectRoot = root;
}

/** The package specifiers a Source imports, with any logical version suffix removed. */
export function importedPackages(source: string): readonly string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/<import\b[^>]*\bfrom\s*=\s*"([^"]+)"/gu)) {
    const specifier = match[1]!;
    const suffix = specifier.lastIndexOf("@");
    found.add(suffix > 0 && /^\d+$/u.test(specifier.slice(suffix + 1)) ? specifier.slice(0, suffix) : specifier);
  }
  return [...found];
}

type OfficialVideoDomain = {
  readonly closure: ResolvedModuleClosure;
  readonly surfaces: MarkupSurfaceRegistry;
  readonly producers: ProducerRegistry;
  readonly validators: TypeValidatorRegistry;
  readonly resolveModule: (specifier: string) => ModuleRef | undefined;
  readonly frontends: (surfaces?: MarkupSurfaceRegistryLike) => AuthorFrontendRegistry;
};

let loading: Promise<OfficialVideoDomain> | undefined;

async function loadOfficialVideoDomain(): Promise<OfficialVideoDomain> {
  const selection = [...new Set([...OFFICIAL_VIDEO_PACKAGES, ...projectPackages])];
  const loaded = await loadNodePackageSelection(selection, projectRoot ?? import.meta.dirname);
  const contributions = loaded.map((item) => item.contribution);
  const manifests = contributions.flatMap((item) =>
    (item.modules ?? []).map((module) => module.manifest));
  const closure = createResolvedClosure(manifests);

  const modules = new Map<string, ModuleRef>();
  for (const contribution of contributions) {
    for (const module of contribution.modules ?? []) {
      const ref = { name: module.manifest.name, version: module.manifest.version };
      for (const specifier of [
        module.manifest.name,
        `${module.manifest.name}@${module.manifest.version}`,
        ...(module.specifiers ?? []),
      ]) modules.set(specifier, ref);
    }
  }
  const resolveModule = (specifier: string): ModuleRef | undefined => modules.get(specifier);

  const facets = contributions.flatMap((item) => item.hostFacets ?? []);
  const surfaces = new MarkupSurfaceRegistry();
  installMarkupSurfaceHostFacets(facets, surfaces);

  const components = contributions.flatMap((item) => item.components ?? []);
  const producers = new ProducerRegistry();
  const validators = new TypeValidatorRegistry();
  for (const component of components) {
    registerProducerFacets(producers, component.producers ?? []);
    registerTypeValidatorFacets(validators, component.validators ?? []);
  }

  return {
    closure,
    surfaces,
    producers,
    validators,
    resolveModule,
    frontends(registry = surfaces) {
      const frontends = new AuthorFrontendRegistry();
      frontends.register(createMarkupAuthorFrontend({
        registry,
        resolveModule(request) {
          const found = resolveModule(request.from);
          if (found === undefined) throw new Error(`No package installed under the previewed project declares ${request.from}.`);
          return found;
        },
      }));
      installAuthorFrontendHostFacets(facets, frontends);
      return frontends;
    },
  };
}

/** Load the preview application's package composition once per process. */
export async function officialVideoDomain(): Promise<OfficialVideoDomain> {
  loading ??= loadOfficialVideoDomain();
  return await loading;
}
