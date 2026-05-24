#!/usr/bin/env python3
"""One-shot CLI for generating dev seed transcripts.

Reads a local media file and runs the same transcribe pipeline as the
Temporal activity (`services/transcribe/src/activities.py::transcribe`),
writing a camelCase `transcript.json` identical to what the worker uploads
to S3 in production.

The two stages most prone to drift — the whisper-iter → internal-segment
shape and the final JSON serialization — live in `src/pipeline.py` and are
imported by both this script and the activity, so the seed output stays in
lockstep with whatever the worker produces.

Accepts any media format ffmpeg can read, including HLS playlists
(`AUDIO.m3u8`) directly — when given an m3u8 the referenced m4s segments
must be reachable at the playlist's relative paths.

Typical use (from the host, via the just recipe):

    just regenerate-seed-transcript <uuid> [whisper_model]

Or directly inside the container:

    docker compose exec -e WHISPER_MODEL=large-v3 transcribe-worker \\
        uv run --no-sync python scripts/transcribe_file.py \\
            --input /path/to/AUDIO.m3u8 \\
            --output /path/to/transcript.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow `src.*` imports when launched as a plain script from /app.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import torch  # noqa: E402

from src.alignment import align_segments  # noqa: E402
from src.audio import convert_to_wav, load_audio  # noqa: E402
from src.diarization import assign_word_speakers  # noqa: E402
from src.models import get_model_manager, initialize_models  # noqa: E402
from src.pipeline import build_transcript_json, iter_whisper_segments  # noqa: E402
from src.segmentation import process_speaker_segments  # noqa: E402
from src.vtt import segments_to_plaintext  # noqa: E402


def transcribe_to_json(input_media: Path, output_json: Path) -> None:
    """Run the full pipeline and write the camelCase transcript JSON."""
    output_json.parent.mkdir(parents=True, exist_ok=True)

    # Always produce a distinct converted-wav path so it doesn't collide with
    # the input when the input is itself a WAV.
    wav_path = output_json.parent / f"{input_media.stem}_converted.wav"
    print(f"[transcribe_file] converting {input_media} -> {wav_path}")
    convert_to_wav(input_media, wav_path)

    models = get_model_manager()

    print("[transcribe_file] transcribing")
    segments_iter, info = models.whisper.transcribe(
        str(wav_path),
        language="en",
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
    )
    segments = list(iter_whisper_segments(segments_iter))
    print(
        f"[transcribe_file] transcription done: language={info.language} "
        f"segments={len(segments)} duration={info.duration:.2f}s"
    )

    audio = load_audio(str(wav_path))

    if models.align is not None:
        print("[transcribe_file] aligning")
        segments = align_segments(audio, segments, models.align)

    print("[transcribe_file] diarizing")
    per_segment_labels, speaker_vectors = models.diarizer.diarize(audio, segments)
    for seg, label in zip(segments, per_segment_labels, strict=True):
        seg["speaker"] = label
    assign_word_speakers(segments)

    print(f"[transcribe_file] segmenting ({len(segments)} segments)")
    segments = process_speaker_segments(segments, models.sat, threshold=0.4)
    paragraph_count = sum(1 for s in segments if s.get("is_paragraph_start"))
    print(
        f"[transcribe_file] segmentation done: segments={len(segments)} "
        f"paragraphs={paragraph_count}"
    )

    plain_text = segments_to_plaintext(segments)
    transcript_json = build_transcript_json(
        segments=segments,
        speaker_vectors=speaker_vectors,
        language=info.language or "en",
        duration=info.duration,
        plain_text=plain_text,
    )

    output_json.write_text(json.dumps(transcript_json))
    wav_path.unlink(missing_ok=True)
    print(f"[transcribe_file] wrote {output_json}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Transcribe a media file with the same pipeline as the production "
            "activity and write transcript.json (used by the dev seed)."
        ),
    )
    parser.add_argument(
        "--input",
        "-i",
        type=Path,
        required=True,
        help=(
            "Path to the source media (any format ffmpeg can read, including HLS .m3u8 playlists)."
        ),
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        required=True,
        help="Path to write the resulting transcript.json.",
    )
    parser.add_argument(
        "--whisper-model",
        default="base.en",
        help=(
            "faster-whisper model id (e.g. tiny.en, base.en, small.en, "
            "medium.en, large-v3). Default: base.en. First use of a new "
            "model triggers a download into the container's model cache."
        ),
    )
    parser.add_argument(
        "--wtpsplit-model",
        default="sat-12l-sm",
        help="wtpsplit SaT model id. Default: sat-12l-sm.",
    )
    parser.add_argument(
        "--titanet-model",
        default="nvidia/speakerverification_en_titanet_large",
        help="NeMo titanet model id (for speaker diarization).",
    )
    parser.add_argument(
        "--no-align",
        action="store_true",
        help="Skip the wav2vec2 CTC alignment refinement step.",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    print(
        f"[transcribe_file] loading models: whisper={args.whisper_model} "
        f"device={device} align={not args.no_align}"
    )
    initialize_models(
        whisper_model=args.whisper_model,
        device=device,
        compute_type=compute_type,
        wtpsplit_model=args.wtpsplit_model,
        titanet_model=args.titanet_model,
        align_enabled=not args.no_align,
    )

    transcribe_to_json(args.input, args.output)


if __name__ == "__main__":
    main()
