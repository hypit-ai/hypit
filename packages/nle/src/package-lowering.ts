import {
  assertAudioOperator,
  assertPackageSymbol,
  assertPictureOperator,
  assertProgramSource,
  assertSignalReconstruction,
  type AudioOperator,
  type PictureOperator,
  type SignalReconstruction,
} from "@hypit/audiovisual";
import type { ResolvedMedia } from "@hypit/media";
import type {
  NleComponentItem,
  NleComponentLoweringContext,
  NleLoweringHost,
  NleMatte,
  NleMatteLoweringContext,
  NleMediaLoweringContext,
  NleMediaReference,
  NleProcess,
  NleProcessLoweringContext,
  NleResolvedItemSource,
  NleSignalReconstruction,
  NleSignalReconstructionLoweringContext,
  NleTransition,
  NleTransitionLoweringContext,
} from "./types.js";

export const nleLoweringContributionKind = "hypit.nle-lowering";

export type NleComponentLoweringImplementation = {
  readonly symbol: string;
  resolve(item: NleComponentItem, context: NleComponentLoweringContext): NleResolvedItemSource;
};

export type NlePictureProcessLoweringImplementation = {
  readonly symbol: string;
  resolve(process: NleProcess, context: NleProcessLoweringContext): PictureOperator;
};

export type NleAudioProcessLoweringImplementation = {
  readonly symbol: string;
  resolve(process: NleProcess, context: NleProcessLoweringContext): AudioOperator;
};

export type NleReconstructionLoweringImplementation = {
  readonly symbol: string;
  resolve(
    reconstruction: NleSignalReconstruction,
    context: NleSignalReconstructionLoweringContext,
  ): SignalReconstruction;
};

export type NleTransitionLoweringImplementation = {
  readonly symbol: string;
  resolve(transition: NleTransition, context: NleTransitionLoweringContext): PictureOperator;
};

export type NleMatteLoweringImplementation = {
  readonly symbol: string;
  resolve(matte: NleMatte, context: NleMatteLoweringContext): PictureOperator;
};

/** Process-local facets supplied by one selected npm package. */
export type NleLoweringContribution = {
  readonly kind: typeof nleLoweringContributionKind;
  readonly package: string;
  readonly components?: readonly NleComponentLoweringImplementation[];
  readonly pictureProcesses?: readonly NlePictureProcessLoweringImplementation[];
  readonly audioProcesses?: readonly NleAudioProcessLoweringImplementation[];
  readonly reconstructions?: readonly NleReconstructionLoweringImplementation[];
  readonly transitions?: readonly NleTransitionLoweringImplementation[];
  readonly mattes?: readonly NleMatteLoweringImplementation[];
};

export type CreateNlePackageLoweringHostOptions = {
  readonly contributions: readonly NleLoweringContribution[];
  readonly resolveMedia: (
    asset: NleMediaReference,
    context: NleMediaLoweringContext,
  ) => ResolvedMedia;
};

function identity(value: string, label: string): void {
  assertPackageSymbol({ package: "hypit-placeholder", symbol: value }, label);
}

function verifyContribution(value: NleLoweringContribution): void {
  if (value.kind !== nleLoweringContributionKind) throw new Error("NLE lowering contribution kind is invalid.");
  assertPackageSymbol({ package: value.package, symbol: "contribution" }, "NLE lowering contribution package");
  for (const [group, implementations] of Object.entries({
    components: value.components,
    pictureProcesses: value.pictureProcesses,
    audioProcesses: value.audioProcesses,
    reconstructions: value.reconstructions,
    transitions: value.transitions,
    mattes: value.mattes,
  })) {
    const symbols = new Set<string>();
    for (const implementation of implementations ?? []) {
      identity(implementation.symbol, `NLE lowering ${group} symbol`);
      if (typeof implementation.resolve !== "function") {
        throw new Error(`NLE lowering ${value.package}#${implementation.symbol} has no resolver.`);
      }
      if (symbols.has(implementation.symbol)) {
        throw new Error(`NLE lowering contribution ${value.package} repeats ${group} symbol ${implementation.symbol}.`);
      }
      symbols.add(implementation.symbol);
    }
  }
}

export function defineNleLoweringContribution(value: NleLoweringContribution): NleLoweringContribution {
  verifyContribution(value);
  return value;
}

function registry<T extends { readonly symbol: string }>(
  contributions: readonly NleLoweringContribution[],
  select: (value: NleLoweringContribution) => readonly T[] | undefined,
  label: string,
): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const contribution of contributions) for (const implementation of select(contribution) ?? []) {
    const key = `${contribution.package}\u0000${implementation.symbol}`;
    if (result.has(key)) throw new Error(`NLE lowering repeats ${label} ${contribution.package}#${implementation.symbol}.`);
    result.set(key, implementation);
  }
  return result;
}

function requireImplementation<T>(
  values: ReadonlyMap<string, T>,
  selected: { readonly package: string; readonly symbol: string },
  label: string,
): T {
  const found = values.get(`${selected.package}\u0000${selected.symbol}`);
  if (found === undefined) throw new Error(`NLE lowering has no selected ${label} ${selected.package}#${selected.symbol}.`);
  return found;
}

/** Assemble the selected package facets into the explicit pure lowering Host. */
export function createNlePackageLoweringHost(options: CreateNlePackageLoweringHostOptions): NleLoweringHost {
  options.contributions.forEach(verifyContribution);
  const components = registry(options.contributions, (value) => value.components, "Component");
  const pictureProcesses = registry(options.contributions, (value) => value.pictureProcesses, "Picture Process");
  const audioProcesses = registry(options.contributions, (value) => value.audioProcesses, "Audio Process");
  const reconstructions = registry(options.contributions, (value) => value.reconstructions, "Reconstruction");
  const transitions = registry(options.contributions, (value) => value.transitions, "Transition");
  const mattes = registry(options.contributions, (value) => value.mattes, "Matte");
  return {
    resolveMedia: options.resolveMedia,
    resolveComponent(item, context) {
      const value = requireImplementation(components, item.component, "Component").resolve(item, context);
      assertProgramSource(value.source);
      return value;
    },
    resolvePictureOperator(process, context) {
      const value = requireImplementation(pictureProcesses, process.operator, "Picture Process").resolve(process, context);
      assertPictureOperator(value, `NLE Picture Process ${process.id}`);
      return value;
    },
    resolveAudioOperator(process, context) {
      const value = requireImplementation(audioProcesses, process.operator, "Audio Process").resolve(process, context);
      assertAudioOperator(value, `NLE Audio Process ${process.id}`);
      return value;
    },
    resolveSignalReconstruction(reconstruction, context) {
      const value = requireImplementation(reconstructions, reconstruction.using, "Reconstruction")
        .resolve(reconstruction, context);
      assertSignalReconstruction(value);
      return value;
    },
    resolveTransition(transition, context) {
      const value = requireImplementation(transitions, transition.operator, "Transition").resolve(transition, context);
      assertPictureOperator(value, `NLE Transition ${transition.id}`);
      return value;
    },
    resolveMatte(matte, context) {
      const value = requireImplementation(mattes, matte.operator, "Matte").resolve(matte, context);
      assertPictureOperator(value, `NLE Matte ${matte.id}`);
      return value;
    },
  };
}
