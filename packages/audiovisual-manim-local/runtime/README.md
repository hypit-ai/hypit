# Manim runtime

This locked environment executes project-owned Manim Community scenes for the
local audiovisual Terminal. Preparing it is an explicit environment operation;
rendering never installs or upgrades Python packages.

Manim also needs its documented native Cairo/Pango dependencies and FFmpeg on
the execution host. Those deployment facts do not enter AVIR or a Manim scene
programme.

`hypit_manim_runner.py` is the local Terminal adapter, not an author-facing
programme format. It bounds ordinary Cairo Scene execution to a selected
prefix frame count and uses Manim's normal early-scene completion path so
partial movie segments are finalized normally. It does not install packages,
rewrite author files or trim an already completed video.
