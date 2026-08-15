from __future__ import annotations

import logging

from .application import WhisperXApplication
from .config import ServiceConfig
from .engine import WhisperXEngine
from .server import serve


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    config = ServiceConfig.from_environment()
    logging.getLogger("narratage.whisperx").info(
        "loading model=%s device=%s compute=%s batch=%d",
        config.model,
        config.device,
        config.compute,
        config.batch_size,
    )
    engine = WhisperXEngine(config)
    serve(WhisperXApplication(config, engine))


if __name__ == "__main__":
    main()
