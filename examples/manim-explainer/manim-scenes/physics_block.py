"""Opaque Manim physics card for the Hypit showcase."""

from manim import *


class PhysicsBlock(Scene):
    def construct(self):
        self.camera.background_color = "#101B36"
        panel = RoundedRectangle(width=5.7, height=6.35, corner_radius=0.18,
                                 stroke_color="#FFB45C", stroke_width=4,
                                 fill_color="#101C33", fill_opacity=1)
        label = Text("PHYSICS", font="Arial", color="#FFB45C", weight=BOLD).scale(0.46)
        label.next_to(panel.get_top(), DOWN, buff=0.30)
        self.play(FadeIn(panel), FadeIn(label), run_time=0.35)

        pivot = panel.get_center() + 0.28 * DOWN + 1.25 * UP
        string = Line(pivot, pivot + 1.95 * DOWN, color="#9AAAC1", stroke_width=3)
        bob = Dot(pivot + 1.95 * DOWN, color="#EF5350", radius=0.19)
        anchor = Dot(pivot, color="#F4F7FB", radius=0.09)
        gravity = Arrow(bob.get_center(), bob.get_center() + 0.95 * DOWN, buff=0,
                        color="#FFB45C", stroke_width=4, max_tip_length_to_length_ratio=0.22)
        velocity = Arrow(bob.get_center(), bob.get_center() + 0.95 * LEFT, buff=0,
                         color="#49B6FF", stroke_width=4, max_tip_length_to_length_ratio=0.22)
        self.play(Create(string), FadeIn(anchor), FadeIn(bob, scale=1.4), run_time=0.45)
        self.play(Create(gravity), Create(velocity), run_time=0.35)
        pendulum = VGroup(string, bob, gravity, velocity)
        self.play(Rotate(pendulum, angle=0.72, about_point=pivot), run_time=0.80)
        self.play(Rotate(pendulum, angle=-1.44, about_point=pivot), run_time=1.00)
        self.play(Rotate(pendulum, angle=0.72, about_point=pivot), run_time=0.80)
        trail = Arc(radius=1.95, start_angle=-PI / 2 - 0.72, angle=1.44,
                    arc_center=pivot, color="#49B6FF", stroke_opacity=0.45, stroke_width=4)
        self.play(Create(trail), run_time=0.40)
        self.wait(0.95)
