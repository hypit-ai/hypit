import { randomUUID } from "node:crypto";
import { applyNleTransaction, indexNleComposition, isNlePicturePresent, nleItemCovers,
  type NleCommand, type NleComposition, type NleProject } from "@hypit/nle";
import type { NleStudioMatteSourcesProjection } from "./protocol.js";

type MatteTimeline = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly lockedTracks: ReadonlySet<string>;
};

export function planMatteBinding(composition: NleComposition, content: string, source: string): NleCommand {
  const previous = composition.mattes.find(value => value.content === content);
  const matte = { id: previous?.id ?? `matte-${randomUUID()}`, content, matte: source };
  return previous === undefined ? { kind: "matte.add", composition: composition.id, matte } : { kind: "matte.replace", matte };
}

export function projectMatteSources(context: MatteTimeline, content: string): NleStudioMatteSourcesProjection {
  const index = indexNleComposition(context.composition);
  const target = index.item(content);
  if (target === undefined || !isNlePicturePresent(target.item) || !target.item.enabled) {
    return { sources: [], unavailable: "ineligible" };
  }
  const previousSource = context.composition.mattes.find(value => value.content === content)?.matte;
  const previousTrack = previousSource === undefined ? undefined : index.item(previousSource)?.track;
  let matchingSource = false;
  let coveringSource = false;
  let writableSource = false;
  const sources = context.composition.tracks.flatMap(track => track.items.flatMap(item => {
    if (!isNlePicturePresent(item) || !item.enabled || item.id === content || item.id === previousSource) return [];
    matchingSource = true;
    if (!nleItemCovers(item, target.item)) return [];
    coveringSource = true;
    if ([target.track, track, previousTrack].some(value => value !== undefined && context.lockedTracks.has(value.id))) return [];
    writableSource = true;
    try {
      applyNleTransaction(context.project, { commands: [planMatteBinding(context.composition, content, item.id)] });
      return [item.id];
    } catch {
      return [];
    }
  }));
  if (sources.length > 0) return { sources };
  if (!matchingSource) return { sources, unavailable: previousSource === undefined ? "no-source" : "no-alternative" };
  if (!coveringSource) return { sources, unavailable: "outside-range" };
  return { sources, unavailable: writableSource ? "ineligible" : "locked" };
}
