"""Wav2vec2 CTC forced alignment to refine whisper's word timestamps.

Inspired by WhisperX's `whisperx.align` step, written directly against
`torchaudio.functional.forced_align` + `merge_tokens` (no whisperx dep).
English only for now — uses torchaudio's bundled `WAV2VEC2_ASR_BASE_960H`.

Whisper's `word_timestamps=True` is a DTW heuristic over cross-attention; it's
close-ish but visibly off for word-level highlighting. CTC forced alignment
against wav2vec2 emissions snaps each word to its true frame range, much
tighter for sub-second visual sync.

Diarization (titanet) is independent of this — alignment only refines word
`start`/`end`. Run AFTER whisper (whose timings seed the segment bounds) and
BEFORE diarization/wtpsplit so the rest of the pipeline sees refined timings.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import numpy as np
import torch
import torchaudio
from torchaudio.functional import forced_align, merge_tokens

from .audio import SAMPLE_RATE

logger = logging.getLogger(__name__)


@dataclass
class AlignModel:
    """Loaded wav2vec2 ASR bundle + its CTC vocabulary."""

    model: torch.nn.Module
    dictionary: dict[str, int]  # lowercase char → vocab id (includes '|' separator)
    blank_id: int
    device: str


def load_align_model(device: str = "cpu") -> AlignModel:
    """Load torchaudio's wav2vec2 ASR base bundle (English, 16kHz)."""
    bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
    logger.info("Loading wav2vec2 align model: WAV2VEC2_ASR_BASE_960H")
    model = bundle.get_model().to(device).eval()
    labels = bundle.get_labels()
    # Vocab labels are upper-case characters plus '|' (word separator) and '-'
    # (CTC blank). We index by lower-case for matching against transcript text.
    dictionary = {ch.lower(): i for i, ch in enumerate(labels)}
    blank_id = dictionary.get("-", 0)
    logger.info("wav2vec2 align model loaded")
    return AlignModel(model=model, dictionary=dictionary, blank_id=blank_id, device=device)


# Characters that may appear in whisper's word output but never in the wav2vec2
# vocabulary — strip them before mapping.
_PUNCT = re.compile(r"[^\w']")


def _encode_target(words: list[str], dictionary: dict[str, int]) -> tuple[list[int], list[int]]:
    """Encode the segment's words as a CTC target sequence.

    Returns `(target_ids, token_to_word)` where `target_ids` is the flat list
    of vocab ids — the chars of each word (intersected with the wav2vec2
    dictionary) joined by the `|` word separator — and `token_to_word[i]` is
    the index of the source word that target token `i` belongs to (`-1` for
    inter-word separators). The latter lets us collapse per-target spans back
    to per-word frame ranges after alignment.

    Words with no in-vocabulary characters (e.g. pure punctuation, or rare
    glyphs) produce no target tokens and will keep their whisper timings.
    """
    sep_id = dictionary.get("|")
    target_ids: list[int] = []
    token_to_word: list[int] = []
    last_appended: int | None = None
    for wi, word in enumerate(words):
        chars = [
            dictionary[c] for c in _PUNCT.sub("", word).lower() if c in dictionary and c != "|"
        ]
        if not chars:
            continue
        if last_appended is not None and sep_id is not None:
            target_ids.append(sep_id)
            token_to_word.append(-1)
        for cid in chars:
            target_ids.append(cid)
            token_to_word.append(wi)
        last_appended = wi
    return target_ids, token_to_word


