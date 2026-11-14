import type { TypeRef } from "@hypit/module";

export const audiovisualModuleRef = { name: "@hypit/audiovisual" } as const;

/** The signal value produced by a Picture Program before renderer lowering. */
export const pictureType = {
  module: audiovisualModuleRef,
  name: "Picture",
} as const satisfies TypeRef;

/** The signal value produced by an Audio Program before renderer lowering. */
export const audioType = {
  module: audiovisualModuleRef,
  name: "Audio",
} as const satisfies TypeRef;
