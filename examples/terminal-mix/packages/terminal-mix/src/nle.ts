import { preparedPictureSamplingRepresentation } from "@hypit/media";
import { blenderSceneProgram } from "@hypit/audiovisual-blender-local";
import { manimSceneProgram } from "@hypit/audiovisual-manim-local";
import type { NleAudiovisualComponentResolver } from "@hypit/nle-audiovisual";
import type {
  NleComponentItem,
  NleComponentResolver,
  NleLoweringContext,
  NlePackageSymbol,
} from "@hypit/nle";
import { nleTimeMappingRequiredDuration } from "@hypit/nle";
import type { CanonicalValue } from "@hypit/protocol";
import { compareExactTemporalValues, exactTemporalZero } from "@hypit/temporal/algebra";

import { terminalMixLabelHtmlSource } from "./html.js";
import { terminalMixBlenderSceneArtifact } from "./blender.js";
import {
  terminalMixBlenderTerminal,
  terminalMixManimTerminal,
  terminalMixModuleRef,
} from "./identity.js";
import { terminalMixManimSceneArtifact } from "./scene.js";
import { terminalMixPictureSource } from "./source.js";

export const terminalMixManimSymbol: NlePackageSymbol = {
  module: terminalMixModuleRef,
  name: "manim-orbit",
};

export const terminalMixLabelSymbol: NlePackageSymbol = {
  module: terminalMixModuleRef,
  name: "html-label",
};

export const terminalMixBlenderSymbol: NlePackageSymbol = {
  module: terminalMixModuleRef,
  name: "blender-object",
};

function record(value: CanonicalValue, subject: string): Readonly<Record<string, CanonicalValue>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must be a record.`);
  }
  return value as Readonly<Record<string, CanonicalValue>>;
}

function labelParameters(value: CanonicalValue): { readonly title: string; readonly subtitle: string } {
  const parameters = record(value, "Terminal mix HTML label parameters");
  if (Object.keys(parameters).sort().join("\u0000") !== "subtitle\u0000title"
    || typeof parameters.title !== "string" || parameters.title.trim().length === 0
    || typeof parameters.subtitle !== "string" || parameters.subtitle.trim().length === 0) {
    throw new Error("Terminal mix HTML label parameters are invalid.");
  }
  return { title: parameters.title, subtitle: parameters.subtitle };
}

function resolvedSource(item: NleComponentItem, context: NleLoweringContext) {
  const required = nleTimeMappingRequiredDuration(item.sourceTime);
  const duration = compareExactTemporalValues(required, item.duration) > 0 ? required : item.duration;
  return terminalMixPictureSource(
    `${item.id}:source`,
    duration,
    context.project.canvas.width,
    context.project.canvas.height,
  );
}

export const terminalMixManimNleResolver: NleComponentResolver = {
  component: terminalMixManimSymbol,
  resolve: (item, context) => ({ source: resolvedSource(item, context), pictureOutput: "picture" }),
};

export const terminalMixLabelNleResolver: NleComponentResolver = {
  component: terminalMixLabelSymbol,
  resolve: (item, context) => ({ source: resolvedSource(item, context), pictureOutput: "picture" }),
};

export const terminalMixBlenderNleResolver: NleComponentResolver = {
  component: terminalMixBlenderSymbol,
  resolve: (item, context) => ({ source: resolvedSource(item, context), pictureOutput: "picture" }),
};

export const terminalMixManimHtmlVideoResolver: NleAudiovisualComponentResolver = {
  component: terminalMixManimSymbol,
  resolve: () => ({
    picture: {
      terminal: terminalMixManimTerminal,
      sourceAccess: { kind: "sequential", origin: exactTemporalZero() },
      representation: preparedPictureSamplingRepresentation,
      program: manimSceneProgram({
        scene: "TerminalMixScene",
        entry: "scene.py",
        files: [{ path: "scene.py", artifact: terminalMixManimSceneArtifact }],
      }),
    },
  }),
};

export const terminalMixLabelHtmlVideoResolver: NleAudiovisualComponentResolver = {
  component: terminalMixLabelSymbol,
  resolve: (item, context) => {
    const parameters = labelParameters(item.parameters);
    const source = resolvedSource(item, context);
    return { html: terminalMixLabelHtmlSource(source.id, parameters.title, parameters.subtitle) };
  },
};

export const terminalMixBlenderHtmlVideoResolver: NleAudiovisualComponentResolver = {
  component: terminalMixBlenderSymbol,
  resolve: () => ({
    picture: {
      terminal: terminalMixBlenderTerminal,
      sourceAccess: { kind: "range" },
      representation: preparedPictureSamplingRepresentation,
      program: blenderSceneProgram({
        entry: "scene.py",
        files: [{ path: "scene.py", artifact: terminalMixBlenderSceneArtifact }],
      }),
    },
  }),
};
