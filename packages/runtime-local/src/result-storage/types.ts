import { assertOrderedBuildId } from "@hypit/hypit/protocol";
import type {
  BlobRef,
  PublicationIntent,
  TypeRef,
  TypedRecord,
} from "@hypit/hypit/protocol";
import { assertPublicationIntent } from "@hypit/hypit/protocol";
import type {
  ProductValueDocument,
  StoredProduct,
} from "@hypit/hypit/product";
import type { BuildResultHistory, BuildResultOperation } from "@hypit/hypit/result";

export type BuildResultFileRef = {
  readonly kind: "build-file";
  readonly size: number;
  readonly mediaType: string;
  /** Path relative to the containing Result directory. */
  readonly path: string;
};

/**
 * Durable encoding of one array or object value. Domain data stays ordinary canonical data while
 * Resource references live beside it, so reserved-looking domain objects cannot be
 * mistaken for persistence metadata.
 */
export type BuildResultValueDocument = ProductValueDocument;

/** One portable address inside a Build Result; repositories map it to their own physical storage. */
export function assertBuildResultPath(value: unknown, subject: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`${subject} is not a Result-relative path`);
  }
}

export function assertBuildResultFileRef(value: unknown, subject: string): asserts value is BuildResultFileRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} is not a Build file reference`);
  }
  const item = value as Readonly<Record<string, unknown>>;
  if (item.kind !== "build-file"
    || typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size < 0
    || typeof item.mediaType !== "string" || item.mediaType.length === 0) {
    throw new Error(`${subject} is not a valid Build file reference`);
  }
  assertBuildResultPath(item.path, `${subject}.path`);
}

export type StoredBuildResultOutput = StoredProduct;

type StoredBuildResultBase = {
  readonly format: "hypit.build-result@1";
  /** Injected from the Repository address; `result.json` does not repeat its containing Build id. */
  readonly id: string;
  /** Author Source path recorded when the Build was submitted. */
  readonly sourcePath: string;
  /** Author-facing names of the Build's actual final goals. */
  readonly targets: readonly string[];
  readonly outputs: Readonly<Record<string, StoredBuildResultOutput>>;
};

/** Private writable state while Runtime is still materializing publications. */
export type BuildResultDraft = StoredBuildResultBase & {
  readonly outcome?: never;
  readonly finishedAt?: never;
  readonly failure?: never;
  readonly operations?: never;
  readonly executionLog?: never;
};

type StoredBuildResultEvidence = {
  readonly operations?: readonly BuildResultOperation[];
  readonly executionLog?: BuildResultFileRef;
};

/** Finished storage manifest used only by Runtime publication and Repository decoding. */
export type StoredFinishedBuildResult = StoredBuildResultBase & StoredBuildResultEvidence & (
  | { readonly outcome: "complete"; readonly finishedAt: number; readonly failure?: never }
  | { readonly outcome: "failed" | "cancelled"; readonly finishedAt: number; readonly failure: string }
);

/** Storage state used only by Runtime publication and recovery. */
export type StoredBuildResult = BuildResultDraft | StoredFinishedBuildResult;

/** Read one author-named published Output without invoking inherited object properties. */
export function storedBuildResultOutput(
  manifest: Pick<StoredBuildResult, "outputs">,
  name: string,
): StoredBuildResultOutput | undefined {
  return Object.hasOwn(manifest.outputs, name) ? manifest.outputs[name] : undefined;
}

/** Define one stored Output without invoking special object setters such as `__proto__`. */
export function defineStoredBuildResultOutput(
  outputs: Record<string, StoredBuildResultOutput>,
  name: string,
  output: StoredBuildResultOutput,
): void {
  Object.defineProperty(outputs, name, {
    value: output,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

export type BuildResultSeed = {
  readonly id: string;
  readonly sourcePath: string;
  /** Author-facing names requested by this Build; targets are execution evidence, not publications. */
  readonly targets: readonly string[];
  readonly publication: PublicationIntent;
};

/** Validate the publication request before storage is touched. */
export function assertBuildResultSeed(seed: BuildResultSeed): void {
  if (seed.sourcePath.trim().length === 0) throw new Error("Build Result Source path must not be empty");
  const targets = new Set<string>();
  for (const target of seed.targets) {
    if (target.trim().length === 0) throw new Error("Build Result target must not be empty");
    if (targets.has(target)) throw new Error(`Build Result target ${target} is repeated`);
    targets.add(target);
  }
  assertPublicationIntent(seed.publication);
}

export type BuildResultResourceSource = {
  open(blob: BlobRef): Promise<AsyncIterable<Uint8Array> | undefined>;
};

export type BuildResultSync = {
  /** Already accepted Records; Result does not observe Runtime lifecycle or scheduling state. */
  readonly records: readonly TypedRecord[];
  readonly resources: BuildResultResourceSource;
};

type BuildResultFinishEvidence = {
  /** Closed execution evidence; Repository stores it before publishing the terminal manifest. */
  readonly executionLog?: AsyncIterable<Uint8Array>;
  readonly operations?: readonly BuildResultOperation[];
};

export type BuildResultFinish = BuildResultFinishEvidence & (
  | { readonly outcome: "complete"; readonly failure?: never }
  | { readonly outcome: "failed" | "cancelled"; readonly failure: string }
);

export type BuildResultWriter = {
  read(): Promise<StoredBuildResult>;
  /** Store newly completed publications; no storage writes when none are new. */
  sync(input: BuildResultSync): Promise<StoredBuildResult>;
  finish(input: BuildResultFinish): Promise<StoredFinishedBuildResult>;
};

/** Runtime-owned publication and recovery port. Applications consume `BuildResultHistory`. */
export type BuildResultStore = BuildResultHistory & {
  create(seed: BuildResultSeed): Promise<BuildResultWriter>;
  openWriter(build: string): Promise<BuildResultWriter | undefined>;
  /** Remove one exact unfinished Result created by a submission that never became claimable. */
  removeIncomplete(build: string): Promise<void>;
  /** Read private publication state for active-build observation and crash recovery. */
  readStored(build: string): Promise<StoredBuildResult | undefined>;
};
