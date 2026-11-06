import type { NlePackageSymbol, NleTransitionResolver } from "@hypit/nle";

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
