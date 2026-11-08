import type { NlePackageSymbol, NleSignalReconstructionResolver } from "@hypit/nle";

import { audioPreservePitchModuleRef } from "./manifest.js";
import { preservePitch } from "./program.js";

export const audioPreservePitchNleSymbol: NlePackageSymbol = {
  module: audioPreservePitchModuleRef,
  name: "preserve-pitch",
};

export const audioPreservePitchNleResolver: NleSignalReconstructionResolver = {
  reconstruction: audioPreservePitchNleSymbol,
  resolve: (request) => {
    if (request.parameters === null || typeof request.parameters !== "object"
      || Array.isArray(request.parameters) || Object.keys(request.parameters).length !== 0) {
      throw new Error("NLE Preserve Pitch parameters must be an empty object.");
    }
    return { reconstruction: preservePitch() };
  },
};
