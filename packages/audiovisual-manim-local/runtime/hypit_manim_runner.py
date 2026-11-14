"""Bound one ordinary Cairo Scene render to an exact prefix frame count."""

from __future__ import annotations

import sys
from types import MethodType
from typing import Any

from manim import config
from manim.cli.render.commands import render
from manim.renderer.cairo_renderer import CairoRenderer
from manim.utils.exceptions import EndSceneEarlyException


def positive_frame_count(value: str) -> int:
    try:
        result = int(value)
    except ValueError as error:
        raise SystemExit("Hypit Manim frame count must be an integer.") from error
    if result <= 0:
        raise SystemExit("Hypit Manim frame count must be positive.")
    return result


def install_prefix_limit(frame_count: int) -> None:
    original_play = CairoRenderer.play

    def bounded_play(
        renderer: CairoRenderer,
        scene: Any,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        rendered = getattr(renderer, "_hypit_rendered_frames", 0)
        if rendered >= frame_count:
            raise EndSceneEarlyException()

        original_progression = scene.get_time_progression
        original_add_frame = renderer.add_frame
        remaining = frame_count - rendered

        def bounded_progression(
            self: Any,
            run_time: float,
            description: str,
            n_iterations: int | None = None,
            override_skip_animations: bool = False,
        ) -> Any:
            available = remaining / float(config["frame_rate"])
            return original_progression(
                min(run_time, available),
                description,
                n_iterations,
                override_skip_animations,
            )

        def bounded_add_frame(
            self: CairoRenderer,
            frame: Any,
            num_frames: int = 1,
        ) -> None:
            accepted = min(num_frames, frame_count - self._hypit_rendered_frames)
            if accepted > 0:
                original_add_frame(frame, accepted)
                self._hypit_rendered_frames += accepted

        scene.get_time_progression = MethodType(bounded_progression, scene)
        renderer.add_frame = MethodType(bounded_add_frame, renderer)
        try:
            original_play(renderer, scene, *args, **kwargs)
        finally:
            scene.get_time_progression = original_progression
            renderer.add_frame = original_add_frame

        if renderer._hypit_rendered_frames >= frame_count:
            raise EndSceneEarlyException()

    CairoRenderer._hypit_rendered_frames = 0
    CairoRenderer.play = bounded_play


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: hypit_manim_runner.py FRAME_COUNT MANIM_ARGS...")
    install_prefix_limit(positive_frame_count(sys.argv[1]))
    render.main(args=sys.argv[2:], prog_name="manim", standalone_mode=True)


if __name__ == "__main__":
    main()
