# Screen walkthrough

Presents a take recorded with `hypit capture plan` as a finished product demonstration: the
recording plays at its recorded pace on a framed screen card, while a cursor, click ripples and a
camera that moves in on each action are drawn from the take's own steps. The footage itself stays
clean, so a different zoom or no cursor needs no retake.

```svml
<import as="walk" from="@example/screen-walkthrough@1"/>
<import as="take" source="./captures/board/steps.svs"/>

<asset:Video id="recording" src="./captures/board/recording.mp4"/>
<mediaop:Normalize id="recording-media" source={recording} clock={clock}
  video="primary-moving" audio="none" span-authority="video"/>
<time:Timeline id="program" clock={clock} end="board.end">
  <time:Window id="board" from="start" for={recording-media.extent}/>
</time:Timeline>

<walk:Walkthrough id="demo" timeline={program.timeline} within={canvas.bounds}
  media={recording-media.media} source-window={program.board} during={program.board}
  take={take.walkthrough.take} zoom="1.7"/>
```

| Attribute | Meaning |
| --- | --- |
| `media` | The normalized recording. |
| `source-window` | Window the whole recording occupies. Step times are recorded seconds, so every cursor move, press and camera change follows this Window: moving the recording later in the program moves them with it. |
| `during` | The scene's lifetime; footage outside `source-window` is not shown. |
| `take` | The `walkthrough.take` Recipe that `capture plan` writes to `steps.svs` beside the recording. A failed take is refused. |
| `within` | Frame the screen card fits inside, keeping the recording's aspect ratio. |
| `zoom` | Camera magnification on pointer actions, 1–3 (default 1.6). `1` keeps the whole screen in view. |
| `cursor` | `arrow` (default) draws the cursor and click ripples; `none` omits them. |
| `stack-order` | Paint order among other contributions (default 0). |

The camera moves in shortly before each hover, click or typing step, pans between actions that
follow within a second of each other, and returns to the whole screen during longer pauses. Its
view is clamped to the recording, so the screen edge never shows. The cursor travels into each
recorded pointer position, presses on clicks and typing, and keeps a constant size while the
camera zooms. All of it is computed from the requested frame, so seeking and range renders give the
same picture.

`src/render.ts` holds the motion (`walkthroughMotion`) and drawing; `src/activation.ts` declares the
Module, Surface and Producer. The design (card, shadow, background, timing of the camera) is fixed
in `render.ts`; change it there for a different look rather than adding parameters.

The package builds against `@hypit/hypit` and emits JavaScript. In a standalone project, replace the
repository's `workspace:*` development dependency with the Hypit version you use, run `npm run build`
and connect the directory through an ordinary `file:` dependency.
