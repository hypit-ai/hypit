import { placedVisualMedia } from "./placed-visual-media.js";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { declarationField, sealGraphFragment } from "@hypit/hypit/author";
import { presenterStyle, presenterTypes } from "./presenter.js";
import { sealPresentVisualTrack, compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { htmlVisual } from "@hypit/html-program";
const styles = (o) =>
  Object.entries(o).map(([name, value]) => ({ name, value }));
export function installReframe(module, manifest, component) {
  const types = presenterTypes(module);
  const inputs = [
      { name: "timeline", type: timelineTypes.timeline },
      { name: "within", type: spatialTypes.frame },
      { name: "window", type: temporalTypes.window },
      { name: "sources", type: types.sources },
      { name: "from", type: spatialTypes.frame },
      { name: "to", type: spatialTypes.frame },
    ],
    producer = { module, name: "reframe" };
  manifest.producers.push({
    name: "reframe",
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
        { clips, children } = placedVisualMedia(timeline, window, sources.sources);
      const program = htmlVisual({
        html:
          '<div class="viewport">' +
          children.map((v) => "{{" + v.id + "}}").join("") +
          "</div>",
        css: ".viewport{position:absolute;overflow:hidden}.viewport>*{object-position:50% 30%!important}",
        data: {
          from,
          to,
          duration: window.span.endFrameExclusive - window.span.startFrame,
        },
        setup: `const view=root.querySelector('.viewport');return f=>{const p=Math.max(0,Math.min(1,f/Math.max(1,data.duration-1))),q=p*p*(3-2*p),a=data.from,b=data.to;Object.assign(view.style,{left:(a.xPx+(b.xPx-a.xPx)*q)+'px',top:(a.yPx+(b.yPx-a.yPx)*q)+'px',width:(a.widthPx+(b.widthPx-a.widthPx)*q)+'px',height:(a.heightPx+(b.heightPx-a.heightPx)*q)+'px'});};`,
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
  return {
    declaration: {
    module,
    declaration: "reframe",
      outputs: [types.style],
      shape: {
        summary:
          "Continuous prepared-performance viewport change between two Frames.",
        fields: [
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
      bindings(element) {
        const value = declarationField(element, "id");
        if (value?.kind !== "literal" || !value.value.trim()) throw Error("Reframe.id must be text");
        const id = value.value.trim();
        return [{ name: id, ref: { kind: "record", id }, type: types.style }];
      },
    async compile({ declaration: element, resolveReference }) {
      const bindings = {};
      for (const n of ["from", "to"]) {
        const a = declarationField(element, n);
        if (a?.kind !== "reference") throw Error(n + " needs Frame");
        const r = await resolveReference(a.path);
        if (!r || !sameType(r.type, spatialTypes.frame))
          throw Error(n + " needs Frame");
        bindings[n] = r;
      }
      return {
        records: [
          {
            id: declarationField(element, "id").value.trim(),
            type: types.style,
            value: (canonicalize(presenterStyle(fragment, bindings, "overlay"))),
            range: element.range,
          },
        ],
        components: [],
      };
    },
    },
    markup: { name: "reframe", tag: "Reframe" },
  };
}
