import type { BlobRef } from "@hypit/protocol";

export const terminalMixManimScene = String.raw`from manim import *

class TerminalMixScene(Scene):
    def construct(self):
        pink = "#ff5b94"
        blue = "#7dd8ff"
        white = "#f7f8ff"

        outer = Circle(radius=2.05, color=pink, stroke_width=10).set_stroke(opacity=0.82)
        inner = Circle(radius=1.38, color=blue, stroke_width=5).set_stroke(opacity=0.62)
        waist = RoundedRectangle(width=2.7, height=1.02, corner_radius=0.22,
                                 color=white, stroke_width=3).set_fill("#10182d", opacity=0.92)
        label = Text("AVIR", font_size=58, weight=BOLD, color=white)
        dot = Dot(radius=0.12, color=white).move_to(outer.point_at_angle(0))
        system = VGroup(outer, inner, waist, label, dot)

        self.play(Create(outer), Create(inner), FadeIn(waist, scale=0.86),
                  FadeIn(label, shift=DOWN * 0.12), FadeIn(dot), run_time=0.65)
        self.play(Rotate(outer, angle=PI * 1.35), Rotate(inner, angle=-PI),
                  MoveAlongPath(dot, outer), system.animate.scale(1.045), run_time=0.9)
        self.play(system.animate.scale(1 / 1.045), run_time=0.2)
        self.wait(0.25)
`;

export const terminalMixManimSceneBytes = new TextEncoder().encode(terminalMixManimScene);

export const terminalMixManimSceneArtifact: BlobRef = {
  kind: "blob",
  resource: "res_terminal_mix_manim_scene",
  size: terminalMixManimSceneBytes.byteLength,
  mediaType: "text/x-python",
};
