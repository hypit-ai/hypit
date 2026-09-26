# Asset provenance

This production keeps the accepted presenter performance, its native narration and the three
independent Manim renders as separate inputs. The active Run selects only the files documented
below; earlier experiments remain in the project for comparison and are not active dependencies.

## Presenter and narration

- Presenter video: `assets/edits/english-seedance-person-full.mp4`
- Seedance voice reference sample: `assets/edits/alex.wav`
- Original voice recording retained as provenance: `assets/edits/english-seedance-native-voice.wav`
- Generation authoring: `authors/main.svml` (the single active Author Graph)
- Presenter direction: `authors/direction.svml`
- The accepted performance is an adult male speaking the authored English Script. Seedance uses the
  five-second sample for voice identity and generates the performance audio inside each video.

## Manim inputs

The following files are separate external renders produced from the project-local Python scenes.
They are declared directly as Author assets and must be re-rendered manually after their Python
sources or render settings change:

| Active file | Authoring source | Role |
| --- | --- | --- |
| `manim-renders/math_block.mp4` | `manim-scenes/math_block.py` | Axes, growing parabola and moving tangent |
| `manim-renders/ml_block.mp4` | `manim-scenes/ml_block.py` | Three-layer network, signal propagation and falling loss curve |
| `manim-renders/physics_block.mp4` | `manim-scenes/physics_block.py` | Pendulum, force and velocity vectors with trail |

Each active Manim input is an opaque H.264 `yuv420p` MP4 at 1280x720. The intended project rate is
30 fps, but the current probe does not confirm a constant 30/1 rate for every file: `math_block.mp4`
reports an average of `253440/8447`, `ml_block.mp4` reports `30/1`, and `physics_block.mp4` reports
`1182720/39419`. These files therefore need a corrected render or explicit normalization and another
probe before they can be described as verified 30 fps inputs. The scene code owns the internal
mathematical animation. The Hypit component samples and presents these files; it does not create
their scene motion and does not rely on an alpha channel.

## Historical material

Transparent WebM/MOV experiments, composite exports, QA frames and earlier final exports under
`manim-renders/`, `qa-*` and `final/` are generated production state and are not selected
by the canonical production graph in `authors/main.svml`. `drafts/legacy/` contains the superseded
authoring lineage. The canonical `runs/render.svrun` selects the five accepted presenter videos from
a historical Build through explicit `build-record` Candidates; the corresponding Results must be
present in the local Hypit Result repository. Iteration Runs should update those records when a newer
presenter Build is accepted.
