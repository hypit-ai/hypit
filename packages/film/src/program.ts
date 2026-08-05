import {
  assertAudioTrackIdentity,
  assertCompositionIdentity,
  assertProgramSpaceIdentity,
  assertVisualTrackIdentity,
  sealComposition,
} from "@svml/contracts";
import type {
  AudioTrack,
  Composition,
  ProgramSpace,
  Track,
  VisualTrack,
} from "@svml/contracts";
import { digestOf, isDigest } from "@svml/protocol";
import type { Digest } from "@svml/protocol";

import type { FilmProgram, FilmTrackSet } from "./types.js";

export const createFilmTrackSetImplementationDigest = digestOf("@svml/film/create-track-set@1");
export const appendFilmVisualTrackImplementationDigest = digestOf("@svml/film/append-visual-track@1");
export const appendFilmAudioTrackImplementationDigest = digestOf("@svml/film/append-audio-track@1");
export const compileFilmCompositionImplementationDigest = digestOf("@svml/film/compile-composition@1");

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
}

function trackKey(track: Track): string {
  return `${track.contract}\u0000${track.id}`;
}

function filmProgramContent(value: Omit<FilmProgram, "digest">): Omit<FilmProgram, "digest"> {
  return {
    contract: "svml.film-program@1",
    id: value.id,
    frameRate: { ...value.frameRate },
    canvas: { ...value.canvas },
  };
}

function filmTrackSetContent(value: Omit<FilmTrackSet, "digest">): Omit<FilmTrackSet, "digest"> {
  return {
    contract: "svml.film-track-set@1",
    programSpace: {
      ...value.programSpace,
      frameRate: { ...value.programSpace.frameRate },
    },
    tracks: [...value.tracks]
      .map((track) => structuredClone(track))
      .sort((left, right) => trackKey(left).localeCompare(trackKey(right))),
    ...(value.lastAddition === undefined ? {} : { lastAddition: { ...value.lastAddition } }),
  };
}

export function computeFilmProgramDigest(value: Omit<FilmProgram, "digest">): Digest {
  return digestOf(filmProgramContent(value));
}

export function sealFilmProgram(value: Omit<FilmProgram, "digest">): FilmProgram {
  const content = filmProgramContent(value);
  return { ...content, digest: digestOf(content) };
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
  const { digest: _digest, ...content } = program;
  if (!isDigest(program.digest) || program.digest !== computeFilmProgramDigest(content)) {
    throw new Error("FilmProgram digest does not match its contents.");
  }
}

export function computeFilmTrackSetDigest(value: Omit<FilmTrackSet, "digest">): Digest {
  return digestOf(filmTrackSetContent(value));
}

function sealFilmTrackSet(value: Omit<FilmTrackSet, "digest">): FilmTrackSet {
  const content = filmTrackSetContent(value);
  return { ...content, digest: digestOf(content) };
}

export function assertFilmTrackSetIdentity(set: FilmTrackSet): void {
  if (set.contract !== "svml.film-track-set@1") throw new Error("Unsupported FilmTrackSet contract.");
  assertProgramSpaceIdentity(set.programSpace);
  const { digest: _digest, ...content } = set;
  if (!isDigest(set.digest) || set.digest !== computeFilmTrackSetDigest(content)) {
    throw new Error("FilmTrackSet digest does not match its contents.");
  }
  const ids = new Set<string>();
  for (const track of set.tracks) {
    if (ids.has(track.id)) throw new Error(`FilmTrackSet contains duplicate Track id ${track.id}.`);
    ids.add(track.id);
    if (track.contract === "svml.visual-track@1") assertVisualTrackIdentity(track, set.programSpace);
    else assertAudioTrackIdentity(track, set.programSpace);
  }
  if (set.tracks.length === 0 && set.lastAddition !== undefined) {
    throw new Error("An empty FilmTrackSet cannot declare a last addition.");
  }
  if (set.tracks.length > 0 && set.lastAddition === undefined) {
    throw new Error("A non-empty FilmTrackSet must declare its last addition.");
  }
  if (set.lastAddition !== undefined) {
    if (!isDigest(set.lastAddition.previousSetDigest) || !isDigest(set.lastAddition.trackDigest)) {
      throw new Error("FilmTrackSet last addition contains an invalid digest.");
    }
    if (!set.tracks.some((track) => track.digest === set.lastAddition?.trackDigest)) {
      throw new Error("FilmTrackSet last addition does not identify one of its Tracks.");
    }
  }
}

export function createFilmTrackSet(programSpace: ProgramSpace): FilmTrackSet {
  assertProgramSpaceIdentity(programSpace);
  return sealFilmTrackSet({
    contract: "svml.film-track-set@1",
    programSpace,
    tracks: [],
  });
}

function appendTrack(set: FilmTrackSet, track: Track): FilmTrackSet {
  assertFilmTrackSetIdentity(set);
  if (track.contract === "svml.visual-track@1") assertVisualTrackIdentity(track, set.programSpace);
  else assertAudioTrackIdentity(track, set.programSpace);
  if (set.tracks.some((existing) => existing.id === track.id)) {
    throw new Error(`FilmTrackSet already contains Track id ${track.id}.`);
  }
  return sealFilmTrackSet({
    contract: "svml.film-track-set@1",
    programSpace: set.programSpace,
    tracks: [...set.tracks, track],
    lastAddition: {
      previousSetDigest: set.digest,
      trackDigest: track.digest,
    },
  });
}

export function appendFilmVisualTrack(set: FilmTrackSet, track: VisualTrack): FilmTrackSet {
  return appendTrack(set, track);
}

export function appendFilmAudioTrack(set: FilmTrackSet, track: AudioTrack): FilmTrackSet {
  return appendTrack(set, track);
}

export function compileFilmComposition(program: FilmProgram, set: FilmTrackSet): Composition {
  assertFilmProgramIdentity(program);
  assertFilmTrackSetIdentity(set);
  if (
    program.frameRate.numerator !== set.programSpace.frameRate.numerator
    || program.frameRate.denominator !== set.programSpace.frameRate.denominator
  ) {
    throw new Error("FilmProgram and FilmTrackSet use different frame rates.");
  }
  const composition = sealComposition({
    contract: "svml.composition@1",
    id: program.id,
    programSpace: set.programSpace,
    canvas: program.canvas,
    tracks: set.tracks,
  });
  assertCompositionIdentity(composition);
  return composition;
}
