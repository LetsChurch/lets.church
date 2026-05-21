"""Holds the long-lived model handles for the worker process.

All models are loaded once at startup so they stay resident in GPU memory
across activity invocations.
"""

from __future__ import annotations

import logging

from faster_whisper import WhisperModel
from wtpsplit import SaT

from .diarization import TitanetDiarizer

logger = logging.getLogger(__name__)


class ModelManager:
    def __init__(
        self,
        whisper_model: str,
        device: str,
        compute_type: str,
        wtpsplit_model: str = "sat-12l-sm",
        titanet_model: str = "nvidia/speakerverification_en_titanet_large",
    ):
        self.device = device
        self.compute_type = compute_type

        logger.info(f"Loading faster-whisper model: {whisper_model} ({device}/{compute_type})")
        self.whisper = WhisperModel(whisper_model, device=device, compute_type=compute_type)
        logger.info("faster-whisper model loaded")

        logger.info(f"Loading titanet diarizer: {titanet_model}")
        self.diarizer = TitanetDiarizer(device=device, model_name=titanet_model)
        logger.info("titanet diarizer loaded")

        logger.info(f"Loading wtpsplit SaT model: {wtpsplit_model}")
        sat = SaT(wtpsplit_model)
        if device == "cuda":
            sat.half().to(device)
        self.sat = sat
        logger.info("wtpsplit model loaded")


_manager: ModelManager | None = None


def initialize_models(
    whisper_model: str,
    device: str,
    compute_type: str,
    wtpsplit_model: str = "sat-12l-sm",
    titanet_model: str = "nvidia/speakerverification_en_titanet_large",
) -> None:
    global _manager
    _manager = ModelManager(
        whisper_model=whisper_model,
        device=device,
        compute_type=compute_type,
        wtpsplit_model=wtpsplit_model,
        titanet_model=titanet_model,
    )


def get_model_manager() -> ModelManager:
    if _manager is None:
        raise RuntimeError("Model manager not initialized; call initialize_models() first.")
    return _manager
