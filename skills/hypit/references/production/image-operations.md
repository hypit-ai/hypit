# Preparing generated images

Read this when a generated or supplied image needs to be combined, corrected, resized, cropped, or
cut out before it becomes a model reference or a Track item. [Image direction](../playbooks/craft/image-direction.md)
owns what the image should communicate; [spatial layout](spatial.md) owns Canvas, Frame and fit.

An image operation publishes another ordinary image Output. The resulting image can feed Seedance,
a Media Track, another image operation, or any compatible project component. The operation belongs
in Source when that transformation is part of the reproducible production relationship.

## Compose several images on one canvas

Use Image Compose when the work needs a flattened picture made from explicitly positioned layers:

```svml
<import as="compose" from="@hypit/image-compose@1"/>

<compose:Image id="card" canvas={portrait} background="#00000000">
  <compose:Layer source={background.image} frame={full} fit="cover"/>
  <compose:Layer source={product.image} frame={product-frame} fit="contain"/>
</compose:Image>
```

Child order is paint order. Each Layer keeps the source image, destination Frame, fit and optional
opacity explicit. `{card.image}` is a flattened image, not a Track; use a visual component instead
when the layers need independent timing or motion in the final video.

## Apply a reusable correction program

Image Transform separates the ordered correction choices from the image they act on:

```svml
<import as="image" from="@hypit/image-transform@1"/>

<image:Program id="delivery-crop">
  <image:Crop x="0" y="0" width="1080" height="1920" unit="pixel"/>
  <image:Resize width="1080" height="1920" fit="cover"/>
  <image:Encode format="png"/>
</image:Program>

<image:Transform id="prepared-shot" source={shot.image} program={delivery-crop}/>
```

Operations run in written order. A Program is authored data and produces no pixels until a
Transform applies it. Crop, resize, rotate, flip, denoise, color, sharpen, blur, alpha handling and
encoding are available; use `hypit vocabulary @hypit/image-transform --tag Program` for their
installed fields and limits. `{prepared-shot.image}` is the transformed image.

Use correction to express a known production choice. A prompt problem remains owned by the image
direction and its Prompt Kit; a different composition remains owned by the shot or reference
relationship.

## Remove a background

Use Background Removal when the next composition needs a still subject without its original field:

```svml
<import as="remove" from="@hypit/background-removal@1"/>

<remove:Background id="presenter-cutout" source={portrait.image}/>
```

`{presenter-cutout.image}` is an image with transparency, ready for a Media Track, image composition,
or another compatible consumer. The Runtime Profile chooses the Endpoint that performs the removal;
the Source records only the requested visual relationship.

The installed `@hypit/background-removal` operation accepts one image and returns one image.
Its package README names the implemented Provider binding; `hypit plan` with the selected Runtime
checks which Endpoint will serve this Source. A service advertising background removal still needs
a matching Provider capability in the installed Distribution.

For a speaking video cutout, the moving silhouette must be removed across the clip. This image
operation supplies neither video matting nor a moving mask. [Compositing](../playbooks/craft/compositing.md#inset-cutout-and-flattened-composite-are-distinct-choices)
explains the choice between a geometric inset, a still cutout and a live presenter cutout, including
how the same A-roll performance keeps its semantic role.

## Keep operation and presentation distinct

Composing or correcting image bytes changes the reusable image itself. A Media Track instead places
an image in a Frame for a Window and may animate that presentation. Choose the former when several
downstream consumers should receive the same prepared pixels; choose the latter when the change
belongs only to how this video presents the image.

Inspect the selected package vocabulary before using optional fields. The examples above provide the
stable Source shapes; Endpoint choice, credentials and execution capacity remain Runtime concerns.
