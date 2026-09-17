import type { ReactNode } from "react";

export function FilmStill({
  src,
  kind,
  caption,
  className,
  eager,
}: {
  src?: string;
  kind: "video" | "image";
  caption?: ReactNode;
  className?: string;
  eager?: boolean;
}) {
  return (
    <figure className={className ?? "still"}>
      {src && kind === "video" ? <video src={src} muted playsInline preload="metadata" /> : null}
      {src && kind === "image" ? <img src={src} alt="" loading={eager ? "eager" : "lazy"} /> : null}
      {!src ? <div className="still-empty" /> : null}
      {caption ? <figcaption className="caption">{caption}</figcaption> : null}
    </figure>
  );
}
