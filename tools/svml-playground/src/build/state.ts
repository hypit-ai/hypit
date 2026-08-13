import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";

/** The store schema this reader understands. A newer store is left alone. */
const SCHEMA_VERSION = 6;

export type BuildArtifact = {
  readonly digest: string;
  readonly mediaType: string;
  readonly size: number;
};

export type BuildFacts = {
  readonly buildId: string;
  readonly artifactRoot: string;
  /** Measured token timings, when the build reached alignment. */
  readonly map?: CompleteSemanticMap;
  /** The measured frame domain, which supersedes any estimate. */
  readonly space?: ProgramSpace;
  /** The muxed programme, when the build rendered one. */
  readonly video?: BuildArtifact;
  /** Any accepted Record by its public name, for a Run Source reusing one. */
  named(name: string): unknown;
};

type Alias = { readonly name: string; readonly ref: { readonly kind: string; readonly id: string } };
type Descriptor = { readonly aliases?: readonly Alias[] };
type Record_ = {
  readonly id: string;
  readonly type: { readonly module: { readonly name: string }; readonly name: string };
  readonly value: { readonly kind: string; readonly value?: unknown; readonly digest?: string; readonly mediaType?: string; readonly size?: number };
};
type State = {
  readonly status?: string;
  readonly records?: readonly Record_[];
  readonly plan?: { readonly selections?: readonly { readonly output: string; readonly record: string }[] };
};

function contractOf(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "contract" in value
    ? String((value as { contract: unknown }).contract)
    : undefined;
}

/**
 * Read what a completed build already measured, without starting a Worker.
 *
 * Everything here is a read: two SELECTs against a read-only connection and a
 * directory of content-addressed bytes. It is written to give up rather than
 * guess — a store from a newer schema, a build that never completed, a record
 * whose shape has moved — because a wrong measured timeline is worse than an
 * openly estimated one.
 */
export function readBuild(source: string, buildId?: string): BuildFacts | undefined {
  const root = join(dirname(source), ".svml");
  const path = join(root, "state.sqlite");
  // Opening a missing file would create an empty store, so ask first.
  if (!existsSync(path)) return undefined;

  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    const meta = database.prepare("SELECT schema_version FROM svml_store_meta WHERE singleton = 1").get() as
      { schema_version?: number } | undefined;
    if (meta?.schema_version !== SCHEMA_VERSION) return undefined;

    // A Run Source can name an earlier build to reuse a value from; otherwise
    // the most recent one is what an author last produced.
    const entry = (buildId === undefined
      ? database.prepare(
        "SELECT build_id, descriptor_json FROM svml_build_catalog ORDER BY updated_at DESC LIMIT 1",
      ).get()
      : database.prepare(
        "SELECT build_id, descriptor_json FROM svml_build_catalog WHERE build_id = ?",
      ).get(buildId)) as { build_id?: string; descriptor_json?: string } | undefined;
    if (entry?.build_id === undefined || entry.descriptor_json === undefined) return undefined;

    const row = database.prepare("SELECT state_json FROM svml_builds WHERE build_id = ?")
      .get(entry.build_id) as { state_json?: string } | undefined;
    if (row?.state_json === undefined) return undefined;

    const descriptor = JSON.parse(entry.descriptor_json) as Descriptor;
    const state = JSON.parse(row.state_json) as State;
    // Records from a failed or half-finished build were never validated.
    if (state.status !== "complete") return undefined;

    const records = new Map((state.records ?? []).map((record) => [record.id, record]));
    const byName = (name: string): Record_ | undefined => {
      const alias = descriptor.aliases?.find((item) => item.name === name);
      if (alias === undefined) return undefined;
      const id = alias.ref.kind === "record"
        ? alias.ref.id
        : state.plan?.selections?.find((item) => item.output === alias.ref.id)?.record;
      return id === undefined ? undefined : records.get(id);
    };

    const inline = (name: string, contract: string): unknown => {
      const record = byName(name);
      if (record?.value.kind !== "inline") return undefined;
      // A rename upstream would otherwise hand the wrong value to the timeline.
      return contractOf(record.value.value) === contract ? record.value.value : undefined;
    };

    const video = byName("final.video");
    const artifact = video?.value.kind === "blob" && typeof video.value.digest === "string"
      ? {
        digest: video.value.digest,
        mediaType: typeof video.value.mediaType === "string" ? video.value.mediaType : "video/mp4",
        size: typeof video.value.size === "number" ? video.value.size : 0,
      }
      : undefined;

    return {
      named: (name) => {
        const record = byName(name);
        return record?.value.kind === "inline" ? record.value.value : undefined;
      },
      buildId: entry.build_id,
      artifactRoot: join(root, "artifacts"),
      ...(inline("timing.map", "svml.complete-semantic-map@1") === undefined
        ? {}
        : { map: inline("timing.map", "svml.complete-semantic-map@1") as CompleteSemanticMap }),
      ...(inline("speech.space", "svml.program-space@1") === undefined
        ? {}
        : { space: inline("speech.space", "svml.program-space@1") as ProgramSpace }),
      ...(artifact === undefined ? {} : { video: artifact }),
    };
  } catch {
    // A store mid-write, a WAL without its companion, a shape that moved: the
    // preview is still useful with estimates, so never fail the read for this.
    return undefined;
  } finally {
    database?.close();
  }
}
