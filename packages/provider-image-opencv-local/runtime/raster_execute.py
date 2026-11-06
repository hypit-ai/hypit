#!/usr/bin/env python3
"""One bounded raster interpreter for @hypit/provider-image-opencv-local."""

import json
import sys

import cv2
import numpy as np


def color(value: str):
    raw = value[1:]
    red, green, blue = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    alpha = int(raw[6:8], 16) if len(raw) == 8 else 255
    return np.array([blue, green, red, alpha], dtype=np.float32)


def interpolation(name):
    return {
        "nearest": cv2.INTER_NEAREST,
        "linear": cv2.INTER_LINEAR,
        "cubic": cv2.INTER_CUBIC,
        "area": cv2.INTER_AREA,
        "lanczos": cv2.INTER_LANCZOS4,
    }[name]


def decode(source):
    image = cv2.imdecode(np.frombuffer(source, np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError("image decode failed")
    return image


def encode_png(image):
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("image encode failed")
    return encoded.tobytes()


def bgra(image):
    if image is None:
        raise ValueError("image decode failed")
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)
    if image.shape[2] == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    if image.shape[2] == 4:
        return image
    raise ValueError("unsupported image channel count")


def spatial_matrix(transform):
    if transform["kind"] == "affine":
        return np.array([
            [transform["xx"], transform["xy"], transform["tx"]],
            [transform["yx"], transform["yy"], transform["ty"]],
            [0.0, 0.0, 1.0],
        ], dtype=np.float64)
    return np.array([
        [transform["xx"], transform["xy"], transform["tx"]],
        [transform["yx"], transform["yy"], transform["ty"]],
        [transform["wx"], transform["wy"], transform["ww"]],
    ], dtype=np.float64)


def raster_sampling_matrix(mapping, image_width, image_height):
    target = mapping["target"]["region"]
    source = mapping["source"]["region"]
    output_pixel_to_target = np.array([
        [1.0, 0.0, target["x"]],
        [0.0, 1.0, target["y"]],
        [0.0, 0.0, 1.0],
    ], dtype=np.float64)
    source_to_image_pixel = np.array([
        [image_width / source["width"], 0.0, -source["x"] * image_width / source["width"]],
        [0.0, image_height / source["height"], -source["y"] * image_height / source["height"]],
        [0.0, 0.0, 1.0],
    ], dtype=np.float64)
    return source_to_image_pixel @ spatial_matrix(mapping["transform"]) @ output_pixel_to_target


def alpha_over(canvas, image, x, y, opacity):
    canvas_height, canvas_width = canvas.shape[:2]
    image_height, image_width = image.shape[:2]
    left, top = max(0, x), max(0, y)
    right, bottom = min(canvas_width, x + image_width), min(canvas_height, y + image_height)
    if left >= right or top >= bottom:
        return
    source = image[top - y:bottom - y, left - x:right - x].astype(np.float32) / 255.0
    target = canvas[top:bottom, left:right].astype(np.float32) / 255.0
    source_alpha = source[:, :, 3:4] * float(opacity)
    target_alpha = target[:, :, 3:4]
    output_alpha = source_alpha + target_alpha * (1.0 - source_alpha)
    premultiplied = source[:, :, :3] * source_alpha + target[:, :, :3] * target_alpha * (1.0 - source_alpha)
    rgb = np.divide(premultiplied, output_alpha, out=np.zeros_like(premultiplied), where=output_alpha > 0)
    canvas[top:bottom, left:right] = np.rint(
        np.concatenate([rgb, output_alpha], axis=2) * 255.0
    ).clip(0, 255).astype(np.uint8)


def compose(request):
    target = request["target"]["region"]
    width, height = int(target["width"]), int(target["height"])
    fill = color(request["background"])
    canvas = np.empty((height, width, 4), dtype=np.uint8)
    canvas[:] = fill
    for layer in request["layers"]:
        with open(layer["source"], "rb") as source_file:
            image = bgra(decode(source_file.read()))
        sampling = raster_sampling_matrix(layer["mapping"], image.shape[1], image.shape[0])
        sampled = cv2.warpPerspective(
            image,
            sampling,
            (width, height),
            flags=interpolation(layer["interpolation"]) | cv2.WARP_INVERSE_MAP,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )
        alpha_over(canvas, sampled, 0, 0, layer["opacity"])
    return encode_png(canvas)


def main():
    if sys.argv[1:] == ["--self-test"]:
        print(json.dumps({"opencv": cv2.__version__, "numpy": np.__version__}))
        return
    if len(sys.argv) != 3:
        raise SystemExit("usage: raster_execute.py <request.json> <output>")
    request_path, output_path = sys.argv[1:]
    with open(request_path, "r", encoding="utf-8") as request_file:
        request = json.load(request_file)
    if request["kind"] == "compose":
        result = compose(request)
    else:
        raise ValueError("unknown raster request kind")
    with open(output_path, "wb") as output_file:
        output_file.write(result)


if __name__ == "__main__":
    main()
