import { assertOrderedBuildId } from "@hypit/protocol";
import type {
  BlobRef,
  CanonicalValue,
  PublicationIntent,
  TypeRef,
  CapabilityRef,
  TypedRecord,
} from "@hypit/protocol";
import { assertPublicationIntent } from "@hypit/protocol";

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

export type BuildResultOutputValue =
  | BuildResultFileRef
  | { readonly kind: "inline"; readonly value: null | boolean | number | string }
  | { readonly kind: "value"; readonly path: string };

export type BuildResultOutput = {
  /** Author-provided display name; the Output identifier remains unchanged. */
  readonly displayName?: string;
  readonly type: TypeRef;
  readonly value: BuildResultOutputValue;
};

/** Non-secret execution facts at the end of this attempt. Pending means the remote outcome was not observed. */
type BuildResultOperationEvidence = {
  readonly operation: string;
  readonly need?: { readonly id: string; readonly capability: CapabilityRef };
  readonly createdAt?: number;
  readonly acknowledgedAt?: number;
  readonly endedAt?: number;
  readonly progress?: { readonly phase: string; readonly completed?: number; readonly total?: number; readonly unit?: string };
  readonly cancellation?: { readonly outcome: "confirmed" | "accepted" | "unsupported" | "too-late" | "failed"; readonly message?: string };
  readonly command: string;
  readonly endpoint: string;
  readonly pool?: string;
  readonly credentials?: Readonly<Record<string, { readonly store: string; readonly key: string }>>;
  readonly receipt?: { readonly id: string; readonly url?: string };
};

export type BuildResultOperation = BuildResultOperationEvidence & (
  | { readonly status: "pending" | "received" | "completed"; readonly failure?: never }
  | { readonly status: "failed"; readonly failure: { readonly code: string; readonly message: string } }
  | { readonly status: "cancelled"; readonly failure?: never }
);

type BuildResultManifestBase = {
  readonly format: "hypit.build-result@1";
  /** Injected from the Repository address; `result.json` does not repeat its containing Build id. */
  readonly id: string;
  readonly title?: string;
  readonly note?: string;
  /** Human-selected public Outputs to surface first; names must exist in `outputs`. */
  readonly highlightedOutputs?: readonly string[];
  /** Opaque author Source identity. A local application may choose a project-relative path. */
  readonly sourceId: string;
  /** Opaque saved Invocation Source identity, when this Build used one. */
  readonly invocationSourceId?: string;
  /** Author-facing names of the Build's actual final goals. */
  readonly targets: readonly string[];
  readonly outputs: Readonly<Record<string, BuildResultOutput>>;
  readonly operations?: readonly BuildResultOperation[];
  readonly executionLog?: BuildResultFileRef;
};

export type OpenBuildResultManifest = BuildResultManifestBase & {
  readonly outcome?: never;
  readonly finishedAt?: never;
  readonly failure?: never;
};

export type FinishedBuildResultManifest = BuildResultManifestBase & (
  | { readonly outcome: "complete"; readonly finishedAt: number; readonly failure?: never }
  | { readonly outcome: "failed" | "cancelled"; readonly finishedAt: number; readonly failure: string }
);

/** A Result is either writable or finished with one internally consistent conclusion. */
export type BuildResultManifest = OpenBuildResultManifest | FinishedBuildResultManifest;

/**
 * Read one exact public Output name. Output names are author data, so inherited object
 * properties such as `constructor` and `toString` are never Result entries.
 */
export function buildResultOutput(
  manifest: Pick<BuildResultManifest, "outputs">,
  name: string,
): BuildResultOutput | undefined {
  return Object.hasOwn(manifest.outputs, name) ? manifest.outputs[name] : undefined;
}

/** Define an author-named Output without invoking special object setters such as `__proto__`. */
export function defineBuildResultOutput(
  outputs: Record<string, BuildResultOutput>,
  name: string,
  output: BuildResultOutput,
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
  readonly title?: string;
  readonly sourceId: string;
  readonly invocationSourceId?: string;
  readonly publication: PublicationIntent;
};

