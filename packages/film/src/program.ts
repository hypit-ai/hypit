import { assertAudioTrackIdentity, assertCompositionIdentity, assertVisualProcessEffect, assertVisualTrackIdentity, sealComposition, sealVisualScope } from "@hypit/composition";
import type { AudioTrack, Composition, Track, VisualScope, VisualTrack } from "@hypit/composition";
import { assertCanvas } from "@hypit/spatial";
import type { Canvas } from "@hypit/spatial";
import { assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { verifyWorkingPictureSpec } from "@hypit/media";

import type { FilmProgram, FilmTrackSet, FilmVisualPlanMember } from "./types.js";

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
}

function filmProgramContent(value: FilmProgram): FilmProgram {
  return {
    id: value.id,
    clearColor: value.clearColor,
    picture: structuredClone(value.picture),
    visual: structuredClone(value.visual),
    audio: [...value.audio],
  };
}

function filmTrackSetContent(value: FilmTrackSet): FilmTrackSet {
  return {

    tracks: [...value.tracks].map((track) => structuredClone(track)),
  };
}

export function sealFilmProgram(value: FilmProgram): FilmProgram {
  return filmProgramContent(value);
}

export function assertFilmProgramIdentity(program: FilmProgram): void {
  if (program === null || typeof program !== "object" || Array.isArray(program)) {
    throw new Error("FilmProgram is invalid.");
  }
  assertNonEmpty(program.id, "FilmProgram id");
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(program.clearColor)) {
    throw new Error("FilmProgram clear color is invalid.");
  }
  verifyWorkingPictureSpec(program.picture, "FilmProgram.picture");
  if (program.visual === null || typeof program.visual !== "object" || !Array.isArray(program.visual.members)
    || !Array.isArray(program.audio)) throw new Error("FilmProgram assembly is invalid.");
  const visualSlots = new Set<number>();
  const visit = (members: readonly FilmVisualPlanMember[], label: string): void => {
    const memberIds = new Set<string>();
    for (const [index, member] of members.entries()) {
      const item = `${label}.${index}`;
      if (member === null || typeof member !== "object") throw new Error(`${item} is invalid.`);
      if (!member.id.trim() || memberIds.has(member.id)) {
        throw new Error(`${item}.id is empty or duplicated in its parent Visual Scope.`);
      }
      memberIds.add(member.id);
      if (member.kind === "track") {
        if (!Number.isSafeInteger(member.slot) || member.slot < 0) {
          throw new Error(`${item} is an invalid Visual Track member.`);
        }
        visualSlots.add(member.slot);
        continue;
      }
      if (member.kind === "stack") {
        if (!Array.isArray(member.members) || member.members.length === 0) {
          throw new Error(`${item} is an invalid Visual Stack.`);
        }
        visit(member.members, `${item}.members`);
        continue;
      }
      if (member.kind !== "process" || !Array.isArray(member.inputs) || member.inputs.length === 0) {
        throw new Error(`${item} is an invalid Visual Process.`);
      }
      assertVisualProcessEffect(member.effect, `${item}.effect`);
      const inputNames = new Set<string>();
      for (const [inputIndex, input] of member.inputs.entries()) {
        const inputLabel = `${item}.inputs.${inputIndex}`;
        if (input === null || typeof input !== "object" || !input.name.trim()
          || inputNames.has(input.name) || !Array.isArray(input.members) || input.members.length === 0) {
          throw new Error(`${inputLabel} is invalid.`);
        }
        inputNames.add(input.name);
        visit(input.members, `${inputLabel}.members`);
      }
      if (inputNames.size !== member.effect.inputs.length
        || member.effect.inputs.some((name) => !inputNames.has(name))) {
        throw new Error(`${item} inputs do not match its VisualProcessEffect.`);
      }
    }
  };
  visit(program.visual.members, "FilmProgram.visual.members");
  const audioSlots = new Set<number>();
  for (const [index, slot] of program.audio.entries()) {
    if (!Number.isSafeInteger(slot) || slot < 0 || audioSlots.has(slot) || visualSlots.has(slot)) {
      throw new Error(`FilmProgram.audio.${index} is invalid or duplicated.`);
    }
    audioSlots.add(slot);
  }
}

