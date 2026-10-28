# Shared visual language

An ordinary JavaScript dependency containing this production's named palette and its CSS-variable
representation. `palette` supplies the color values; `paletteCss` supplies a `:scope` rule with the
same names. Scene packages import the representation their renderer needs.

```js
import { palette, paletteCss } from "@explainer/visual-language";
```

This package declares no Hypit Module, Author Declaration, Track or Companion. Sharing a design decision does
not by itself create a visible component. Scenes still own their geometry, typography, depth and
motion; changing this palette alone does not implement a complete change of visual style.

Keep the colors that serve this film, or revise them as one shared design decision when adapting it.
They are not defaults prescribed for other productions.
