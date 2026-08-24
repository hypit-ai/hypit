from __future__ import annotations

import argparse
from pathlib import Path

from .resources import default_nltk_data_root, prepare_punkt_tab


def main() -> None:
    parser = argparse.ArgumentParser(description="Install NLTK data required by Hypit WhisperX")
    parser.add_argument(
        "--nltk-data",
        type=Path,
        default=default_nltk_data_root(),
        help="NLTK data root (defaults to the SVML user cache)",
    )
    arguments = parser.parse_args()
    path = prepare_punkt_tab(arguments.nltk_data)
    print(path)
