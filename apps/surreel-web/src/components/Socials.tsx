import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useRef, useState, type FormEvent } from "react";
import { launchUri, socialCaption, socialTarget, socialTargets } from "../socials.ts";
import { studio } from "../store.ts";
import { isApproved, isSent, projectVideo, type Project } from "../types.ts";
import { useStudio } from "../useStudio.ts";
import { FilmStill } from "./FilmStill.tsx";
import { WheelDeck } from "./FormatDeck.tsx";

export function Socials() {
  const { projects, api, error } = useStudio();
  const [targets, setTargets] = useState<string[]>(["tiktok"]);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const ready = projects.filter(isApproved);
  const sent = projects.filter(isSent);
  const [filmId, setFilmId] = useState(ready[0]?.id ?? "");
  const current = ready.find((project) => project.id === filmId) ?? ready[0];
  const currentVideo = current ? projectVideo(current) : undefined;
  const destError = submitted && targets.length === 0;

  async function send(event: FormEvent<HTMLFormElement>, project: Project) {
    event.preventDefault();
    setSubmitted(true);
    if (targets.length === 0) {
      summaryRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      const caption = socialCaption(project);
      try {
        await navigator.clipboard.writeText(caption);
      } catch {
        // Opening the platform still works if clipboard is blocked.
      }
      for (const id of targets) {
        window.open(launchUri(socialTarget(id), caption), "_blank", "noopener,noreferrer");
      }
      await studio.setReview(project, "sent", targets);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <h1 className="sr-only">Socials</h1>
      <p className="note">Ship the keepers. We copy the caption and open the app. You still post.</p>
      {error ? <p className="banner">{error}</p> : null}
      {destError ? (
        <div className="error-summary" role="alert" tabIndex={-1} ref={summaryRef} aria-labelledby="socials-error-title">
          <h2 id="socials-error-title">There is a problem</h2>
          <ul>
            <li>
              <a href="#dest-tiktok">Pick at least one app</a>
            </li>
          </ul>
        </div>
      ) : null}

      <fieldset className="meters">
        <legend>Apps</legend>
        {socialTargets.map((target) => {
          const selected = targets.includes(target.id);
          return (
            <button
              key={target.id}
              id={`dest-${target.id}`}
              data-testid={`dest-${target.id}`}
              type="button"
              className={selected ? "meter is-current" : "meter"}
              aria-pressed={selected}
              onClick={() =>
                setTargets((currentTargets) =>
                  currentTargets.includes(target.id) ? currentTargets.filter((id) => id !== target.id) : [...currentTargets, target.id],
                )
              }
            >
              {target.label}
            </button>
          );
        })}
      </fieldset>
      {destError ? <p className="field-error" id="dest-error">Pick at least one app before you send.</p> : null}

      {current ? (
        <form className="send-hero" onSubmit={(event) => void send(event, current)}>
          {ready.length > 1 ? (
            <WheelDeck
              items={ready.map((project) => {
                const video = projectVideo(project);
                return {
                  id: project.id,
                  src: video ? api.artifactUrl(video.url) : "",
                  kind: video ? ("video" as const) : ("image" as const),
                  caption: project.title,
                };
              })}
              selectedId={current.id}
              onChange={setFilmId}
              label="Keepers"
              testId="send-deck"
              size="compact"
            />
          ) : (
            <FilmStill
              src={currentVideo ? api.artifactUrl(currentVideo.url) : undefined}
              kind="video"
              caption={current.title}
              eager
            />
          )}
          <button type="submit" className="btn" data-testid={`send-${current.id}`} disabled={sending} aria-busy={sending || undefined}>
            {sending ? "Opening" : "Send"}
          </button>
        </form>
      ) : (
        <div className="empty">
          <PaperPlaneTiltIcon size={40} weight="thin" className="empty-icon" aria-hidden />
          <p className="caption">Nothing to send.</p>
          <p className="note">Keep a film in Review first.</p>
          <a className="btn btn-ghost" href="#/review">
            Open Review
          </a>
        </div>
      )}

      {sent.length > 0 ? (
        <div className="strip" aria-label="Opened">
          {sent.map((project) => {
            const video = projectVideo(project);
            return (
              <a key={project.id} className="strip-item" href={`#/project/${project.id}`} aria-label={project.title}>
                <FilmStill
                  src={video ? api.artifactUrl(video.url) : undefined}
                  kind={video ? "video" : "image"}
                  caption={project.title}
                />
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
