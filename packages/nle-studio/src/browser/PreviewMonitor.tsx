import { AudioLines, Maximize2, Minimize2, Pause, Play, StepBack, StepForward, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { NleStudioMediaEntry } from "../protocol.js";
import { SourceWaveform } from "./SourceWaveform.js";
import { IconButton } from "./common.js";
import { libraryMediaLabel, libraryMediaType } from "./library-media.js";
import { timecode } from "./timecode.js";

type SourcePlayback = {
  readonly key: string | undefined;
  readonly attempt: number;
  readonly failed: boolean;
  readonly playing: boolean;
  readonly time: number;
  readonly duration: number;
};

function initialPlayback(key: string | undefined): SourcePlayback {
  return { key, attempt: 0, failed: false, playing: false, time: 0, duration: 0 };
}

function useSourcePlayback(source: NleStudioMediaEntry | undefined, mediaDuration: number | undefined) {
  const key = source === undefined ? undefined : JSON.stringify([source.id, source.resource]);
  const [state, setState] = useState(() => initialPlayback(key));
  if (state.key !== key) setState(initialPlayback(key));

  const media = useRef<HTMLMediaElement | null>(null);
  const attach = useCallback((element: HTMLMediaElement | null) => {
    media.current = element;
    if (element === null) return;
    return () => { media.current = null; element.pause(); };
  }, []);

  const playableEnd = useCallback((element: HTMLMediaElement) => Math.min(element.duration, mediaDuration ?? Infinity), [mediaDuration]);
  const read = useCallback((element: HTMLMediaElement) => {
    if (media.current !== element) return;
    const time = Math.min(element.currentTime, mediaDuration ?? Infinity);
    if (mediaDuration !== undefined && time >= mediaDuration && !element.paused) element.pause();
    const duration = Number.isFinite(element.duration) ? element.duration : 0;
    const playing = !element.paused && !element.ended;
    setState(previous => previous.time === time && previous.duration === duration && previous.playing === playing
      ? previous : { ...previous, playing, time, duration });
  }, [mediaDuration]);
  const readEvent = (event: { readonly currentTarget: HTMLMediaElement }) => read(event.currentTarget);
  const fail = useCallback(() => setState(previous => ({ ...previous, failed: true, playing: false })), []);
  const seek = useCallback((position: number) => {
    const element = media.current;
    if (element === null || element.readyState < 1) return;
    const end = playableEnd(element);
    if (!Number.isFinite(end) || end <= 0) return;
    element.currentTime = Math.max(0, Math.min(end, position));
    read(element);
  }, [playableEnd, read]);
  const step = useCallback((seconds: number) => seek((media.current?.currentTime ?? 0) + seconds), [seek]);
  const toggle = useCallback(() => {
    const element = media.current;
    if (element === null) return;
    if (!element.paused) { element.pause(); return; }
    if (element.ended || element.currentTime >= playableEnd(element)) seek(0);
    void element.play().catch((error: unknown) => {
      if (media.current === element && !(error instanceof DOMException && error.name === "AbortError")) fail();
    });
  }, [fail, playableEnd, seek]);

  useEffect(() => {
    if (!state.playing) return;
    let animation = 0;
    const tick = () => {
      if (media.current !== null) read(media.current);
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [read, state.playing]);

  const timed = source !== undefined && (source.kind === "audio" || source.pictureKind === "signal");
  useEffect(() => {
    if (!timed) return;
    const pause = () => { if (document.hidden) media.current?.pause(); };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || state.failed
        || target?.closest("input,textarea,select,[role=combobox],[contenteditable=true]")
        || document.querySelector("[role=dialog],[role=menu],[role=listbox]")) return;
      if (event.code === "Space" && (!target?.closest("button") || target.closest(".library-card-main"))) {
        event.preventDefault();
        if (!event.repeat) toggle();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); step(event.key === "ArrowRight" ? 5 : -5);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault(); seek(event.key === "Home" ? 0 : Infinity);
      }
    };
    window.addEventListener("keydown", keydown);
    document.addEventListener("visibilitychange", pause);
    return () => {
      window.removeEventListener("keydown", keydown);
      document.removeEventListener("visibilitychange", pause);
    };
  }, [seek, state.failed, step, timed, toggle]);

  return {
    ...state, timed, seek, step, toggle, fail, attach,
    retry: () => setState(previous => ({ ...initialPlayback(previous.key), attempt: previous.attempt + 1 })),
    events: { onLoadedMetadata: readEvent, onDurationChange: readEvent, onTimeUpdate: readEvent,
      onPlay: readEvent, onPause: readEvent, onEnded: readEvent, onError: fail },
  };
}

