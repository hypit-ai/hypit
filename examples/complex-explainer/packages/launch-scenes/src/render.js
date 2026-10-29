import { sealPresentVisualTrack } from "@hypit/composition";
import { htmlVisual } from "@hypit/html-program";
import { assertTemporalWindowFor } from "@hypit/temporal";
const sty = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
function seal(t, within, w, o, html, css, setup, data, children = []) {
  assertTemporalWindowFor(w, { subjectId: o.id, timeline: t });
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
            html: html + '<div class="font-resource">{{font}}</div>',
            css:
              ":scope{pointer-events:none}.font-resource{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}" +
              css,
            setup:
              `const family=getComputedStyle(root.querySelector('.font-resource>*')).fontFamily;root.style.fontFamily=family;` +
              setup,
            data,
          }),
          style: sty({
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
            fonts: [data.font],
            style: sty({ "font-size": "12px" }),
          }}, ...children.map((element) => ({ name: element.id, element }))],
        },
      },
    ],
  });
}
export function renderPoster(t, within, w, font, o) {
  return seal(
    t,
    within,
    w,
    o,
    `<div class="poster"><div class="poster-title">${esc(o.text)}</div><div class="poster-subtitle">${esc(o.subtitle)}</div></div>`,
    `.poster{position:absolute;left:5%;top:${o.y * 100}%;width:90%;text-align:center}.poster-title{font-size:${o.size}px;line-height:1.05;color:#ff79bc;-webkit-text-stroke:5px #2b1f30;paint-order:stroke fill;text-shadow:2px 2px #2b1f30,4px 4px #2b1f30,7px 8px #2b1f30;filter:drop-shadow(0 0 1px #ffe6f2)}.poster-subtitle{display:inline-block;margin-top:${o["subtitle-gap"]}px;padding:10px 26px 13px;font-size:${o["subtitle-size"]}px;line-height:1.2;color:#2b1f30;background:#fff0f7;border:3px solid #2b1f30;border-radius:6px;box-shadow:6px 7px 0 #fa67aa}`,
    "return frame=>{};",
    { font },
  );
}