function sealFilmTrackSet(value: FilmTrackSet): FilmTrackSet {
  return filmTrackSetContent(value);
}

export function assertFilmTrackSetIdentity(set: FilmTrackSet): void {
  if (set === null || typeof set !== "object" || Array.isArray(set) || !Array.isArray(set.tracks)) {
    throw new Error("FilmTrackSet is invalid.");
  }
  for (const track of set.tracks) {
    if (track.kind === "visual") assertVisualTrackIdentity(track);
    else assertAudioTrackIdentity(track);
  }
}

export function createFilmTrackSet(): FilmTrackSet {
  return sealFilmTrackSet({

    tracks: [],
  });
}

function appendTrack(set: FilmTrackSet, timeline: Timeline, track: Track): FilmTrackSet {
  assertFilmTrackSetIdentity(set);
  assertTimelineIdentity(timeline);
  if (track.kind === "visual") assertVisualTrackIdentity(track, timeline);
  else assertAudioTrackIdentity(track, timeline);
  return sealFilmTrackSet({

    tracks: [...set.tracks, track],
  });
}

export function appendFilmVisualTrack(set: FilmTrackSet, timeline: Timeline, track: VisualTrack): FilmTrackSet {
  return appendTrack(set, timeline, track);
}

export function appendFilmAudioTrack(set: FilmTrackSet, timeline: Timeline, track: AudioTrack): FilmTrackSet {
  return appendTrack(set, timeline, track);
}

export function compileFilmComposition(
  program: FilmProgram,
  canvas: Canvas,
  timeline: Timeline,
  set: FilmTrackSet,
): Composition {
  assertFilmProgramIdentity(program);
  assertCanvas(canvas);
  assertTimelineIdentity(timeline);
  assertFilmTrackSetIdentity(set);
  const usedSlots = new Set<number>();
  const trackAt = (slot: number): Track => {
    const track = set.tracks[slot];
    if (track === undefined) throw new Error(`FilmProgram references missing Track slot ${slot}.`);
    usedSlots.add(slot);
    return track;
  };
  const compileVisual = (members: readonly FilmVisualPlanMember[]): VisualScope => sealVisualScope({
    members: members.map((member) => {
      if (member.kind === "stack") {
        return { kind: "stack" as const, id: member.id, scope: compileVisual(member.members) };
      }
      if (member.kind === "process") {
        return {
          kind: "process" as const,
          id: member.id,
          inputs: member.inputs.map((input) => ({ name: input.name, scope: compileVisual(input.members) })),
          effect: structuredClone(member.effect),
        };
      }
      const track = trackAt(member.slot);
      if (track.kind !== "visual") throw new Error(`FilmProgram Track slot ${member.slot} must be visual.`);
      return { kind: "track" as const, id: member.id, track };
    }),
  });
  const visual = compileVisual(program.visual.members);
  const audio = program.audio.map((slot) => {
    const track = trackAt(slot);
    if (track.kind !== "audio") throw new Error(`FilmProgram Track slot ${slot} must be audio.`);
    return track;
  });
  if (usedSlots.size !== set.tracks.length || [...set.tracks.keys()].some((slot) => !usedSlots.has(slot))) {
    throw new Error("FilmProgram must use every assembled Track.");
  }
  const composition = sealComposition({
    id: program.id,
    visual: {
      picture: structuredClone(program.picture),
      canvas: {
        width: canvas.widthPx,
        height: canvas.heightPx,
        clearColor: program.clearColor,
      },
      root: visual,
    },
    audio: { contributions: audio },
  }, timeline);
  assertCompositionIdentity(composition);
  return composition;
}
