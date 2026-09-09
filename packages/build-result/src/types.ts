import type {
  BlobRef,
  BuildState,
  CanonicalValue,
  TypeRef,
} from "@hypit/protocol";

/** The one durable conclusion of a finished Build. Active execution belongs to Runtime. */
export type BuildResultOutcome = "complete" | "failed" | "cancelled";

export type BuildResultFileRef = {
  readonly kind: "build-file";
  /** Forward-only path relative to the owning Build's result directory. */
  readonly path: string;
  readonly size: number;
  readonly mediaType: string;
};

/** A normalized half-open byte range within one Result file. */
export type BuildResultFileRange = {
  readonly start: number;
  readonly endExclusive: number;
};

export type HistoricalBuildOutputRef = {
  readonly kind: "build-output";
  readonly build: string;
  readonly output: string;
};

export type BuildResultValuePath = readonly (string | number)[];

export type BuildResultResourceBinding = {
  /** Location of one Resource inside `value`; the encoded slot itself is `null`. */
  readonly at: BuildResultValuePath;
  readonly file: BuildResultFileRef;
};

/**
 * Durable encoding of one Composite value. Domain data stays ordinary canonical data while
 * Result-local Resource addresses live beside it, so reserved-looking domain objects cannot be
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
  | HistoricalBuildOutputRef
  | { readonly kind: "inline"; readonly value: null | boolean | number | string }
  | { readonly kind: "value"; readonly path: string };

export type BuildResultOutput = {
  readonly type: TypeRef;
  readonly value: BuildResultOutputValue;
};

/** Non-secret execution facts at the end of this attempt. Pending means the remote outcome was not observed. */
export type BuildResultOperation = {
  readonly operation: string;
  readonly need?: { readonly id: string; readonly capability: TypeRef };
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
  readonly status: "pending" | "completed" | "failed" | "cancelled";
  readonly failure?: { readonly code: string; readonly message: string };
};

export type BuildResultManifest = {
  readonly format: "hypit.build-result@1";
  /** Injected from the Repository address; `result.json` does not repeat its containing Build id. */
  readonly id: string;
  readonly title?: string;
  readonly note?: string;
  /** Human-selected public Outputs to surface first; names must exist in `outputs`. */
  readonly highlightedOutputs?: readonly string[];
  readonly source: { readonly path: string };
  readonly run?: { readonly path: string };
  /** Author-facing names of the Build's actual final goals. */
  readonly targets: readonly string[];
  readonly finishedAt?: number;
  /** Absent while this Result is still accepting completed public Outputs. */
  readonly outcome?: BuildResultOutcome;
  readonly failure?: string;
  readonly outputs: Readonly<Record<string, BuildResultOutput>>;
  readonly operations?: readonly BuildResultOperation[];
};

export type FinishedBuildResultManifest = BuildResultManifest & {
  readonly outcome: BuildResultOutcome;
  readonly finishedAt: number;
};

export type BuildResultPublishedOutput = {
  readonly name: string;
  readonly output: string;
};

export type BuildResultForward = {
  /** Logical Output in the current Build whose entire value is carried forward. */
  readonly output: string;
  readonly build: string;
  readonly sourceOutput: string;
};

export type BuildResultSeed = {
  readonly id: string;
  readonly title?: string;
  readonly source: { readonly path: string };
  readonly run?: { readonly path: string };
  readonly targets: readonly string[];
  readonly publishedOutputs: readonly BuildResultPublishedOutput[];
  readonly forwards?: readonly BuildResultForward[];
};

