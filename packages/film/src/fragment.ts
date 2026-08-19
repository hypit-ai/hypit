import { programSpaceTypes } from "@hypit/program-space";
import { spatialTypes } from "@hypit/spatial";
import { compositionTypes } from "@hypit/composition";
import type { Track } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";

import { filmProducers, filmTypes } from "./manifest.js";
import type { FilmAssemblyFragmentOptions, FilmTrackInput } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function assertTrackInputs(tracks: readonly FilmTrackInput[]): FilmTrackInput[] {
  const names = new Set(["program", "canvas", "space"]);
  return [...tracks]
    .map((track) => ({ name: track.name.trim(), kind: track.kind }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((track) => {
      if (!track.name) throw new Error("Film Track input name must not be empty.");
      if (names.has(track.name)) throw new Error(`Film Track input name ${track.name} is reserved or duplicated.`);
      names.add(track.name);
      return track;
    });
}

/**
 * Create one hygienic, finite Fragment for a concrete Film declaration. The
 * author module decides how many Track references it has; Core still receives
 * ordinary fixed-port Operations after this lowering.
 */
export function createFilmAssemblyFragment(options: FilmAssemblyFragmentOptions) {
  const tracks = assertTrackInputs(options.tracks);
  const operations: FragmentOperation[] = [{
    id: "track-set:empty",
    producer: filmProducers.createTrackSet,
    inputs: {},
    result: { kind: "output" as const, name: "set" },
  }];
  let current = "track-set:empty";
  tracks.forEach((track, index) => {
    const id = `track-set:append:${String(index).padStart(4, "0")}`;
    operations.push({
      id,
      producer: track.kind === "visual" ? filmProducers.appendVisualTrack : filmProducers.appendAudioTrack,
      inputs: { set: operation(current), space: input("space"), track: input(track.name) },
      result: { kind: "output" as const, name: "set" },
    });
    current = id;
  });
  operations.push({
    id: "film:composition",
    producer: filmProducers.compileComposition,
    inputs: {
      program: input("program"),
      canvas: input("canvas"),
      space: input("space"),
      set: operation(current),
    },
    result: { kind: "output" as const, name: "composition" },
  });
  return sealGraphFragment({
    inputs: [
      { name: "program", type: filmTypes.program },
      { name: "canvas", type: spatialTypes.canvas },
      { name: "space", type: programSpaceTypes.programSpace },
      ...tracks.map((track) => ({
        name: track.name,
        type: track.kind === "visual" ? compositionTypes.visualTrack : compositionTypes.audioTrack,
      })),
    ],
    operations,
    exports: [
      {
        name: "composition",
        type: compositionTypes.composition,
        root: operation("film:composition"),
      },
    ],
  });
}
