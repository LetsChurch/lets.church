"""Tests for src/segmentation.py.

The deterministic logic is exercised through the pure functions with real
inputs — no model stub. The only stub is a one-line `BoomSaT` to cover the
orchestrator's "model raised → keep originals" branch, which is interaction
with the model by definition.
"""

from __future__ import annotations

import pytest

from src.segmentation import (
    _normalize,
    capitalize_segment_starts,
    group_consecutive_by_speaker,
    process_speaker_segments,
    sentences_to_segments,
)


def _word(word: str, start: float, end: float) -> dict:
    return {"word": word, "start": start, "end": end, "probability": 1.0}


def _seg(speaker, words: list[dict], text: str | None = None) -> dict:
    return {
        "speaker": speaker,
        "start": words[0]["start"] if words else 0.0,
        "end": words[-1]["end"] if words else 0.0,
        "text": text if text is not None else " ".join(w["word"] for w in words),
        "words": words,
    }


# --- _normalize ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("Hello,", "hello"), ("don't", "dont"), ("...", ""), ("  Word!  ", "word"), ("5", "5")],
)
def test_normalize(raw, expected):
    assert _normalize(raw) == expected


# --- group_consecutive_by_speaker --------------------------------------------


def test_group_merges_consecutive_same_speaker():
    a1, a2, b1 = (
        _seg("A", [_word("x", 0, 1)]),
        _seg("A", [_word("y", 1, 2)]),
        _seg("B", [_word("z", 2, 3)]),
    )
    groups = group_consecutive_by_speaker([a1, a2, b1])
    assert [g["speaker"] for g in groups] == ["A", "B"]
    assert groups[0]["segments"] == [a1, a2]
    assert groups[1]["segments"] == [b1]


def test_group_does_not_merge_non_adjacent_same_speaker():
    a1, b1, a2 = (
        _seg("A", [_word("x", 0, 1)]),
        _seg("B", [_word("y", 1, 2)]),
        _seg("A", [_word("z", 2, 3)]),
    )
    groups = group_consecutive_by_speaker([a1, b1, a2])
    assert [g["speaker"] for g in groups] == ["A", "B", "A"]


def test_group_empty():
    assert group_consecutive_by_speaker([]) == []


# --- sentences_to_segments (pure, no model) -----------------------------------


def test_sentences_to_segments_adds_period_and_paragraph_markers_and_keeps_timings():
    words = [
        _word("hello", 0.0, 1.0),
        _word("world", 1.0, 2.0),
        _word("how", 2.0, 3.0),
        _word("are", 3.0, 4.0),
        _word("you", 4.0, 5.0),
    ]
    out = sentences_to_segments([["hello world", "how are you"]], words, "A")

    assert len(out) == 2
    # Period appended; casing left for capitalize_segment_starts.
    assert out[0]["text"] == "hello world."
    assert out[0]["speaker"] == "A"
    assert out[0]["paragraph_idx"] == 0
    assert out[0]["is_paragraph_start"] is True
    assert [w["word"] for w in out[0]["words"]] == ["hello", "world."]
    assert (out[0]["start"], out[0]["end"]) == (0.0, 2.0)  # timings preserved

    assert out[1]["text"] == "how are you."
    assert out[1]["is_paragraph_start"] is False
    assert (out[1]["start"], out[1]["end"]) == (2.0, 5.0)


def test_sentences_to_segments_tracks_multiple_paragraphs():
    words = [_word(w, float(i), float(i) + 1) for i, w in enumerate("a b c d".split())]
    out = sentences_to_segments([["a b"], ["c d"]], words, "A")
    assert [s["paragraph_idx"] for s in out] == [0, 1]
    assert [s["is_paragraph_start"] for s in out] == [True, True]


def test_sentences_to_segments_keeps_existing_terminal_punctuation():
    out = sentences_to_segments([["really?"]], [_word("really?", 0.0, 1.0)], "A")
    assert out[0]["text"] == "really?"


def test_sentences_to_segments_skips_unmatchable_tokens():
    # "zzz" isn't in the words, so it's dropped; the rest still map.
    # The appended terminal period rides on the last token ("beta." -> word "beta").
    words = [_word("alpha", 0.0, 1.0), _word("beta", 1.0, 2.0)]
    out = sentences_to_segments([["alpha zzz beta"]], words, "A")
    assert [w["word"] for w in out[0]["words"]] == ["alpha", "beta."]


def test_sentences_to_segments_empty_paragraphs_yields_nothing():
    assert sentences_to_segments([], [_word("hi", 0.0, 1.0)], "A") == []


# --- capitalize_segment_starts (pure) -----------------------------------------


def test_capitalize_lowercases_first_word_and_text():
    seg = {"text": "hello world.", "words": [_word("hello", 0, 1), _word("world.", 1, 2)]}
    capitalize_segment_starts([seg])
    assert seg["words"][0]["word"] == "Hello"
    assert seg["text"] == "Hello world."


def test_capitalize_leaves_numbers_alone():
    seg = {"text": "5 dollars.", "words": [_word("5", 0, 1), _word("dollars.", 1, 2)]}
    capitalize_segment_starts([seg])
    assert seg["words"][0]["word"] == "5"
    assert seg["text"] == "5 dollars."


def test_capitalize_ignores_wordless_segments():
    seg = {"text": "x", "words": []}
    capitalize_segment_starts([seg])  # must not raise
    assert seg["text"] == "x"


# --- process_speaker_segments orchestration -----------------------------------


def test_process_empty_input_returns_empty():
    # sat_model is never touched, so None is safe.
    assert process_speaker_segments([], None) == []


def test_process_segment_without_words_falls_back_without_touching_model():
    seg = _seg("A", [], text="untouched")
    # sat_model=None proves the model is never reached on the no-words path.
    assert process_speaker_segments([seg], None) == [seg]


def test_process_model_failure_falls_back_to_originals():
    class BoomSaT:
        def split(self, *a, **k):
            raise RuntimeError("model blew up")

    seg = _seg("A", [_word("hello", 0.0, 1.0)], text="hello")
    assert process_speaker_segments([seg], BoomSaT()) == [seg]
