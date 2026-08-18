from __future__ import annotations

import logging
from logging.config import dictConfig
from typing import Any

LOG_FORMAT = "%(asctime)s %(levelname)-8s %(name)s %(message)s"
DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"
DEFAULT_LEVEL = "INFO"


def normalize_level(level: str) -> str:
    candidate = (level or "").strip().upper()
    if candidate in logging.getLevelNamesMapping():
        return candidate
    return DEFAULT_LEVEL


def build_logging_config(level: str = DEFAULT_LEVEL) -> dict[str, Any]:
    resolved = normalize_level(level)
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {"format": LOG_FORMAT, "datefmt": DATE_FORMAT},
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "standard",
                "stream": "ext://sys.stdout",
            },
        },
        "root": {"handlers": ["console"], "level": resolved},
        "loggers": {
            name: {"handlers": ["console"], "level": resolved, "propagate": False}
            for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "celery")
        },
    }


def configure_logging(level: str = DEFAULT_LEVEL) -> None:
    dictConfig(build_logging_config(level))
