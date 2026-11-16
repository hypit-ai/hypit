"""Opaque Manim machine-learning card for the Hypit showcase."""

from manim import *


class MLBlock(Scene):
    def construct(self):
        self.camera.background_color = "#101B36"
        panel = RoundedRectangle(width=5.7, height=6.35, corner_radius=0.18,
                                 stroke_color="#B58CFF", stroke_width=4,
                                 fill_color="#101C33", fill_opacity=1)
        label = Text("MACHINE LEARNING", font="Arial", color="#B58CFF", weight=BOLD).scale(0.46)
        label.next_to(panel.get_top(), DOWN, buff=0.30)
        self.play(FadeIn(panel), FadeIn(label), run_time=0.45)

        center = panel.get_center() + 0.28 * DOWN
        columns = [-1.55, 0, 1.55]
        rows = [[0.95, 0, -0.95], [1.35, 0.45, -0.45, -1.35], [0.95, 0, -0.95]]
        nodes = VGroup(*[Dot(center + x * RIGHT + y * UP, radius=0.13, color="#B58CFF")
                         for x, ys in zip(columns, rows) for y in ys])
        left_nodes, middle_nodes, right_nodes = nodes[:3], nodes[3:7], nodes[7:]
        lines = VGroup()
        for source in left_nodes:
            for target in middle_nodes:
                lines.add(Line(source.get_center(), target.get_center(), stroke_color="#67539B", stroke_width=1.7))
        for source in middle_nodes:
            for target in right_nodes:
                lines.add(Line(source.get_center(), target.get_center(), stroke_color="#67539B", stroke_width=1.7))
        self.play(Create(lines), FadeIn(nodes), run_time=0.85)

        pulse = Dot(left_nodes[1].get_center(), color="#FFB45C", radius=0.10)
        self.add(pulse)
        for target in [middle_nodes[1], right_nodes[1]]:
            self.play(pulse.animate.move_to(target.get_center()), run_time=0.75)

        loss_axes = Axes(x_range=[0, 4, 1], y_range=[0, 1, 0.5],
                         x_length=2.55, y_length=1.25,
                         axis_config={"color": "#8492A8", "stroke_width": 2}, tips=False)
        loss_axes.move_to(panel.get_bottom() + 1.12 * UP)
        loss = loss_axes.plot(lambda x: 0.72 * (1 - x / 4) ** 2 + 0.10,
                              color="#58D68D", stroke_width=5)
        loss_label = Text("LOSS", font="Arial", color="#58D68D", weight=BOLD).scale(0.25)
        loss_label.next_to(loss_axes, UP, buff=0.12)
        self.play(Create(loss_axes), Create(loss), FadeIn(loss_label), run_time=1.0)
        self.wait(0.93)
