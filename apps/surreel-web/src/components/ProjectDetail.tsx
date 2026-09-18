import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { studio } from "../store.ts";
import { isActive, projectVideo, statusLabel } from "../types.ts";
import { useStudio } from "../useStudio.ts";

export function ProjectDetail({ id }: { id: string }) {
  const { projects, selected, api, busy, error } = useStudio();
  const project = selected?.id === id ? selected : projects.find((item) => item.id === id);
  const [revision, setRevision] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project) studio.selectProject(project);
  }, [id, project?.id]);

  if (!project) {
    return (
      <div className="page empty">
        <h1 className="sr-only">Project</h1>
        <p className="caption">This film is not in the pipeline.</p>
        <a className="btn btn-ghost" href="#/queue">
          Back to queue
        </a>
      </div>
    );
  }

  const video = projectVideo(project);
  const src = video ? api.artifactUrl(video.url) : undefined;
  const revisionError = (submitted || touched) && revision.trim().length === 0;

  function onRevise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (revision.trim().length === 0) {
      summaryRef.current?.focus();
      return;
    }
    void studio.rerun(revision);
  }

  return (
    <div className="page">
      <a className="text-link" href="#/queue">
        <ArrowLeftIcon size={20} weight="regular" aria-hidden />
        Queue
      </a>
      <h1 className="caption title">{project.title}</h1>
      <p className="note">
        <span className="status-tag">{statusLabel(project.status)}</span>
        {project.aspectRatio} · {project.duration}s
      </p>
      {error ? <p className="banner">{error}</p> : null}
      {src ? <video className="bleed preview" src={src} controls playsInline preload="metadata" /> : <div className="bleed preview" />}
      {project.error ? <p className="banner">{project.error}</p> : null}
      {isActive(project) ? (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void studio.cancel()}>
          Cancel
        </button>
      ) : (
        <form onSubmit={onRevise} noValidate>
          {submitted && revision.trim().length === 0 ? (
            <div className="error-summary" role="alert" tabIndex={-1} ref={summaryRef} aria-labelledby="revision-error-title">
              <h2 id="revision-error-title">There is a problem</h2>
              <ul>
                <li>
                  <a href="#field-revision">Say what should change</a>
                </li>
              </ul>
            </div>
          ) : null}
          <label className="field" htmlFor="field-revision">
            <span>
              Revision
              <span aria-hidden> *</span>
            </span>
            <textarea
              id="field-revision"
              value={revision}
              required
              aria-required
              aria-invalid={revisionError || undefined}
              aria-describedby={`revision-hint${revisionError ? " revision-error" : ""}`}
              placeholder="What should change on the next pass?"
              onChange={(event) => setRevision(event.target.value)}
              onBlur={() => setTouched(true)}
            />
            <span className="note" id="revision-hint">
              What should change on the next pass?
            </span>
            {revisionError ? (
              <span className="field-error" id="revision-error">
                Write what should change before you run again.
              </span>
            ) : null}
          </label>
          <button type="submit" className="btn" disabled={busy} aria-busy={busy || undefined}>
            {busy ? "Running" : "Run again"}
          </button>
        </form>
      )}
      <ol className="activity">
        {project.events.length === 0 ? <li>No agent notes yet.</li> : null}
        {project.events.map((event) => (
          <li key={event.id}>{event.message}</li>
        ))}
      </ol>
    </div>
  );
}
