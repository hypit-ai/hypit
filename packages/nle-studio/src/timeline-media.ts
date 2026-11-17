import type { ProjectMediaCatalog } from "@hypit/media-asset/service";
import { nleItemEnd, type NleComposition, type NleMediaItem } from "@hypit/nle";
import {
  compareExactTemporalValues, exactTemporalRational, extrapolateTemporalAffineMapPiece, isAffineTemporalMapPiece,
  subtractExactTemporalValues, type ExactTemporalValue, type TemporalRate, type TemporalRange,
} from "@hypit/temporal/algebra";
import type { NleStudioTimelineMediaRequest, NleStudioTimelineMediaView } from "./protocol.js";
import { studioFrameTime } from "./timeline-planning.js";

const compare = compareExactTemporalValues;

function visibleMediaRange(item: NleMediaItem, range: TemporalRange): TemporalRange | undefined {
  const from = subtractExactTemporalValues(range.start, item.start);
  const until = subtractExactTemporalValues(range.end, item.start);
  const piece = item.sourceTime.pieces.find(value => compare(value.target.start, from) <= 0
    && compare(value.target.end, until) >= 0);
  if (piece === undefined || !isAffineTemporalMapPiece(piece) || piece.wrap !== undefined || piece.rate.numerator <= 0) {
    return undefined;
  }
  return {
    start: extrapolateTemporalAffineMapPiece(piece, from),
    end: extrapolateTemporalAffineMapPiece(piece, until),
  };
}

export function observeTimelineMedia(input: {
  readonly composition: NleComposition;
  readonly rate: TemporalRate;
  readonly catalog: ProjectMediaCatalog;
  readonly request: NleStudioTimelineMediaRequest;
  readonly mediaIdentity: (item: NleMediaItem) => string;
}): readonly NleStudioTimelineMediaView[] {
  const { composition, rate, catalog, request } = input;
  const ids = new Set(request.tracks);
  if (ids.size !== request.tracks.length || ids.size > 64
    || composition.tracks.filter(track => ids.has(track.id)).length !== ids.size
    || request.fromFrame < 0 || request.toFrame <= request.fromFrame) {
    throw new Error(`NLE Studio Timeline Media requires active Tracks and a positive range in ${composition.id}.`);
  }
  const from = studioFrameTime(request.fromFrame, rate);
  const to = studioFrameTime(request.toFrame, rate);
  const frames = (time: ExactTemporalValue) => {
    const value = exactTemporalRational(time);
    return Number(value.numerator) / Number(value.denominator) * rate.numerator / rate.denominator;
  };
  const catalogEntries = new Map(catalog.entries.map(entry => [entry.reference.path, entry]));
  const candidates = composition.tracks.filter(track => ids.has(track.id)).flatMap(track => track.items)
    .filter((item): item is NleMediaItem => item.kind === "present" && item.source === "media"
      && compare(item.start, to) < 0 && compare(nleItemEnd(item), from) > 0)
    .sort((left, right) => compare(left.start, right.start));
  const views: NleStudioTimelineMediaView[] = [];
  for (const item of candidates) {
    if (views.length >= 8) break;
    const media = input.mediaIdentity(item);
    const entry = catalogEntries.get(media);
    if (entry?.state !== "available") continue;
    const end = nleItemEnd(item);
    const start = compare(item.start, from) < 0 ? from : item.start;
    const until = compare(end, to) > 0 ? to : end;
    const display = { item: item.id, fromFrame: frames(start), toFrame: frames(until) };
    const source = { media, expectedMediaGeneration: catalog.generation };
    if (item.picture !== undefined && entry.picture?.kind === "constant") {
      views.push({ ...display, action: { ...source, kind: "media.thumbnail", height: 64 } });
      continue;
    }
    const range = visibleMediaRange(item, { start, end: until });
    if (range === undefined || entry.duration === undefined || compare(range.end, entry.duration) > 0) continue;
    const length = subtractExactTemporalValues(range.end, range.start);
    if (item.picture !== undefined && entry.picture?.kind === "signal" && compare(length, studioFrameTime(7200, { numerator: 1, denominator: 1 })) <= 0) {
      views.push({ ...display, action: { ...source, kind: "media.storyboard", range, frames: 6, height: 64 } });
    }
    if (views.length < 8 && item.audio !== undefined && entry.audio
      && compare(length, studioFrameTime(600, { numerator: 1, denominator: 1 })) <= 0) {
      views.push({ ...display, action: { ...source, kind: "media.waveform", range, width: 512, height: 48 } });
    }
  }
  return views;
}
