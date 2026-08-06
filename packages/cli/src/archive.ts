import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { LocalRuntime } from "@svml/local";
import { isDigest } from "@svml/protocol";
import type { BuildState, Digest, TypedRecord } from "@svml/protocol";

type ArtifactIdentity = {
  readonly digest: Digest;
  readonly size: number;
  readonly mediaType: string;
};

export type ArchivedArtifactReference = ArtifactIdentity & {
  readonly record: string;
  readonly path: string;
};

function artifactIdentity(value: unknown): ArtifactIdentity | undefined {
  if (value === null || Array.isArray(value) || typeof value !== "object") return undefined;
  const candidate = value as Readonly<Record<string, unknown>>;
  if (typeof candidate.digest !== "string" || !isDigest(candidate.digest)
    || typeof candidate.size !== "number" || !Number.isSafeInteger(candidate.size) || candidate.size < 0
    || typeof candidate.mediaType !== "string" || candidate.mediaType.trim().length === 0) return undefined;
  return { digest: candidate.digest, size: candidate.size, mediaType: candidate.mediaType };
}

function recordArtifact(record: TypedRecord): ArtifactIdentity | undefined {
  if (record.value.kind === "blob") return artifactIdentity(record.value);
  return artifactIdentity(record.value.value);
}

export async function materializeRecord(
  runtime: Pick<LocalRuntime, "readArtifact">,
  record: TypedRecord,
  destination: string,
): Promise<
  | { readonly kind: "artifact"; readonly path: string; readonly digest: string; readonly size: number; readonly mediaType: string }
  | { readonly kind: "json"; readonly path: string; readonly size: number }
> {
  await mkdir(dirname(destination), { recursive: true });
  const artifact = recordArtifact(record);
  if (artifact !== undefined) {
    return await materializeArtifact(runtime, artifact, destination, `Record ${record.id}`);
  }
  const inline = record.value.kind === "inline" ? record.value.value : record.value;
  const bytes = Buffer.from(`${JSON.stringify(inline, null, 2)}\n`, "utf8");
  await writeFile(destination, bytes);
  return { kind: "json", path: destination, size: bytes.byteLength };
}

export async function materializeArtifact(
  runtime: Pick<LocalRuntime, "readArtifact">,
  artifact: ArtifactIdentity,
  destination: string,
  subject = "Build archive",
): Promise<{ readonly kind: "artifact"; readonly path: string; readonly digest: string; readonly size: number; readonly mediaType: string }> {
  const bytes = await runtime.readArtifact(artifact.digest);
  if (bytes === undefined) throw new Error(`Artifact ${artifact.digest} is absent from the selected ArtifactStore`);
  if (bytes.byteLength !== artifact.size) throw new Error(`Artifact ${artifact.digest} size differs from ${subject}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return { kind: "artifact", path: destination, ...artifact };
}

export function collectArtifacts(
  value: unknown,
  path = "$",
  found: { path: string; artifact: ArtifactIdentity }[] = [],
): readonly {
  readonly path: string;
  readonly digest: Digest;
  readonly size: number;
  readonly mediaType: string;
}[] {
  const artifact = artifactIdentity(value);
  if (artifact !== undefined) found.push({ path, artifact });
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectArtifacts(item, `${path}[${index}]`, found));
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) collectArtifacts(item, `${path}.${key}`, found);
  }
  return found.map((item) => ({ path: item.path, ...item.artifact }));
}

export function findArchivedArtifact(state: BuildState, digest: string): readonly ArchivedArtifactReference[] {
  if (!isDigest(digest)) throw new Error(`--artifact requires a valid sha256 digest, received ${digest}`);
  return state.records.flatMap((record) => {
    const value = record.value.kind === "blob" ? record.value : record.value.value;
    return collectArtifacts(value)
      .filter((artifact) => artifact.digest === digest)
      .map((artifact) => ({ record: record.id, ...artifact }));
  });
}

function summarizeRecord(record: TypedRecord) {
  const value = record.value.kind === "blob" ? record.value : record.value.value;
  return {
    id: record.id,
    type: record.type,
    digest: record.digest,
    conformance: record.conformance,
    origin: record.origin,
    storage: record.value.kind,
    artifacts: collectArtifacts(value),
  };
}

export function selectArchivedRecord(
  state: BuildState,
  options: { readonly record?: string; readonly output?: string },
): TypedRecord {
  if (options.record !== undefined && options.output !== undefined) {
    throw new Error("get accepts either --record or --output, not both");
  }
  let id = options.record;
  if (options.output !== undefined) {
    const selection = state.plan.selections.find((item) => item.output === options.output);
    if (selection === undefined) throw new Error(`Build has no demanded Logical Output ${options.output}`);
    id = selection.record;
  }
  if (id === undefined) {
    const goals = [...new Set(state.plan.goals.map((goal) => goal.record))];
    if (goals.length !== 1) {
      throw new Error("get without --record or --output requires exactly one distinct target Record");
    }
    [id] = goals;
  }
  const record = state.records.find((item) => item.id === id);
  if (record === undefined) throw new Error(`Record ${id} has not been accepted by this Build`);
  return record;
}

export function inspectBuild(state: BuildState) {
  const records = new Map(state.records.map((record) => [record.id, record]));
  const selections = new Map(state.plan.selections.map((selection) => [selection.output, selection]));
  return {
    core: state.id,
    status: state.status,
    graph: state.graph.id,
    request: state.request.digest,
    targets: state.request.targets.map((target) => {
      const selection = selections.get(target.output);
      const record = selection === undefined ? undefined : records.get(selection.record);
      return {
        output: target.output,
        accepts: target.accepts,
        ...(selection === undefined ? {} : {
          candidate: selection.candidate,
          fidelity: selection.fidelity,
          record: selection.record,
          accepted: record !== undefined,
        }),
      };
    }),
    demandedOutputs: state.plan.selections.map((selection) => ({
      output: selection.output,
      candidate: selection.candidate,
      fidelity: selection.fidelity,
      record: selection.record,
      accepted: records.has(selection.record),
    })),
    records: state.records.map(summarizeRecord),
    receipts: state.receipts.length,
    derivations: state.derivations.length,
    diagnostics: state.diagnostics,
  };
}
