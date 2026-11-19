import { AudioLines, ArrowLeft, Pause, Play, StepBack, StepForward, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { NleStudioMediaEntry } from "../protocol.js";
import { ErrorNotice } from "./ErrorNotice.js";
import { IconButton } from "./common.js";
import { enterMotion } from "./motion.js";
import { timecode } from "./timecode.js";

function Source({ entry, fps, muted, onMute, onClose }: {
  readonly entry: NleStudioMediaEntry;
  readonly fps: number;
  readonly muted: boolean;
  readonly onMute: () => void;
  readonly onClose: () => void;
}) {
  const media = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false), [time, setTime] = useState(0);
  const [duration, setDuration] = useState((entry.durationFrames ?? 0) / fps);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const timed = entry.mediaType?.startsWith("video/") || entry.mediaType?.startsWith("audio/");
  const image = entry.mediaType?.startsWith("image/") ?? false;
  const lastFrame = Math.max(0, Math.ceil(duration * fps) - 1), frame = Math.min(lastFrame, Math.round(time * fps));
  const failed = () => setError(`无法预览素材：${entry.name}`);
  const seek = (target: number) => {
    const element = media.current;
    if (!element || !duration || error) return;
    element.pause(); element.currentTime = Math.max(0, Math.min(lastFrame, target)) / fps; setTime(element.currentTime);
  };
  const toggle = () => {
    const element = media.current;
    if (!element || error) return;
    if (!element.paused) element.pause();
    else { if (element.ended) element.currentTime = 0; void element.play().catch(reason => { if (reason.name !== "AbortError") failed(); }); }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || document.activeElement?.closest("input,textarea,select,[contenteditable=true]") || document.querySelector("[role=dialog],[role=menu]")) return;
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      else if (event.code === "Space" && timed) { event.preventDefault(); if (!event.repeat) toggle(); }
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); seek(Math.round((media.current?.currentTime ?? time) * fps) + (event.key === "ArrowRight" ? 1 : -1)); }
      else if (event.key === "Home" || event.key === "End") { event.preventDefault(); seek(event.key === "Home" ? 0 : lastFrame); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [error, timed, duration, fps, time, lastFrame, onClose]);
  useEffect(() => {
    const pause = () => { if (document.hidden) media.current?.pause(); };
    document.addEventListener("visibilitychange", pause);
    return () => { document.removeEventListener("visibilitychange", pause); media.current?.pause(); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let animation = 0;
    const tick = () => { setTime(media.current?.currentTime ?? 0); animation = requestAnimationFrame(tick); };
    animation = requestAnimationFrame(tick); return () => cancelAnimationFrame(animation);
  }, [playing]);
  const props = {
    src: entry.resource, muted, preload: "metadata",
    onLoadedMetadata: () => { const duration = media.current?.duration; if (duration && Number.isFinite(duration)) setDuration(duration); setError(undefined); },
    onTimeUpdate: () => setTime(media.current?.currentTime ?? 0),
    onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => setPlaying(false), onError: failed,
  };
  return <>
    <header><button type="button" className="button" onClick={onClose}><ArrowLeft size={14}/>返回剪辑</button><span>{image ? `图片 ${entry.name}` : entry.name}</span></header>
    <div className="studio-source-content">{entry.resource === undefined ? <p>{entry.diagnostic ?? "素材暂时不可用"}</p>
      : entry.mediaType?.startsWith("image/") ? <img key={attempt} src={entry.resource} alt={entry.name} onError={failed}/>
      : entry.mediaType?.startsWith("video/") ? <video key={attempt} ref={node => { media.current = node; }} {...props} playsInline onClick={toggle}/>
      : <div className="studio-source-audio"><AudioLines size={48}/><audio key={attempt} ref={node => { media.current = node; }} {...props}/></div>}</div>
    {!image && <div className="nle-source-controls">
      {timed && <input className="nle-source-seek" type="range" min={0} max={lastFrame} step={1} value={frame} disabled={!duration || Boolean(error)} aria-label="素材播放位置" aria-valuetext={timecode(frame, fps)} onChange={event => seek(Number(event.target.value))}/>}
      <div className="nle-transport"><span className="nle-transport-time">{timed ? <><span className="current">{timecode(frame, fps)}</span><span className="separator">/</span><span className="total">{timecode(Math.round(duration * fps), fps)}</span></> : null}</span>
        <span className="nle-transport-center"><IconButton label="素材后退五秒" disabled={!timed || Boolean(error)} onClick={() => seek(frame - Math.round(fps * 5))}><StepBack size={15}/></IconButton>
          <button type="button" className="nle-play" aria-label={playing ? "暂停素材" : "播放素材"} disabled={!timed || Boolean(error)} onClick={toggle}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
          <IconButton label="素材前进五秒" disabled={!timed || Boolean(error)} onClick={() => seek(frame + Math.round(fps * 5))}><StepForward size={15}/></IconButton></span>
        <span className="nle-transport-actions"><IconButton label={muted ? "开启素材声音" : "静音素材"} disabled={!timed} onClick={onMute}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</IconButton></span>
      </div>
    </div>}
    <ErrorNotice message={error} onClose={() => {}}><button type="button" className="button small" onClick={() => { setError(undefined); setPlaying(false); setAttempt(value => value + 1); }}>重试</button></ErrorNotice>
  </>;
}

export function SourcePreview({ entry, fps, muted, onMute, onClose }: {
  readonly entry: NleStudioMediaEntry | undefined;
  readonly fps: number;
  readonly muted: boolean;
  readonly onMute: () => void;
  readonly onClose: () => void;
}) {
  const reduced = useReducedMotion();
  return <AnimatePresence>{entry !== undefined && <motion.div className="studio-source-preview" key={entry.id} {...enterMotion(reduced)}>
    <Source entry={entry} fps={fps} muted={muted} onMute={onMute} onClose={onClose}/>
  </motion.div>}</AnimatePresence>;
}
