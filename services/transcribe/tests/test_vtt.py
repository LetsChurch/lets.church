"""Tests for the pure VTT / plaintext shaping in src/vtt.py."""

from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from src.vtt import (
    cue_chunks,
    format_timestamp,
    group_paragraphs,
    segments_to_plaintext,
    segments_to_vtt,
)


def _word(word: str, start: float, end: float) -> dict:
    return {"word": word, "start": start, "end": end, "probability": 1.0}


def _seg(text: str, words: list[dict], **extra) -> dict:
    return {
        "start": words[0]["start"] if words else 0.0,
        "end": words[-1]["end"] if words else 0.0,
        "text": text,
        "words": words,
        **extra,
    }


# --- format_timestamp ---------------------------------------------------------


def test_format_timestamp_zero():
    assert format_timestamp(0) == "00:00:00.000"


def test_format_timestamp_compound():
    assert format_timestamp(3661.5) == "01:01:01.500"


def test_format_timestamp_negative_clamps_to_zero():
    assert format_timestamp(-5) == "00:00:00.000"


def test_format_timestamp_millisecond_precision():
    assert format_timestamp(12.345) == "00:00:12.345"


# --- group_paragraphs ---------------------------------------------------------


def test_group_paragraphs_splits_on_is_paragraph_start():
    segs = [
        {"text": "a", "is_paragraph_start": True},
        {"text": "b", "is_paragraph_start": False},
        {"text": "c", "is_paragraph_start": True},
        {"text": "d", "is_paragraph_start": False},
    ]
    groups = group_paragraphs(segs)
    assert [[s["text"] for s in g] for g in groups] == [["a", "b"], ["c", "d"]]


def test_group_paragraphs_ignores_marker_on_first_segment():
    # is_paragraph_start on index 0 must not create a leading empty group.
    segs = [{"text": "a", "is_paragraph_start": True}, {"text": "b", "is_paragraph_start": False}]
    assert group_paragraphs(segs) == [segs]


def test_group_paragraphs_empty():
    assert group_paragraphs([]) == []


# --- cue_chunks ---------------------------------------------------------------


def test_cue_chunks_short_sentence_single_cue_uses_segment_text():
    seg = _seg("Hello world.", [_word("Hello", 0.0, 1.0), _word("world.", 1.0, 2.0)])
    assert cue_chunks(seg, max_seconds=6.0) == [(0.0, 2.0, "Hello world.")]


def test_cue_chunks_no_words_cannot_split():
    seg = {"start": 0.0, "end": 30.0, "text": "long sentence", "words": []}
    assert cue_chunks(seg, max_seconds=6.0) == [(0.0, 30.0, "long sentence")]


def test_cue_chunks_long_sentence_splits_on_word_boundaries():
    words = [_word(w, i * 2.5, i * 2.5 + 2.5) for i, w in enumerate("a b c d".split())]
    seg = _seg("a b c d", words)
    cues = cue_chunks(seg, max_seconds=6.0)
    # 2.5s words: "a b" = 0..5 (<=6), adding "c" -> 7.5 > 6 so flush.
    assert cues == [(0.0, 5.0, "a b"), (5.0, 10.0, "c d")]


def test_cue_chunks_single_word_longer_than_ceiling_is_its_own_cue():
    words = [_word("loooong", 0.0, 9.0), _word("next", 9.0, 10.0)]
    seg = _seg("loooong next", words)
    cues = cue_chunks(seg, max_seconds=6.0)
    assert cues == [(0.0, 9.0, "loooong"), (9.0, 10.0, "next")]


# --- segments_to_vtt ----------------------------------------------------------


def test_segments_to_vtt_empty_is_header_only():
    assert segments_to_vtt([]) == "WEBVTT"


def test_segments_to_vtt_one_cue_per_sentence():
    segs = [
        _seg("First.", [_word("First.", 0.0, 1.0)], is_paragraph_start=True),
        _seg("Second.", [_word("Second.", 1.0, 2.0)], is_paragraph_start=False),
    ]
    vtt = segments_to_vtt(segs)
    assert vtt == (
        "WEBVTT\n\n"
        "00:00:00.000 --> 00:00:01.000\nFirst.\n\n"
        "00:00:01.000 --> 00:00:02.000\nSecond.\n"
    )


def test_segments_to_vtt_splits_long_sentence():
    words = [_word(w, i * 2.5, i * 2.5 + 2.5) for i, w in enumerate("a b c d".split())]
    segs = [_seg("a b c d", words, is_paragraph_start=True)]
    vtt = segments_to_vtt(segs, max_cue_seconds=6.0)
    # Two cues from one over-long sentence.
    assert vtt.count("-->") == 2


# --- segments_to_plaintext ----------------------------------------------------


def test_segments_to_plaintext_joins_paragraphs_with_blank_line():
    segs = [
        {"text": "One.", "is_paragraph_start": True},
        {"text": "Two.", "is_paragraph_start": False},
        {"text": "Three.", "is_paragraph_start": True},
    ]
    assert segments_to_plaintext(segs) == "One. Two.\n\nThree."


# --- property: cue_chunks invariants -----------------------------------------


@st.composite
def _segment_with_words(draw):
    n = draw(st.integers(min_value=1, max_value=12))
    tokens = draw(
        st.lists(
            st.text(
                alphabet=st.characters(min_codepoint=97, max_codepoint=122), min_size=1, max_size=6
            ),
            min_size=n,
            max_size=n,
        )
    )
    t = 0.0
    words: list[dict] = []
    for tok in tokens:
        gap = draw(st.floats(min_value=0.0, max_value=2.0))
        dur = draw(st.floats(min_value=0.01, max_value=8.0))
        start = t + gap
        end = start + dur
        words.append(_word(tok, start, end))
        t = end
    return _seg(" ".join(tokens), words)


@given(seg=_segment_with_words(), max_seconds=st.floats(min_value=0.5, max_value=10.0))
def test_cue_chunks_preserves_words_and_bounds_duration(seg, max_seconds):
    cues = cue_chunks(seg, max_seconds)
    assert cues, "must always emit at least one cue for a non-empty sentence"

    # 1. Every token is preserved, in order, across the cues.
    emitted = " ".join(text for _s, _e, text in cues).split()
    assert emitted == [w["word"] for w in seg["words"]]

    # 2. Any multi-word cue respects the ceiling; only a single over-long word may exceed.
    for cstart, cend, ctext in cues:
        if len(ctext.split()) > 1:
            assert cend - cstart <= max_seconds + 1e-9

    # 3. Cue span matches the sentence's first/last word timings.
    assert cues[0][0] == seg["words"][0]["start"]
    assert cues[-1][1] == seg["words"][-1]["end"]
