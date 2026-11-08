import type {
  NlePackageSymbol,
  NleTransitionParameterAuthoring,
  NleTransitionResolver,
} from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";

import { pictureTransitionModuleRef } from "./manifest.js";
import {
  assertTransitionOperatorSpec,
  transitionOperator,
  type TransitionOperatorSpec,
} from "./program.js";

export const pictureTransitionNleSymbol: NlePackageSymbol = {
  module: pictureTransitionModuleRef,
  name: "transition",
};

export const pictureTransitionNleResolver: NleTransitionResolver = {
  transition: pictureTransitionNleSymbol,
  resolve: (transition, { domain }) => {
    const spec = transition.parameters as unknown as TransitionOperatorSpec;
    assertTransitionOperatorSpec(spec);
    return { operator: transitionOperator(spec, domain) };
  },
};

export type PictureTransitionNleEdit = {
  readonly kind: "set-spec";
  readonly spec: TransitionOperatorSpec;
};

export const pictureTransitionNleAuthoring: NleTransitionParameterAuthoring = {
  transition: pictureTransitionNleSymbol,
  inspect: ({ transition }) => {
    const spec = transition.parameters as unknown as TransitionOperatorSpec;
    assertTransitionOperatorSpec(spec);
    return canonicalize(spec);
  },
  edit: (operation) => {
    if (operation === null || typeof operation !== "object" || Array.isArray(operation)
      || Object.keys(operation).sort().join("\u0000") !== ["kind", "spec"].sort().join("\u0000")
      || !("kind" in operation) || operation.kind !== "set-spec" || !("spec" in operation)) {
      throw new Error("NLE Picture Transition edit is invalid.");
    }
    const spec = operation.spec as unknown as TransitionOperatorSpec;
    assertTransitionOperatorSpec(spec);
    return canonicalize(spec);
  },
};
