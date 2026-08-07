#!/usr/bin/env python3
"""Bounded closed-data image transforms for @svml/provider-image-opencv-local."""

import json
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


def resize(image, operation):
    target_width, target_height = int(operation["width"]), int(operation["height"])
    mode = operation["fit"]
    method = interpolation(operation["interpolation"])
    if mode == "stretch":
        return cv2.resize(image, (target_width, target_height), interpolation=method)
    height, width = image.shape[:2]
    scale = min(target_width / width, target_height / height) if mode == "contain" else max(
        target_width / width, target_height / height
    )
    scaled_width, scaled_height = max(1, int(round(width * scale))), max(1, int(round(height * scale)))
    scaled = cv2.resize(image, (scaled_width, scaled_height), interpolation=method)
    if mode == "cover":
        x = (scaled_width - target_width) // 2
        y = (scaled_height - target_height) // 2
        return scaled[y:y + target_height, x:x + target_width].copy()
    channels = 4 if scaled.ndim == 3 and scaled.shape[2] == 4 else 3
    default = "#00000000" if channels == 4 else "#000000"
    fill = color(operation.get("background", default))
    canvas = np.empty((target_height, target_width, channels), dtype=np.uint8)
    canvas[:] = fill[:channels]
    x = (target_width - scaled_width) // 2
    y = (target_height - scaled_height) // 2
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


def transform(source, program):
    image = cv2.imdecode(np.frombuffer(source, np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError("image decode failed")
    for operation in program["operations"]:
        if operation["kind"] != "encode":
            image = apply(image, operation)
    encode = next((item for item in program["operations"] if item["kind"] == "encode"), {"format": "png"})
    output_format = encode["format"]
    parameters = []
    if output_format == "jpeg":
        if image.ndim == 3 and image.shape[2] == 4:
            if "background" not in encode:
                raise ValueError("JPEG encoding of alpha requires an explicit background")
            image = flatten(image, encode["background"])
        extension = ".jpg"
        parameters = [cv2.IMWRITE_JPEG_QUALITY, int(encode.get("quality", 95))]
    elif output_format == "webp":
        extension = ".webp"
        parameters = [cv2.IMWRITE_WEBP_QUALITY, int(encode.get("quality", 95))]
    else:
        extension = ".png"
    ok, encoded = cv2.imencode(extension, image, parameters)
    if not ok:
        raise ValueError("image encode failed")
    return encoded.tobytes()


def main():
    if sys.argv[1:] == ["--self-test"]:
        print(json.dumps({"opencv": cv2.__version__, "numpy": np.__version__}))
        return
    if len(sys.argv) != 4:
        raise SystemExit("usage: image_transform.py <input> <program.json> <output>")
    input_path, program_path, output_path = sys.argv[1:]
    with open(input_path, "rb") as source_file:
        source = source_file.read()
    with open(program_path, "r", encoding="utf-8") as program_file:
        program = json.load(program_file)
    result = transform(source, program)
    with open(output_path, "wb") as output_file:
        output_file.write(result)


if __name__ == "__main__":
    main()
