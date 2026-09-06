# Authoring Prompt Kits

Read this when a useful piece of prompt direction should be assembled consistently across several
shots or projects. For one prompt whose wording belongs only to the current Source, ordinary
`text:Value` elements are enough.

A Prompt Kit is a data-only TextTemplate Source. It owns reusable wording and meaningful choices;
it does not own a model, Provider, media reference, output size, or production workflow. Keep fluent
shot direction fluent. Turn something into a Kit when preserving the exact text or exposing a small
repeated choice improves real productions, rather than splitting every sentence into a parameter.

## Declare the reusable text program

An `.svs` file selects Text's Recipe Frontend and declares one template root. This example preserves
one fixed capture direction, requires the current shot and direction, offers a reusable camera choice,
and includes a screen note only when the render selects it:

```svs
<?svml using="@hypit/text/svs@1"?>

<sheet version="1" id="phone-shot">
  text-template.phone-shot {
    separator: paragraph;
    default-camera: handheld;
    default-screen: false;
  }

  text-template.phone-shot.block.capture {
    kind: fixed;
    order: 10;
    text: "A frame from naturally captured phone video, with coherent texture and lighting.";
  }

  text-template.phone-shot.block.camera {
    kind: axis;
    order: 20;
    parameter: camera;
  }
  text-template.phone-shot.choice.camera.handheld {
    text: "The camera has a believable handheld relationship to the subject.";
  }
  text-template.phone-shot.choice.camera.locked {
    text: "The camera remains still while the subject carries the action.";
  }

  text-template.phone-shot.block.screen-note {
    kind: variant;
    order: 30;
  }
  text-template.phone-shot.choice.screen-note.present {
    when-param-screen: true;
    text: "Keep the supplied interface physically contained and readable on its screen.";
  }

  text-template.phone-shot.block.shot {
    kind: slot;
    order: 40;
    slot: shot;
  }
  text-template.phone-shot.block.direction {
    kind: slot;
    order: 50;
    slot: direction;
  }
  text-template.phone-shot.block.references {
    kind: slot;
    order: 60;
    slot: references;
    optional: true;
    label: "REFERENCE ROLES:";
  }
</sheet>
```

The root joins blocks by one blank line. Its `default-<name>` properties supply scalar bindings.
Blocks are ordered by unique non-negative `order` values:

| Block | What it contributes |
| --- | --- |
| `fixed` | Exact reusable Text from `text` |
| `slot` | Text connected at render time; `optional: true` omits an absent slot, and `label` adds one literal heading |
| `axis` | Exactly the choice whose id equals the scalar named by `parameter` |
| `variant` | A choice whose `when-param-<name>` or `when-select-<name>` scalar conditions all match |

Choices live at `text-template.<template>.choice.<block>.<choice>`. Defaults, conditions, axis
parameters and literal `text:Param` values are finite text, number or boolean scalars. Text that is
produced elsewhere remains a graph edge rather than being copied into a scalar binding.

## Render it in an Author Source

```svml
<?svml using="@hypit/markup@1"?>
<svml>
  <import as="text" from="@hypit/text@1"/>
  <import as="kit" source="./phone-shot.svs"/>
  <import as="recipes" source="./look.svs"/>

  <text:Value id="shot">A close half-body vertical view with room above the presenter.</text:Value>
  <text:Value id="direction">A confident presenter speaks in a lived-in studio.</text:Value>
  <text:Value id="reference-roles">The first image supplies the presenter's identity.</text:Value>

  <text:Render id="prompt" template={kit.phone-shot} recipe={recipes.prompt.main}>
    <text:Param name="camera" value="locked"/>
    <text:Param name="screen" value="true" type="boolean"/>
    <text:Set name="shot" text={shot}/>
    <text:Set name="direction" text={direction}/>
    <text:Set name="references" text={reference-roles}/>
  </text:Render>
</svml>
```

The optional Recipe supplies scalar properties consumed by the template. Template defaults apply
first, Recipe values replace those defaults, and explicit `text:Param` children replace Recipe
values. `text:Set` replaces one Text binding through a graph edge; `text:Append` adds another Text
after that binding. Their order is authored and visible.

The rendered `{prompt}` is an ordinary Text Output. Connect it to a model's prompt port, or target it
in a small Run and inspect or export that Result before using the Kit elsewhere. This checks the
assembled words without calling the image or video model. The model Surface still owns aspect ratio,
duration, resolution and reference Resource children; prose describing what a reference supplies
does not create the reference edge.

Keep a Kit project-local while it serves one project. When its owner wants the same program in other
projects, export the `.svs` file from an ordinary versioned data package and import that package Source
directly. [Component sharing](component-sharing.md#data-packages-remain-data) owns that distribution
boundary; no activation code or Hypit-specific registry is involved.
