# Reading and writing Source syntax

Read this for the language around a production: imports, references, literal values, Recipes and
Invocation choices. [Script syntax](script-syntax.md) owns prose, Roles, Dual Text, authored Cues, display
attributes and markers. [Timing](timing.md) explains how components consume those identities.
[System relationships](system.md) explains authored values and computed Outputs.

## Three documents, three decisions

A `.svml` normally describes the work, a `.svs` holds reusable authored values, and a `.svrun`
chooses one Author entry, its execution Targets and any transient realization override. Each
document's Header selects its parser; the filename extension
is the convention used to recognize its role.

This small Author Source produces Text and Script values; it makes no media request:

```svml
<?svml using="@hypit/markup@1"?>
<svml>
  <import from="@hypit/script@1"/>
  <import as="copy" from="@hypit/text@1"/>
  <import as="kit" source="./direction.svs"/>

  <script id="story">
    <opening><HOST>Here is @{proof}the useful part.@{/proof}</opening>
  </script>
  <copy:Value id="direction">She leans in slightly, amused by her own observation.</copy:Value>
  <copy:Render id="prompt" template={kit.performance}>
    <copy:Set name="dialogue" text={story.segment.opening.dialogue}/>
    <copy:Set name="direction" text={direction}/>
  </copy:Render>
</svml>
```

Package imports expose vocabulary under a local alias. Source imports expose a document's public
values: `<import as="look" source="./look.svs"/>`. A data package can expose the same kind of Source,
for example `<import as="ugc" source="@hypit/gpt-image-kits/phone-ugc-v1"/>`; its own relative imports
and assets stay inside that package. Put imports in the leading prologue, before body declarations.
Use a package's Source address, such as `@hypit/text@1`, in `from`; installed package versions belong
to ordinary package management. A Source data import reads the package's declared Source content.

A Source alias qualifies public bindings; it does not rename a Narrative's authored identity.
Two imported Sources declaring different Scripts both named `story` therefore conflict. Share the
one Script that owns the work, or give genuinely separate Narratives distinct ids.

## Braces connect values

`duration="5"` is literal attribute text interpreted by the receiving declaration.
`prompt={direction}` is a whole-value graph reference, checked against the declared input Type.
`prompt="direction"` is a string, not that reference. Braces contain whole-value graph references.
Use `copy:Render` with a TextTemplate and explicit bindings to assemble text; use the receiving
package's expression syntax where it declares one, such as temporal offsets.

Output paths are package vocabulary, not inferred from the element's tag:

- `copy:Value id="direction"` publishes `{direction}`;
- an imported `media:Image id="logo"` publishes `{logo}`;
- `gpt:Image id="portrait"` publishes `{portrait.image}`;
- `mediaop:Prepare id="prepared"` publishes `{prepared.media}`;
- `time:Timeline id="speech"` publishes `{speech.timeline}`;
- `typo:Flow id="title"` publishes `{title.occurrence}` and `{title.visual}`;
- `visual:Track id="picture"` publishes `{picture.visual}` and `{picture.program}`;
- `audio:Track id="mix"` publishes `{mix.audio}`.

Visual and Audio Tracks separately publish the picture and sound contributions selected in Film.

Inspect `hypit vocabulary` for the actual declaration's exports and use the published path it reports.
Public bindings can be authored Records or realizable Logical Outputs. Script,
Recipes and literal Text already exist as authored data; they are not Invocation Targets. The computed
`prompt` from `copy:Render` is a Logical Output that an Invocation can target or another declaration
can consume.
Declaration order does not establish dependencies. References state which values each declaration
uses, so a later declaration can be referenced without rearranging the Source.

Different bodies have different readers. Script uses its own prose grammar; structured components
declare their permitted attributes and children; Text has its own literal/template forms. In
structured Markup, use the receiving declaration's attributes, children, literals, Recipes and
reference expressions, and escape `&`, `<`, `>`, `"`, and `'` as `&amp;`, `&lt;`, `&gt;`,
`&quot;`, and `&apos;`; comments use `<!-- ... -->` outside raw bodies. Script owns the punctuation
inside its raw body, as described in [Script syntax](script-syntax.md).

## Recipes are named values

```svs
<?svml using="@hypit/recipe@1"?>
<sheet version="1">
  media.cover {
    fit: cover;
  }
</sheet>
```

Imported as `look`, this rule is `{look.media.cover}`. Recipe rule names use dotted paths, such as
`media.cover`. Rules do not inherit or cascade. Scalars, strict JSON arrays and strict JSON objects are
supported; each consumer owns the allowed properties, defaults and units. A Caption Style's Recipe
is not interchangeable with Media appearance merely because both have a color or size.

Every property ends with `;`. `null`, booleans, finite numbers, and simple bare words are scalar
values. Quote strings whose punctuation could be read as SVS syntax. Arrays and objects use strict
JSON, including quoted keys and strings:

```svs
caption.host {
  enabled: true;
  color: "#ff6f61";
  padding: [12, 18];
  motion: {"kind":"spring","amount":0.12};
  enter: 8f;
}
```

Units such as `8f`, `250ms`, and `50%` remain strings until the consuming package interprets them.
Recipe properties are authored literals. Media, fonts, semantic ranges and other computed values are
explicit Source inputs to the component that consumes them.

Some packages, such as TextTemplate, explicitly define parameter precedence for their own inputs.
A Prompt Kit remains a reusable text program; image
references, voice references, model parameters and generated Outputs stay explicit in Author Source.

The `direction.svs` used above selects Text's own Recipe Frontend to produce a TextTemplate rather
than ordinary Recipes. This is the same file-extension convention with a different explicit Header:

```svs
<?svml using="@hypit/text/svs@1"?>
<sheet version="1" id="performance">
  text-template.performance { separator: paragraph; }
  text-template.performance.block.dialogue {
    kind: slot;
    order: 10;
    slot: dialogue;
  }
  text-template.performance.block.direction {
    kind: slot;
    order: 20;
    slot: direction;
  }
</sheet>
```

This small Kit just joins two Text inputs. It does not generate a video. Fixed blocks and variable
axes can be added when they express reusable direction; `@hypit/text` owns that template grammar.

## Invocations demand Outputs

For the Text example saved as `main.svml`, beside `direction.svs`:

```svml
<?svml using="@hypit/markup/invocation@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="prompt"/>
</svrun>
```

A video Invocation usually targets the renderer's public video Output. Several Targets are valid when
several deliverables are wanted. Targets are public Output names; requests outside the demanded graph
are not executed.

An Invocation may add a transient override for an existing authored Record, but it cannot introduce
a file, value or computation. Accept durable material by declaring the project resource through the
package that owns its meaning and selecting that Record in the Author Source. A raw MP4 file is a
media asset, not prepared media or alignment evidence; preparation and evidence retain their nominal
types and explicit relationships. [Invocations](runs.md) explains Targets and transient overrides, while
[Authoring](authoring.md) owns durable material choices.

`hypit check <source>` checks Source and graph legality. `hypit plan <author-source> --target <output> --runtime <profile>` exposes
the selected graph and external requests without submitting them. A legal document can still describe a
poor image, a misplaced Caption or an unhelpful cut; those remain directing questions.
