# `@hypit/program-space`

The time and frame domain shared by a compiled film. ProgramSpace contains `id`, `durationSec` and
`frameRate`. Script identity belongs to semantic data; the physical film clock also serves animation
with no speech or source media.

For spoken work, SemanticTrack projects the selected performance's real duration and frame rate.
For authored animation, `Space` declares them directly:

```svml
<import as="time" from="@hypit/program-space@1"/>
<time:Space id="animation" frame-rate="30" duration="8s"/>
```

`duration` accepts seconds, milliseconds or frames (`8s`, `8000ms`, `240f`); the result must end on an
exact frame boundary. The rate may be rational, such as `30000/1001`. `Space` publishes an ordinary
inline ProgramSpace value and performs no media generation.

`Clock` is the duration-free frame-rate input for media normalization. A clock does not prescribe
how long a performance will be; its actual normalized material establishes that later.
