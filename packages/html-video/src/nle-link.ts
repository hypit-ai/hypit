import type { AudioOutputSampling, AudioProgram } from "@hypit/audio-program";
import { sealAudioProgram } from "@hypit/audio-program";
import type { AudiovisualProgram } from "@hypit/audiovisual";
import {
  appendAudiovisualAudioSource,
  createAudiovisualAudioSourceSet,
  lowerAudiovisualAudioProgram,
  preparedMediaAudioSource,
  sealAudiovisualAudioSource,
  type AudiovisualAudioSource,
} from "@hypit/audiovisual-audio";
import {
  assertAudiovisualHtmlSourceSet,
  audiovisualProgramHtmlSource,
  lowerAudiovisualPictureProgramToHtmlProgram,
  preparedMediaHtmlSource,
  type AudiovisualHtmlSource,
  type AudiovisualHtmlSourceSet,
} from "@hypit/audiovisual-html";
import type { Facet } from "@hypit/facet";
import type { HtmlProgram } from "@hypit/html-program";
import {
  createNleLoweringHost,
  findNleItem,
  findNleMedia,
  lowerNleProjectToAudiovisual,
  nlePackagesFromFacets,
  type NleComponentItem,
  type NleLoweringContext,
  type NleLoweringHost,
  type NleMediaResolver,
  type NlePackage,
  type NlePackageSymbol,
  type NleProject,
  type NleResolvedMedia,
  type NleResolvedItemSource,
} from "@hypit/nle";
import { nlePackageSymbolKey } from "@hypit/nle";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import type { TemporalRate } from "@hypit/temporal/algebra";

export type NleTerminalComponentResolution = {
  readonly html?: AudiovisualHtmlSource;
  /** Sampling closes an Audio implementation only after an output policy exists. */
  readonly audio?: (sampling: AudioOutputSampling) => AudiovisualAudioSource;
};

export type NleHtmlVideoComponentResolver = {
  readonly component: NlePackageSymbol;
  readonly resolve: (
    item: NleComponentItem,
    context: NleLoweringContext,
    source: NleResolvedItemSource,
  ) => NleTerminalComponentResolution;
};

export type NleHtmlVideoPackage = {
  readonly components?: readonly NleHtmlVideoComponentResolver[];
};

export const nleHtmlVideoPackageFacetAbi = "hypit.html-video-nle-package@1";

export type NleHtmlVideoPackageFacet = Facet & {
  readonly abi: typeof nleHtmlVideoPackageFacetAbi;
  readonly implementation: NleHtmlVideoPackage;
};

export type NleTerminalLinkHost = NleLoweringHost & {
  readonly resolveTerminalComponent: (
    item: NleComponentItem,
    context: NleLoweringContext,
    source: NleResolvedItemSource,
  ) => NleTerminalComponentResolution;
};

