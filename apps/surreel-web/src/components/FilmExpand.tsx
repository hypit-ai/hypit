import { XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { WheelCard } from "./FormatDeck.tsx";

export type OriginBox = { top: number; left: number; width: number; height: number };

export function originBox(rect: DOMRectReadOnly): OriginBox {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export function FilmExpand({
  item,
  origin,
  detailsHref,
  onClose,
}: {
  item: WheelCard;
  origin: OriginBox;
  detailsHref: string;
  onClose: () => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(false);
  const closing = useRef(false);

  function finish() {
    if (closing.current) return;
    closing.current = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setGrown(false);
    if (reduced) {
      onClose();
      return;
    }
    window.setTimeout(onClose, 280);
  }

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => setGrown(true));
    if (reduced) setGrown(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const pick = () =>
      Array.from(layer.current?.querySelectorAll<HTMLElement>("a[href], button, video") ?? []).filter(
        (element) => !element.hasAttribute("disabled"),
      );
    window.setTimeout(() => pick()[0]?.focus(), 20);

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
        return;
      }
      if (event.key !== "Tab" || !layer.current) return;
      const items = pick();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      prior?.focus();
    };
  }, []);

  return createPortal(
    <div
      ref={layer}
      className={grown ? "film-expand is-grown" : "film-expand"}
      role="dialog"
      aria-modal="true"
      aria-label={item.caption}
      data-testid="film-expand"
      style={
        {
          "--ox": `${origin.top}px`,
          "--oy": `${origin.left}px`,
          "--ow": `${origin.width}px`,
          "--oh": `${origin.height}px`,
        } as CSSProperties
      }
    >
      <div className="film-expand-scrim" onClick={finish} aria-hidden="true" />
      <div className="film-expand-frame">
        {item.kind === "video" ? (
          <video className="film-expand-media" src={item.src} controls autoPlay playsInline />
        ) : (
          <img className="film-expand-media" src={item.src} alt="" />
        )}
      </div>
      <button type="button" className="icon-btn film-expand-close" data-testid="close-film" aria-label="Close" onClick={finish}>
        <XIcon size={22} weight="bold" />
      </button>
      <div className="film-expand-chrome">
        <p className="caption">{item.caption}</p>
        <a className="btn" data-testid="film-details" href={detailsHref}>
          Details
        </a>
      </div>
    </div>,
    document.body,
  );
}
