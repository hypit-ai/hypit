#!/usr/bin/env python3
"""One bounded raster interpreter for @narratage/provider-image-opencv-local."""

import json
import math
import sys

import cv2
import numpy as np


def color(value: str):
    raw = value[1:]
    red, green, blue = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    alpha = int(raw[6:8], 16) if len(raw) == 8 else 255
    return np.array([blue, green, red, alpha], dtype=np.float32)


def split(image):
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR), None
    if image.shape[2] == 4:
        return image[:, :, :3], image[:, :, 3]
    if image.shape[2] == 3:
        return image, None
    raise ValueError("unsupported image channel count")


def join(bgr, alpha):
    return bgr if alpha is None else cv2.merge([bgr[:, :, 0], bgr[:, :, 1], bgr[:, :, 2], alpha])


def flatten(image, background):
    bgr, alpha = split(image)
    if alpha is None:
        return bgr
    bg = color(background)[:3]
    weight = alpha.astype(np.float32)[:, :, None] / 255.0
    return np.rint(bgr.astype(np.float32) * weight + bg * (1.0 - weight)).clip(0, 255).astype(np.uint8)


def crop(image, operation):
    height, width = image.shape[:2]
    if operation["unit"] == "fraction":
        x = int(round(operation["x"] * width))
        y = int(round(operation["y"] * height))
        out_width = int(round(operation["width"] * width))
        out_height = int(round(operation["height"] * height))
    else:
        x, y = int(operation["x"]), int(operation["y"])
        out_width, out_height = int(operation["width"]), int(operation["height"])
    if out_width < 1 or out_height < 1 or x < 0 or y < 0 or x + out_width > width or y + out_height > height:
        raise ValueError("crop lies outside the current image")
    return image[y:y + out_height, x:x + out_width].copy()


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


def fit_geometry(width, height, target_width, target_height, mode):
    if mode == "stretch":
        return target_width, target_height, 0, 0
    scale = min(target_width / width, target_height / height) if mode == "contain" else max(
        target_width / width, target_height / height
    )
    scaled_width = max(1, round_half_up(width * scale))
    scaled_height = max(1, round_half_up(height * scale))
    return scaled_width, scaled_height, (target_width - scaled_width) // 2, (target_height - scaled_height) // 2


def resize(image, operation):
    target_width, target_height = int(operation["width"]), int(operation["height"])
    mode = operation["fit"]
    method = interpolation(operation["interpolation"])
    height, width = image.shape[:2]
    scaled_width, scaled_height, x, y = fit_geometry(width, height, target_width, target_height, mode)
    scaled = cv2.resize(image, (scaled_width, scaled_height), interpolation=method)
    if mode == "cover":
        return scaled[-y:-y + target_height, -x:-x + target_width].copy()
    if mode == "stretch":
        return scaled
    channels = 4 if scaled.ndim == 3 and scaled.shape[2] == 4 else 3
    default = "#00000000" if channels == 4 else "#000000"
    fill = color(operation.get("background", default))
    canvas = np.empty((target_height, target_width, channels), dtype=np.uint8)
    canvas[:] = fill[:channels]
    canvas[y:y + scaled_height, x:x + scaled_width] = scaled
    return canvas


def denoise(image, operation):
    bgr, alpha = split(image)
    if bgr.shape[0] < 32 or bgr.shape[1] < 32:
        return image
    y, cr, cb = cv2.split(cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb))
    template = int(operation["templateWindow"])
    search = int(operation["searchWindow"])
    y = cv2.fastNlMeansDenoising(y, None, float(operation["lumaStrength"]), template, search)
    cr = cv2.fastNlMeansDenoising(cr, None, float(operation["chromaStrength"]), template, search)
    cb = cv2.fastNlMeansDenoising(cb, None, float(operation["chromaStrength"]), template, search)
    out = cv2.cvtColor(cv2.merge([y, cr, cb]), cv2.COLOR_YCrCb2BGR).astype(np.float32)
    recovery = float(operation["saturationRecovery"])
    gray = (0.0722 * out[:, :, 0] + 0.7152 * out[:, :, 1] + 0.2126 * out[:, :, 2])[:, :, None]
    out = np.rint(gray + (out - gray) * recovery).clip(0, 255).astype(np.uint8)
    return join(out, alpha)


def adjust_color(image, operation):
    bgr, alpha = split(image)
    out = bgr.astype(np.float32)
    out *= 2.0 ** float(operation["exposureStops"])
    out = (out - 127.5) * float(operation["contrast"]) + 127.5
    gray = (0.0722 * out[:, :, 0] + 0.7152 * out[:, :, 1] + 0.2126 * out[:, :, 2])[:, :, None]
    out = gray + (out - gray) * float(operation["saturation"])
    temperature = float(operation["temperature"]) * 32.0
    tint = float(operation["tint"]) * 32.0
    out[:, :, 2] += temperature
    out[:, :, 0] -= temperature
    out[:, :, 1] += tint
    gamma = float(operation["gamma"])
    out = 255.0 * np.power(np.clip(out, 0, 255) / 255.0, 1.0 / gamma)
    return join(np.rint(out).clip(0, 255).astype(np.uint8), alpha)


