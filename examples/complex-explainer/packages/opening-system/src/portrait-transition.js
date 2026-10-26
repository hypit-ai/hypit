import { palette } from "@explainer/visual-language";
import { placedVisualMedia } from "./placed-visual-media.js";
import { assertAttributes, assertEmptyElement, textAttribute, createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import { presenterStyle, presenterTypes } from "./presenter.js";
import { sealPresentVisualTrack, compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { htmlVisual } from "@hypit/html-program";
const styles = (o) =>
  Object.entries(o).map(([name, value]) => ({ name, value }));
export function installPortraitTransition(module, manifest, component) {
  const types = presenterTypes(module);
  const inputs = [
      { name: "timeline", type: timelineTypes.timeline },
      { name: "within", type: spatialTypes.frame },
      { name: "window", type: temporalTypes.window },
      { name: "sources", type: types.sources },
      { name: "from", type: spatialTypes.frame },
      { name: "to", type: spatialTypes.frame },
    ],
    producer = { module, name: "portrait-transition" };
  manifest.producers.push({
    name: "portrait-transition",
    inputs,
    result: { kind: "output", name: "visual", type: compositionTypes.visualTrack },
  });
  const fragment = sealGraphFragment({
    inputs,
    operations: [
      {
        id: "render",
        producer,
        inputs: Object.fromEntries(
          inputs.map((p) => [p.name, { kind: "fragment-input", name: p.name }]),
        ),
        result: { kind: "output", name: "visual" },
      },
    ],
    exports: [
      {
        name: "visual",
        type: compositionTypes.visualTrack,
        root: { kind: "fragment-operation", operation: "render" },
      },
    ],
  });
  component.producers.push({
    producer,
    handler: ({ inputs }) => {
      const { timeline, within, window, sources, from, to } = Object.fromEntries(
          Object.entries(inputs).map(([k, r]) => [k, r.value]),
        ),
        { children } = placedVisualMedia(timeline, window, sources.sources);
      const program = htmlVisual({
        html:
          '<div class="viewport"><div class="inner">' +
          children.map((v) => "{{" + v.id + "}}").join("") +
          "</div></div>",
        css: `.viewport{position:absolute;overflow:hidden}.inner{position:absolute;inset:0;transform-origin:50% 28%}` ,
        data: {
          from,
          to,
          ink: palette.ink,
          duration: window.span.endFrameExclusive - window.span.startFrame,
        },
        setup: `const view=root.querySelector('.viewport'),inner=root.querySelector('.inner'),videos=[...inner.querySelectorAll('video')];return f=>{
 const p=Math.max(0,Math.min(1,f/Math.max(1,data.duration-1))),q=p*p*p*(p*(p*6-15)+10),a=data.from,b=data.to;
 Object.assign(view.style,{left:(a.xPx+(b.xPx-a.xPx)*q)+'px',top:(a.yPx+(b.yPx-a.yPx)*q)+'px',width:(a.widthPx+(b.widthPx-a.widthPx)*q)+'px',height:(a.heightPx+(b.heightPx-a.heightPx)*q)+'px',borderRadius:(50*q)+'%',border:(4*q)+'px solid '+data.ink,boxShadow:q===0?'none':'0 0 0 '+(5*q)+'px #fa81b8,'+(7*q)+'px '+(9*q)+'px 0 '+(5*q)+'px '+data.ink});
 inner.style.transform='scale('+(1+.23*q)+')';
 videos.forEach(v=>v.style.setProperty('object-position','50% '+(50-22*q)+'%','important'));
};`,
      });
      const id = window.subjectId,
        visual = sealPresentVisualTrack({
          id,
          timelineId: timeline.id,
          visualIr: "hypit.visual-ir@1",
          presents: children.length
            ? [
                {
                  id,
                  span: window.span,
                  root: {
                    id: "scene",
                    kind: "program",
                    program,
                    style: styles({
                      position: "absolute",
                      left: within.xPx + "px",
                      top: within.yPx + "px",
                      width: within.widthPx + "px",
                      height: within.heightPx + "px",
                    }),
                    slots: children.map((element) => ({ name: element.id, element })),
                  },
                },
              ]
            : [],
        });
      return { kind: "output", value: canonicalize(visual) };
    },
  });
  return createMarkupSurfaceFacet({
    module,
    declaration: {
      name: "portrait-transition",
      tag: "PortraitTransition",
      mode: "structured",
      outputs: [types.style],
      vocabulary: {
        summary:
          "A continuous full-frame performance move into the project's circular presenter inset.",
        attributes: [
          {
            name: "id",
            kind: "identifier",
            required: true,
            summary: "Style identity",
          },
          ...["from", "to"].map((name) => ({
            name,
            kind: "reference",
            required: true,
            accepts: [spatialTypes.frame],
            summary: "Endpoint frame",
          })),
        ],
      },
    },
    handler: ({ element, resolveReference }) => {
      assertAttributes(element, ["id", "from", "to"]);
      assertEmptyElement(element);
      const bindings = {};
      for (const n of ["from", "to"]) {
        const a = element.attributes[n];
        if (a?.kind !== "reference") throw Error(n + " needs Frame");
        const r = resolveReference(a.path);
        if (!r || !sameType(r.type, spatialTypes.frame))
          throw Error(n + " needs Frame");
        bindings[n] = r;
      }
      return {
        records: [
          {
            id: textAttribute(element, "id"),
            type: types.style,
            value: (canonicalize(presenterStyle(fragment, bindings, "overlay"))),
            range: element.range,
          },
        ],
        components: [],
      };
    },
  });
}
