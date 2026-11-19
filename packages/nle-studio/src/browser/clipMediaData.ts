import type { NleItem, NleMediaItem } from "@hypit/nle";
import { createTemporalMapEvaluator, type ExactTemporalValue } from "@hypit/temporal/algebra";
import { nleTimeMappingRequiredDuration } from "@hypit/nle";
import type { NleStudioMediaEntry, NleStudioSession } from "../protocol.js";

/** The shared Project Media entry a timeline Media item references, resolved against the open Project document. */
export function clipMediaEntry(session: NleStudioSession, item: NleItem | undefined): NleStudioMediaEntry | undefined {
  if (item?.kind !== "present" || item.source !== "media") return undefined;
  const base = new URL(session.projectDocument.path, "https://hypit.invalid/");
  const path = decodeURIComponent(new URL(item.asset.path, base).pathname.slice(1));
  return session.media.entries.find(entry => entry.id === path);
}

function seconds(time: ExactTemporalValue): number {
  return Number(time.ticks) * time.timeBase.numerator / time.timeBase.denominator;
}

/** Maps clip-local seconds to source seconds through the item's source-time mapping. */
export function sourceClock(item: Pick<NleMediaItem, "sourceTime" | "duration">): (local: number) => number | undefined {
  const span = nleTimeMappingRequiredDuration(item.sourceTime);
  const evaluate = createTemporalMapEvaluator({ stages: [{
    target: { id: "clip", duration: item.duration },
    source: { id: "source", duration: span.ticks === "0" ? item.duration : span },
    pieces: item.sourceTime.pieces,
  }] });
  return local => {
    const sample = evaluate({ ticks: String(Math.max(0, Math.round(local * 1000))), timeBase: { numerator: 1, denominator: 1000 } }, "after");
    return sample ? seconds(sample.position) : undefined;
  };
}

/**
 * Preview stand-in for a Composition item: its lowest Picture Track's first Media item, reached through the
 * outer occurrence time and the inner item's own source-time mapping. Only that Media is shown, not the composite.
 */
export function compoundFilm(session: NleStudioSession, item: NleItem | undefined):
  { readonly entry: NleStudioMediaEntry; readonly clock: (local: number) => number | undefined } | undefined {
  if (item?.kind !== "present" || item.source !== "composition") return undefined;
  const nested = session.open.project.project.compositions.find(composition => composition.id === item.composition);
  const inner = nested?.tracks.filter(track => track.kind === "picture" && track.role === undefined)
    .flatMap(track => track.items).find((value): value is NleMediaItem => value.kind === "present" && value.source === "media" && value.picture !== undefined);
  const entry = clipMediaEntry(session, inner);
  if (!inner || !entry?.resource || entry.state !== "available" || entry.kind === "audio") return undefined;
  const outer = sourceClock(item), media = sourceClock(inner);
  const start = seconds(inner.start), end = start + seconds(inner.duration);
  return { entry, clock: local => {
    const time = outer(local);
    return time === undefined || time < start || time >= end ? undefined : media(time - start);
  } };
}

const frames = new Map<string, Promise<string>>();
const players = new Map<string, Promise<HTMLVideoElement>>();
const queues = new Map<string, Promise<unknown>>();

function event(target: HTMLMediaElement, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { target.removeEventListener(name, done); target.removeEventListener("error", fail); resolve(); };
    const fail = () => { target.removeEventListener(name, done); target.removeEventListener("error", fail); reject(new Error("media unavailable")); };
    target.addEventListener(name, done); target.addEventListener("error", fail);
  });
}

function player(resource: string): Promise<HTMLVideoElement> {
  let value = players.get(resource);
  if (!value) {
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.playsInline = true; video.src = resource;
    value = event(video, "loadeddata").then(() => video);
    players.set(resource, value);
  }
  return value;
}

/** One small JPEG frame of a video resource near `time`, captured once and shared by every clip and zoom level. */
export function videoFrame(resource: string, time: number): Promise<string> {
  const at = Math.max(0, Math.round(time * 2) / 2), key = `${resource}@${at}`;
  const cached = frames.get(key);
  if (cached) return cached;
  const job = (queues.get(resource) ?? Promise.resolve()).then(async () => {
    const video = await player(resource);
    video.currentTime = Math.min(at, Math.max(0, video.duration - .05));
    await event(video, "seeked");
    const canvas = document.createElement("canvas");
    canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext("2d")!;
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const width = video.videoWidth * scale, height = video.videoHeight * scale;
    context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", .72);
  });
  queues.set(resource, job.catch(() => undefined));
  frames.set(key, job);
  return job;
}

export type AudioPeaks = { readonly duration: number; readonly peaks: Float32Array };
const peaks = new Map<string, Promise<AudioPeaks>>();

/** Normalised loudness peaks for an audio resource, decoded once in the browser. */
export function audioPeaks(resource: string): Promise<AudioPeaks> {
  let value = peaks.get(resource);
  if (!value) {
    value = fetch(resource).then(response => response.arrayBuffer()).then(async bytes => {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(bytes);
        const data = buffer.getChannelData(0), count = Math.max(1, Math.min(8000, Math.ceil(buffer.duration * 100)));
        const result = new Float32Array(count), step = data.length / count;
        let loudest = 0;
        for (let index = 0; index < count; index++) {
          let peak = 0;
          for (let sample = Math.floor(index * step), end = Math.floor((index + 1) * step); sample < end; sample++) peak = Math.max(peak, Math.abs(data[sample]!));
          result[index] = peak; loudest = Math.max(loudest, peak);
        }
        if (loudest > 0) for (let index = 0; index < count; index++) result[index] = result[index]! / loudest;
        return { duration: buffer.duration, peaks: result };
      } finally { void context.close(); }
    });
    peaks.set(resource, value);
  }
  return value;
}
