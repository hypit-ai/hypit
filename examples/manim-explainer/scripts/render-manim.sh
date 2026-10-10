#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"
render() {
  local output="$1" scene_file="$2" scene_name="$3"
  uv run --frozen --project "$project_root" manim render \
    --config_file manim.cfg --format mp4 --fps 30 --resolution 1280,720 \
    --output_file "$output" "manim-scenes/$scene_file" "$scene_name"
}

render math_block math_block.py MathBlock
render ml_block ml_block.py MLBlock
render physics_block physics_block.py PhysicsBlock

for file in math_block ml_block physics_block; do
  path="$project_root/manim-renders/$file.mp4"
  test -s "$path"
  codec="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$path")"
  pix_fmt="$(ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "$path")"
  width="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$path")"
  height="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$path")"
  frame_rate="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$path")"
  test "$codec" = h264 && test "$pix_fmt" = yuv420p && test "$width" = 1280 && test "$height" = 720 && test "$frame_rate" = 30/1 || {
    echo "Unexpected Manim media metadata for $path: $codec $width $height $pix_fmt $frame_rate" >&2
    exit 1
  }
  audio="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$path")"
  test -z "$audio"
done
