import { programmeAudioFrames } from "../programme-transport.js";

/** Queue bounded mix buffers on the audio clock and advance Picture on the same edit grid. */
export function playProgramme(input: {
  readonly document: string;
  readonly start: number;
  readonly end: number;
  readonly fps: number;
  readonly audio: { readonly context: AudioContext; readonly output: GainNode } | undefined;
  readonly present: (frame: number, advancing: boolean) => void;
  readonly finish: () => void;
  readonly fail: (error: unknown) => void;
}): () => void {
  const { audio, start, end, fps } = input;
  const interval = programmeAudioFrames(fps);
  const document = new URL(input.document, location.href);
  const controller = new AbortController();
  const sources = new Set<AudioBufferSourceNode>();
  let animation = 0;
  let loading = false;
  let silent = false;
  let available = start;
  let queuedThrough = 0;
  let anchor: { frame: number; time: number } | undefined;
  let lastFrame = start;
  let advancing = false;

  const stop = () => {
    controller.abort();
    cancelAnimationFrame(animation);
    for (const source of sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    sources.clear();
  };

  const enqueue = async (frame: number) => {
    loading = true;
    try {
      const response = await fetch(new URL(`audio/${frame}.wav`, document), { signal: controller.signal });
      if (response.status === 204) {
        silent = true;
        available = end;
        anchor = { frame: start, time: performance.now() / 1000 };
        return;
      }
      if (!response.ok) {
        const issue = await response.json().catch(() => undefined);
        throw new Error(typeof issue?.error === "string" ? issue.error : "无法准备节目音频。");
      }
      if (audio === undefined) throw new Error("当前浏览器无法播放节目音频。");
      const { context, output } = audio;
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      controller.signal.throwIfAborted();
      if (context.state !== "running") await context.resume();
      controller.signal.throwIfAborted();

      const now = context.currentTime;
      if (anchor === undefined || queuedThrough <= now) {
        queuedThrough = now + 0.035;
        anchor = { frame, time: queuedThrough };
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      source.onended = () => { sources.delete(source); source.disconnect(); };
      source.start(queuedThrough);
      sources.add(source);
      queuedThrough += buffer.duration;
      available = Math.min(end, frame + interval);
    } catch (error) {
      if (!controller.signal.aborted) {
        stop();
        input.fail(error);
      }
    } finally { loading = false; }
  };

  const tick = () => {
    if (controller.signal.aborted) return;
    const now = silent ? performance.now() / 1000 : audio?.context.currentTime ?? 0;
    if (!silent && !loading && available < end && queuedThrough - now <= interval / fps) void enqueue(available);
    if (anchor !== undefined && now >= anchor.time) {
      const buffered = silent || now < queuedThrough;
      const frame = anchor.frame + Math.floor((now - anchor.time) * fps);
      if (available === end && (silent ? frame >= end : !buffered)) {
        stop();
        input.finish();
        return;
      }
      const target = Math.min(available - 1, frame);
      if (target !== lastFrame || advancing !== buffered) {
        lastFrame = target;
        advancing = buffered;
        input.present(target, buffered);
      }
    }
    animation = requestAnimationFrame(tick);
  };
  tick();
  return stop;
}