export type NleTerminalLink = {
  readonly program: AudiovisualProgram;
  readonly htmlSources: AudiovisualHtmlSourceSet;
  readonly audioSources: readonly {
    readonly source: string;
    readonly output: string;
    readonly resolve: (sampling: AudioOutputSampling) => AudiovisualAudioSource;
  }[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function createNleHtmlVideoPackageFacet(
  implementation: NleHtmlVideoPackage,
): NleHtmlVideoPackageFacet {
  const keys = new Set<string>();
  for (const resolver of implementation.components ?? []) {
    const key = nlePackageSymbolKey(resolver.component);
    assert(!keys.has(key), `NLE HTML-video package repeats Component resolver ${key}.`);
    assert(typeof resolver.resolve === "function", `NLE HTML-video Component resolver ${key} is not callable.`);
    keys.add(key);
  }
  return { abi: nleHtmlVideoPackageFacetAbi, implementation };
}

export function nleHtmlVideoPackagesFromFacets(facets: readonly Facet[]): readonly NleHtmlVideoPackage[] {
  return facets.flatMap((facet) => facet.abi === nleHtmlVideoPackageFacetAbi
    ? [(facet as NleHtmlVideoPackageFacet).implementation]
    : []);
}

export function createNleTerminalLinkHost(
  packages: readonly NlePackage[],
  terminalPackages: readonly NleHtmlVideoPackage[],
  resolveMedia?: NleMediaResolver,
): NleTerminalLinkHost {
  const core = createNleLoweringHost(packages, resolveMedia);
  const components = new Map<string, NleHtmlVideoComponentResolver>();
  for (const pack of terminalPackages) {
    for (const resolver of pack.components ?? []) {
      const key = nlePackageSymbolKey(resolver.component);
      assert(!components.has(key), `NLE HTML-video Host has multiple Component resolvers for ${key}.`);
      assert(typeof resolver.resolve === "function", `NLE HTML-video Component resolver ${key} is not callable.`);
      components.set(key, resolver);
    }
  }
  return {
    ...core,
    resolveTerminalComponent: (item, context, source) => {
      const key = nlePackageSymbolKey(item.component);
      const resolver = components.get(key);
      assert(resolver !== undefined, `NLE Component ${key} has no HTML-video terminal resolver.`);
      return resolver.resolve(item, context, source);
    },
  };
}

export function createNleTerminalLinkHostFromFacets(
  facets: readonly Facet[],
  resolveMedia?: NleMediaResolver,
): NleTerminalLinkHost {
  return createNleTerminalLinkHost(
    nlePackagesFromFacets(facets),
    nleHtmlVideoPackagesFromFacets(facets),
    resolveMedia,
  );
}

function addHtmlSource(sources: Map<string, AudiovisualHtmlSource>, source: AudiovisualHtmlSource): void {
  const key = `${source.source}\u0000${source.output}`;
  const existing = sources.get(key);
  if (existing !== undefined) {
    assert(JSON.stringify(existing) === JSON.stringify(source),
      `NLE terminal linking resolved conflicting HTML implementations for ${source.source}.${source.output}.`);
    return;
  }
  sources.set(key, structuredClone(source));
}

/**
 * Compile editable structure once, then link only its selected Source outputs to terminal values.
 * The project/program maps live for this call only and never become NLE or AVIR metadata.
 */
export function linkNleProjectTerminals(
  project: NleProject,
  host: NleTerminalLinkHost,
): NleTerminalLink {
  const programs = new Map<NleProject, AudiovisualProgram>();
  const components = new Map<NleProject, Map<string, NleResolvedItemSource & NleTerminalComponentResolution>>();
  const media = new Map<NleProject, Map<string, NleResolvedMedia>>();
  const structuralHost: NleLoweringHost = {
    ...host,
    resolveMedia(declaration, context) {
      let byMedia = media.get(context.project);
      if (byMedia === undefined) {
        byMedia = new Map();
        media.set(context.project, byMedia);
      }
      const cached = byMedia.get(declaration.id);
      if (cached !== undefined) return cached;
      const resolved = host.resolveMedia(declaration, context);
      byMedia.set(declaration.id, resolved);
      return resolved;
    },
    resolveComponent(item, context) {
      const resolved = host.resolveComponent(item, context);
      const terminal = host.resolveTerminalComponent(item, context, resolved);
      let byItem = components.get(context.project);
      if (byItem === undefined) {
        byItem = new Map();
        components.set(context.project, byItem);
      }
      byItem.set(item.id, { ...resolved, ...terminal });
      return resolved;
    },
  };
  const program = lowerNleProjectToAudiovisual(project, structuralHost, {
    lowered: (nestedProject, nestedProgram) => programs.set(nestedProject, nestedProgram),
  });

  const link = (current: NleProject): NleTerminalLink => {
    const currentProgram = programs.get(current);
    assert(currentProgram !== undefined, `NLE Project ${current.id} was not structurally lowered.`);
    const htmlSources = new Map<string, AudiovisualHtmlSource>();
    const audioSources = new Map<string, NleTerminalLink["audioSources"][number]>();

    for (const occurrence of Object.values(currentProgram.occurrences)) {
      const { item } = findNleItem(current, occurrence.id);
      let terminal: NleResolvedItemSource & NleTerminalComponentResolution;
      if (item.kind === "component") {
        const resolved = components.get(current)?.get(item.id);
        assert(resolved !== undefined, `NLE Component ${item.id} has no terminal resolution.`);
        terminal = resolved;
      } else if (item.kind === "media") {
        const declaration = findNleMedia(current, item.media);
        const resolvedMedia = media.get(current)?.get(declaration.id);
        assert(resolvedMedia !== undefined,
          `NLE Media ${declaration.id} has no terminal resolution.`);
        terminal = {
          source: occurrence.source,
          ...(occurrence.source.outputs.picture === undefined ? {} : {
            pictureOutput: "picture",
            html: preparedMediaHtmlSource(resolvedMedia),
          }),
          ...(occurrence.source.outputs.audio === undefined ? {} : {
            audioOutput: "audio",
            audio: (sampling) => preparedMediaAudioSource(resolvedMedia, sampling),
          }),
        };
      } else {
        const child = link(item.project);
        terminal = {
          source: occurrence.source,
          ...(child.program.picture === undefined ? {} : {
            pictureOutput: "picture",
            html: audiovisualProgramHtmlSource(child.program, child.htmlSources),
          }),
          ...(child.program.audio === undefined ? {} : {
            audioOutput: "audio",
            audio: (sampling) => ({
              source: child.program.id,
              output: "audio",
              program: lowerNleAudiovisualToAudioProgram(child, sampling),
            }),
          }),
        };
      }

      assert(terminal.source.id === occurrence.source.id,
        `NLE Item ${item.id} terminal Source disagrees with its AVIR Source.`);
      for (const output of Object.keys(occurrence.selections)) {
        if (output === terminal.pictureOutput) {
          assert(terminal.html !== undefined,
            `NLE Item ${item.id} selected Picture output ${output} without an HTML implementation.`);
          assert(terminal.html.source === occurrence.source.id && terminal.html.output === output,
            `NLE Item ${item.id} HTML implementation disagrees with ${occurrence.source.id}.${output}.`);
          addHtmlSource(htmlSources, terminal.html);
          continue;
        }
        if (output === terminal.audioOutput) {
          assert(terminal.audio !== undefined,
            `NLE Item ${item.id} selected Audio output ${output} without an Audio implementation.`);
          const key = `${occurrence.source.id}\u0000${output}`;
          if (!audioSources.has(key)) {
            audioSources.set(key, { source: occurrence.source.id, output, resolve: terminal.audio });
          }
          continue;
        }
        throw new Error(`NLE Item ${item.id} selected terminal output ${output} without an implementation.`);
      }
    }

    const sources = { sources: [...htmlSources.values()] };
    assertAudiovisualHtmlSourceSet(sources);
    return {
      program: currentProgram,
      htmlSources: structuredClone(sources),
      audioSources: [...audioSources.values()],
    };
  };

  const linked = link(project);
  assert(linked.program === program,
    `NLE Project ${project.id} terminal link did not retain its structural AVIR Programme.`);
  return linked;
}

export function lowerNleAudiovisualToHtmlProgram(
  project: NleProject,
  lowering: NleTerminalLink,
  frameRate: TemporalRate,
): HtmlProgram {
  assert(lowering.program.picture !== undefined && lowering.program.pictureDomain !== undefined,
    "NLE Project has no Picture output for HTML lowering.");
  const viewport = sealLocalSpatialDomain({
    id: `${project.id}:viewport`,
    region: { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height },
  });
  return lowerAudiovisualPictureProgramToHtmlProgram({
    program: lowering.program,
    sources: lowering.htmlSources,
    output: {
      id: `${project.id}:html`,
      sampling: { frameRate: structuredClone(frameRate) },
      canvas: structuredClone(project.canvas),
      pictureMapping: sealSpatialMap({
        target: viewport,
        source: lowering.program.pictureDomain,
        transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
      }),
    },
  });
}

export function lowerNleProjectToHtmlProgram(
  project: NleProject,
  host: NleTerminalLinkHost,
  frameRate: TemporalRate,
): HtmlProgram {
  return lowerNleAudiovisualToHtmlProgram(project, linkNleProjectTerminals(project, host), frameRate);
}

export function lowerNleAudiovisualToAudioProgram(
  lowering: NleTerminalLink,
  sampling: AudioOutputSampling,
  options: { readonly silenceWhenAbsent?: boolean } = {},
): AudioProgram {
  if (lowering.program.audio === undefined) {
    assert(options.silenceWhenAbsent === true,
      "NLE Project has no Audio output for AudioProgram lowering.");
    return sealAudioProgram({
      domain: structuredClone(lowering.program.domain),
      sampling: structuredClone(sampling),
      graph: {
        nodes: [{ kind: "silence", id: `${lowering.program.id}:silence` }],
        output: { node: `${lowering.program.id}:silence` },
      },
    });
  }
  let sources = createAudiovisualAudioSourceSet();
  for (const implementation of lowering.audioSources) {
    const resolved = implementation.resolve(sampling);
    sources = appendAudiovisualAudioSource(sources, sealAudiovisualAudioSource({
      ...resolved,
      source: implementation.source,
      output: implementation.output,
    }));
  }
  return lowerAudiovisualAudioProgram({ program: lowering.program, sampling, sources });
}

export function lowerNleProjectToAudioProgram(
  project: NleProject,
  host: NleTerminalLinkHost,
  sampling: AudioOutputSampling,
): AudioProgram {
  return lowerNleAudiovisualToAudioProgram(linkNleProjectTerminals(project, host), sampling);
}
