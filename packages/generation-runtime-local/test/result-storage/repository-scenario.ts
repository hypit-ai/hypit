import type { CanonicalValue } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";

export const videoType: TypeRef = {
  module: { name: "example.media" },
  name: "Video",
};
export const structuredType: TypeRef = {
  module: { name: "example.speech" },
  name: "StructuredValue",
};

export function publicationIntent(
  outputs: readonly { readonly name: string; readonly record?: string; readonly parameters?: CanonicalValue }[],
) {
  return {
    outputs: outputs.map((output) => ({
      name: output.name,
      record: output.record ?? `record:${output.name}`,
      publisher: "example.test-product@1",
      ...(output.parameters === undefined ? {} : { parameters: output.parameters }),
    })),
  };
}
