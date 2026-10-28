import { compareCodeUnits, isBlobRef, mapValueBlobs, sameType } from "@hypit/protocol";
import type {
  BlobRef,
  CanonicalValue,
  PublicationIntent,
  PublicationOutputIntent,
  TypedRecord,
} from "@hypit/protocol";

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
import { buildResultOutput, defineBuildResultOutput } from "./types.js";

export type BuildResultWriterState = {
  readonly resources: Readonly<Record<string, string>>;
  readonly resourceReferences?: Readonly<Record<string, BuildResultFileRef>>;
  readonly values: Readonly<Record<string, string>>;
  readonly publication: PublicationIntent;
};

export type BuildResultWriteTarget = {
  writeResource(
    path: string,
    blob: BlobRef,
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

type NumberedPathAllocator = {
  next: number;
  readonly occupied: Set<string>;
};

function numberedPathAllocator(
  directory: "files" | "values",
  stem: "file" | "value",
  paths: Iterable<string>,
): NumberedPathAllocator {
  const occupied = new Set(paths);
  const prefix = `${directory}/${stem}-`;
  let highest = 0;
  for (const path of occupied) {
    if (!path.startsWith(prefix)) continue;
    const match = /^(\d+)\.[^/]+$/u.exec(path.slice(prefix.length));
    if (match === null) continue;
    const index = Number(match[1]);
    assert(Number.isSafeInteger(index), `Build Result path ${path} has an unsafe generated index`);
    highest = Math.max(highest, index);
  }
  assert(highest < Number.MAX_SAFE_INTEGER, `Build Result ${directory} path index is exhausted`);
  return { next: highest + 1, occupied };
}

function numberedPath(
  directory: "files" | "values",
  stem: "file" | "value",
  extension: string,
  allocator: NumberedPathAllocator,
): string {
  while (true) {
    assert(Number.isSafeInteger(allocator.next), `Build Result ${directory} path index is exhausted`);
    const candidate = `${directory}/${stem}-${String(allocator.next).padStart(4, "0")}${extension}`;
    allocator.next += 1;
    if (allocator.occupied.has(candidate)) continue;
    allocator.occupied.add(candidate);
    return candidate;
  }
}

async function runBounded<T>(
  values: readonly T[],
  concurrency: number,
  perform: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failed = false;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (!failed) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      try {
        await perform(values[index]!);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  if (failed) throw failure;
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

type ReadyOutput = {
  readonly published: PublicationOutputIntent;
  readonly record?: TypedRecord;
  readonly forward?: HistoricalBuildOutputRef;
};

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
  const filePaths = numberedPathAllocator("files", "file", resources.values());
  const valuePaths = numberedPathAllocator("values", "value", values.values());
  const outputs: Record<string, BuildResultOutput> = { ...input.manifest.outputs };

  const materialize = async (artifacts: readonly BlobRef[]): Promise<readonly BuildResultFileRef[]> => {
    const writes: Array<{ readonly path: string; readonly blob: BlobRef }> = [];
    const result = artifacts.map((blob): BuildResultFileRef => {
      const reference = input.writer.resourceReferences?.[blob.resource];
      if (reference !== undefined) return { ...reference, mediaType: blob.mediaType };
      const identity = blob.resource;
      assert(identity.length > 0, "Build resource has no instance identity");
      let path = resources.get(identity);
      if (path === undefined) {
        path = numberedPath("files", "file", mediaExtension(blob.mediaType), filePaths);
        resources.set(identity, path);
        writes.push({ path, blob });
      }
      return { kind: "build-file", path, size: blob.size, mediaType: blob.mediaType };
    });
    await runBounded(writes, 4, async ({ path, blob }) => {
      await input.target.writeResource(path, blob, input.sync.resources);
    });
    return result;
  };

  const outputValue = async (record: TypedRecord): Promise<BuildResultOutput["value"]> => {
    if (isBlobRef(record.value)) return (await materialize([record.value]))[0]!;
    if (scalar(record.value)) return { kind: "inline", value: record.value };
    const existingPath = values.get(record.id);
    if (existingPath !== undefined) return { kind: "value", path: existingPath };
    const path = numberedPath("values", "value", ".json", valuePaths);
    values.set(record.id, path);
    const blobs: Array<{ readonly at: BuildResultValuePath; readonly blob: BlobRef }> = [];
    const value = mapValueBlobs(record.value, (blob, at) => {
      blobs.push({ at, blob });
      return null;
    }) as CanonicalValue;
    const files = await materialize(blobs.map((item) => item.blob));
    const document: BuildResultValueDocument = {
      format: "hypit.result-value@1",
      value,
      resources: blobs.map((item, index) => ({ at: item.at, file: files[index]! })),
    };
    await input.target.writeValue(path, document);
    return { kind: "value", path };
  };

  const outputRank = (record: TypedRecord | undefined, forward: HistoricalBuildOutputRef | undefined): number => forward !== undefined
    ? 0
    : record !== undefined && isBlobRef(record.value) ? 1 : record !== undefined && scalar(record.value) ? 2 : 3;
  const ready: ReadyOutput[] = input.writer.publication.outputs.flatMap((published): ReadyOutput[] => {
    if (buildResultOutput({ outputs }, published.name) !== undefined) return [];
    const source = published.source;
    if (source.kind === "historical-output") return [{ published, forward: {
      kind: "build-output" as const,
      build: source.build,
      output: source.output,
    } }];
    const currentRecord = published.source.kind === "current-record" ? published.source.record : undefined;
    const record = currentRecord === undefined
      ? undefined
      : input.sync.records.find((item) => item.id === currentRecord);
    if (record === undefined) return [];
    assert(sameType(record.type, published.type),
      `Logical Output ${published.output} has the wrong type for published Output ${published.name}`);
    return [{ published, record }];
  }).sort((left, right) => outputRank(left.record, left.forward) - outputRank(right.record, right.forward)
    || compareCodeUnits(left.published.name, right.published.name));

  if (ready.length === 0) {
    return { changed: false, manifest: input.manifest, writer: input.writer };
  }

  for (const { published, record, forward } of ready) {
    defineBuildResultOutput(outputs, published.name, {
      ...(published.displayName === undefined ? {} : { displayName: published.displayName }),
      type: published.type,
      value: forward ?? await outputValue(record!),
    });
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