def sharpen(image, operation):
    bgr, alpha = split(image)
    source = bgr.astype(np.float32)
    blurred = cv2.GaussianBlur(source, (0, 0), sigmaX=float(operation["radius"]))
    detail = source - blurred
    threshold = float(operation["threshold"])
    if threshold > 0:
        detail[np.max(np.abs(detail), axis=2) < threshold] = 0
    out = np.rint(source + detail * float(operation["amount"])).clip(0, 255).astype(np.uint8)
    return join(out, alpha)


def blur(image, operation):
    bgr, alpha = split(image)
    out = cv2.GaussianBlur(bgr, (0, 0), sigmaX=float(operation["sigma"]))
    return join(out, alpha)


def apply(image, operation):
    kind = operation["kind"]
    if kind == "crop":
        return crop(image, operation)
    if kind == "resize":
        return resize(image, operation)
    if kind == "rotate":
        return {90: cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE),
                180: cv2.rotate(image, cv2.ROTATE_180),
                270: cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)}[int(operation["degrees"])]
    if kind == "flip":
        return cv2.flip(image, {"horizontal": 1, "vertical": 0, "both": -1}[operation["axis"]])
    if kind == "denoise":
        return denoise(image, operation)
    if kind == "color":
        return adjust_color(image, operation)
    if kind == "sharpen":
        return sharpen(image, operation)
    if kind == "blur":
        return blur(image, operation)
    if kind == "alpha":
        return image if operation["mode"] == "preserve" else flatten(image, operation["background"])
    if kind == "encode":
        return image
    raise ValueError(f"unknown image operation {kind}")


def encode_image(image, output_format="png", quality=None, background=None):
    parameters = []
    if output_format == "jpeg":
        if image.ndim == 3 and image.shape[2] == 4:
            if background is None:
                raise ValueError("JPEG encoding of alpha requires an explicit background")
            image = flatten(image, background)
        extension = ".jpg"
        parameters = [cv2.IMWRITE_JPEG_QUALITY, int(quality or 95)]
    elif output_format == "webp":
        extension = ".webp"
        parameters = [cv2.IMWRITE_WEBP_QUALITY, int(quality or 95)]
    else:
        extension = ".png"
    ok, encoded = cv2.imencode(extension, image, parameters)
    if not ok:
        raise ValueError("image encode failed")
    return encoded.tobytes()


def transform(source, operations):
    image = decode(source)
    for operation in operations:
        if operation["kind"] != "encode":
            image = apply(image, operation)
    encode = next((item for item in operations if item["kind"] == "encode"), {"format": "png"})
    output_format = encode["format"]
    return encode_image(image, output_format, encode.get("quality"), encode.get("background"))


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


def round_half_up(value):
    return math.floor(float(value) + 0.5)


def fit_layer(image, frame, mode, method):
    frame_width = max(1, round_half_up(frame["widthPx"]))
    frame_height = max(1, round_half_up(frame["heightPx"]))
    height, width = image.shape[:2]
    scaled_width, scaled_height, x, y = fit_geometry(width, height, frame_width, frame_height, mode)
    scaled = cv2.resize(image, (scaled_width, scaled_height), interpolation=method)
    return scaled, x, y


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
    width, height = int(request["canvas"]["widthPx"]), int(request["canvas"]["heightPx"])
    fill = color(request["background"])
    canvas = np.empty((height, width, 4), dtype=np.uint8)
    canvas[:] = fill
    for layer in request["layers"]:
        with open(layer["source"], "rb") as source_file:
            image = bgra(decode(source_file.read()))
        fitted, offset_x, offset_y = fit_layer(
            image, layer["frame"], layer["fit"], interpolation(layer["interpolation"])
        )
        alpha_over(
            canvas, fitted,
            round_half_up(layer["frame"]["xPx"]) + offset_x,
            round_half_up(layer["frame"]["yPx"]) + offset_y,
            layer["opacity"],
        )
    return encode_image(canvas)


def main():
    if sys.argv[1:] == ["--self-test"]:
        print(json.dumps({"opencv": cv2.__version__, "numpy": np.__version__}))
        return
    if len(sys.argv) != 3:
        raise SystemExit("usage: raster_execute.py <request.json> <output>")
    request_path, output_path = sys.argv[1:]
    with open(request_path, "r", encoding="utf-8") as request_file:
        request = json.load(request_file)
    if request["kind"] == "transform":
        with open(request["source"], "rb") as source_file:
            result = transform(source_file.read(), request["operations"])
    elif request["kind"] == "compose":
        result = compose(request)
    else:
        raise ValueError("unknown raster request kind")
    with open(output_path, "wb") as output_file:
        output_file.write(result)


if __name__ == "__main__":
    main()
