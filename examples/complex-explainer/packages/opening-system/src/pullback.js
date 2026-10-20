import { placedVisualMedia } from "./placed-visual-media.js";
import { assertAttributes, assertEmptyElement, textAttribute, createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { canonicalize } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import { presenterStyle, presenterTypes } from "./presenter.js";
import { sealVisualTrack, compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { htmlVisual } from "@hypit/html-program";
const styles = (o) =>
  Object.entries(o).map(([name, value]) => ({ name, value }));
// A local Use owns the pullback's clock; media continues from its Source Window.
export function installPullback(module, manifest, component, optionsType, mode="pullback") {
  const types = presenterTypes(module);
  const isFade=mode==="fade-out",tag=isFade?"FadeOut":"Pullback";
  const inputs = [
    { name: "timeline", type: timelineTypes.timeline },
    { name: "within", type: spatialTypes.frame },
    { name: "window", type: temporalTypes.window },
    { name: "sources", type: types.sources },
    { name: "options", type: optionsType },
  ];
  const producer = { module, name: mode };
  manifest.producers.push({
    name: mode,
    inputs,
    outputs: [{ name: "visual", type: compositionTypes.visualTrack }],
    needs: [],
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
      const { timeline, within, window, sources, options } = Object.fromEntries(
        Object.entries(inputs).map(([k, r]) => {
          return [k, r.value];
        }),
      );
      const { clips, children } = placedVisualMedia(timeline, window, sources.sources);
      const duration = window.span.endFrameExclusive - window.span.startFrame;
      const program = htmlVisual({
        html:
          '<div class="picture">' +
          children.map((c) => "{{" + c.id + "}}").join("") +
          "</div>",
        css: (isFade?":scope{background:#fce5ee}":"")+":scope{overflow:hidden}.picture{position:absolute;inset:0;transform-origin:50% 35%}",
        data: {
          scale: options.scale,
          fade: isFade,
          duration,
          spans: clips.map((c) => ({
            start: c.span.startFrame - window.span.startFrame,
            end: c.span.endFrameExclusive - window.span.startFrame,
          })),
        },
        setup: `const picture=root.querySelector('.picture'),videos=[...picture.querySelectorAll('video')];return frame=>{const p=Math.max(0,Math.min(1,frame/Math.max(1,data.duration-1))),scale=1+(data.scale-1)*Math.pow(1-p,4);picture.style.transform='scale('+scale+')';picture.style.opacity=data.fade?String(1-p*p*(3-2*p)):'1';videos.forEach((v,i)=>v.style.visibility=frame>=data.spans[i].start&&frame<data.spans[i].end?'inherit':'hidden');};`,
      });
      const id = window.subjectId,
        visual = sealVisualTrack({
          id,
          timelineId: timeline.id,
          visualIr: "hypit.visual-ir@1",
          presents: children.length
            ? [
                {
                  id,
                  order: 0,
                  z: 0,
                  span: window.span,
                  elements: [
                    {
                      id: "scene",
                      kind: "program",
                      order: 0,
                      program,
                      style: styles({
                        position: "absolute",
                        left: within.xPx + "px",
                        top: within.yPx + "px",
                        width: within.widthPx + "px",
                        height: within.heightPx + "px",
                      }),
                    },
                    ...children,
                  ],
                },
              ]
            : [],
        });
      return {
        outputs: { visual: (canonicalize(visual)) },
        needs: {},
      };
    },
  });
  return createMarkupSurfaceFacet({
    module,
    declaration: {
      name: mode,
      tag,
      mode: "structured",
      outputs: [types.style, optionsType],
      vocabulary: {
        summary:
          isFade?"Fade placed footage to transparent across this Use.":"Fast-to-slow pullback of placed footage, settling at ordinary full-frame geometry.",
        attributes: [
          {
            name: "id",
            kind: "identifier",
            required: true,
            summary: "Style identity",
          },
          ...(!isFade?[{
            name: "scale",
            kind: "literal",
            required: false,
            summary: "Initial magnification; defaults to 1.5",
          }]:[]),
        ],
      },
    },
    handler: ({ element }) => {
      assertAttributes(element, isFade?["id"]:["id", "scale"]);
      assertEmptyElement(element);
      const id = textAttribute(element, "id"),
        scale = isFade?1:Number(element.attributes.scale ?? 1.5);
      if (!Number.isFinite(scale) || scale < 1)
        throw Error("Pullback scale must be at least 1");
      const options = {
        type: optionsType,
        ref: { kind: "record", id: id + ".options" },
      };
      return {
        records: [
          {
            id: id + ".options",
            type: optionsType,
            value: (canonicalize({ scale })),
            range: element.range,
          },
          {
            id,
            type: types.style,
            value: (canonicalize(presenterStyle(fragment, { options }))),
            range: element.range,
          },
        ],
        components: [],
      };
    },
  });
}
