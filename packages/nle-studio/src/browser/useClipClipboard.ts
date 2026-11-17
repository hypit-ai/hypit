import { useEffect, useRef } from "react";

const mime = "application/x-hypit-clips";

export function useClipClipboard(options: {
  readonly available: boolean;
  readonly canCopy: boolean;
  readonly copy: (token: string, cut: boolean) => void;
  readonly paste: (token: string) => void;
}) {
  const current = useRef(options); current.current = options;
  useEffect(() => {
    const ownsEvent = () => current.current.available && !document.activeElement?.closest("input,textarea,select,[contenteditable=true]") && !document.querySelector("[role=dialog],[role=menu]");
    const copy = (event: ClipboardEvent) => {
      if (!ownsEvent() || !current.current.canCopy || !event.clipboardData) return;
      const token = crypto.randomUUID();
      event.preventDefault(); event.clipboardData.setData(mime, token);
      current.current.copy(token, event.type === "cut");
    };
    const paste = (event: ClipboardEvent) => {
      if (!ownsEvent()) return;
      const token = event.clipboardData?.getData(mime);
      if (!token) return;
      event.preventDefault(); current.current.paste(token);
    };
    window.addEventListener("copy", copy); window.addEventListener("cut", copy); window.addEventListener("paste", paste);
    return () => { window.removeEventListener("copy", copy); window.removeEventListener("cut", copy); window.removeEventListener("paste", paste); };
  }, []);
}
