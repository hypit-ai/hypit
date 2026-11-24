# Preparing and Editing Images (`image-operations.md`)

Read this when a generated or supplied still image needs to be edited, cropped, resized, composited, or prepared before becoming a model reference or a Picture Present. [Image direction](../playbooks/craft/image-direction.md) owns visual direction; [spatial layout](spatial.md) owns timeline `<layout>` and `fit`.

## Choose the Right Tool for the Operation

Keep deterministic pixel edits, AI image editing, and timeline compositing distinct:

| Goal | Right approach |
| --- | --- |
| Crop, resize, pad, or convert format (PNG/JPG/WebP) | Local deterministic edit with `ffmpeg` or ImageMagick/Python (`PIL`) before registering as Project Media. |
| Combine multiple stills into a coherent new scene (matching lighting, perspective, or camera) | Generative image editing via Canvas or ExecutionHost (`@hypit/gpt-image`, `@hypit/nano-banana`, `@hypit/seedream`, `@hypit/grok-imagine`). |
| Animate, layer, mask, or fade multiple images over time | Separate Picture Presents on Picture Tracks in SVML ([Picture Presents](visual-clips.md)), or an HTML component ([Component Visuals](component-visuals.md)). |
| Isolate a moving person from a video background | Video matting via `@hypit/volcengine-matting` ([Media Preparation](media.md)). |

## Generative Image Editing on Canvas

When an image needs semantic changes—relighting, wardrobe edits, background replacement, style transfer, or combining reference subjects—run an image-editing model node on Canvas (`hypit canvas invoke`) or via `hypit execution submit`:

1. Check available image capabilities and schemas with `hypit execution capabilities` and `hypit execution doctor <capability>` (or `hypit canvas catalog`).
2. Pass the source image(s) as explicit reference inputs on the Canvas node.
3. Review the generated Publication before adopting it into Project Media (`hypit canvas adopt`).

## Deterministic Local Image Operations

For exact pixel-level preparation (e.g., cropping a 16:9 screenshot to 9:16, resizing a contact sheet, or stripping metadata), use `ffmpeg` or a small local script:

```bash
# Center-crop and scale to 1080x1920 PNG
ffmpeg -i assets/raw-still.png \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  media/still-9x16.png

# Side-by-side 2048x1024 comparison board
ffmpeg -i media/before.png -i media/after.png \
  -filter_complex "[0:v]scale=1024:1024:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2:color=#EEEAE2[l];[1:v]scale=1024:1024:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2:color=#EEEAE2[r];[l][r]hstack=inputs=2" \
  media/comparison.png
```

## Keep Asset Preparation and Timeline Layout Separate

- **Modify the image file** when multiple downstream model prompts or multiple timelines need the exact same cropped/corrected pixels.
- **Use SVML `<layout>` and `<process>`** when the original uncropped image should stay intact and only its framing, scale, opacity, or motion on a specific timeline should change.
- Always keep the original file alongside processed variants so you can re-crop or re-direct without regenerating from scratch.
