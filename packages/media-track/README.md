# `@narratage/media-track`

Official provider-free Media Item and Sequence authoring package.

The current executable slice implements one independently timed still-image Item. Its Artifact,
intrinsic extent, Placement Frame, Content Fit and ProgramSpace are separate graph inputs. The
resolved package-owned Program lowers to an ordinary peer `VisualTrack`; it does not add Media,
B-roll or Provider meaning to Core, Film, Composition or HyperFrames.

Timed visual sources, frame Paint, motion, Sequence handoffs, explicit audio projection and the
author Surface remain governed by `spec/media-track.md` and are intentionally not claimed by this
first witness.
