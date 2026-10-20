import type { TypeRef, TypedRecord } from "@hypit/protocol";

export const videoType: TypeRef = {
  module: { name: "example.media", version: "1" },
  name: "Video",
};
export const compositeType: TypeRef = {
  module: { name: "example.speech", version: "1" },
  name: "CompositeValue",
};

export function publication(
  outputs: readonly { readonly name: string; readonly output: string; readonly record?: string; readonly displayName?: string; readonly type?: TypeRef }[],
  targets: readonly string[] = [],
) {
  const selected = new Set(targets);
  return {
    outputs: outputs.map((output) => ({
      ...output,
      type: output.type ?? videoType,
      target: selected.has(output.name),
      source: {
        kind: "current-record" as const,
        record: output.record ?? (output.output.startsWith("logical:")
          ? `record:${output.output.slice("logical:".length)}`
          : output.output),
      },
    })),
  };
}

export function acceptedRecords(input: {
  readonly records: readonly TypedRecord[];
  readonly bindings: readonly { readonly output: string; readonly record: string }[];
}): readonly TypedRecord[] {
  return input.records.filter((record) => input.bindings.some((binding) => binding.record === record.id));
}
