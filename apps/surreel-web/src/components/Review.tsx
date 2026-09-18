import { CheckIcon, FilmReelIcon, XIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { studio } from "../store.ts";
import { inReview, projectVideo } from "../types.ts";
import { useStudio } from "../useStudio.ts";
import { FilmExpand, originBox } from "./FilmExpand.tsx";
import { WheelDeck } from "./FormatDeck.tsx";

export function Review() {
  const { projects, api, error } = useStudio();
  const inbox = projects.filter(inReview);
  const [filmId, setFilmId] = useState(inbox[0]?.id ?? "");
  const [expanded, setExpanded] = useState<{ id: string; origin: ReturnType<typeof originBox> } | null>(null);
  const [acting, setActing] = useState<"keep" | "skip" | null>(null);
  const actTimer = useRef(0);
  const current = inbox.find((project) => project.id === filmId) ?? inbox[0];
  const films = inbox.map((project) => {
    const video = projectVideo(project);
    return {
      id: project.id,
      src: video ? api.artifactUrl(video.url) : "",
      kind: video ? ("video" as const) : ("image" as const),
      caption: project.title,
    };
  });
  const expandedFilm = films.find((item) => item.id === expanded?.id);
  const currentVideo = current ? projectVideo(current) : undefined;
  const src = currentVideo ? api.artifactUrl(currentVideo.url) : undefined;

  return (
    <div className="page">
      <h1 className="sr-only">Review</h1>
      {error ? <p className="banner">{error}</p> : null}
      {inbox.length === 0 ? (
        <div className="empty">
          <FilmReelIcon size={40} weight="thin" className="empty-icon" aria-hidden />
          <p className="note">Turn the wheel. Keep what sells. Queue a page first.</p>
          <a className="btn btn-ghost" href="#/queue">
            Queue a page
          </a>
        </div>
      ) : (
        <div>
          <WheelDeck
            items={films}
            selectedId={current?.id ?? filmId}
            onChange={setFilmId}
            onActivate={(id, origin) => setExpanded({ id, origin: originBox(origin) })}
            label="Inbox films"
            testId="review-deck"
          />
          <div className={acting ? `review-act-${acting}` : undefined}>
            {src ? <video className="bleed preview" src={src} controls playsInline preload="metadata" /> : <div className="bleed preview" />}
          </div>
          {expanded && expandedFilm ? (
            <FilmExpand item={expandedFilm} origin={expanded.origin} detailsHref={`#/project/${expanded.id}`} onClose={() => setExpanded(null)} />
          ) : null}
          {current ? (
            <div className="deck-actions">
              <button
                type="button"
                className="round-act"
                data-testid="skip-review"
                disabled={acting !== null}
                onClick={() => {
                  setActing("skip");
                  if (actTimer.current) clearTimeout(actTimer.current);
                  actTimer.current = window.setTimeout(() => {
                    setActing(null);
                    void studio.setReview(current, "rejected");
                  }, 280);
                }}
              >
                <XIcon size={20} weight="bold" aria-hidden />
                Skip
              </button>
              <p className="note" role="status" aria-atomic="true">
                {inbox.length} {inbox.length === 1 ? "film" : "films"} left
              </p>
              <button
                type="button"
                className="round-act keep"
                data-testid="keep-review"
                disabled={acting !== null}
                onClick={() => {
                  setActing("keep");
                  if (actTimer.current) clearTimeout(actTimer.current);
                  actTimer.current = window.setTimeout(() => {
                    setActing(null);
                    void studio.setReview(current, "approved");
                  }, 280);
                }}
              >
                <CheckIcon size={20} weight="bold" aria-hidden />
                Keep
              </button>
            </div>
          ) : null}
          <p className="note">Turn the wheel. Tap the front film to fill the screen. Keep what sells.</p>
        </div>
      )}
    </div>
  );
}