/** Validate the one-name-per-Output public Result surface before storage is touched. */
export function assertBuildResultSeed(seed: BuildResultSeed): void {
  if (seed.title !== undefined && seed.title.trim().length === 0) {
    throw new Error("Build Result title must not be empty");
  }
  const names = new Set<string>();
  const outputs = new Set<string>();
  for (const published of seed.publishedOutputs) {
    if (published.name.trim().length === 0) throw new Error("Published Output name must not be empty");
    if (published.output.trim().length === 0) throw new Error(`Published Output ${published.name} has no Logical Output`);
    if (names.has(published.name)) throw new Error(`Published Output name ${published.name} is repeated`);
    if (outputs.has(published.output)) {
      throw new Error(`Logical Output ${published.output} has more than one published name`);
    }
    names.add(published.name);
    outputs.add(published.output);
  }
  const targets = new Set<string>();
  for (const target of seed.targets) {
    if (!names.has(target)) throw new Error(`Target ${target} is not a published Output`);
    if (targets.has(target)) throw new Error(`Target ${target} is repeated`);
    targets.add(target);
  }
  const logicalOutputs = new Set(seed.publishedOutputs.map((published) => published.output));
  const forwards = new Set<string>();
  for (const forward of seed.forwards ?? []) {
    if (!logicalOutputs.has(forward.output)) {
      throw new Error(`Forwarded Logical Output ${forward.output} is not public`);
    }
    if (forwards.has(forward.output)) {
      throw new Error(`Logical Output ${forward.output} has more than one forward source`);
    }
    if (forward.build.trim().length === 0 || forward.sourceOutput.trim().length === 0) {
      throw new Error(`Logical Output ${forward.output} has an incomplete forward source`);
    }
    if (forward.build === seed.id) throw new Error(`Logical Output ${forward.output} cannot forward to its own Build`);
    forwards.add(forward.output);
  }
}

export type BuildResultResourceSource = {
  open(artifact: BlobRef): Promise<AsyncIterable<Uint8Array> | undefined>;
};

export type BuildResultSync = {
  readonly state: BuildState;
  readonly resources: BuildResultResourceSource;
};

export type BuildResultFinish = {
  readonly operations?: readonly BuildResultOperation[];
  readonly outcome: BuildResultOutcome;
  readonly failure?: string;
};

export type BuildResultPresentationUpdate = {
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

export type ResolvedBuildResultOutput = {
  readonly build: string;
  readonly output: string;
  readonly directory: string;
  readonly type: TypeRef;
  readonly value:
    | BuildResultFileRef
    | { readonly kind: "inline"; readonly value: null | boolean | number | string }
    | { readonly kind: "value"; readonly path: string; readonly document: BuildResultValueDocument };
};

/** Storage-neutral resolved Output. Physical repositories never enter Build or Run identity. */
export type RepositoryBuildResultOutput = Omit<ResolvedBuildResultOutput, "directory">;

/**
 * Storage-neutral description of one resolved public Output. Unlike `resolve`, this never opens a
 * Composite value document or Resource bytes. Forwarding remains internal: callers cannot use this
 * view to distinguish a forwarded Output from one produced by the named Build.
 */
export type RepositoryBuildResultOutputDescription = {
  readonly type: TypeRef;
} & (
  | { readonly kind: "scalar" }
  | { readonly kind: "composite" }
  | { readonly kind: "resource"; readonly size: number; readonly mediaType: string }
);

export type BuildResultWriter = {
  read(): Promise<BuildResultManifest>;
  sync(input: BuildResultSync): Promise<BuildResultManifest>;
  finish(input: BuildResultFinish): Promise<BuildResultManifest>;
};

/**
 * Project result history addressed only by Build id, Output name and Build-relative file path.
 * Filesystem paths, bucket keys and service URLs remain implementation details.
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
  /** Follow explicit Output forwarding and describe its terminal value without opening content. */
  describeOutput(build: string, output: string): Promise<RepositoryBuildResultOutputDescription | undefined>;
  resolve(build: string, output: string): Promise<RepositoryBuildResultOutput | undefined>;
  openFile(
    build: string,
    file: BuildResultFileRef,
    range?: BuildResultFileRange,
  ): Promise<AsyncIterable<Uint8Array> | undefined>;
};
