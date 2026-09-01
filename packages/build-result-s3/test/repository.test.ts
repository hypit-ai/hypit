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

  async open(key: string): Promise<AsyncIterable<Uint8Array> | undefined> {
    const value = this.objects.get(key);
    if (value === undefined) return undefined;
    return (async function* () {
      yield Uint8Array.from(value);
    })();
  }

  async list(prefix: string): Promise<readonly string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix));
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

function state(input: {
  readonly status?: BuildState["status"];
  readonly records: BuildState["records"];
  readonly selections: BuildState["plan"]["selections"];
}): BuildState {
  return {
    status: input.status ?? "active",
    records: input.records,
    plan: { selections: input.selections },
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
    digest: `sha256:${"1".repeat(64)}`,
    size: bytes.byteLength,
    mediaType: "video/mp4",
  };
  const writer = await repository.create({
    id: "bld_one",
    name: "opening variants",
    source: { path: "/project/main.svml" },
    run: { path: "/project/build.svrun" },
    targets: ["final.video"],
    aliases: [
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
      selections: [
        {
          output: "logical:video",
          candidate: "candidate:video",
          record: "record:video",
        },
        {
          output: "logical:take",
          candidate: "candidate:take",
          record: "record:take",
        },
      ],
    }),
    artifacts: {
      async open() {
        return (async function* () {
          yield bytes;
        })();
      },
    },
  });

  assert.equal(manifest.name, "opening variants");
  assert.equal(manifest.outputs["shot.video"]?.value.kind, "build-file");
  assert.equal(manifest.outputs["shot.take"]?.value.kind, "json");
  assert.deepEqual(
    [...client.objects.keys()].filter((key) => key.includes("/files/")),
    ["projects/episode-12/bld_one/files/shot.video.mp4"],
  );
  const resolvedTake = await repository.resolve("bld_one", "shot.take");
  assert.equal(resolvedTake?.value.kind, "json");
  if (resolvedTake?.value.kind !== "json") throw new Error("expected structured result");
  assert.deepEqual(resolvedTake.value.value, {
    media: {
      visual: {
        artifact: {
          kind: "build-file",
          path: "files/shot.video.mp4",
          size: bytes.byteLength,
          mediaType: "video/mp4",
        },
      },
    },
  });
  assert.deepEqual(
    (await repository.list()).map((item) => item.id),
    ["bld_one"],
  );
});

test("S3 forwarding can cross several Builds without copying the historical file", async () => {
  const client = new MemoryS3();
  const repository = new S3BuildResultRepository({ bucket: "fixture", client });
  const bytes = new TextEncoder().encode("historical video");
  const original = await repository.create({
    id: "bld_original",
    source: { path: "/project/main.svml" },
    targets: ["video"],
    aliases: [{ name: "video", output: "logical:video" }],
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
            digest: `sha256:${"2".repeat(64)}`,
            size: bytes.byteLength,
            mediaType: "video/mp4",
          },
        },
      ],
      selections: [
        {
          output: "logical:video",
          candidate: "candidate:video",
          record: "record:video",
        },
      ],
    }),
    artifacts: {
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
      aliases: [{ name: "video", output: "logical:video" }],
      reuses: [{ candidate: "candidate:reuse", build: fromBuild, output: "video" }],
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
              digest: `sha256:${"3".repeat(64)}`,
              size: bytes.byteLength,
              mediaType: "video/mp4",
            },
          },
        ],
        selections: [
          {
            output: "logical:video",
            candidate: "candidate:reuse",
            record: "record:reused",
          },
        ],
      }),
      artifacts: {
        async open() {
          throw new Error("forwarded bytes must not be copied");
        },
      },
    });
  };
  await forward("bld_second", "bld_original");
  await forward("bld_third", "bld_second");

  const resolved = await repository.resolve("bld_third", "video");
  assert.equal(resolved?.build, "bld_original");
  assert.equal(resolved?.value.kind, "build-file");
  if (resolved?.value.kind !== "build-file") throw new Error("expected historical file");
  const opened = await repository.openFile(resolved.build, resolved.value);
  if (opened === undefined) throw new Error("expected historical file bytes");
  const chunks: Uint8Array[] = [];
  for await (const chunk of opened) chunks.push(chunk);
  assert.equal(new TextDecoder().decode(Uint8Array.from(chunks.flatMap((chunk) => [...chunk]))), "historical video");
  assert.equal([...client.objects.keys()].filter((key) => key.includes("/files/")).length, 1);
});
