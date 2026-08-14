/**
 * The official video packages understood by this preview application.
 *
 * This is deliberately application-local composition. Narratage packages do
 * not register themselves with a central video catalogue and do not know that
 * the Playground exists. The Playground chooses the packages it previews,
 * then reads the activation each package already publishes for normal Hosts.
 */
import { registerProducerFacets, registerTypeValidatorFacets } from "@narratage/component-kit";
import { createResolvedClosure } from "@narratage/core";
import { ProducerRegistry } from "@narratage/driver-node";
import {
  AuthorFrontendRegistry,
  installAuthorFrontendHostFacets,
} from "@narratage/elaborator";
import {
  createMarkupAuthorFrontend,
  installMarkupSurfaceHostFacets,
  MarkupSurfaceRegistry,
} from "@narratage/markup";
import type { MarkupSurfaceRegistryLike } from "@narratage/markup";
import { createNodePackageInventory } from "@narratage/package-loader-node";
import type { ModuleRef, ResolvedModuleClosure } from "@narratage/protocol";
import { TypeValidatorRegistry } from "@narratage/validation";

const OFFICIAL_VIDEO_PACKAGES = [
  "@narratage/audio-track",
  "@narratage/background-removal",
  "@narratage/caption",
  "@narratage/caption-fine",
  "@narratage/caption-gemini",
  "@narratage/comment-sticker",
  "@narratage/deck-track",
  "@narratage/estimate",
  "@narratage/film",
  "@narratage/fonts-open",
  "@narratage/gemini-omni",
  "@narratage/gpt-image",
  "@narratage/grok-imagine",
  "@narratage/image-compose",
  "@narratage/image-transform",
  "@narratage/media",
  "@narratage/media-pipeline",
  "@narratage/media-track",
  "@narratage/mimo-tts",
  "@narratage/minimax-h3",
  "@narratage/nano-banana",
  "@narratage/ranking",
  "@narratage/render-hyperframes",
  "@narratage/screen-overlay",
  "@narratage/script",
  "@narratage/seedance",
  "@narratage/seedream",
  "@narratage/spatial",
  "@narratage/speech-spine",
  "@narratage/svs",
  "@narratage/text",
  "@narratage/typography-track",
  "@narratage/whisperx",
] as const;

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
  const loaded = await createNodePackageInventory(OFFICIAL_VIDEO_PACKAGES, import.meta.dirname);
  const contributions = loaded.packages.map((item) => item.contribution);
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
          if (found === undefined) throw new Error(`No official preview package declares ${request.from}.`);
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