/** Validate the one-name-per-Output public Result surface before storage is touched. */
export function assertBuildResultSeed(seed: BuildResultSeed): void {
  if (seed.sourceId.trim().length === 0) throw new Error("Build Result Source identity must not be empty");
  if (seed.invocationSourceId !== undefined && seed.invocationSourceId.trim().length === 0) {
    throw new Error("Build Result Invocation Source identity must not be empty");
  }
  if (seed.title !== undefined && seed.title.trim().length === 0) {
    throw new Error("Build Result title must not be empty");
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

export type BuildResultPresentationUpdate = {
  /** Exact public Output names; null removes an override. */
  readonly outputDisplayNames?: Readonly<Record<string, string | null>>;
  /** `null` removes the current title; omission leaves it unchanged. */
  readonly title?: string | null;
  /** `null` removes the current note; omission leaves it unchanged. */
  readonly note?: string | null;
  /** An empty list clears the selection; omission leaves it unchanged. */
  readonly highlightedOutputs?: readonly string[];
};

export type BuildResultBrowseRequest = {
  /** Return Builds strictly older than this ordered Build id. */
  readonly before?: string;
  readonly limit: number;
};

export type BuildResultPage = {
  /** Newest first. */
  readonly results: readonly FinishedBuildResultManifest[];
  /** Last scanned Build id when an older page may exist. */
  readonly next?: string;
};

/** Storage-neutral public Output and its stored value. */
export type RepositoryBuildResultOutput = {
  readonly build: string;
  readonly output: string;
  readonly type: TypeRef;
  readonly value:
    | BuildResultFileRef
    | { readonly kind: "inline"; readonly value: null | boolean | number | string }
    | { readonly kind: "value"; readonly path: string; readonly document: BuildResultValueDocument };
};

/**
 * Storage-neutral description of one public Output. Unlike `resolve`, this never opens a Value
 * document or Resource bytes.
 */
export type RepositoryBuildResultOutputDescription = {
  readonly type: TypeRef;
} & (
  | { readonly representation: "inline" }
  | { readonly representation: "value-document" }
  | { readonly representation: "file"; readonly size: number; readonly mediaType: string }
);

export type BuildResultWriter = {
  read(): Promise<BuildResultManifest>;
  /** Publish newly accepted public Outputs; no storage writes when none are new. */
  sync(input: BuildResultSync): Promise<BuildResultManifest>;
  finish(input: BuildResultFinish): Promise<BuildResultManifest>;
};

/**
 * Project result history addressed by Build id and Output name. File references are relative to
 * that Build's Result; each repository supplies the corresponding byte access.
 */
export type BuildResultRepository = {
  create(seed: BuildResultSeed): Promise<BuildResultWriter>;
  openWriter(build: string): Promise<BuildResultWriter | undefined>;
  /** Remove one exact unfinished Result created by a submission that never became claimable. */
  removeIncomplete(build: string): Promise<void>;
  read(build: string): Promise<BuildResultManifest | undefined>;
  /** Edit only human presentation stored inside this exact finished Result. */
  updatePresentation(build: string, update: BuildResultPresentationUpdate): Promise<BuildResultManifest>;
  /** Browse finished Results in descending Build-id time order. */
  browse(request: BuildResultBrowseRequest): Promise<BuildResultPage>;
  /** Describe one Output without opening its value document or file content. */
  describeOutput(build: string, output: string): Promise<RepositoryBuildResultOutputDescription | undefined>;
  resolve(build: string, output: string): Promise<RepositoryBuildResultOutput | undefined>;
  openFile(
    build: string,
    file: BuildResultFileRef,
    range?: BuildResultFileRange,
  ): Promise<AsyncIterable<Uint8Array> | undefined>;
};
