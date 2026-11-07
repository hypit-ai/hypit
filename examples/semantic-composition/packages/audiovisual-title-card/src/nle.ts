import type {
  NleComponentItem,
  NleComponentParameterAuthoring,
  NleComponentResolver,
  NleLoweringContext,
  NlePackageSymbol,
} from "@hypit/nle";
import type { NleHtmlVideoComponentResolver } from "@hypit/html-video";
import { canonicalize } from "@hypit/protocol";
import { exactTemporalValueFromFrames } from "@hypit/temporal/sampling";

import { titleCardModuleRef } from "./manifest.js";
import { titleCardHtmlSource } from "./picture.js";
import { titleCardProgramSource, type TitleCardSpec } from "./source.js";

export const titleCardNleSymbol: NlePackageSymbol = {
  module: titleCardModuleRef,
  name: "title-card",
};

export type TitleCardNleParameters = {
  readonly title: string;
  readonly subtitle: string;
  readonly background: string;
  readonly foreground: string;
};

export type TitleCardNleEdit =
  | { readonly kind: "set-title"; readonly value: string }
  | { readonly kind: "set-subtitle"; readonly value: string }
  | { readonly kind: "set-colors"; readonly background: string; readonly foreground: string };

function record(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a record.`);
  }
}

function exactFields(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  if (Object.keys(value).sort().join("\u0000") !== [...fields].sort().join("\u0000")) {
    throw new Error(`${label} has invalid fields.`);
  }
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`NLE Title Card parameter ${name} is invalid.`);
  }
  return value;
}

function color(value: unknown, name: string): string {
  const resolved = text(value, name);
  if (!/^#[0-9a-f]{6}$/iu.test(resolved)) {
    throw new Error(`NLE Title Card parameter ${name} is not a six-digit hex color.`);
  }
  return resolved;
}

export function assertTitleCardNleParameters(value: unknown): asserts value is TitleCardNleParameters {
  record(value, "NLE Title Card parameters");
  exactFields(value, ["background", "foreground", "subtitle", "title"], "NLE Title Card parameters");
  text(value.title, "title");
  text(value.subtitle, "subtitle");
  color(value.background, "background");
  color(value.foreground, "foreground");
}

export function editTitleCardNleParameters(
  parameters: TitleCardNleParameters,
  operation: TitleCardNleEdit,
): TitleCardNleParameters {
  assertTitleCardNleParameters(parameters);
  record(operation, "NLE Title Card edit");
  if (operation.kind === "set-title") {
    exactFields(operation, ["kind", "value"], "NLE Title Card edit");
    return { ...parameters, title: text(operation.value, "title") };
  }
  if (operation.kind === "set-subtitle") {
    exactFields(operation, ["kind", "value"], "NLE Title Card edit");
    return { ...parameters, subtitle: text(operation.value, "subtitle") };
  }
  if (operation.kind === "set-colors") {
    exactFields(operation, ["background", "foreground", "kind"], "NLE Title Card edit");
    return {
      ...parameters,
      background: color(operation.background, "background"),
      foreground: color(operation.foreground, "foreground"),
    };
  }
  throw new Error("NLE Title Card edit.kind is invalid.");
}

function resolveTitleCard(item: NleComponentItem, { project }: NleLoweringContext) {
  const parameters = item.parameters as unknown;
  assertTitleCardNleParameters(parameters);
  const spec: TitleCardSpec = {
    id: `${item.id}:source`,
    duration: exactTemporalValueFromFrames(item.localStartFrame + item.durationFrames, {
      frameRate: project.frameRate,
    }),
    width: project.canvas.width,
    height: project.canvas.height,
    title: parameters.title,
    subtitle: parameters.subtitle,
    background: parameters.background,
    foreground: parameters.foreground,
  };
  return {
    source: titleCardProgramSource(spec),
    pictureOutput: "picture",
    html: titleCardHtmlSource(spec),
  };
}

export const titleCardNleResolver: NleComponentResolver = {
  component: titleCardNleSymbol,
  resolve: (item, context) => {
    const { source, pictureOutput } = resolveTitleCard(item, context);
    return { source, pictureOutput };
  },
};

export const titleCardNleHtmlVideoResolver: NleHtmlVideoComponentResolver = {
  component: titleCardNleSymbol,
  resolve: (item, context) => ({ html: resolveTitleCard(item, context).html }),
};

export const titleCardNleAuthoring: NleComponentParameterAuthoring = {
  component: titleCardNleSymbol,
  inspect: ({ item }) => {
    const parameters = item.parameters as unknown;
    assertTitleCardNleParameters(parameters);
    return canonicalize(parameters);
  },
  edit: (operation, { item }) => {
    const parameters = item.parameters as unknown;
    assertTitleCardNleParameters(parameters);
    return canonicalize(editTitleCardNleParameters(
      parameters,
      operation as unknown as TitleCardNleEdit,
    ));
  },
};
