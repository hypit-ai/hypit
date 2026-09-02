import assert from "node:assert/strict";
import test from "node:test";

import { S3BuildResultRepository } from "@hypit/build-result-s3";
import type { BuildResultS3Client } from "@hypit/build-result-s3";
import type { BlobRef, BuildState, TypeRef } from "@hypit/protocol";

const videoType: TypeRef = {
  module: { name: "example.media", version: "1" },
  name: "Video",
};
const takeType: TypeRef = {
  module: { name: "example.speech", version: "1" },
  name: "SemanticTake",
};

class MemoryS3 implements BuildResultS3Client {
  readonly objects = new Map<string, Uint8Array>();
  readonly listRequests: {
    readonly prefix: string;
    readonly limit?: number;
    readonly after?: string;
    readonly delimiter?: string;
  }[] = [];

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.objects.set(key, Uint8Array.from(bytes));
  }

  async putStream(key: string, chunks: AsyncIterable<Uint8Array>): Promise<void> {
    const values: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of chunks) {
      const value = Uint8Array.from(chunk);
      values.push(value);
      size += value.byteLength;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const value of values) {
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    this.objects.set(key, bytes);
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const value = this.objects.get(key);
    return value === undefined ? undefined : Uint8Array.from(value);
  }

  async open(key: string, range?: { readonly start: number; readonly endExclusive: number }): Promise<AsyncIterable<Uint8Array> | undefined> {
    const value = this.objects.get(key);
    if (value === undefined) return undefined;
    const selected = range === undefined ? value : value.slice(range.start, range.endExclusive);
    return (async function* () {
      yield Uint8Array.from(selected);
    })();
  }

  async list(prefix: string, options: {
    readonly limit?: number;
    readonly after?: string;
    readonly delimiter?: string;
  } = {}): Promise<readonly string[]> {
    this.listRequests.push({ prefix, ...options });
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const items = options.delimiter === undefined
      ? keys
      : [...new Set(keys.map((key) => {
          const remainder = key.slice(prefix.length);
          const split = remainder.indexOf(options.delimiter!);
          return split < 0 ? key : `${prefix}${remainder.slice(0, split + options.delimiter!.length)}`;
        }))];
    const selected = options.after === undefined ? items : items.filter((item) => item > options.after!);
    return options.limit === undefined ? selected : selected.slice(0, options.limit);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

function state(input: {
  readonly status?: BuildState["status"];
  readonly records: BuildState["records"];
  readonly bindings: readonly { readonly output: string; readonly record: string }[];
}): BuildState {
  return {
    status: input.status ?? "active",
    records: input.records,
    plan: {
      outputBindings: input.bindings.map((binding) => ({
        ...binding,
        type: input.records.find((record) => record.id === binding.record)!.type,
      })),
    },
  } as unknown as BuildState;
}

test("S3 keeps the same Build Result model as the filesystem repository", async () => {
  const client = new MemoryS3();
  const repository = new S3BuildResultRepository({
    bucket: "unused-by-memory-client",
    prefix: "projects/episode-12",
    client,
  });
  const bytes = new TextEncoder().encode("one video");
  const video: BlobRef = {
    kind: "blob",
    resource: "res_same_build_video",
    size: bytes.byteLength,
    mediaType: "video/mp4",
  };
  const writer = await repository.create({
    id: "bld_20260902T100000000Z_0000000001",
    title: "opening variants",
    source: { path: "/project/main.svml" },
    run: { path: "/project/build.svrun" },
    targets: ["shot.video"],
    publishedOutputs: [
      { name: "shot.take", output: "logical:take" },
      { name: "shot.video", output: "logical:video" },
    ],
  });
  const manifest = await writer.sync({
    state: state({
      records: [
        { id: "record:video", type: videoType, value: video },
        {
          id: "record:take",
          type: takeType,
          value: {
            kind: "inline",
            value: { media: { visual: { artifact: video } } },
          },
        },
      ],
      bindings: [
        {
          output: "logical:video",
          record: "record:video",
        },
        {
          output: "logical:take",
          record: "record:take",
        },
      ],
    }),
    resources: {
      async open() {
        return (async function* () {
          yield bytes;
        })();
      },
    },
  });

  assert.equal(manifest.title, "opening variants");
  assert.equal(manifest.outputs["shot.video"]?.value.kind, "build-file");
  assert.equal(manifest.outputs["shot.take"]?.value.kind, "value");
  assert.deepEqual(
    [...client.objects.keys()].filter((key) => key.includes("/files/")).map((key) => key.slice(key.indexOf("/files/"))),
    ["/files/file-0001.mp4"],
  );
  const resolvedTake = await repository.resolve("bld_20260902T100000000Z_0000000001", "shot.take");
  assert.equal(resolvedTake?.value.kind, "value");
  if (resolvedTake?.value.kind !== "value") throw new Error("expected Composite Result value");
  assert.deepEqual(resolvedTake.value.document, {
    format: "hypit.result-value@1",
    value: { media: { visual: { artifact: null } } },
    resources: [{
      at: ["media", "visual", "artifact"],
      file: {
        kind: "build-file",
        path: "files/file-0001.mp4",
        size: bytes.byteLength,
        mediaType: "video/mp4",
      },
    }],
  });
  assert.deepEqual(
    (await repository.browse({ limit: 20 })).results.map((item) => item.id),
    [],
  );
  await writer.finish({ outcome: "complete" });
  await writer.finish({ outcome: "complete" });
  assert.equal(client.objects.has("projects/episode-12/bld_20260902T100000000Z_0000000001/.writer.json"), false);
  await assert.rejects(
    writer.finish({ outcome: "failed", failure: "different" }),
    /already finished with a different outcome/u,
  );
  assert.deepEqual((await repository.browse({ limit: 20 })).results.map((item) => item.id), ["bld_20260902T100000000Z_0000000001"]);
  const presented = await repository.updatePresentation("bld_20260902T100000000Z_0000000001", {
    title: "Episode 12 opening",
    note: "Preferred composite.",
    highlightedOutputs: ["shot.video"],
  });
  assert.equal(presented.title, "Episode 12 opening");
  assert.equal(presented.note, "Preferred composite.");
  assert.deepEqual(presented.highlightedOutputs, ["shot.video"]);
});

test("S3 opens only the requested byte range of a Result file", async () => {
  const client = new MemoryS3();
  const repository = new S3BuildResultRepository({ bucket: "unused", client });
  const bytes = new TextEncoder().encode("0123456789");
  const build = "bld_20260902T100000010Z_0000000001";
  const physical = `${(Number.MAX_SAFE_INTEGER - Date.parse("2026-09-02T10:00:00.010Z")).toString().padStart(16, "0")}-${build}`;
  client.objects.set(`${physical}/files/video.mp4`, bytes);
  const stream = await repository.openFile(build, {
    kind: "build-file",
    path: "files/video.mp4",
    size: bytes.byteLength,
    mediaType: "video/mp4",
  }, { start: 2, endExclusive: 6 });
  assert.notEqual(stream, undefined);
  const chunks: number[] = [];
  for await (const chunk of stream!) chunks.push(...chunk);
  assert.equal(new TextDecoder().decode(Uint8Array.from(chunks)), "2345");
});

test("S3 diagnosis performs one bounded prefix listing", async () => {
  const client = new MemoryS3();
  const repository = new S3BuildResultRepository({
    bucket: "unused",
    prefix: "projects/episode-12",
    client,
  });
  await repository.diagnose();
  assert.deepEqual(client.listRequests, [{ prefix: "projects/episode-12/", limit: 1 }]);
});

test("S3 browses ordered Build ids newest first with a public cursor", async () => {
  const client = new MemoryS3();
  const repository = new S3BuildResultRepository({
    bucket: "unused",
    prefix: "projects/episode-12",
    client,
  });
  const ids = [
    "bld_20260902T100000001Z_0000000001",
    "bld_20260902T100000002Z_0000000001",
    "bld_20260902T100000003Z_0000000001",
  ];
  for (const id of ids) {
    const writer = await repository.create({
      id,
      source: { path: "/project/main.svml" },
      targets: ["video"],
      publishedOutputs: [{ name: "video", output: "logical:video" }],
    });
    await writer.finish({ outcome: "failed", failure: "ordering fixture" });
  }

  const first = await repository.browse({ limit: 2 });
  assert.deepEqual(first.results.map((item) => item.id), [ids[2], ids[1]]);
  assert.equal(first.next, ids[1]);
  if (first.next === undefined) throw new Error("expected an older Result cursor");
  const second = await repository.browse({ limit: 2, before: first.next });
  assert.deepEqual(second.results.map((item) => item.id), [ids[0]]);
  assert.equal(second.next, undefined);
  assert.equal(client.listRequests.at(-1)?.after?.endsWith(`-${ids[1]}/`), true);
});

test("S3 forwarding can cross several Builds without copying the historical file", async () => {
  const client = new MemoryS3();
  const repository = new S3BuildResultRepository({ bucket: "fixture", client });
  const bytes = new TextEncoder().encode("historical video");
  const original = await repository.create({
    id: "bld_20260902T100000001Z_0000000001",
    source: { path: "/project/main.svml" },
    targets: ["video"],
    publishedOutputs: [{ name: "video", output: "logical:video" }],
  });
  await original.sync({
    state: state({
      status: "complete",
      records: [
        {
          id: "record:video",
          type: videoType,
          value: {
            kind: "blob",
            resource: "res_original",
            size: bytes.byteLength,
            mediaType: "video/mp4",
          },
        },
      ],
      bindings: [
        {
          output: "logical:video",
          record: "record:video",
        },
      ],
    }),
    resources: {
      async open() {
        return (async function* () {
          yield bytes;
        })();
      },
    },
  });

  const forward = async (id: string, fromBuild: string) => {
    const writer = await repository.create({
      id,
      source: { path: "/project/main.svml" },
      targets: ["video"],
      publishedOutputs: [{ name: "video", output: "logical:video" }],
      forwards: [{ output: "logical:video", build: fromBuild, sourceOutput: "video" }],
    });
    await writer.sync({
      state: state({
        status: "complete",
        records: [
          {
            id: "record:reused",
            type: videoType,
            value: {
              kind: "blob",
              resource: "res_reused",
              size: bytes.byteLength,
              mediaType: "video/mp4",
            },
          },
        ],
        bindings: [
          {
            output: "logical:video",
            record: "record:reused",
          },
        ],
      }),
      resources: {
        async open() {
          throw new Error("forwarded bytes must not be copied");
        },
      },
    });
  };
  await forward("bld_20260902T100000002Z_0000000001", "bld_20260902T100000001Z_0000000001");
  await forward("bld_20260902T100000003Z_0000000001", "bld_20260902T100000002Z_0000000001");

  const resolved = await repository.resolve("bld_20260902T100000003Z_0000000001", "video");
  assert.equal(resolved?.build, "bld_20260902T100000001Z_0000000001");
  assert.equal(resolved?.value.kind, "build-file");
  if (resolved?.value.kind !== "build-file") throw new Error("expected historical file");
  const opened = await repository.openFile(resolved.build, resolved.value);
  if (opened === undefined) throw new Error("expected historical file bytes");
  const chunks: Uint8Array[] = [];
  for await (const chunk of opened) chunks.push(chunk);
  assert.equal(new TextDecoder().decode(Uint8Array.from(chunks.flatMap((chunk) => [...chunk]))), "historical video");
  assert.equal([...client.objects.keys()].filter((key) => key.includes("/files/")).length, 1);
});
