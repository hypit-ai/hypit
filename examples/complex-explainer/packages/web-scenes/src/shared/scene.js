import { terminalSetup } from "./terminal.js";
import { scene_styles } from "./scene-styles.js";
import { sealPresentVisualTrack } from "@hypit/composition";
import { htmlVisual } from "@hypit/html-program";
import { assertTemporalWindowFor } from "@hypit/temporal";
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
  const children = Object.entries(entries).map(([id, v], n) => {
    const shared = {
      id,
      parent: "scene",
      order: n + 2,
      style: styles({ width: "100%", height: "100%", "object-fit": "contain" }),
    };
    if (v.image) return { ...shared, kind: "image", artifact: v.image };
    const m = v.media,
      src = m.frameDomain.frameRate,
      start = Math.max(0, v.start ?? 0),
      end = Math.min(count, v.end ?? count);
    if (!m.visual) throw Error(id + " requires prepared picture");
    const rate = {
      numerator: src.numerator * t.frameRate.denominator * (v.rate?.numerator ?? 1),
      denominator: src.denominator * t.frameRate.numerator * (v.rate?.denominator ?? 1),
    };
    if (
      !v.loop &&
      !v.holdLast &&
      ((end - start - 1) * rate.numerator) / rate.denominator >= m.frameDomain.frameCount
    )
      throw Error(id + " source is too short");
    return {
      ...shared,
      kind: "video",
      artifact: m.visual.artifact,
      muted: true,
      sourceTime: {
        sourceFrameRate: src,
        sourceFrameCount: m.frameDomain.frameCount,
        pieces: v.holdLast
          ? (() => {
              const played = Math.min(
                  end - start,
                  Math.ceil((m.frameDomain.frameCount * rate.denominator) / rate.numerator),
                ),
                segments = [
                  {
                    target: { startFrame: start, endFrameExclusive: start + played },
                    sourceAtStart: { numerator: 0, denominator: 1 },
                    rate,
                  },
                ];
              if (start + played < end)
                segments.push({
                  target: { startFrame: start + played, endFrameExclusive: end },
                  sourceAtStart: { numerator: m.frameDomain.frameCount - 1, denominator: 1 },
                  rate: { numerator: 0, denominator: 1 },
                });
              return segments;
            })()
          : v.loop
            ? Array.from(
                {
                  length: Math.ceil(
                    (end - start) /
                      Math.floor((m.frameDomain.frameCount * rate.denominator) / rate.numerator),
                  ),
                },
                (_, i) => {
                  const n = Math.floor((m.frameDomain.frameCount * rate.denominator) / rate.numerator),
                    a = start + i * n;
                  return {
                    target: { startFrame: a, endFrameExclusive: Math.min(end, a + n) },
                    sourceAtStart: { numerator: 0, denominator: 1 },
                    rate,
                  };
                },
              )
            : [
                {
                  target: { startFrame: start, endFrameExclusive: end },
                  sourceAtStart: { numerator: 0, denominator: 1 },
                  rate,
                },
              ],
      },
    };
  });
  return sealPresentVisualTrack({
    id: o.id,
    timelineId: t.id,
    visualIr: "hypit.visual-ir@1",
    presents: [
      {
        id: o.id,
        order: 0,
        span: w.span,
        elements: [
          {
            id: "scene",
            kind: "program",
            order: 0,
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
          },
          {
            id: "font",
            parent: "scene",
            kind: "text",
            order: 1,
            text: "Hypit 字",
            fonts: [font],
            style: styles({ "font-size": "12px" }),
          },
          ...children,
        ],
      },
    ],
  });
}
const base = scene_styles;
