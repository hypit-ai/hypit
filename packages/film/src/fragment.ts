import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { filmProducers, filmTypes } from "./manifest.js";
import type { FilmAssemblyFragmentOptions, FilmTrackInput } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function assertTrackInputs(tracks: readonly FilmTrackInput[]): FilmTrackInput[] {
  const names = new Set(["program", "canvas", "timeline"]);
  return [...tracks]
    .map((track) => ({ name: track.name.trim(), kind: track.kind }))
    .map((track) => {
      if (!track.name) throw new Error("Film Track input name must not be empty.");
      if (names.has(track.name)) throw new Error(`Film Track input name ${track.name} is reserved or duplicated.`);
      names.add(track.name);
      if (track.kind === "compound") {
        if (names.has(`${track.name}:at`)) throw new Error(`Film input ${track.name}:at is duplicated.`);
        names.add(`${track.name}:at`);
      }
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
  const operations: FragmentOperation[] = [
    {
      id: "track-set:empty",
      producer: filmProducers.createTrackSet,
      inputs: {},
      result: { kind: "output" as const, name: "set" },
    },
  ];
  let current = "track-set:empty";
  tracks.forEach((track, index) => {
    const id = `track-set:append:${String(index).padStart(4, "0")}`;
    operations.push({
      id,
      producer: track.kind === "compound" ? filmProducers.appendCompound
        : track.kind === "visual" ? filmProducers.appendVisualTrack : filmProducers.appendAudioTrack,
      inputs: track.kind === "compound"
        ? { set: operation(current), timeline: input("timeline"), composition: input(track.name), at: input(`${track.name}:at`) }
        : { set: operation(current), timeline: input("timeline"), track: input(track.name) },
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
      timeline: input("timeline"),
      set: operation(current),
    },
    result: { kind: "output" as const, name: "composition" },
  });
  return sealGraphFragment({
    inputs: [
      { name: "program", type: filmTypes.program },
      { name: "canvas", type: spatialTypes.canvas },
      { name: "timeline", type: timelineTypes.timeline },
      ...tracks.flatMap((track) => track.kind === "compound" ? [
        { name: track.name, type: compositionTypes.composition },
        { name: `${track.name}:at`, type: temporalTypes.instant },
      ] : [{ name: track.name, type: track.kind === "visual" ? compositionTypes.visualTrack : compositionTypes.audioTrack }]),
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
