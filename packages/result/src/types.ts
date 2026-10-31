import { assertOrderedBuildId } from "@hypit/protocol";
import type {
  BlobRef,
  CanonicalValue,
  NeedId,
  ResultIntent,
  TypeRef,
  TypedRecord,
  Value,
} from "@hypit/protocol";
import { assertResultIntent } from "@hypit/protocol";

/** The one durable conclusion of a finished Build. Active execution belongs to Runtime. */
export type BuildResultOutcome = "complete" | "failed" | "cancelled";

export type BuildResultFileRef = {
  readonly kind: "build-file";
  readonly size: number;
  readonly mediaType: string;
  /** Path relative to the containing Result directory. */
  readonly path: string;
};

/** A normalized half-open byte range within one Result file. */
export type BuildResultFileRange = {
  readonly start: number;
  readonly endExclusive: number;
};

export type BuildResultValuePath = readonly (string | number)[];

export type BuildResultResourceBinding = {
  /** Location of one Resource inside `value`; the encoded slot itself is `null`. */
  readonly at: BuildResultValuePath;
  readonly file: BuildResultFileRef;
};

/**
 * Durable encoding of one array or object value. Domain data stays ordinary canonical data while
 * Resource references live beside it, so reserved-looking domain objects cannot be
 * mistaken for persistence metadata.
 */
export type BuildResultValueDocument = {
  readonly format: "hypit.result-value@1";
  readonly value: CanonicalValue;
  readonly resources: readonly BuildResultResourceBinding[];
};

function assertCanonicalValue(value: unknown, subject: string): asserts value is CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${subject} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCanonicalValue(item, `${subject}[${index}]`));
    return;
  }
  if (typeof value !== "object") throw new Error(`${subject} is not canonical data`);
  for (const [key, child] of Object.entries(value as Readonly<Record<string, unknown>>)) {
    assertCanonicalValue(child, `${subject}.${key}`);
  }
}

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

function valueAtPath(value: CanonicalValue, path: BuildResultValuePath, subject: string): CanonicalValue {
  let current = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Number.isSafeInteger(segment) || segment < 0 || !Array.isArray(current) || segment >= current.length) {
        throw new Error(`${subject} does not address a value slot`);
      }
      current = current[segment]!;
      continue;
    }
    if (typeof segment !== "string" || current === null || Array.isArray(current) || typeof current !== "object"
      || !Object.hasOwn(current, segment)) {
      throw new Error(`${subject} does not address a value slot`);
    }
    current = (current as Readonly<Record<string, CanonicalValue>>)[segment]!;
  }
  return current;
}

