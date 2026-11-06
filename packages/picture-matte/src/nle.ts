import type { NleMatteResolver, NlePackageSymbol } from "@hypit/nle";

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
