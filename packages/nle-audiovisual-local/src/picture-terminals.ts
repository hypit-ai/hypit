import type { Facet } from "@hypit/facet";
import type {
  NlePictureTerminalRuntime,
  NleAudiovisualLink,
} from "@hypit/nle-audiovisual";
import type { CreateMediaExecutionEnvironmentOptions } from "@hypit/media-local/execution";
import type { ResourceStore } from "@hypit/resource-store";

export const localNlePictureTerminalFacetKind = "hypit.nle-local-picture-terminal";

export type LocalNlePictureTerminalSource = NleAudiovisualLink["pictureSources"][number];

export type LocalNlePictureTerminalContext = {
  readonly sources: readonly LocalNlePictureTerminalSource[];
  readonly resources: ResourceStore;
  readonly media?: Omit<CreateMediaExecutionEnvironmentOptions, "signal">;
  readonly signal?: AbortSignal;
};

/** Local execution supplied by the package that owns an explicitly selected Picture Terminal. */
export type LocalNlePictureTerminalProvider = {
  readonly terminal: string;
  readonly create: (context: LocalNlePictureTerminalContext) => NlePictureTerminalRuntime;
};

export type LocalNlePictureTerminalFacet = Facet & {
  readonly kind: typeof localNlePictureTerminalFacetKind;
  readonly address: string;
  readonly implementation: LocalNlePictureTerminalProvider;
};

export type LocalNlePictureTerminalOptions = {
  readonly media?: Omit<CreateMediaExecutionEnvironmentOptions, "signal">;
  readonly signal?: AbortSignal;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertProvider(
  value: unknown,
  subject: string,
): asserts value is LocalNlePictureTerminalProvider {
  assert(value !== null && typeof value === "object", `${subject} implementation is not an object.`);
  const provider = value as Partial<LocalNlePictureTerminalProvider>;
  assert(typeof provider.terminal === "string" && provider.terminal.trim().length > 0,
    `${subject} Terminal identity is empty.`);
  assert(typeof provider.create === "function", `${subject} does not implement create().`);
}

export function createLocalNlePictureTerminalFacet(
  implementation: LocalNlePictureTerminalProvider,
): LocalNlePictureTerminalFacet {
  assertProvider(implementation, "Local NLE Picture Terminal");
  return {
    kind: localNlePictureTerminalFacetKind,
    address: implementation.terminal,
    implementation,
  };
}

export function localNlePictureTerminalsFromFacets(
  facets: readonly Facet[],
): readonly LocalNlePictureTerminalProvider[] {
  const providers = new Map<string, LocalNlePictureTerminalProvider>();
  for (const facet of facets) {
    if (facet.kind !== localNlePictureTerminalFacetKind) continue;
    assertProvider(facet.implementation, `Local NLE Picture Terminal ${facet.address ?? "<unaddressed>"}`);
    const provider = facet.implementation;
    assert(facet.address === provider.terminal,
      `Local NLE Picture Terminal facet address ${facet.address ?? "<missing>"} does not match ${provider.terminal}.`);
    assert(!providers.has(provider.terminal),
      `Local NLE application has multiple executors for Picture Terminal ${provider.terminal}.`);
    providers.set(provider.terminal, provider);
  }
  return [...providers.values()];
}

/** Resolve only the exact Terminal identities selected by package-owned NLE Source projections. */
export function createLocalNlePictureTerminalRuntimes(
  facets: readonly Facet[],
  lowering: NleAudiovisualLink,
  resources: ResourceStore,
  options: LocalNlePictureTerminalOptions = {},
): readonly NlePictureTerminalRuntime[] {
  if (lowering.pictureSources.length === 0) return [];
  const providers = new Map(localNlePictureTerminalsFromFacets(facets)
    .map((provider) => [provider.terminal, provider] as const));
  const groups = new Map<string, LocalNlePictureTerminalSource[]>();
  for (const source of lowering.pictureSources) {
    groups.set(source.terminal, [...(groups.get(source.terminal) ?? []), source]);
  }
  return [...groups].map(([terminal, sources]) => {
    const provider = providers.get(terminal);
    assert(provider !== undefined,
      `Local NLE application has no selected executor for Picture Terminal ${terminal}.`);
    const runtime = provider.create({
      sources,
      resources,
      ...(options.media === undefined ? {} : { media: options.media }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    assert(runtime.capability.terminal === terminal,
      `Picture Terminal ${terminal} provider returned capability ${runtime.capability.terminal}.`);
    assert(runtime.executor.terminal === terminal,
      `Picture Terminal ${terminal} provider returned executor ${runtime.executor.terminal}.`);
    return runtime;
  });
}
