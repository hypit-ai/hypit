import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { CliRuntimeArtifactAccess } from "./runtime-port.js";
import { isDigest } from "@hypit/protocol";
import type { BuildState, Digest, TypedRecord, TypeRef } from "@hypit/protocol";
import type { BuildCatalogEntry } from "@hypit/runtime";

type ArtifactIdentity = {
  readonly digest: Digest;
  readonly size: number;
  readonly mediaType: string;
};

export type ArchivedArtifactReference = ArtifactIdentity & {
  readonly record: string;
  readonly path: string;
};

export type ArchivedLogicalOutput = {
  readonly name: string;
  readonly type: TypeRef;
  readonly output: string;
  readonly candidate: BuildState["plan"]["selections"][number]["candidate"];
  readonly record: ReturnType<typeof summarizeRecord>;
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
  runtime: Pick<CliRuntimeArtifactAccess, "openArtifact">,
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
  runtime: Pick<CliRuntimeArtifactAccess, "openArtifact">,
  artifact: ArtifactIdentity,
  destination: string,
  subject = "Build archive",
): Promise<{ readonly kind: "artifact"; readonly path: string; readonly digest: string; readonly size: number; readonly mediaType: string }> {
  await mkdir(dirname(destination), { recursive: true });
  const source = await runtime.openArtifact(artifact.digest);
  if (source === undefined) throw new Error(`Artifact ${artifact.digest} is absent from the selected ArtifactStore`);
  const temporary = `${destination}.hypit-${randomUUID()}.part`;
  const output = await open(temporary, "wx");
  let size = 0;
  try {
    for await (const chunk of source) {
      size += chunk.byteLength;
      await output.write(chunk);
    }
    await output.close();
    if (size !== artifact.size) throw new Error(`Artifact ${artifact.digest} size differs from ${subject}`);
    // Replace an explicitly selected destination only after the stream completes.
    await rename(temporary, destination);
  } catch (error) {
    await output.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  }
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
    storage: record.value.kind,
    artifacts: collectArtifacts(value),
  };
}

function catalogAliasType(
  state: BuildState,
  ref: BuildCatalogEntry["aliases"][number]["ref"],
): TypeRef | undefined {
  return ref.kind === "record"
    ? state.program.records.find((record) => record.id === ref.id)?.type
    : state.graph.outputs.find((output) => output.id === ref.id)?.type;
}

/**
 * Public Logical Outputs that this exact Build actually selected and accepted.
 *
 * Catalog aliases alone are insufficient: a source can publish many Outputs while a Run targets
 * only a small subgraph. Authored Record aliases are useful to `get`, but are not historical
 * `build-record` Candidate roots, so this view intentionally excludes them as well.
 */
export function acceptedArchivedOutputs(
  state: BuildState,
  catalog: BuildCatalogEntry,
): readonly ArchivedLogicalOutput[] {
  const records = new Map(state.records.map((record) => [record.id, record]));
  const selections = new Map(state.plan.selections.map((selection) => [selection.output, selection]));
  return catalog.aliases.flatMap((alias) => {
    if (alias.ref.kind !== "logical-output") return [];
    const selection = selections.get(alias.ref.id);
    if (selection === undefined) return [];
    const record = records.get(selection.record);
    if (record === undefined) return [];
    return [{
      name: alias.name,
      type: record.type,
      output: alias.ref.id,
      candidate: selection.candidate,
      record: summarizeRecord(record),
    }];
  });
}

export function selectArchivedRecord(
  state: BuildState,
  options: {
    readonly record?: string;
    readonly output?: string;
    readonly name?: string;
    readonly catalog?: BuildCatalogEntry;
  },
): TypedRecord {
  const selectors = [options.record, options.output, options.name].filter((item) => item !== undefined);
  if (selectors.length > 1) {
    throw new Error("get accepts one of --name, --record or --output");
  }
  let id = options.record;
  let output = options.output;
  if (options.name !== undefined) {
    if (options.catalog === undefined) throw new Error("Build has no Host Catalog aliases");
    const alias = options.catalog.aliases.find((item) => item.name === options.name);
    if (alias === undefined) throw new Error(`Build Catalog has no output named ${options.name}`);
    if (alias.ref.kind === "record") id = alias.ref.id;
    else output = alias.ref.id;
  }
  if (output !== undefined) {
    const selection = state.plan.selections.find((item) => item.output === output);
    if (selection === undefined) throw new Error(`Build has no demanded Logical Output ${output}`);
    id = selection.record;
  }
  if (id === undefined) {
    const goals = [...new Set(state.plan.goals.map((goal) => goal.record))];
    if (goals.length !== 1) {
      throw new Error("get without a selector requires exactly one distinct target Record");
    }
    [id] = goals;
  }
  const record = state.records.find((item) => item.id === id);
  if (record === undefined) throw new Error(`Record ${id} has not been accepted by this Build`);
  return record;
}

export function inspectBuild(state: BuildState, catalog?: BuildCatalogEntry) {
  const records = new Map(state.records.map((record) => [record.id, record]));
  const selections = new Map(state.plan.selections.map((selection) => [selection.output, selection]));
  return {
    status: state.status,
    targets: state.request.targets.map((target) => {
      const selection = selections.get(target.output);
      const record = selection === undefined ? undefined : records.get(selection.record);
      return {
        output: target.output,
        ...(selection === undefined ? {} : {
          candidate: selection.candidate,
          record: selection.record,
          accepted: record !== undefined,
        }),
      };
    }),
    demandedOutputs: state.plan.selections.map((selection) => ({
      output: selection.output,
      candidate: selection.candidate,
      record: selection.record,
      accepted: records.has(selection.record),
    })),
    records: state.records.map(summarizeRecord),
    diagnostics: state.diagnostics,
    ...(catalog === undefined ? {} : {
      presentation: {
        source: catalog.source,
        ...(catalog.run === undefined ? {} : { run: catalog.run }),
        aliases: catalog.aliases.map((alias) => {
          const record = alias.ref.kind === "record"
            ? records.get(alias.ref.id)
            : (() => {
                const selection = selections.get(alias.ref.id);
                return selection === undefined ? undefined : records.get(selection.record);
              })();
          const type = record?.type ?? catalogAliasType(state, alias.ref);
          return {
            name: alias.name,
            ...(type === undefined ? {} : { type }),
            ref: alias.ref,
            ...(record === undefined ? { accepted: false } : { accepted: true, record: record.id }),
          };
        }),
      },
    }),
  };
}

/** Compact Host presentation for routine list/status output. Detailed aliases belong to inspect. */
export function summarizeBuildCatalog(catalog: BuildCatalogEntry, state?: BuildState) {
  const targetOutputs = new Set(state?.request.targets.map((target) => target.output) ?? []);
  const targetRecords = new Set(state?.plan.goals.map((goal) => goal.record) ?? []);
  return {
    source: catalog.source,
    ...(catalog.run === undefined ? {} : { run: catalog.run }),
    aliasCount: catalog.aliases.length,
    targets: catalog.aliases
      .filter((alias) => alias.ref.kind === "logical-output"
        ? targetOutputs.has(alias.ref.id)
        : targetRecords.has(alias.ref.id))
      .map((alias) => alias.name),
  };
}
