import { useEffect, useRef, useState } from "react";
import type { NleStudioActionObservation, NleStudioActionRequest, NleStudioOpenProjection } from "../protocol.js";
import { cancelAction, readAction, startAction } from "./api.js";

export function usePreview(input: {
  readonly session: NleStudioOpenProjection | undefined;
  readonly atFrame: number;
  readonly playing: boolean;
  readonly blocked: boolean;
}) {
  const { session, atFrame, playing, blocked } = input;
  const composition = session?.timeline.scene.composition;
  const project = session?.status.projectRevision;
  const view = session?.status.viewRevision;
  const maximum = session?.timeline.scene.maximumFrame ?? 0;
  const hasTimedItems = session?.timeline.scene.tracks.some(track => track.items.length > 0) ?? false;
  const rate = session?.timeline.scene.editRate;
  const framesPerSecond = rate === undefined ? 0 : rate.numerator / rate.denominator;
  const available = session?.preview.state === "available";
  const generation = session?.preview.state === "available" ? session.preview.generation : undefined;
  const playback = hasTimedItems && session?.preview.state === "available" && session.preview.playback;
  const [state, setState] = useState<NleStudioActionObservation>();
  const [failure, setFailure] = useState<string>();
  const starts = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    setState(undefined);
    setFailure(undefined);
    if (!available || !hasTimedItems || blocked || composition === undefined || project === undefined || view === undefined
      || maximum < 1 || (playing && !playback)) return;
    let active = true;
    let latest: NleStudioActionObservation | undefined;
    const startFrame = Math.max(0, Math.min(atFrame, maximum - 1));
    const context = { composition, expectedProjectRevision: project, expectedViewRevision: view, atFrame: startFrame };
    const action: NleStudioActionRequest = playing
      ? { ...context, kind: "playback-preview", durationFrames: Math.min(240, Math.max(1, Math.floor(3 * framesPerSecond))) }
      : { ...context, kind: "frame-preview" };
    const run = async () => {
      const starting = starts.current.then(async () => active ? await startAction(action) : undefined);
      starts.current = starting.catch(() => undefined);
      latest = await starting;
      if (latest === undefined) return;
      if (!active && (latest.state === "queued" || latest.state === "running")) {
        void cancelAction(latest.handle).catch(() => undefined);
        return;
      }
      while (active) {
        setState(latest);
        if (latest.state !== "queued" && latest.state !== "running") return;
        await new Promise<void>(resolve => window.setTimeout(resolve, 150));
        if (!active) return;
        latest = await readAction(latest.handle);
      }
    };
    const timer = window.setTimeout(() => {
      void run().catch((error: unknown) => {
        if (active) setFailure(error instanceof Error ? error.message : String(error));
      });
    }, playing ? 0 : 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
      if (latest?.state === "queued" || latest?.state === "running") {
        void cancelAction(latest.handle).catch(() => undefined);
      }
    };
  }, [available, hasTimedItems, generation, playback, composition, project, view, atFrame, playing, blocked, maximum, framesPerSecond]);

  return { state, failure, playback };
}
