import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media"
IMPACT = "/System/Library/Fonts/Supplemental/Impact.ttf"
ARIAL_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
LAYOUTS = json.loads((ROOT / "scripts/meme-layouts.json").read_text())["scenes"]


def font(path: str, size: int):
    return ImageFont.truetype(path, size)


def open_rgba(path: Path):
    return Image.open(path).convert("RGBA")


def save(image: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)
    print(path.relative_to(ROOT))


def fit(image: Image.Image, size: tuple[int, int]):
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS)


def contain(image: Image.Image, size: tuple[int, int], pad: int = 0):
    width, height = size
    inner = (max(1, width - pad * 2), max(1, height - pad * 2))
    scaled = ImageOps.contain(image, inner, method=Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", size, (255, 255, 255, 255))
    layer.alpha_composite(scaled, ((width - scaled.width) // 2, (height - scaled.height) // 2))
    return layer


def meme_text(draw: ImageDraw.ImageDraw, xy, text: str, size: int, stroke: int = 5):
    draw.multiline_text(
        xy,
        text,
        font=font(IMPACT, size),
        fill="white",
        stroke_width=stroke,
        stroke_fill="black",
        anchor="mm",
        align="center",
        spacing=-4,
    )


def round_avatar(source: Path, diameter: int, border: int = 4):
    avatar = fit(open_rgba(source), (diameter - border * 2, diameter - border * 2))
    mask = Image.new("L", avatar.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, avatar.width - 1, avatar.height - 1), fill=255)
    output = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
    output.paste(avatar, (border, border), mask)
    ImageDraw.Draw(output).ellipse((border // 2, border // 2, diameter - border // 2 - 1, diameter - border // 2 - 1), outline="white", width=border)
    return output


def label(image: Image.Image, xy, text: str, size: int, width: int):
    draw = ImageDraw.Draw(image)
    box = draw.textbbox((0, 0), text, font=font(IMPACT, size), stroke_width=2)
    height = box[3] - box[1] + 10
    x, y = xy
    draw.rounded_rectangle((x - width // 2, y - height // 2, x + width // 2, y + height // 2), 5, fill=(0, 0, 0, 210))
    draw.text((x, y), text, font=font(IMPACT, size), fill="white", stroke_width=2, stroke_fill="black", anchor="mm")


def plain_label(image: Image.Image, xy, text: str, size: int):
    ImageDraw.Draw(image).text(
        xy,
        text,
        font=font(IMPACT, size),
        fill="white",
        stroke_width=3,
        stroke_fill="black",
        anchor="mm",
    )


def rotated_panel_text(image: Image.Image, center, text: str, angle: float, size: int = 44):
    panel = Image.new("RGBA", (250, 160), (0, 0, 0, 0))
    draw = ImageDraw.Draw(panel)
    draw.multiline_text((125, 80), text, font=font(IMPACT, size), fill="#111111", anchor="mm", align="center", spacing=-8)
    panel = panel.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    image.alpha_composite(panel, (round(center[0] - panel.width / 2), round(center[1] - panel.height / 2)))


def render():
    lawyer = LAYOUTS["lawyer"]["items"][0]
    image = open_rgba(MEDIA / "broll-wife-divorce-lawyer/source.jpg")
    meme_text(ImageDraw.Draw(image), (lawyer["x"], lawyer["y"]), lawyer["text"], lawyer["fontSize"], lawyer["stroke"])
    save(image, MEDIA / "broll-wife-divorce-lawyer/final-loris-lawyer-v3.png")

    money = LAYOUTS["money"]["items"][0]
    image = open_rgba(MEDIA / "broll-wife-huell-money/source.jpg")
    meme_text(ImageDraw.Draw(image), (money["x"], money["y"]), money["text"], money["fontSize"], money["stroke"])
    save(image, MEDIA / "broll-wife-huell-money/final-lori-after-divorce-v3.png")

    image = fit(open_rgba(MEDIA / "broll-trump-pointing/source.png"), (1600, 1200))
    draw = ImageDraw.Draw(image)
    for item in LAYOUTS["spiderman"]["items"]:
        meme_text(draw, (item["x"], item["y"]), item["text"], item["fontSize"], item["stroke"])
    save(image, MEDIA / "broll-trump-pointing/final-trump-jensen-v3.png")

    image = open_rgba(MEDIA / "broll-trump-no-big-deal/source.jpeg")
    draw = ImageDraw.Draw(image)
    medals = [((113, 390), "#1", "#f6c738"), ((339, 390), "#2", "#e5e7eb"), ((565, 390), "#3", "#c9783a")]
    for (x, y), text, color in medals:
        draw.text((x, y), text, font=font(IMPACT, 76), fill=color, stroke_width=5, stroke_fill="black", anchor="mm")
    save(image, MEDIA / "broll-trump-no-big-deal/final-wife-ranking-v2.png")

    image = open_rgba(MEDIA / "broll-trump-which-one/source.png")
    image.alpha_composite(round_avatar(MEDIA / "icon-alice/icon-alice.png", 92, 5), (66, 28))
    image.alpha_composite(round_avatar(MEDIA / "icon-kimberly/icon-kimberly.png", 92, 5), (532, 24))
    unknown = Image.new("RGBA", (86, 86), (0, 0, 0, 0))
    ud = ImageDraw.Draw(unknown)
    ud.ellipse((1, 1, 84, 84), fill="#202020", outline="white", width=4)
    ud.text((43, 43), "?", font=font(ARIAL_BLACK, 50), fill="white", anchor="mm")
    image.alpha_composite(unknown, (82, 232))
    plain_label(image, (112, 136), "ALICE", 28)
    plain_label(image, (578, 132), "KIMBERLY", 26)
    plain_label(image, (125, 333), "???", 28)
    save(image, MEDIA / "broll-trump-which-one/final-which-one-v2.png")

    for source, output in [
        ("broll-kimberly-side-effects/two-buttons.jpg", "broll-kimberly-side-effects/final-no-wife-no-job-v3.png"),
        ("broll-kimberly-wife-lost/source.png", "broll-kimberly-wife-lost/final-no-wife-no-job-both-v3.png"),
    ]:
        image = open_rgba(MEDIA / source)
        for item in LAYOUTS["buttons"]["items"]:
            rotated_panel_text(image, (item["x"], item["y"]), item["text"], item["angle"], item["fontSize"])
        save(image, MEDIA / output)

    drake = open_rgba(MEDIA / "broll-alice-hermes-h100/drake.jpg")
    birkin = contain(open_rgba(MEDIA / "broll-alice-hermes-h100/product-birkin-cutout.png"), (600, 600), 35)
    h100 = contain(open_rgba(MEDIA / "broll-alice-hermes-h100/product-h100.jpg"), (600, 600), 48)
    stage_one = drake.copy()
    stage_one.alpha_composite(birkin, (600, 0))
    save(stage_one, MEDIA / "broll-alice-hermes-h100/final-hermes-stage.png")
    stage_two = stage_one.copy()
    stage_two.alpha_composite(h100, (600, 600))
    label(stage_two, (1025, 1134), "NVIDIA H100", 42, 300)
    save(stage_two, MEDIA / "broll-alice-hermes-h100/final-h100-stage.png")

    alice = open_rgba(MEDIA / "broll-alice-source-extraction/source.jpeg")
    save(fit(alice, (512, 512)), MEDIA / "broll-alice-source-extraction/final-alice-icon.png")

    image = open_rgba(MEDIA / "broll-jacket-galaxy-brain/source.webp")
    draw = ImageDraw.Draw(image)
    entries = [((213, 126), "DATING\nA PERSON", 43), ((213, 383), "DATING\nAN AI", 47), ((213, 649), "DATING\nA GPU", 45)]
    for xy, text, size in entries:
        draw.multiline_text(xy, text, font=font(ARIAL_BLACK, size), fill="#050505", anchor="mm", align="center", spacing=-5)
    save(image, MEDIA / "broll-jacket-galaxy-brain/final-galaxy-brain-v2.png")


if __name__ == "__main__":
    render()
