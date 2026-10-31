import type { TypeRef } from "@hypit/protocol";

export const videoType: TypeRef = {
  module: { name: "example.media", version: "1" },
  name: "Video",
};
export const structuredType: TypeRef = {
  module: { name: "example.speech", version: "1" },
  name: "StructuredValue",
};

export function resultIntent(
  outputs: readonly { readonly name: string; readonly record?: string }[],
) {
  return {
    outputs: outputs.map((output) => ({
      name: output.name,
      record: output.record ?? `record:${output.name}`,
    })),
  };
}
