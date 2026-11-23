import { AudioLines, Film, Images } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { NleStudioMediaEntry } from "../protocol.js";
import { SourceWaveform } from "./SourceWaveform.js";
import { SourceFilmstrip } from "./SourceFilmstrip.js";
import { mediaSeconds, sampleTime } from "./source-preview.js";

export function MediaThumbnail({ entry, mediaGeneration, strip = false, children }: {
  readonly entry: NleStudioMediaEntry;
  readonly mediaGeneration?: number | undefined;
  readonly strip?: boolean;
  readonly children?: ReactNode;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    const observer = new IntersectionObserver(entries => setVisible(entries.at(-1)?.isIntersecting ?? false),
      { rootMargin: "64px" });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const pictureResource = visible && entry.pictureKind !== undefined ? entry.resource : undefined;
  const audio = entry.pictureKind === undefined && entry.kind === "audio";
  const { id, state, duration, pictureKind } = entry;
  const seconds = duration === undefined ? 0 : mediaSeconds(duration);
  const sourceAt = useCallback((pixels: number, width: number) => sampleTime(seconds * pixels / width), [seconds]);
  const fallback = audio ? <AudioLines size={24}/>
    : entry.mediaType?.startsWith("image/") ? <Images size={24}/> : <Film size={24}/>;
  return <span ref={host} className="library-thumbnail studio-library-thumbnail">
    {audio ? <SourceWaveform source={{ media: state === "available" && duration !== undefined ? id : undefined,
        generation: mediaGeneration, version: entry.audioVersion }} duration={seconds} active={visible} placeholder={fallback}/>
      : strip && pictureKind !== undefined && mediaGeneration !== undefined ? <SourceFilmstrip
        source={{ media: state === "available" ? id : undefined, generation: mediaGeneration, version: entry.pictureVersion }}
        active={visible} sourceAt={sourceAt} timed={pictureKind === "signal"}
        className="library-filmstrip" tileRatio={3 / 4} placeholder={fallback}/>
      : pictureResource && entry.mediaType?.startsWith("image/") ? <img src={pictureResource} alt="" draggable={false}/>
      : pictureResource && entry.mediaType?.startsWith("video/") ? <video src={pictureResource} muted playsInline preload="metadata"/>
      : fallback}
    {children}
  </span>;
}
