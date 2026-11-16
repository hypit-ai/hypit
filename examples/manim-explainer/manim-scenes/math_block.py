"""Opaque Manim mathematics card for the Hypit showcase."""

from manim import *


class MathBlock(Scene):
    def construct(self):
        self.camera.background_color = "#101B36"
        panel = RoundedRectangle(width=5.7, height=6.35, corner_radius=0.18,
                                 stroke_color="#49B6FF", stroke_width=4,
                                 fill_color="#101C33", fill_opacity=1)
        label = Text("MATHEMATICS", font="Arial", color="#49B6FF", weight=BOLD).scale(0.46)
        label.next_to(panel.get_top(), DOWN, buff=0.30)
        self.play(FadeIn(panel), FadeIn(label), run_time=0.45)

        center = panel.get_center() + 0.28 * DOWN
        axes = Axes(x_range=[-2.2, 2.2, 1], y_range=[-0.5, 2.7, 1],
                    x_length=4.35, y_length=3.15,
                    axis_config={"color": "#B8C5D8", "stroke_width": 2}, tips=False)
        axes.move_to(center + 0.05 * DOWN)
        def function(x):
            return 0.42 * (x + 0.05) ** 2 + 0.12

        def derivative(x):
            return 0.84 * (x + 0.05)

        curve = axes.plot(function,
                          color="#49B6FF", stroke_width=6)
        position = ValueTracker(-1.0)

        def tangent_at(x):
            return axes.plot(
                lambda value: derivative(x) * (value - x) + function(x),
                x_range=[max(-2.0, x - 1.5), min(2.0, x + 1.5)],
                color="#FFB45C", stroke_width=4)

        tangent = always_redraw(lambda: tangent_at(position.get_value()))
        marker = always_redraw(lambda: Dot(axes.c2p(position.get_value(), function(position.get_value())),
                                          color="#FFB45C", radius=0.09))
        formula = Text("f(x) = 0.42(x + 0.05)² + 0.12", font="Menlo", color="#F4F7FB").scale(0.24)
        formula.move_to(panel.get_bottom() + 0.50 * UP)

        self.play(Create(axes), run_time=0.85)
        self.play(Create(curve), run_time=1.05)
        self.play(Create(tangent), FadeIn(marker, scale=1.4), Write(formula), run_time=0.85)
        for x in [0.0, 0.95]:
            self.play(position.animate.set_value(x), run_time=0.85)
        self.wait(0.50)
