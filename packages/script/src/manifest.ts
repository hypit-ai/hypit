import { narrativeDependency, narrativeSchema, narrativeTypes } from "@hypit/narrative";
import { textDependency, textTypes } from "@hypit/text";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";

export const scriptModuleRef = { name: "@hypit/script", version: "1" } as const;
export const narrativeType: TypeRef = narrativeTypes.narrative;
export const narrativeExcerptType: TypeRef = narrativeTypes.excerpt;
export const narrativeSelectionType: TypeRef = narrativeTypes.selection;
export const narrativeMomentType: TypeRef = narrativeTypes.moment;
export const captionDisplayType: TypeRef = narrativeTypes.captionDisplay;
export const captionCorrespondenceType: TypeRef = narrativeTypes.captionCorrespondence;
export const captionDisplayWordSubsetType: TypeRef = narrativeTypes.captionDisplayWordSubset;
export { narrativeSchema };

export const scriptMarkupSurfaces = [
  {
    name: "script",
    tag: "script",
    mode: "raw",
    outputs: [
      narrativeType,
      narrativeExcerptType,
      textTypes.text,
      narrativeSelectionType,
      narrativeMomentType,
      captionDisplayType,
      captionCorrespondenceType,
      captionDisplayWordSubsetType,
    ],
    vocabulary: {
      summary: "Holds every spoken word as prose-first Segments and publishes the authored Narrative with the Selections, Moments and text projections the rest of the source reads.",
      attributes: [
        { name: "id", kind: "identifier", required: false,
          summary: "Names the Narrative Record and prefixes every view this element publishes." },
      ],
      text: "The element's own content is the Script body: named Segments holding prose, Role Cues, Dual Text, and zero-width Selection and Moment markers. It carries no timecode, no media reference and no generation parameter.",
      ports: [
        { name: "", type: narrativeType,
          summary: "The whole authored Narrative, addressed by the element's own id." },
        { name: "segment.<id>", type: narrativeExcerptType,
          summary: "One Segment as a narrow Excerpt, used to associate a generated Take with that Segment." },
        { name: "segment.<id>.dialogue", type: textTypes.text,
          summary: "One Segment as display-independent dialogue, keeping Role Cue labels and the spoken side of Dual Text." },
        { name: "segment.<id>.speech", type: textTypes.text,
          summary: "One Segment as pronunciation only, with Role Cue labels dropped." },
        { name: "caption", type: captionDisplayType,
          summary: "The ordered display Atoms of the whole Script." },
        { name: "caption.correspondence", type: captionCorrespondenceType,
          summary: "The edge from each whole display Atom to its authored speech-token range." },
        { name: "caption.selection.<id>", type: captionDisplayWordSubsetType,
          summary: "The display words wholly owned by one Selection." },
        { name: "selection.<id>", type: narrativeSelectionType,
          summary: "One named range over the Narrative, reusable wherever a Selection is read." },
        { name: "moment.<id>", type: narrativeMomentType,
          summary: "One named point in the Narrative, reusable wherever a Moment is read." },
      ],
      example: [
        '<script id="story">',
        "  @whole",
        "  <hook>",
        "    <HOST> @problem Never let anyone take credit for your work. @/problem",
        "  </hook>",
        "",
        "  <meeting>",
        "    <HOST> I started sending <BCC | B C C> recaps. @ranking! Everything changed.",
        "  </meeting>",
        "  @/whole~",
        "</script>",
      ].join("\n"),
      notes: [
        "`id` defaults to `script` and must be a canonical lower-case identifier of up to 64 characters.",
        "A Script requires at least one Segment, and natural-language text is refused outside a Segment.",
        "A Segment is opened by its own lower-case name and closed by that exact name, or written self-closing as `<pause/>`; the name is the Segment id, must be unique within the Script, and `script` is reserved. Segments do not nest.",
        "A Role Cue such as `<HOST>` is a bare tag inside a Segment with no close; its turn runs until the next Cue or the end of the Segment, and a Cue may not follow unowned speech in the same Segment. Role state resets when the Segment closes.",
        "Dual Text is written `<display | speech>`: the left side reaches the caption projection and the right side reaches dialogue and speech. The spoken side must not be empty; the displayed side may be, which speaks a word that is never displayed.",
        "Selection and Moment markers are zero-width, share one name namespace, and may not split a speech token:",
        [
          "| Marker | Meaning |",
          "|---|---|",
          "| `@id` | Opens a Selection at the next word's start |",
          "| `~@id` | Opens a Selection at the previous word's end |",
          "| `@/id` | Closes a Selection at the previous word's end |",
          "| `@/id~` | Closes a Selection at the next word's start |",
          "| `@id!` | A Moment at the next word's start |",
          "| `~@id!` | A Moment at the previous word's end |",
        ].join("\n"),
        "One Selection name may open and close more than once, giving a Selection with gaps, and two Selections may cross each other rather than nest.",
        "`<!-- -->` comments never enter any projection, and `\\@`, `\\<` and `\\\\` write those characters literally; inside Dual Text `\\|` and `\\>` do the same.",
      ],
    },
  },
] as const;

export const scriptManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: scriptModuleRef.name,
  version: scriptModuleRef.version,
  dependencies: [narrativeDependency, textDependency],
  types: [],
  capabilities: [],
  producers: [],
};
