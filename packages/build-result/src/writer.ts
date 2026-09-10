import type { BlobRef, CanonicalValue, TypedRecord } from "@hypit/protocol";

import type {
  BuildResultFileRef,
  BuildResultManifest,
  BuildResultOutput,
  BuildResultResourceSource,
  BuildResultSync,
  BuildResultValueDocument,
  BuildResultValuePath,
  HistoricalBuildOutputRef,
} from "./types.js";

export type BuildResultWriterState = {
  readonly resources: Readonly<Record<string, string>>;
  readonly resourceReferences?: Readonly<Record<string, BuildResultFileRef>>;
  readonly values: Readonly<Record<string, string>>;
  readonly publishedOutputs: readonly { readonly name: string; readonly output: string; readonly displayName?: string }[];
  readonly forwards: readonly { readonly output: string; readonly build: string; readonly sourceOutput: string }[];
};

export type BuildResultWriteTarget = {
  writeResource(
    path: string,
    artifact: BlobRef,
    source: BuildResultResourceSource,
  ): Promise<void>;
  writeValue(path: string, document: BuildResultValueDocument): Promise<void>;
};

export type BuildResultSyncResult = {
  /** Whether accepted public Outputs were added to the manifest. */
  readonly changed: boolean;
  readonly manifest: BuildResultManifest;
  readonly writer: BuildResultWriterState;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function numberedPath(
  directory: "files" | "values",
  stem: "file" | "value",
  extension: string,
  occupied: ReadonlySet<string>,
): string {
  let index = 1;
  while (true) {
    const candidate = `${directory}/${stem}-${String(index).padStart(4, "0")}${extension}`;
    if (!occupied.has(candidate)) return candidate;
    index += 1;
  }
}

function mediaExtension(mediaType: string): string {
  const subtype = mediaType.split("/", 2)[1]?.split(";", 1)[0]?.trim().toLowerCase();
  if (subtype === undefined || subtype.length === 0) return ".bin";
  const conventional = subtype === "jpeg" ? "jpg" : subtype === "x-wav" ? "wav" : subtype;
  const suffix = conventional.includes("+") ? conventional.slice(0, conventional.indexOf("+")) : conventional;
  const safe = suffix.replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  return safe.length === 0 ? ".bin" : `.${safe}`;
}

function scalar(value: unknown): value is null | boolean | number | string {
  return value === null || typeof value === "boolean" || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function isBlobRef(value: unknown): value is BlobRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const item = value as Readonly<Record<string, unknown>>;
  return item.kind === "blob"
    && typeof item.resource === "string"
    && item.resource.length > 0
    && typeof item.size === "number"
    && Number.isSafeInteger(item.size)
    && item.size >= 0
    && typeof item.mediaType === "string"
    && item.mediaType.length > 0;
}

function outputRecord(input: BuildResultSync, output: string): TypedRecord | undefined {
  const binding = input.state.plan.outputBindings.find((item) => item.output === output);
  return binding === undefined ? undefined : input.state.records.find((item) => item.id === binding.record);
}

/**
 * Encode accepted public Outputs exactly once, independently of the physical repository adapter.
 * The adapter only writes bytes/documents at the paths chosen here.
 */
export async function syncBuildResultOutputs(input: {
  readonly manifest: BuildResultManifest;
  readonly writer: BuildResultWriterState;
  readonly sync: BuildResultSync;
  readonly target: BuildResultWriteTarget;
}): Promise<BuildResultSyncResult> {
  const resources = new Map(Object.entries(input.writer.resources));
  const values = new Map(Object.entries(input.writer.values));
  const outputs: Record<string, BuildResultOutput> = { ...input.manifest.outputs };

  const materialize = async (artifact: BlobRef): Promise<BuildResultFileRef> => {
    const reference = input.writer.resourceReferences?.[artifact.resource];
    if (reference !== undefined) return { ...reference, mediaType: artifact.mediaType };
    const identity = artifact.resource;
    assert(identity.length > 0, "Build resource has no instance identity");
    let path = resources.get(identity);
    if (path === undefined) {
      path = numberedPath("files", "file", mediaExtension(artifact.mediaType), new Set(resources.values()));
      resources.set(identity, path);
      await input.target.writeResource(path, artifact, input.sync.resources);
    }
    return { kind: "build-file", path, size: artifact.size, mediaType: artifact.mediaType };
  };

  const encodeComposite = async (
    value: unknown,
    path: BuildResultValuePath = [],
  ): Promise<{ readonly value: CanonicalValue; readonly resources: BuildResultValueDocument["resources"] }> => {
    if (isBlobRef(value)) {
      return { value: null, resources: [{ at: path, file: await materialize(value) }] };
    }
    if (scalar(value)) return { value, resources: [] };
    if (Array.isArray(value)) {
      const children = await Promise.all(value.map(async (item, index) => await encodeComposite(item, [...path, index])));
      return {
        value: children.map((child) => child.value),
        resources: children.flatMap((child) => child.resources),
      };
    }
    assert(value !== null && typeof value === "object", "Build Output contains a non-canonical value");
    const entries = await Promise.all(Object.entries(value as Readonly<Record<string, unknown>>).map(async ([key, item]) => {
      return [key, await encodeComposite(item, [...path, key])] as const;
    }));
    return {
      value: Object.fromEntries(entries.map(([key, child]) => [key, child.value])),
      resources: entries.flatMap(([, child]) => child.resources),
    };
  };

  const outputValue = async (record: TypedRecord): Promise<BuildResultOutput["value"]> => {
    if (record.value.kind === "blob") return await materialize(record.value);
    if (scalar(record.value.value)) return { kind: "inline", value: record.value.value };
    const existingPath = values.get(record.id);
    if (existingPath !== undefined) return { kind: "value", path: existingPath };
    const path = numberedPath("values", "value", ".json", new Set(values.values()));
    values.set(record.id, path);
    const document: BuildResultValueDocument = {
      format: "hypit.result-value@1",
      ...await encodeComposite(record.value.value),
    };
    await input.target.writeValue(path, document);
    return { kind: "value", path };
  };

  const forwards = new Map(input.writer.forwards.map((item) => [item.output, item]));
  const outputRank = (record: TypedRecord, forward: HistoricalBuildOutputRef | undefined): number => forward !== undefined
    ? 0
    : record.value.kind === "blob" ? 1 : scalar(record.value.value) ? 2 : 3;
  const ready = input.writer.publishedOutputs.flatMap((published) => {
    if (outputs[published.name] !== undefined) return [];
    const record = outputRecord(input.sync, published.output);
    if (record === undefined) return [];
    const source = forwards.get(published.output);
    const forward = source === undefined ? undefined : {
      kind: "build-output" as const,
      build: source.build,
      output: source.sourceOutput,
    };
    return [{ published, record, forward }];
  }).sort((left, right) => outputRank(left.record, left.forward) - outputRank(right.record, right.forward)
    || left.published.name.localeCompare(right.published.name));

  if (ready.length === 0) {
    return { changed: false, manifest: input.manifest, writer: input.writer };
  }

  for (const { published, record, forward } of ready) {
    outputs[published.name] = {
      ...(published.displayName === undefined ? {} : { displayName: published.displayName }),
      type: record.type,
      value: forward ?? await outputValue(record),
    };
  }

  return {
    changed: true,
    manifest: { ...input.manifest, outputs },
    writer: {
      ...input.writer,
      resources: Object.fromEntries(resources),
      values: Object.fromEntries(values),
    },
  };
}
