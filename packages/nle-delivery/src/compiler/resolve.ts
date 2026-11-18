import { assertHtmlPictureReconstruction, assertHtmlVisual } from "@hypit/html-program";
import {
  assertPackageSymbol,
  type NleComponentItem, type NleMatte, type NleProcess, type NlePictureReconstruction,
  type NleTransition, type PackageSymbol,
} from "@hypit/nle";
import type {
  NleComponentRenderContext, NleMatteRenderContext, NlePictureReconstructionContext, NleProcessRenderContext,
  NleRenderContribution, NleTransitionRenderContext, ResolveNleMedia, SelectedNleRenderContribution,
} from "../render-contribution.js";
import type { ResolveNleTextFont } from "../text.js";
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

export function createNleRenderResolver(
  contributions: readonly SelectedNleRenderContribution[],
  resolveMedia: ResolveNleMedia,
  resolveTextFont: ResolveNleTextFont,
) {
  const component = select(contributions, value => value.components, "Component");
  const pictureProcess = select(contributions, value => value.pictureProcesses, "Picture Process");
  const audioProcess = select(contributions, value => value.audioProcesses, "Audio Process");
  const transition = select(contributions, value => value.transitions, "Transition");
  const matte = select(contributions, value => value.mattes, "Matte");
  const pictureReconstruction = select(contributions, value => value.pictureReconstructions, "Picture Reconstruction");

  return {
    resolveMedia,
    resolveComponent(item: NleComponentItem, context: Omit<NleComponentRenderContext, "resolveTextFont">) {
      const picture = component(item.component, `Item ${item.id}`).render(item, {
        ...context,
        resolveTextFont(source, weight, style) {
          try { return resolveTextFont(source, weight, style); }
          catch (cause) {
            throw new Error("NLE Item " + item.id + ": " + (cause instanceof Error ? cause.message : String(cause)), { cause });
          }
        },
      });
      assertHtmlVisual(picture.visual);
      return picture;
    },
    resolvePictureOperator(process: NleProcess, context: NleProcessRenderContext) {
      return pictureProcess(process.operator, `Process ${process.id}`).render(process, context);
    },
    resolveAudioOperator(process: NleProcess, context: NleProcessRenderContext) {
      const effect = audioProcess(process.operator, `Process ${process.id}`).render(process, context);
      if (typeof effect.filter !== "string" || effect.filter.trim().length === 0) {
        throw new Error(`NLE Audio Process ${process.id} requires a filter expression.`);
      }
      return effect;
    },
    resolveTransition(value: NleTransition, context: NleTransitionRenderContext) {
      return transition(value.operator, `Transition ${value.id}`).render(value, context);
    },
    resolveMatte(value: NleMatte, context: NleMatteRenderContext) {
      return matte(value.operator, `Matte ${value.id}`).render(value, context);
    },
    resolvePictureReconstruction(value: NlePictureReconstruction,
      context: NlePictureReconstructionContext) {
      const output = pictureReconstruction(value.using, `Item ${context.item.id}`).render(value, context);
      assertHtmlPictureReconstruction(output);
      return output;
    },
  };
}

export type NleRenderResolver = ReturnType<typeof createNleRenderResolver>;
