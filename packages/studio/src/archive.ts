import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import type { Digest, StoredValue, TypeRef } from "@hypit/protocol";

import { selectArchivedRecord } from "@hypit/cli";
import { videoCliDistribution } from "@hypit/video-cli";

export type StudioArchive = {
  readonly runtime?: Pick<Awaited<ReturnType<NodeRuntimeHost["openArchive"]>>, "status">;
  readonly resolveBuildRecord: (
    build: string,
    output: string,
  ) => Promise<{ readonly type: TypeRef; readonly value: StoredValue } | undefined>;
  readonly read: (digest: Digest) => Promise<Uint8Array | undefined>;
  readonly close: () => Promise<void>;
};

/** Open a Runtime profile read-only; Studio never creates or mutates a Build. */
export async function openStudioArchive(
  profile: string | undefined,
  packageRoot: string,
  distributionPackageRoot?: string,
): Promise<StudioArchive | undefined> {
  if (profile === undefined) return undefined;
  const host = await videoCliDistribution.openRuntimeHost(profile, {
    packageRoot,
    ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
  });
  const runtime = await host.openArchive({ readOnly: true });
  const artifacts = await host.openArtifacts();
  const cache = new Map<string, Awaited<ReturnType<typeof runtime.status>>>();
  const status = async (build: string) => {
    const held = cache.get(build);
    if (held !== undefined) return held;
    const fresh = await runtime.status(build);
    cache.set(build, fresh);
    return fresh;
  };
  return {
    runtime,
    async resolveBuildRecord(build, output) {
      const held = await status(build);
      const state = held.build?.state;
      if (state === undefined) return undefined;
      const alias = held.catalog?.aliases.find((item) => item.name === output);
      if (alias !== undefined && alias.ref.kind !== "logical-output") {
        throw new Error(`Build ${build} alias ${output} is an authored Record, not a Logical Output`);
      }
      const record = alias === undefined
        ? selectArchivedRecord(state, { output })
        : selectArchivedRecord(state, {
            name: output,
            catalog: held.catalog as NonNullable<typeof held.catalog>,
          });
      return { type: record.type, value: record.value };
    },
    async read(digest) { return await artifacts.readArtifact(digest) ?? undefined; },
    async close() {
      await artifacts.close();
      await runtime.close();
    },
  };
}
