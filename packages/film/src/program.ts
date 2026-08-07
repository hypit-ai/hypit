import { assertProgramSpaceIdentity } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { assertAudioTrackIdentity, assertCompositionIdentity, assertVisualTrackIdentity, sealComposition } from "@narratage/composition";
import type { AudioTrack, Composition, Track, VisualTrack } from "@narratage/composition";
import { digestOf } from "@narratage/protocol";

import type { FilmProgram, FilmTrackSet } from "./types.js";

export const createFilmTrackSetImplementationDigest = digestOf("@narratage/film/create-track-set@1");
export const appendFilmVisualTrackImplementationDigest = digestOf("@narratage/film/append-visual-track@1");
export const appendFilmAudioTrackImplementationDigest = digestOf("@narratage/film/append-audio-track@1");
export const compileFilmCompositionImplementationDigest = digestOf("@narratage/film/compile-composition@1");

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
}

function trackKey(track: Track): string {
  return `${track.contract}\u0000${track.id}`;
}

function filmProgramContent(value: FilmProgram): FilmProgram {
  return {
    contract: "svml.film-program@1",
    id: value.id,
    frameRate: { ...value.frameRate },
    canvas: { ...value.canvas },
  };
}

function filmTrackSetContent(value: FilmTrackSet): FilmTrackSet {
  return {
    contract: "svml.film-track-set@1",
    tracks: [...value.tracks]
      .map((track) => structuredClone(track))
      .sort((left, right) => trackKey(left).localeCompare(trackKey(right))),
  };
}

export function sealFilmProgram(value: FilmProgram): FilmProgram {
  return filmProgramContent(value);
}

export function assertFilmProgramIdentity(program: FilmProgram): void {
  if (program.contract !== "svml.film-program@1") throw new Error("Unsupported FilmProgram contract.");
  assertNonEmpty(program.id, "FilmProgram id");
  if (
    !Number.isSafeInteger(program.frameRate.numerator)
    || program.frameRate.numerator <= 0
    || !Number.isSafeInteger(program.frameRate.denominator)
    || program.frameRate.denominator <= 0
  ) {
    throw new Error("FilmProgram frame rate is invalid.");
  }
  if (
    !Number.isSafeInteger(program.canvas.width)
    || program.canvas.width <= 0
    || !Number.isSafeInteger(program.canvas.height)
    || program.canvas.height <= 0
    || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(program.canvas.clearColor)
  ) {
    throw new Error("FilmProgram canvas is invalid.");
  }
}

function sealFilmTrackSet(value: FilmTrackSet): FilmTrackSet {
  return filmTrackSetContent(value);
}

export function assertFilmTrackSetIdentity(set: FilmTrackSet): void {
  if (set.contract !== "svml.film-track-set@1") throw new Error("Unsupported FilmTrackSet contract.");
  const ids = new Set<string>();
  for (const track of set.tracks) {
    if (ids.has(track.id)) throw new Error(`FilmTrackSet contains duplicate Track id ${track.id}.`);
    ids.add(track.id);
    if (track.contract === "svml.visual-track@1") assertVisualTrackIdentity(track);
    else assertAudioTrackIdentity(track);
  }
}

export function createFilmTrackSet(): FilmTrackSet {
  return sealFilmTrackSet({
    contract: "svml.film-track-set@1",
    tracks: [],
  });
}

function appendTrack(set: FilmTrackSet, programSpace: ProgramSpace, track: Track): FilmTrackSet {
  assertFilmTrackSetIdentity(set);
  assertProgramSpaceIdentity(programSpace);
  if (track.contract === "svml.visual-track@1") assertVisualTrackIdentity(track, programSpace);
  else assertAudioTrackIdentity(track, programSpace);
  if (set.tracks.some((existing) => existing.id === track.id)) {
    throw new Error(`FilmTrackSet already contains Track id ${track.id}.`);
  }
  return sealFilmTrackSet({
    contract: "svml.film-track-set@1",
    tracks: [...set.tracks, track],
  });
}

export function appendFilmVisualTrack(set: FilmTrackSet, programSpace: ProgramSpace, track: VisualTrack): FilmTrackSet {
  return appendTrack(set, programSpace, track);
}

export function appendFilmAudioTrack(set: FilmTrackSet, programSpace: ProgramSpace, track: AudioTrack): FilmTrackSet {
  return appendTrack(set, programSpace, track);
}

export function compileFilmComposition(program: FilmProgram, programSpace: ProgramSpace, set: FilmTrackSet): Composition {
  assertFilmProgramIdentity(program);
  assertProgramSpaceIdentity(programSpace);
  assertFilmTrackSetIdentity(set);
  if (
    program.frameRate.numerator !== programSpace.frameRate.numerator
    || program.frameRate.denominator !== programSpace.frameRate.denominator
  ) {
    throw new Error("FilmProgram and FilmTrackSet use different frame rates.");
  }
  const composition = sealComposition({
    contract: "svml.composition@1",
    id: program.id,
    canvas: program.canvas,
    tracks: set.tracks,
  });
  assertCompositionIdentity(composition, programSpace);
  return composition;
}
