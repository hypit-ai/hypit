import type { NleMatteParameterAuthoring, NleMatteResolver, NlePackageSymbol } from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";

import { pictureMatteModuleRef } from "./manifest.js";
import { pictureMatteOperator, type PictureMatteOperatorSpec } from "./program.js";

export const pictureMatteNleSymbol: NlePackageSymbol = {
  module: pictureMatteModuleRef,
  name: "matte",
};

export const pictureMatteNleResolver: NleMatteResolver = {
  matte: pictureMatteNleSymbol,
  resolve: (matte) => {
    if (matte.parameters === null || typeof matte.parameters !== "object" || Array.isArray(matte.parameters)) {
      throw new Error(`NLE Picture Matte ${matte.id} parameters must be a record.`);
    }
    const spec = matte.parameters as unknown as PictureMatteOperatorSpec;
    return { operator: pictureMatteOperator(spec.channel, spec.invert) };
  },
};

export type PictureMatteNleEdit = {
  readonly kind: "set-spec";
  readonly spec: PictureMatteOperatorSpec;
};

function assertSpec(value: unknown): asserts value is PictureMatteOperatorSpec {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join("\u0000") !== ["channel", "invert"].sort().join("\u0000")
    || !("channel" in value) || !("invert" in value)) {
    throw new Error("NLE Picture Matte spec is invalid.");
  }
  pictureMatteOperator(
    value.channel as PictureMatteOperatorSpec["channel"],
    value.invert as boolean,
  );
}

export const pictureMatteNleAuthoring: NleMatteParameterAuthoring = {
  matte: pictureMatteNleSymbol,
  inspect: ({ matte }) => {
    const spec = matte.parameters as unknown;
    assertSpec(spec);
    return canonicalize(spec);
  },
  edit: (operation) => {
    if (operation === null || typeof operation !== "object" || Array.isArray(operation)
      || Object.keys(operation).sort().join("\u0000") !== ["kind", "spec"].sort().join("\u0000")
      || !("kind" in operation) || operation.kind !== "set-spec" || !("spec" in operation)) {
      throw new Error("NLE Picture Matte edit is invalid.");
    }
    assertSpec(operation.spec);
    return canonicalize(operation.spec);
  },
};
