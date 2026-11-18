import { assertHtmlPictureReconstruction, assertHtmlVisual } from "@hypit/html-program";
import {
  assertIdentity, assertPackageSymbol,
  type NleComponentItem, type NleMatte, type NleProcess, type NleSignalReconstruction,
  type NleTransition, type PackageSymbol,
} from "@hypit/nle";
import type {
  NleComponentRenderContext, NleMatteRenderContext, NlePictureReconstructionContext, NleProcessRenderContext,
  NleRenderContribution, NleTransitionRenderContext, ResolveNleMedia, SelectedNleRenderContribution,
} from "../render-contribution.js";
import type { AudioOperator, PictureOperator, CompiledSource } from "./types.js";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

export type NleResolvedItemSource = {
  readonly source: CompiledSource;
  readonly pictureOutput?: string;
  readonly audioOutput?: string;
};

function select<T extends { readonly symbol: string; readonly render: unknown }>(
  contributions: readonly SelectedNleRenderContribution[],
  implementations: (value: NleRenderContribution) => readonly T[] | undefined,
  role: string,
): (binding: PackageSymbol, subject: string) => T {
  const index = new Map<string, T>();
  const key = (binding: PackageSymbol) => `${binding.package}\u0000${binding.symbol}`;
  for (const { package: owner, value } of contributions) {
    const selected = implementations(value);
    if (selected === undefined) continue;
    if (!Array.isArray(selected)) throw new Error(`NLE render contribution ${owner} must list ${role} implementations.`);
    for (const implementation of selected) {
      if (implementation === null || typeof implementation !== "object") {
        throw new Error(`NLE render contribution ${owner} has an invalid ${role} implementation.`);
      }
      const binding = { package: owner, symbol: implementation.symbol };
      assertPackageSymbol(binding, `NLE ${role}`);
      if (typeof implementation.render !== "function") {
        throw new Error(`NLE ${role} ${owner}#${binding.symbol} has no render function.`);
      }
      if (index.has(key(binding))) {
        throw new Error(`NLE render contributions repeat ${role} ${owner}#${binding.symbol}.`);
      }
      index.set(key(binding), implementation);
    }
  }
  return (binding, subject) => {
    const found = index.get(key(binding));
    if (found === undefined) {
      throw new Error(`NLE ${subject} requires ${role} ${binding.package}#${binding.symbol}.`);
    }
    return found;
  };
}

function controls(id: string, names: readonly string[] | undefined, duration: ExactTemporalValue) {
  if (names !== undefined && (!Array.isArray(names) || new Set(names).size !== names.length)) {
    throw new Error(`NLE ${id} must declare distinct control names.`);
  }
  return Object.fromEntries((names ?? []).map(name => {
    assertIdentity(name, `NLE ${id} control name`);
    return [name, { id: `${id}:${name}`, duration }];
  }));
}

export function createNleRenderResolver(
  contributions: readonly SelectedNleRenderContribution[],
  resolveMedia: ResolveNleMedia,
) {
  const component = select(contributions, value => value.components, "Component");
  const pictureProcess = select(contributions, value => value.pictureProcesses, "Picture Process");
  const audioProcess = select(contributions, value => value.audioProcesses, "Audio Process");
  const transition = select(contributions, value => value.transitions, "Transition");
  const matte = select(contributions, value => value.mattes, "Matte");
  const pictureReconstruction = select(contributions, value => value.pictureReconstructions, "Picture Reconstruction");

  return {
    resolveMedia,
    resolveComponent(item: NleComponentItem,
      context: NleComponentRenderContext): NleResolvedItemSource {
      const { region, duration, visual } = component(item.component, `Item ${item.id}`).render(item, context);
      assertHtmlVisual(visual);
      const spatialDomain = { id: `${item.id}:source-space`, region };
      return {
        source: {
          id: `${item.id}:source`,
          content: { kind: "visual", visual },
          outputs: {
            picture: duration === undefined
              ? { signal: "picture", kind: "constant", spatialDomain }
              : { signal: "picture", kind: "signal", spatialDomain, domain: { id: `${item.id}:source-time`, duration } },
          },
        },
        pictureOutput: "picture",
      };
    },
    resolvePictureOperator(process: NleProcess,
      context: NleProcessRenderContext): PictureOperator {
      const output = pictureProcess(process.operator, `Process ${process.id}`).render(process, context);
      return {
        id: `${process.id}:operator`, visual: output.visual,
        inputs: ["signal"], temporalControls: controls(process.id, output.controls, context.controlDuration),
      };
    },
    resolveAudioOperator(process: NleProcess,
      context: NleProcessRenderContext): AudioOperator {
      const output = audioProcess(process.operator, `Process ${process.id}`).render(process, context);
      return {
        id: `${process.id}:operator`, filter: output.filter,
        inputs: ["signal"], temporalControls: controls(process.id, output.controls, context.controlDuration),
      };
    },
    resolveTransition(value: NleTransition,
      context: NleTransitionRenderContext): PictureOperator {
      const output = transition(value.operator, `Transition ${value.id}`).render(value, context);
      return {
        id: `${value.id}:operator`, visual: output.visual,
        inputs: ["outgoing", "incoming"], temporalControls: controls(value.id, output.controls, context.domain.duration),
      };
    },
    resolveMatte(value: NleMatte,
      context: NleMatteRenderContext): PictureOperator {
      const output = matte(value.operator, `Matte ${value.id}`).render(value, context);
      return {
        id: `${value.id}:operator`, visual: output.visual,
        inputs: ["content", "matte"], temporalControls: controls(value.id, output.controls, context.content.duration),
      };
    },
    resolvePictureReconstruction(value: NleSignalReconstruction,
      context: NlePictureReconstructionContext) {
      const output = pictureReconstruction(value.using, `Item ${context.item.id}`).render(value, context);
      assertHtmlPictureReconstruction(output);
      return output;
    },
  };
}

export type NleRenderResolver = ReturnType<typeof createNleRenderResolver>;
