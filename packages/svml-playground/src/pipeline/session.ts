/**
 * One reading of a Source: compile it, build every Track in it, render the
 * result, and hand back what the panels display.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { renderPreview } from "../preview/render.js";
import type { PlaygroundSnapshot } from "../shared.js";
import { openArchive } from "./archive.js";
import type { Archive } from "./archive.js";
import type { ServedFile } from "./compile.js";
import { preview } from "./preview.js";
import { snapshot } from "./snapshot.js";

export type Session = {
  readonly snapshot: PlaygroundSnapshot;
  /** Files the Source named, by digest, for the preview to serve. */
  readonly material: ReadonlyMap<string, ServedFile>;
};

export async function readSource(input: {
  readonly source: string;
  readonly run?: string;
  /** A Runtime profile, so material earlier builds produced can be read. */
  readonly runtime?: string;
  readonly packageRoot: string;
  readonly revision: number;
}): Promise<Session> {
  const archive = input.runtime === undefined
    ? undefined
    : await openArchive(input.runtime, input.packageRoot);
  try {
    return await read(input, archive);
  } finally {
    await archive?.close();
  }
}

async function read(
  input: { readonly source: string; readonly run?: string; readonly revision: number },
  archive: Archive | undefined,
): Promise<Session> {
  const built = await preview(input.source, input.run, archive);
  const text = readFileSync(input.source, "utf8");

  // Only Tracks that were built can be drawn; the rest are reported as waiting.
  const drawable = built.tracks
    .map((track) => track.track)
    .filter((track): track is object => track !== undefined);
  const srcdoc = renderPreview({
    id: "preview",
    canvas: built.canvas,
    space: built.space as never,
    tracks: drawable as never,
    served: new Set(built.served.keys()),
    ...(audible(built) === undefined ? {} : { audibleTrack: audible(built)! }),
  });

  return {
    snapshot: snapshot(built, {
      revision: input.revision,
      path: input.source,
      text,
      digest: `sha256:${createHash("sha256").update(text).digest("hex")}`,
      canvas: built.canvas,
      frameRate: built.frameRate,
      preview: { kind: "hyperframes", srcdoc },
    }),
    material: built.served,
  };
}

/**
 * A preview is silent unless something carries the programme's speech. The
 * Audio Track a Source built is that thing, whichever package made it.
 */
function audible(built: Awaited<ReturnType<typeof preview>>): string | undefined {
  const found = built.tracks.find((track) => track.type === "AudioTrack" && track.track !== undefined);
  return found === undefined ? undefined : (found.track as { id?: string }).id;
}