/** Validate the storage document before its Resource paths are decoded into Runtime values. */
export function assertBuildResultValueDocument(
  value: unknown,
  subject = "Build Result value",
): asserts value is BuildResultValueDocument {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} is not a Result value document`);
  }
  const document = value as Readonly<Record<string, unknown>>;
  if (document.format !== "hypit.result-value@1" || !Array.isArray(document.resources)) {
    throw new Error(`${subject} is not a Result value document`);
  }
  const canonicalValue = document.value;
  assertCanonicalValue(canonicalValue, `${subject}.value`);
  const occupied = new Set<string>();
  document.resources.forEach((raw, index) => {
    if (raw === null || Array.isArray(raw) || typeof raw !== "object") {
      throw new Error(`${subject}.resources[${index}] is invalid`);
    }
    const binding = raw as Readonly<Record<string, unknown>>;
    if (!Array.isArray(binding.at) || binding.at.length === 0) {
      throw new Error(`${subject}.resources[${index}].at is invalid`);
    }
    for (const segment of binding.at) {
      if (typeof segment !== "string"
        && !(typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0)) {
        throw new Error(`${subject}.resources[${index}].at is invalid`);
      }
    }
    const path = JSON.stringify(binding.at);
    if (occupied.has(path)) throw new Error(`${subject} binds ${path} more than once`);
    occupied.add(path);
    if (valueAtPath(canonicalValue, binding.at, `${subject}.resources[${index}].at`) !== null) {
      throw new Error(`${subject}.resources[${index}].at must address a null Resource slot`);
    }
    assertBuildResultFileRef(binding.file, `${subject}.resources[${index}].file`);
  });
}

export type StoredBuildResultOutputValue =
  | BuildResultFileRef
  | { readonly kind: "inline"; readonly value: null | boolean | number | string }
  | { readonly kind: "value"; readonly path: string };

export type StoredBuildResultOutput = {
  readonly type: TypeRef;
  readonly value: StoredBuildResultOutputValue;
};

/** History projection of one retained Output; storage paths remain Repository-private. */
export type BuildResultOutput = { readonly type: TypeRef } & (
  | { readonly representation: "inline"; readonly value: null | boolean | number | string;
      readonly mediaType?: never; readonly size?: never }
  | { readonly representation: "structured"; readonly value?: never;
      readonly mediaType?: never; readonly size?: never }
  | { readonly representation: "file"; readonly mediaType: string; readonly size: number }
);

/** Durable facts about one external operation attempted by this Build. */
type BuildResultOperationEvidence = {
  /** Stable identity of the finite Build request, shared with planning and execution logs. */
  readonly request: NeedId;
  readonly endpoint: string;
  readonly receipt?: { readonly id: string; readonly url?: string };
};

export type BuildResultOperation = BuildResultOperationEvidence & (
  | { readonly outcome: "unsettled" | "complete"; readonly failure?: never; readonly cancellation?: never }
  | { readonly outcome: "failed"; readonly failure: { readonly code: string; readonly message: string };
      readonly cancellation?: never }
  | { readonly outcome: "cancelled"; readonly failure?: never; readonly cancellation: {
      readonly outcome: "confirmed" | "accepted" | "unsupported" | "too-late" | "failed";
      readonly message?: string;
    } }
);

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

/** Private writable state while Runtime is still accepting retained Outputs. */
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

type BuildResultBase = {
  readonly format: "hypit.build-result@1";
  readonly id: string;
  readonly sourcePath: string;
  readonly targets: readonly string[];
  readonly outputs: Readonly<Record<string, BuildResultOutput>>;
  /** The Repository can open a published execution log without exposing its file address. */
  readonly executionLog?: true;
  readonly operations?: readonly BuildResultOperation[];
};

/** Immutable objective history published only after the Build reaches one conclusion. */
export type BuildResult = BuildResultBase & (
  | { readonly outcome: "complete"; readonly finishedAt: number; readonly failure?: never }
  | { readonly outcome: "failed" | "cancelled"; readonly finishedAt: number; readonly failure: string }
);

/**
 * Read one exact retained Output name. Output names are author data, so inherited object
 * properties such as `constructor` and `toString` are never Result entries.
 */
export function buildResultOutput(
  manifest: Pick<BuildResult, "outputs">,
  name: string,
): BuildResultOutput | undefined {
  return Object.hasOwn(manifest.outputs, name) ? manifest.outputs[name] : undefined;
}

/** Define an author-named retained Output without invoking special object setters such as `__proto__`. */
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
  /** Author-facing names requested by this Build; targets are execution evidence, not retained Outputs. */
  readonly targets: readonly string[];
  readonly intent: ResultIntent;
};

/** Validate the one-name-per-Output retained Result surface before storage is touched. */
export function assertBuildResultSeed(seed: BuildResultSeed): void {
  if (seed.sourcePath.trim().length === 0) throw new Error("Build Result Source path must not be empty");
  const targets = new Set<string>();
  for (const target of seed.targets) {
    if (target.trim().length === 0) throw new Error("Build Result target must not be empty");
    if (targets.has(target)) throw new Error(`Build Result target ${target} is repeated`);
    targets.add(target);
  }
  assertResultIntent(seed.intent);
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

export type BuildResultBrowseRequest = {
  /** Return Builds strictly older than this ordered Build id. */
  readonly before?: string;
  readonly limit: number;
};

export type BuildResultPage = {
  /** Newest first. */
  readonly results: readonly BuildResult[];
  /** Last scanned Build id when an older page may exist. */
  readonly next?: string;
};

/** One finished retained Output resolved to ordinary domain data and only its owned Resources. */
export type ResolvedBuildResultOutput = {
  readonly type: TypeRef;
  readonly value: Value;
  openResource(
    blob: BlobRef,
    range?: BuildResultFileRange,
  ): Promise<AsyncIterable<Uint8Array> | undefined>;
};

export type BuildResultWriter = {
  read(): Promise<StoredBuildResult>;
  /** Store newly accepted retained Outputs; no storage writes when none are new. */
  sync(input: BuildResultSync): Promise<StoredBuildResult>;
  finish(input: BuildResultFinish): Promise<StoredFinishedBuildResult>;
};

/**
 * Immutable project history addressed by Build id and retained Output name. Open drafts never
 * cross this reader boundary.
 */
export type BuildResultHistory = {
  read(build: string): Promise<BuildResult | undefined>;
  /** Browse finished Results in descending Build-id time order. */
  browse(request: BuildResultBrowseRequest): Promise<BuildResultPage>;
  /** Resolve one retained Output and a reader confined to Resources actually present in that Output. */
  resolve(build: string, output: string): Promise<ResolvedBuildResultOutput | undefined>;
  /** Open only the execution log explicitly published by one finished Result. */
  openExecutionLog(build: string): Promise<AsyncIterable<Uint8Array> | undefined>;
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
