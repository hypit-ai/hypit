import { useCallback, useEffect, useRef, useState } from "react";
import { programmeAudioSampleRate, type ProgrammePlacementDraft } from "../programme-transport.js";
import type { NleStudioProgrammeProjection } from "../protocol.js";
import { playProgramme } from "./programme-playback.js";

type Mounted = {
  readonly element: HTMLIFrameElement;
  sent?: { readonly frame: number; readonly sequence: number; readonly transport?: number };
};

export function useProgrammePreview(programme: NleStudioProgrammeProjection | undefined, frame: number, seeking: boolean, playback: {
  readonly from: number | undefined;
  readonly fps: number;
  readonly muted: boolean;
  readonly onFrame: (frame: number) => void;
  readonly onEnd: () => void;
  readonly onError: (message: string) => void;
}) {
  const [active, setActive] = useState<NleStudioProgrammeProjection>();
  const [presented, setPresented] = useState<{ generation: string; target: number; frame: number; frameCount: number }>();
  const [error, setError] = useState<{ generation: string; frame: number; message: string }>();
  const mounted = useRef(new Map<string, Mounted>());
  const placement = useRef<ProgrammePlacementDraft>(undefined);
  const placementTick = useRef<number>(undefined);
  const sequence = useRef(0);
  const audio = useRef<{ context: AudioContext; output: GainNode }>(undefined);
  const running = useRef<{ generation: string; transport: number; stop: () => void }>(undefined);
  const callbacks = useRef(playback);
  callbacks.current = playback;
  const visible = active?.composition === programme?.composition ? active : undefined;
  const { from, fps, muted } = playback;
  const target = Math.max(0, Math.floor(from ?? frame));
  const current = useRef({ programme, visible, target, seeking });
  current.current = { programme, visible, target, seeking };

  const send = useCallback(() => {
    const { programme, visible, target, seeking } = current.current;
    if (!programme || running.current?.generation === programme.generation) return;
    for (const generation of new Set([visible?.generation, programme.generation])) {
      if (generation === undefined) continue;
      const page = mounted.current.get(generation);
      if (!page || (!seeking && page.sent?.transport === undefined)
        || (page.sent?.frame === target && page.sent.transport === undefined)) continue;
      const request = { frame: target, sequence: ++sequence.current };
      page.sent = request;
      page.element.contentWindow?.postMessage({ kind: "programme-seek", generation, ...request }, "*");
    }
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "null") return;
      const { programme, target, seeking } = current.current;
      const data = event.data;
      if (data?.kind !== "programme-presented" && data?.kind !== "programme-error") return;
      const page = mounted.current.get(data.generation);
      if (!page?.sent || page.element.contentWindow !== event.source) return;
      if (data.transport !== undefined) {
        const run = running.current;
        if (data.kind === "programme-error" && run !== undefined && run.generation === data.generation && run.transport === data.transport
          && typeof data.message === "string") {
          run.stop();
          callbacks.current.onError(data.message);
        }
        return;
      }
      if (page.sent.transport !== undefined || page.sent.sequence !== data.sequence) return;
      if (!seeking || programme === undefined || data.generation !== programme.generation || page.sent.frame !== target) {
        delete page.sent;
        return;
      }
      if (data.kind === "programme-error" && typeof data.message === "string") {
        setError({ generation: programme.generation, frame: target, message: data.message });
      } else if (data.kind === "programme-presented" && Number.isSafeInteger(data.frame) && Number.isSafeInteger(data.frameCount)) {
        setError(undefined);
        setPresented({ generation: programme.generation, target, frame: data.frame, frameCount: data.frameCount });
        setActive(programme);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const generation = programme?.generation;
  const visibleGeneration = visible?.generation;
  const ready = generation !== undefined && presented?.generation === generation && presented.target === target;
  useEffect(() => {
    for (const key of mounted.current.keys()) {
      if (key !== visibleGeneration && key !== generation) mounted.current.delete(key);
    }
    if (generation === undefined) setActive(undefined);
    const pending = requestAnimationFrame(send);
    return () => cancelAnimationFrame(pending);
  }, [generation, visibleGeneration, target, seeking, from, send]);

  const drawPlacement = useCallback((draft: ProgrammePlacementDraft | undefined) => {
    placement.current = draft;
    if (placementTick.current !== undefined) return;
    placementTick.current = requestAnimationFrame(() => {
      placementTick.current = undefined;
      const generation = current.current.visible?.generation;
      if (generation !== undefined) {
        const next = placement.current;
        mounted.current.get(generation)?.element.contentWindow?.postMessage({
          kind: "programme-placement-draft", generation, draft: next?.generation === generation ? next : null,
        }, "*");
      }
    });
  }, []);
  useEffect(() => {
    if (placement.current?.generation !== visibleGeneration) drawPlacement(undefined);
  }, [visibleGeneration, drawPlacement]);
  useEffect(() => () => {
    if (placementTick.current !== undefined) cancelAnimationFrame(placementTick.current);
  }, []);

  useEffect(() => {
    if (visibleGeneration === undefined || visible === undefined) return;
    void fetch(new URL("activate", new URL(visible.document, location.href)), { method: "POST" }).catch(() => undefined);
  }, [visibleGeneration, visible]);

  const unlockAudio = useCallback(() => {
    if (typeof AudioContext === "undefined") return;
    if (audio.current === undefined) {
      const context = new AudioContext({ sampleRate: programmeAudioSampleRate });
      const output = context.createGain();
      output.connect(context.destination);
      audio.current = { context, output };
    }
    const { context, output } = audio.current;
    output.gain.value = callbacks.current.muted ? 0 : 1;
    void context.resume().catch(() => undefined);
  }, []);

  useEffect(() => {
    const value = audio.current;
    if (value !== undefined) value.output.gain.setTargetAtTime(muted ? 0 : 1, value.context.currentTime, 0.005);
  }, [muted]);

  useEffect(() => () => { void audio.current?.context.close().catch(() => undefined); }, []);

  const document = programme?.document;
  const start = ready ? presented.frame : undefined;
  const end = ready ? presented.frameCount : undefined;
  useEffect(() => {
    if (from === undefined || start === undefined || end === undefined || generation === undefined || document === undefined) return;
    const page = mounted.current.get(generation);
    if (page === undefined) return;
    const transport = ++sequence.current;
    const stop = playProgramme({ document, start, end, fps, audio: audio.current,
      present(frame, advancing) {
        const request = { frame, sequence: ++sequence.current, transport };
        page.sent = request;
        page.element.contentWindow?.postMessage({ kind: advancing ? "programme-play" : "programme-seek",
          generation, ...request }, "*");
        callbacks.current.onFrame(frame);
      },
      finish: () => callbacks.current.onEnd(),
      fail: error => callbacks.current.onError(error instanceof Error ? error.message : String(error)),
    });
    running.current = { generation, transport, stop };
    return () => {
      running.current = undefined;
      stop();
    };
  }, [document, generation, from, start, end, fps]);

  const loaded = (entry: NleStudioProgrammeProjection, element: HTMLIFrameElement) => {
    mounted.current.set(entry.generation, { element });
    send();
  };

  const waiting = seeking && generation !== undefined && !ready;
  useEffect(() => {
    if (!waiting || generation === undefined) return;
    const timer = window.setTimeout(() => setError({ generation, frame: target, message: "预览画面准备超时。" }), 15_000);
    return () => window.clearTimeout(timer);
  }, [waiting, generation, target]);

  const failure = error?.generation === generation && error?.frame === target ? error.message : undefined;
  return {
    visible, loaded, unlockAudio, failure, drawPlacement,
    documents: [...(visible === undefined ? [] : [visible]),
      ...(programme === undefined || programme.generation === visibleGeneration ? [] : [programme])],
  };
}