def _refine_words(
    words: list[dict],
    log_probs: torch.Tensor,
    target_ids: list[int],
    token_to_word: list[int],
    am: AlignModel,
    seg_start_s: float,
    sec_per_frame: float,
) -> list[dict]:
    """Run forced_align + collapse the per-target spans into refined per-word timings."""
    try:
        targets = torch.tensor([target_ids], dtype=torch.int32, device=am.device)
        aligned, scores = forced_align(log_probs, targets, blank=am.blank_id)
        spans = merge_tokens(aligned[0], scores[0])
    except Exception as exc:
        logger.warning(f"forced_align failed: {exc}; keeping whisper timings")
        return words

    # merge_tokens yields one span per non-blank target token, in order. If
    # that 1:1 invariant ever breaks (different torchaudio version?), fall back
    # rather than mis-map words to spans.
    if len(spans) != len(target_ids):
        logger.warning(
            f"alignment length mismatch ({len(spans)} spans vs {len(target_ids)} tokens); "
            "keeping whisper timings"
        )
        return words

    # Collapse per-target spans → per-word [start_frame, end_frame].
    word_ranges: dict[int, tuple[int, int]] = {}
    for span, wi in zip(spans, token_to_word, strict=True):
        if wi < 0:
            continue
        s, e = span.start, span.end
        if wi in word_ranges:
            ws, we = word_ranges[wi]
            word_ranges[wi] = (min(ws, s), max(we, e))
        else:
            word_ranges[wi] = (s, e)

    out: list[dict] = []
    for wi, w in enumerate(words):
        if wi not in word_ranges:
            out.append(w)
            continue
        s, e = word_ranges[wi]
        # Stash whisper's DTW-derived timings before overwriting with the
        # CTC-aligned ones. Useful for debugging mis-syncs and for comparing
        # the two timings on real data. `start`/`end` remain canonical.
        new = dict(w)
        new["original_start"] = w["start"]
        new["original_end"] = w["end"]
        new["start"] = round(seg_start_s + s * sec_per_frame, 3)
        new["end"] = round(seg_start_s + e * sec_per_frame, 3)
        out.append(new)

    # Enforce monotonic non-decreasing word starts. CTC is monotonic among
    # aligned words, and whisper's DTW is monotonic among fallback words, but
    # an aligned word's CTC-true start can land before a neighboring fallback
    # word's whisper-derived end (or vice versa) — e.g. digit tokens like
    # "2024" aren't in wav2vec2's vocab, so they keep whisper timings while
    # their neighbors shift to true frame positions. The frontend's bSearch
    # over word starts (transcript-paragraphs.tsx) requires monotonicity, so
    # push any regressing start forward to the previous word's end. We trust
    # whichever timing came first in the array — usually that means CTC wins
    # over a following fallback, which is the desired bias. Pre-clamp values
    # are preserved on `original_start`/`original_end` (added here if the
    # clamped word was a fallback that didn't already carry originals).
    for i in range(1, len(out)):
        prev_end = out[i - 1]["end"]
        if out[i]["start"] < prev_end:
            cur = out[i]
            if "original_start" not in cur:
                cur = dict(cur)
                cur["original_start"] = cur["start"]
                cur["original_end"] = cur["end"]
                out[i] = cur
            cur["start"] = prev_end
            if cur["end"] < cur["start"]:
                cur["end"] = cur["start"]
    return out


@torch.inference_mode()
def align_segments(audio: np.ndarray, segments: list[dict], am: AlignModel) -> list[dict]:
    """Refine word `start`/`end` for every whisper segment.

    Each segment is aligned independently against its own audio slice so the
    alignment cost stays proportional to speech-content, not total audio
    length. A segment falls back to whisper's original timings when it has no
    words, no in-vocab characters, an empty audio slice, or the underlying
    forced_align call errors. Returns a new list — inputs are not mutated.
    """
    out: list[dict] = []
    for seg in segments:
        words = seg.get("words", [])
        if not words:
            out.append(seg)
            continue

        seg_start = float(seg.get("start", words[0]["start"]))
        seg_end = float(seg.get("end", words[-1]["end"]))
        f1 = max(0, int(seg_start * SAMPLE_RATE))
        f2 = min(audio.shape[0], int(seg_end * SAMPLE_RATE))
        # wav2vec2's convolutional front-end needs a minimum input length;
        # ~400 samples (~25ms) is the conservative floor used by the project.
        if f2 - f1 < 400:
            out.append(seg)
            continue

        target_ids, token_to_word = _encode_target([w["word"] for w in words], am.dictionary)
        if not target_ids:
            out.append(seg)
            continue

        chunk = torch.from_numpy(audio[f1:f2]).float().unsqueeze(0).to(am.device)
        emissions, _ = am.model(chunk)
        log_probs = torch.log_softmax(emissions, dim=-1)
        num_frames = log_probs.shape[1]
        if num_frames < len(target_ids):
            # CTC can't fit the target into fewer frames than tokens.
            out.append(seg)
            continue
        sec_per_frame = (f2 - f1) / SAMPLE_RATE / num_frames

        new_words = _refine_words(
            words,
            log_probs,
            target_ids,
            token_to_word,
            am,
            seg_start,
            sec_per_frame,
        )

        new_seg = dict(seg)
        new_seg["words"] = new_words
        # Snap segment bounds to the refined word bounds.
        if new_words:
            new_seg["start"] = float(new_words[0]["start"])
            new_seg["end"] = float(new_words[-1]["end"])
        out.append(new_seg)

    return out
