import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  composeHypitBrief,
  hypitFormat,
  hypitFormats,
  queueReady,
  readPublicHttpUrl,
  sourceUrlFrom,
  titleFromAnswers,
  type GuidedField,
} from "../formats.ts";
import { studio } from "../store.ts";
import { briefTemplates } from "../templates.ts";
import { isActive, projectVideo, statusLabel } from "../types.ts";
import { useStudio } from "../useStudio.ts";
import { clipDurations } from "../timing.ts";
import { FilmExpand, originBox } from "./FilmExpand.tsx";
import { FormatDeck, WheelDeck } from "./FormatDeck.tsx";

const aspects = ["9:16", "16:9", "1:1"] as const;
const durations = [15, 20, 30, 45, 60] as const;
const sourceKey = "surreel.sourceUrl";
const anglesKey = "surreel.angles";

function readSessionUrl(): string {
  try {
    return sessionStorage.getItem(sourceKey) ?? "";
  } catch {
    return "";
  }
}

function readSessionAngles(): string[] | undefined {
  try {
    const raw = sessionStorage.getItem(anglesKey);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const ids = parsed.filter((id): id is string => typeof id === "string" && hypitFormats.some((item) => item.id === id));
    return ids.length > 0 ? ids : undefined;
  } catch {
    return undefined;
  }
}

