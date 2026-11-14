import argparse
import pathlib
import runpy
import sys

import bpy


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--entry", required=True)
    parser.add_argument("--start", required=True, type=int)
    parser.add_argument("--end", required=True, type=int)
    parser.add_argument("--fps-numerator", required=True, type=int)
    parser.add_argument("--fps-denominator", required=True, type=int)
    parser.add_argument("--width", required=True, type=int)
    parser.add_argument("--height", required=True, type=int)
    parser.add_argument("--output", required=True)
    return parser.parse_args(raw)


def main():
    options = arguments()
    if options.end <= options.start:
        raise RuntimeError("Blender frame range is empty")
    runpy.run_path(options.entry, run_name="__main__")
    scene = bpy.context.scene
    scene.render.film_transparent = True
    scene.render.resolution_x = options.width
    scene.render.resolution_y = options.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.fps = options.fps_numerator
    scene.render.fps_base = float(options.fps_denominator)
    output = pathlib.Path(options.output)
    output.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(range(options.start, options.end)):
        scene.frame_set(frame)
        scene.render.filepath = str(output / f"{index:09d}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