export function PreviewMonitor({ projectName, source, mediaGeneration, programme, muted, onMute, expanded, onExpand, children }: {
  readonly projectName: string;
  readonly source: NleStudioMediaEntry | undefined;
  readonly mediaGeneration: number | undefined;
  readonly programme: {
    readonly frame: number;
    readonly end: number;
    readonly fps: number;
    readonly playing: boolean;
    readonly canPlay: boolean;
    readonly toggle: () => void;
    readonly seek: (frame: number) => void;
    readonly step: (delta: number) => void;
  };
  readonly muted: boolean;
  readonly onMute: () => void;
  readonly expanded: boolean;
  readonly onExpand: () => void;
  readonly children: ReactNode;
}) {
  const duration = source?.duration;
  const mediaDuration = duration === undefined ? undefined : Number(duration.ticks) * duration.timeBase.numerator / duration.timeBase.denominator;
  const playback = useSourcePlayback(source, mediaDuration);
  const sourceType = source === undefined ? undefined : libraryMediaType(source);
  const title = source === undefined ? projectName : libraryMediaLabel(source);
  const playing = source === undefined ? programme.playing : playback.playing;
  const canPlay = source === undefined ? programme.canPlay : playback.timed && source.resource !== undefined && !playback.failed;
  const staticSource = source !== undefined && !playback.timed;
  const sourceEnd = mediaDuration ?? playback.duration;
  const seekEnd = source === undefined ? Math.max(0, Math.ceil(programme.end) - 1) : sourceEnd;
  const seekPosition = Math.min(source === undefined ? programme.frame : playback.time, seekEnd);
  const canSeek = canPlay && seekEnd > 0 && (source === undefined || playback.duration > 0);
  const seek = source === undefined ? programme.seek : playback.seek;
  const fraction = seekEnd > 0 ? seekPosition / seekEnd : 0;
  const { fps } = programme;
  const currentLabel = timecode(source === undefined ? programme.frame : playback.time * fps, fps);
  const endLabel = timecode(source === undefined ? programme.end : sourceEnd * fps, fps);
  const elementKey = `${playback.key}:${playback.attempt}`;
  const scrubber = (waveformSeek = false) => <input className={waveformSeek ? "nle-waveform-seek" : "nle-monitor-seek"}
    type="range" min={0} max={seekEnd || 1} step={source === undefined ? 1 : "any"} value={seekPosition} disabled={!canSeek}
    style={{ "--monitor-progress": `${fraction * 100}%` } as CSSProperties}
    tabIndex={waveformSeek ? -1 : undefined}
    aria-label={waveformSeek ? "波形播放位置" : source === undefined ? "时间线播放位置" : "素材播放位置"}
    aria-valuetext={staticSource ? undefined : currentLabel}
    onChange={event => seek(event.currentTarget.valueAsNumber)}/>;

  return <section className="nle-monitor">
    <div className="nle-panel-header nle-monitor-title"><span title={title}>{title}</span>
      <IconButton label={expanded ? "恢复预览" : "放大预览"} onClick={onExpand}>{expanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</IconButton>
    </div>
    <div className="nle-stage">
      <div className="nle-programme-stage" data-visible={source === undefined}>{children}</div>
      {source !== undefined && <div className="nle-source-stage">
        {playback.failed || source.resource === undefined || sourceType === undefined
          ? <div className="nle-source-error" role="alert"><p>{source.diagnostic ?? `无法预览素材：${title}`}</p>
            {playback.failed && <button type="button" className="button" onClick={playback.retry}>重试</button>}</div>
          : sourceType === "image" ? <img src={source.resource} alt={title} key={elementKey} onError={playback.fail}/>
          : sourceType === "video" ? <video key={elementKey} src={source.resource} ref={playback.attach} muted={muted} preload="auto" playsInline
            onClick={playback.toggle} {...playback.events}/>
          : <div className="nle-monitor-waveform">
            <audio key={elementKey} src={source.resource} ref={playback.attach} muted={muted} preload="metadata" {...playback.events}/>
            <SourceWaveform source={{ media: source.id, generation: mediaGeneration, version: source.audioVersion }}
              duration={sourceEnd} centered placeholder={<AudioLines size={30} aria-hidden="true"/>}/>
            {canSeek && <span className="nle-waveform-playhead" style={{ left: `${fraction * 100}%` }} aria-hidden="true"/>}
            {scrubber(true)}
          </div>}
      </div>}
    </div>
    <div className="nle-transport" data-static={staticSource}>
      {scrubber()}
      <span className="nle-transport-time">
        <span className="current">{staticSource ? "--:--:--:--" : currentLabel}</span>
        <span className="separator">/</span><span className="total">{staticSource ? "--:--:--:--" : endLabel}</span></span>
      <button type="button" className="nle-play" aria-label={playing ? "暂停" : "播放"} disabled={!canPlay && !playing}
        onClick={source === undefined ? programme.toggle : playback.toggle}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
      <span className="nle-transport-actions">
        <IconButton label={source === undefined ? "上一帧" : "后退五秒"} disabled={source !== undefined && !canSeek}
          onClick={() => source === undefined ? programme.step(-1) : playback.step(-5)}><StepBack size={15}/></IconButton>
        <IconButton label={source === undefined ? "下一帧" : "前进五秒"} disabled={source !== undefined && !canSeek}
          onClick={() => source === undefined ? programme.step(1) : playback.step(5)}><StepForward size={15}/></IconButton>
        <IconButton label={muted ? "取消静音" : "静音"} disabled={staticSource} onClick={onMute}>{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</IconButton>
      </span>
    </div>
  </section>;
}