export function Queue() {
  const { projects, api, error } = useStudio();
  const [formatId, setFormatId] = useState(hypitFormats[0]!.id);
  const [angles, setAngles] = useState<string[]>(() => readSessionAngles() ?? [hypitFormats[0]!.id]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [aspect, setAspect] = useState("9:16");
  const [duration, setDuration] = useState(20);
  const [reference, setReference] = useState(readSessionUrl);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const hadUrl = useRef(Boolean(readPublicHttpUrl(readSessionUrl())));
  const format = hypitFormat(formatId);
  const sourceUrl = sourceUrlFrom(answers, reference);
  const batch = sourceUrl ? angles : [formatId];
  const ready = queueReady(format, answers, reference) && batch.length > 0;
  const lead = format.fields[0];
  const extra = format.fields.slice(1);
  const reel = projects.filter((project) => isActive(project) || projectVideo(project) !== undefined).slice(0, 8);
  const [filmId, setFilmId] = useState(reel[0]?.id ?? "");
  const [expanded, setExpanded] = useState<{ id: string; origin: ReturnType<typeof originBox> } | null>(null);
  const missingLead = Boolean(lead && !sourceUrl && !(answers[lead.id] ?? "").trim());
  const films = reel.map((project) => {
    const video = projectVideo(project);
    return {
      id: project.id,
      src: video ? api.artifactUrl(video.url) : `/images/${hypitFormat(project.format ?? "").image}.jpg`,
      kind: (video ? "video" : "image") as "video" | "image",
      caption: `${project.title} · ${statusLabel(project.status)}`,
      tone: isActive(project) ? ("live" as const) : project.status === "failed" ? ("alert" as const) : undefined,
    };
  });
  const expandedFilm = films.find((item) => item.id === expanded?.id);

  useEffect(() => {
    const pending = sessionStorage.getItem("surreel.format");
    if (!pending) return;
    sessionStorage.removeItem("surreel.format");
    if (hypitFormats.some((item) => item.id === pending)) applyFormat(pending);
  }, []);

  useEffect(() => {
    if (sourceUrl && !hadUrl.current) setAngles(hypitFormats.map((item) => item.id));
    else if (!sourceUrl && hadUrl.current) setAngles([formatId]);
    hadUrl.current = Boolean(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => {
    try {
      if (reference.trim()) sessionStorage.setItem(sourceKey, reference);
      else sessionStorage.removeItem(sourceKey);
    } catch {
      // Private mode can block sessionStorage.
    }
  }, [reference]);

  useEffect(() => {
    try {
      if (sourceUrl) sessionStorage.setItem(anglesKey, JSON.stringify(angles));
      else sessionStorage.removeItem(anglesKey);
    } catch {
      // Private mode can block sessionStorage.
    }
  }, [sourceUrl, angles]);

  function applyFormat(id: string, nextAnswers: Record<string, string> = {}, extras?: { aspect?: string; duration?: number }) {
    const next = hypitFormat(id);
    const url = sourceUrlFrom(nextAnswers, reference);
    setFormatId(id);
    setAnswers(nextAnswers);
    setAspect(extras?.aspect ?? next.aspectRatio);
    setDuration(extras?.duration ?? next.duration);
    setTouched({});
    setSubmitted(false);
    if (!url) setAngles([id]);
    else setAngles((current) => (current.includes(id) ? current : [...current, id]));
  }

  function previewFormat(id: string) {
    setFormatId(id);
    if (!sourceUrl) applyFormat(id);
  }

  function pickAngle(id: string) {
    if (sourceUrl) {
      const alreadyChosen = id === formatId;
      setFormatId(id);
      setAngles((current) => {
        if (alreadyChosen && current.includes(id)) {
          return current.length === 1 ? current : current.filter((item) => item !== id);
        }
        return current.includes(id) ? current : [...current, id];
      });
      return;
    }
    applyFormat(id);
  }

  function applySeed(index: number) {
    const template = briefTemplates[index];
    if (!template) return;
    setReference("");
    hadUrl.current = false;
    const next = hypitFormat(template.formatId);
    const leadField = next.fields[0];
    const nextAnswers = { ...template.answers };
    if (leadField && !(nextAnswers[leadField.id] ?? "").trim()) nextAnswers[leadField.id] = template.prompt;
    applyFormat(template.formatId, nextAnswers, { aspect: template.aspectOverride, duration: template.durationOverride });
    setAngles([template.formatId]);
  }

  function showFieldError(field: GuidedField) {
    if (sourceUrl) return false;
    return Boolean(field.required && (submitted || touched[field.id]) && !(answers[field.id] ?? "").trim());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!ready) {
      summaryRef.current?.focus();
      return;
    }
    setQueuing(true);
    try {
      await Promise.all(
        batch.map((id) => {
          const next = hypitFormat(id);
          return studio.createAndRun({
            prompt: composeHypitBrief({
              format: next,
              answers,
              aspectRatio: aspect,
              duration,
              referenceUrl: sourceUrl,
            }),
            aspectRatio: aspect,
            duration,
            style: next.title,
            format: next.id,
            title: titleFromAnswers(next, answers, sourceUrl),
            referenceUrl: sourceUrl,
          });
        }),
      );
    } finally {
      setQueuing(false);
    }
  }

  return (
    <form className="page" onSubmit={onSubmit} noValidate>
      <h1 className="sr-only">Queue</h1>
      <ol className="steps">
        <li>Link</li>
        <li>Angles</li>
        <li>Keep</li>
      </ol>
      {error ? <p className="banner">{error}</p> : null}
      {submitted && !ready ? (
        <div className="error-summary" role="alert" tabIndex={-1} ref={summaryRef} aria-labelledby="queue-error-title">
          <h2 id="queue-error-title">There is a problem</h2>
          <ul>
            <li>
              <a href={missingLead && lead ? `#field-${lead.id}` : "#field-reference"}>Paste a public URL or write a line</a>
            </li>
          </ul>
        </div>
      ) : null}

      {films.length > 0 ? (
        <>
          <WheelDeck
            items={films}
            selectedId={filmId}
            onChange={setFilmId}
            onActivate={(id, origin) => setExpanded({ id, origin: originBox(origin) })}
            label="Past films"
            testId="film-deck"
            size="compact"
          />
          <p className="note">Turn the wheel through past takes. Tap the front film to fill the screen.</p>
        </>
      ) : null}

      <label className="hero-field" htmlFor="field-reference">
        <span>Your page</span>
        <input
          id="field-reference"
          className="hero-url"
          data-testid="url-input"
          type="url"
          inputMode="url"
          autoComplete="url"
          value={reference}
          placeholder="https://"
          aria-invalid={submitted && !ready && Boolean(reference) && !readPublicHttpUrl(reference) ? true : undefined}
          aria-describedby="reference-hint"
          onChange={(event) => setReference(event.target.value)}
        />
        <span className="note" id="reference-hint">
          Paste a product or site. Browser Use opens it and follows what explains the offer.
        </span>
      </label>

      <FormatDeck formatId={formatId} onChange={previewFormat} />
      <p className="note">{sourceUrl ? `${batch.length} angles from this page. Swipe to turn the wheel.` : `${format.subtitle}. Swipe to turn the wheel.`}</p>
      <div className="stock" role="group" aria-label="Angles">
        {hypitFormats.map((item) => {
          const on = batch.includes(item.id);
          const chosen = item.id === formatId;
          return (
            <button
              key={item.id}
              type="button"
              id={`format-${item.id}`}
              data-testid={`format-${item.id}`}
              className={["canister", on ? "is-on" : "", chosen ? "is-current" : ""].filter(Boolean).join(" ")}
              aria-label={item.title}
              aria-pressed={on}
              aria-current={chosen ? "true" : undefined}
              onClick={() => pickAngle(item.id)}
            >
              <img src={`/images/${item.image}.jpg`} alt="" />
              {item.chip}
            </button>
          );
        })}
      </div>
      {sourceUrl ? (
        <div className="seeds">
          <button type="button" data-testid="every-angle" onClick={() => setAngles(hypitFormats.map((item) => item.id))}>
            Every angle
          </button>
          <button type="button" data-testid="this-angle" onClick={() => setAngles([formatId])}>
            This angle only
          </button>
        </div>
      ) : null}

      {lead ? (
        <details className="more">
          <summary>Or write a line</summary>
          <label className="field" htmlFor={`field-${lead.id}`}>
            <span>
              {lead.label}
              {lead.required && !sourceUrl ? <span aria-hidden> *</span> : null}
            </span>
            <textarea
              id={`field-${lead.id}`}
              data-testid="brief-input"
              rows={lead.maxLines ?? 4}
              value={answers[lead.id] ?? ""}
              placeholder={lead.hint}
              required={lead.required && !sourceUrl}
              aria-required={lead.required && !sourceUrl ? true : undefined}
              aria-invalid={showFieldError(lead) || undefined}
              aria-describedby={`${lead.id}-hint${showFieldError(lead) ? ` ${lead.id}-error` : ""}`}
              onChange={(event) => setAnswers((current) => ({ ...current, [lead.id]: event.target.value }))}
              onBlur={() => setTouched((current) => ({ ...current, [lead.id]: true }))}
            />
            <span className="note sr-only" id={`${lead.id}-hint`}>
              {lead.hint}
            </span>
            {showFieldError(lead) ? (
              <span className="field-error" id={`${lead.id}-error`}>
                Paste a public URL or write {lead.label.toLowerCase()}.
              </span>
            ) : null}
          </label>
          {extra.map((field) => (
            <label className="field" key={field.id} htmlFor={`field-${field.id}`}>
              <span>{field.label}</span>
              <textarea
                id={`field-${field.id}`}
                rows={field.maxLines ?? 2}
                value={answers[field.id] ?? ""}
                placeholder={field.hint}
                aria-invalid={showFieldError(field) || undefined}
                aria-describedby={`${field.id}-hint`}
                onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))}
              />
              <span className="note sr-only" id={`${field.id}-hint`}>
                {field.hint}
              </span>
            </label>
          ))}
        </details>
      ) : null}

      <fieldset className="meters">
        <legend>Aspect</legend>
        {aspects.map((value) => (
          <button key={value} type="button" className={value === aspect ? "meter is-current" : "meter"} aria-pressed={value === aspect} onClick={() => setAspect(value)}>
            {value}
          </button>
        ))}
      </fieldset>
      <fieldset className="meters">
        <legend>Duration</legend>
        {durations.map((value) => (
          <button key={value} type="button" className={value === duration ? "meter is-current" : "meter"} aria-pressed={value === duration} onClick={() => setDuration(value)}>
            {value}s
          </button>
        ))}
        <p className="note">
          {clipDurations(duration).length === 1
            ? "One take at a natural pace."
            : `${clipDurations(duration).join(" + ")}s takes, joined. Not sped to 15s.`}
        </p>
      </fieldset>

      <div className="seeds">
        <button type="button" onClick={() => applySeed(0)}>
          {briefTemplates[0]!.title}
        </button>
        <button type="button" onClick={() => applySeed(1)}>
          {briefTemplates[1]!.title}
        </button>
        <button type="button" onClick={() => applySeed(2)}>
          {briefTemplates[2]!.title}
        </button>
      </div>

      <button type="submit" className="btn" data-testid="create-video" disabled={queuing} aria-busy={queuing || undefined}>
        {queuing ? "Queuing" : batch.length > 1 ? `Queue ${batch.length} takes` : `Queue ${duration}s`}
      </button>
      {expanded && expandedFilm ? (
        <FilmExpand item={expandedFilm} origin={expanded.origin} detailsHref={`#/project/${expanded.id}`} onClose={() => setExpanded(null)} />
      ) : null}
    </form>
  );
}
