import { palette } from "@explainer/visual-language";
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
export function installPortraitInset(module, manifest, component) {
  const types = presenterTypes(module);
  const inputs = [
      { name: "timeline", type: timelineTypes.timeline },
      { name: "within", type: spatialTypes.frame },
      { name: "window", type: temporalTypes.window },
      { name: "sources", type: types.sources },
      { name: "frame", type: spatialTypes.frame },
    ],
    producer = { module, name: "portrait-inset" };
  manifest.producers.push({
    name: "portrait-inset",
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
      const { timeline, within, window, sources, frame } = Object.fromEntries(
          Object.entries(inputs).map(([k, r]) => [k, r.value]),
        ),
        { children } = placedVisualMedia(timeline, window, sources.sources);
      const program = htmlVisual({
        html:
          '<div class="viewport"><div class="inner">' +
          children.map((v) => "{{" + v.id + "}}").join("") +
          "</div></div>",
        css: `.viewport{position:absolute;overflow:hidden;border-radius:50%;border:4px solid ${palette.ink};box-shadow:0 0 0 5px #fa81b8,7px 9px 0 5px ${palette.ink}}.inner{position:absolute;inset:0;transform:scale(1.23);transform-origin:50% 28%}.inner>*{object-position:50% 28%!important}`,
        data: { frame },
        setup: `const view=root.querySelector('.viewport'),a=data.frame;Object.assign(view.style,{left:a.xPx+'px',top:a.yPx+'px',width:a.widthPx+'px',height:a.heightPx+'px'});return()=>{};`,
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
    declaration: "portrait-inset",
      outputs: [types.style],
      shape: {
        summary: "Round speaking portrait with a tighter inner crop.",
        fields: [
          {
            name: "id",
            kind: "identifier",
            required: true,
            summary: "Style identity",
          },
          ...["frame"].map((name) => ({
            name,
            kind: "reference",
            required: true,
            accepts: [spatialTypes.frame],
            summary: "Portrait viewport",
          })),
        ],
      },
      bindings(element) {
        const value = declarationField(element, "id");
        if (value?.kind !== "literal" || !value.value.trim()) throw Error("PortraitInset.id must be text");
        const id = value.value.trim();
        return [{ name: id, ref: { kind: "record", id }, type: types.style }];
      },
    async compile({ declaration: element, resolveReference }) {
      const bindings = {};
      for (const n of ["frame"]) {
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
    markup: { name: "portrait-inset", tag: "PortraitInset" },
  };
}
