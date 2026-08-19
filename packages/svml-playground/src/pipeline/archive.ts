/**
 * The record of what has already been made.
 *
 * A Source that reuses an accepted take names the Build it came from, not a
 * path, because a produced Artifact has an identity rather than a location. So
 * a preview that is to show those takes has to read the same archive a build
 * writes - opened read-only, because a preview may not change what was accepted.
 */
import {
  createRuntimeArchiveFromConfig, createRuntimeArtifactAccessFromConfig,
} from "@hypit/runtime-local/config";
import type { BuildState } from "@hypit/protocol";

export type Archive = {
  /** A prior Build by its authored id, or undefined when it is not on this machine. */
  readonly readBuild: (id: string) => Promise<BuildState | undefined>;
  /** A public output alias, resolved to the Logical Output it names. */
  readonly resolveOutput: (id: string, output: string) => Promise<string | undefined>;
  /** Bytes for an Artifact this archive holds. */
  readonly read: (digest: string) => Promise<Uint8Array | undefined>;
  readonly close: () => Promise<void>;
};

/**
 * Open the archive a Runtime profile points at. The profile is the only thing
 * that says where it lives, which is why it is the one extra argument a preview
 * needs to show produced material.
 */
export async function openArchive(profilePath: string, packageRoot: string): Promise<Archive> {
  const control = await createRuntimeArchiveFromConfig(profilePath, { packageRoot } as never);
  // Which Build accepted what, and the bytes behind it, are two stores now.
  const artifacts = await createRuntimeArtifactAccessFromConfig(profilePath, { packageRoot } as never);
  const seen = new Map<string, Awaited<ReturnType<typeof control.status>>>();
  const status = async (id: string): Promise<Awaited<ReturnType<typeof control.status>>> => {
    const held = seen.get(id);
    if (held !== undefined) return held;
    const fresh = await control.status(id);
    seen.set(id, fresh);
    return fresh;
  };
  return {
    async readBuild(id) {
      try {
        return (await status(id)).build?.state;
      } catch {
        // An archive that does not hold this Build is not a broken archive.
        return undefined;
      }
    },
    async resolveOutput(id, output) {
      try {
        const alias = (await status(id)).catalog?.aliases.find((item: { name: string }) => item.name === output);
        if (alias === undefined) return output;
        return alias.ref.kind === "logical-output" ? alias.ref.id : undefined;
      } catch {
        return undefined;
      }
    },
    async read(digest) {
      try {
        return await artifacts.readArtifact(digest as never) ?? undefined;
      } catch {
        return undefined;
      }
    },
    close: async () => { await artifacts.close(); await control.close(); },
  };
}
