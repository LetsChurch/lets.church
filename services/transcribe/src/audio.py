"""Audio loading and ffmpeg conversion."""

import subprocess
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000


def convert_to_wav(input_path: Path, output_path: Path, sample_rate: int = SAMPLE_RATE) -> None:
    """Convert any media file to a 16kHz mono WAV via ffmpeg."""
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-i",
            str(input_path),
            "-ar",
            str(sample_rate),
            "-ac",
            "1",
            "-y",
            str(output_path),
        ],
        check=True,
        capture_output=True,
    )


def load_audio(path: str, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Decode an audio file to a float32 mono waveform at `sr` Hz."""
    try:
        out = subprocess.run(
            [
                "ffmpeg",
                "-nostdin",
                "-threads",
                "0",
                "-i",
                path,
                "-f",
                "s16le",
                "-ac",
                "1",
                "-acodec",
                "pcm_s16le",
                "-ar",
                str(sr),
                "-",
            ],
            capture_output=True,
            check=True,
        ).stdout
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to load audio: {e.stderr.decode()}") from e

    return np.frombuffer(out, np.int16).astype(np.float32) / 32768.0
