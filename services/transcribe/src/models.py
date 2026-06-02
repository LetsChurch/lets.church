"""Holds the long-lived model handles for the worker process.

All models are loaded once at startup so they stay resident in GPU memory
across activity invocations.
"""

from __future__ import annotations

import logging

from faster_whisper import WhisperModel
from wtpsplit import SaT

from .alignment import AlignModel, load_align_model
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
        align_enabled: bool = True,
    ):
        self.device = device
        self.compute_type = compute_type

        logger.info(f"Loading faster-whisper model: {whisper_model} ({device}/{compute_type})")
        self.whisper = WhisperModel(whisper_model, device=device, compute_type=compute_type)
        logger.info("faster-whisper model loaded")

        # CTC forced alignment refines whisper's word timestamps to true frame
        # ranges, which matters for word-level highlighting on the media page.
        self.align: AlignModel | None
        if align_enabled:
            self.align = load_align_model(device=device)
        else:
            logger.info("alignment disabled (ALIGN_ENABLED=false)")
            self.align = None

        logger.info(f"Loading titanet diarizer: {titanet_model}")
        self.diarizer = TitanetDiarizer(device=device, model_name=titanet_model)
        logger.info("titanet diarizer loaded")

        logger.info(f"Loading wtpsplit SaT model: {wtpsplit_model}")
        sat = SaT(wtpsplit_model)
        # SaT loads on CPU by default and proxies `.to()` / `.half()` through
        # to the inner SubwordXLMForTokenClassification (transformers
        # nn.Module). We mirror the worker-wide `device` choice rather than
        # selecting independently — `device` here is always one of {'cpu',
        # 'cuda'} because faster-whisper (which sets the worker default in
        # worker.py) uses ctranslate2, and ctranslate2 doesn't support MPS.
        #
        # If you're running the transcribe worker natively on macOS for
        # debugging, the worker will pick 'cpu' here too — MPS would only
        # accelerate SaT, not whisper/align/titanet, so the bottleneck
        # isn't worth the conditional path. The standalone macOS-native
        # scripts (services/transcribe/scripts/sweep_thresholds.py,
        # resegment_seed_snapshots.py) detect MPS themselves and call
        # `sat.to('mps')` at their own call site for that reason.
        #
        # `.half()` on the CUDA path runs SaT at fp16 — matches the
        # whisper compute_type and roughly halves SaT's VRAM. Skipped on
        # CPU to avoid pointless precision loss.
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
    align_enabled: bool = True,
) -> None:
    global _manager
    _manager = ModelManager(
        whisper_model=whisper_model,
        device=device,
        compute_type=compute_type,
        wtpsplit_model=wtpsplit_model,
        titanet_model=titanet_model,
        align_enabled=align_enabled,
    )


def get_model_manager() -> ModelManager:
    if _manager is None:
        raise RuntimeError("Model manager not initialized; call initialize_models() first.")
    return _manager
