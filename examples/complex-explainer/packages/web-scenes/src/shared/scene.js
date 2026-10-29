import { terminalSetup } from "./terminal.js";
import { scene_styles } from "./scene-styles.js";
import { sealPresentVisualTrack } from "@hypit/composition";
import { htmlVisual } from "@hypit/html-program";
import { preparedVisualSource } from "@hypit/media";
import { assertTemporalWindowFor, composeTemporalMaps, exactTemporalValueFromFrames,
  exactTemporalZero, resolveTemporalBoundary, scaleExactTemporalValue, sealTemporalMap } from "@hypit/temporal";
const styles = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));
export function scene(t, within, w, font, o, html, css, setup, events, entries, extra = {}) {
  assertTemporalWindowFor(w, { subjectId: o.id, timeline: t });
  const beats = Object.fromEntries(events.map((e) => [e.name, e.at.frame - w.span.startFrame]));
  const count = w.span.endFrameExclusive - w.span.startFrame;
  const backgrounds = [];
  entries = { ...entries };
  for (const [id, v] of Object.entries(entries)) {
    if (!v.media || !v.backdrop) continue;
    const key = "backdrop-" + id;
    entries[key] = { ...v, backdrop: false };
    backgrounds.push({
      id: key,
      start: v.start ?? 0,
      end: v.end ?? count,
      left: v.backdrop.left ?? 0,
      width: v.backdrop.width ?? 100,
    });
  }
  const backHtml =
    '<div class="backdrop">' +
    backgrounds
      .map(
        (v) =>
          `<div class="backdrop-pane" data-back="${v.id}" style="left:${v.left}%;width:${v.width}%">{{${v.id}}}</div>`,
      )
      .join("") +
    '</div><div class="backdrop-wash"></div>';
  const children = Object.entries(entries).map(([id, v]) => {
    const shared = {
      id,
      style: styles({ width: "100%", height: "100%", "object-fit": "contain" }),
    };
    if (v.image) return { ...shared, kind: "image", artifact: v.image };
    const m = v.media,
      start = Math.max(0, v.start ?? 0),
      end = Math.min(count, v.end ?? count);
    if (!m?.visual) throw Error(id + " requires Prepared Media with a selected visual member");
    const playbackRate = { numerator: v.rate?.numerator ?? 1, denominator: v.rate?.denominator ?? 1 };
    const target = { id: `${id}:occurrence`, duration: exactTemporalValueFromFrames(count, t) };
    const playedFrames = Math.min(end - start, resolveTemporalBoundary(scaleExactTemporalValue(m.domain.duration,
      { numerator: playbackRate.denominator, denominator: playbackRate.numerator }), t, "cover"));
    const pieces = v.holdLast ? [
      { target: { start: exactTemporalValueFromFrames(start, t), end: exactTemporalValueFromFrames(start + playedFrames, t) },
        sourceAtStart: exactTemporalZero(), rate: playbackRate },
      ...(start + playedFrames < end ? [{ target: { start: exactTemporalValueFromFrames(start + playedFrames, t),
        end: exactTemporalValueFromFrames(end, t) }, sourceAtStart: m.domain.duration,
        rate: { numerator: 0, denominator: 1 } }] : []),
    ] : [{
      target: { start: exactTemporalValueFromFrames(start, t), end: exactTemporalValueFromFrames(end, t) },
      sourceAtStart: exactTemporalZero(), rate: playbackRate,
      ...(v.loop ? { wrap: { start: exactTemporalZero(), end: m.domain.duration } } : {}),
    }];
    const occurrenceMap = sealTemporalMap({ stages: [{ target, source: structuredClone(m.domain), pieces }] });
    return {
      ...shared,
      kind: "video",
      source: preparedVisualSource(m),
      muted: true,
      sampling: composeTemporalMaps(occurrenceMap, m.visual.map),
    };
  });
  return sealPresentVisualTrack({
    id: o.id,
    timelineId: t.id,

    presents: [
      {
        id: o.id,
        span: w.span,
        root: {
          id: "scene",
          kind: "program",
          program: htmlVisual({
              html: backHtml + html + '<div class="font-resource">{{font}}</div>',
              css: base + css,
              data: {
                beats,
                fps: t.frameRate.numerator / t.frameRate.denominator,
                count,
                backgrounds,
                ...extra,
              },
              setup:
                terminalSetup +
                `root.style.fontFamily=getComputedStyle(root.querySelector('.font-resource>*')).fontFamily;const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-Math.pow(1-clamp(x),3);const fade=(f,a,z,n=10)=>(a===0?1:ease((f-a)/n))*(z>=data.count?1:clamp((z-f)/n));const paintBackdrop=f=>{for(const b of data.backgrounds){root.querySelector('[data-back="'+b.id+'"]').style.opacity=String(fade(f,b.start,b.end,12));}};` +
                setup,
          }),
          style: styles({
            position: "absolute",
            left: within.xPx + "px",
            top: within.yPx + "px",
            width: within.widthPx + "px",
            height: within.heightPx + "px",
          }),
          slots: [{ name: "font", element: {
            id: "font",
            kind: "text",
            text: "Hypit 字",
            fonts: [font],
            style: styles({ "font-size": "12px" }),
          }}, ...children.map((element) => ({ name: element.id, element }))],
        },
      },
    ],
  });
}
const base = scene_styles;
