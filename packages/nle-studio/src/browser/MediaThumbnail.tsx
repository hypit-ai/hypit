import { AudioLines, Film, Images } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { NleStudioMediaEntry } from "../protocol.js";

export function MediaThumbnail({ entry }: { readonly entry: NleStudioMediaEntry }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "64px" });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  return <span ref={host} className="library-thumbnail studio-library-thumbnail">
    {visible && entry.resource && entry.mediaType?.startsWith("image/") ? <img src={entry.resource} alt="" draggable={false}/>
      : visible && entry.resource && entry.mediaType?.startsWith("video/") ? <video src={entry.resource} muted playsInline preload="metadata"/>
      : entry.kind === "audio" ? <AudioLines size={24}/> : entry.mediaType?.startsWith("image/") ? <Images size={24}/> : <Film size={24}/>}
  </span>;
}
