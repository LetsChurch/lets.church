"""Speaker diarization using NVIDIA NeMo titanet embeddings + clustering.

Pipeline:
  1. Slice each whisper segment into overlapping fixed-size windows.
  2. Batch-extract a titanet_large embedding (192-dim) per window.
  3. Average a segment's window embeddings into one per-segment embedding.
  4. Agglomerative-cluster the per-segment embeddings (cosine distance).
  5. Each segment takes its cluster's label directly; per-cluster mean embedding
     becomes the speaker vector.

Clustering on segments (not windows) keeps the O(N^2) agglomerative step small —
N is the number of speech segments, ~10x fewer points than windows — and the
embedding pass is batched so the GPU isn't fed one 1.5s clip at a time.

This intentionally does not depend on pyannote — VAD is provided upstream by
faster-whisper's `vad_filter=True`, so whisper segment timings define the
candidate speech intervals.
"""

from __future__ import annotations

import logging
import os

import numpy as np
import torch
from sklearn.cluster import AgglomerativeClustering
from sklearn.preprocessing import normalize

from .audio import SAMPLE_RATE
from .windowing import Window, windows_for_segment

logger = logging.getLogger(__name__)


def _slice_audio(audio: np.ndarray, start: float, end: float, sr: int) -> np.ndarray:
    f1 = max(0, int(start * sr))
    f2 = min(audio.shape[0], int(end * sr))
    return audio[f1:f2]


def _slice_audio_min(
    audio: np.ndarray, start: float, end: float, sr: int, min_dur: float
) -> np.ndarray:
    """Slice [start, end], but if shorter than `min_dur`, widen with REAL
    neighboring audio (centered) rather than zero-padding — a titanet embedding
    from a sub-second clip padded with silence is unreliable, so we grab context
    instead. Only falls back to short (later zero-padded) when the whole file is
    smaller than `min_dur`."""
    f1 = max(0, int(start * sr))
    f2 = min(audio.shape[0], int(end * sr))
    need = int(min_dur * sr)
    cur = f2 - f1
    if cur >= need:
        return audio[f1:f2]
    deficit = need - cur
    left = deficit // 2
    f1 -= left
    f2 += deficit - left
    # Shift the window into bounds instead of zero-filling the overflow.
    if f1 < 0:
        f2 -= f1
        f1 = 0
    if f2 > audio.shape[0]:
        f1 = max(0, f1 - (f2 - audio.shape[0]))
        f2 = audio.shape[0]
    return audio[f1:f2]


class TitanetDiarizer:
    """Diarization built on top of NeMo's titanet_large speaker encoder."""

    def __init__(
        self,
        device: str = "cpu",
        model_name: str = "nvidia/speakerverification_en_titanet_large",
        window_size: float | None = None,
        hop: float | None = None,
        min_window_size: float | None = None,
        embed_batch_size: int = 64,
    ):
        from nemo.collections.asr.models import EncDecSpeakerLabelModel

        logger.info(f"Loading titanet speaker model: {model_name}")
        self.device = device
        # Window/pool config (all env-tunable). Defaults raised from the original
        # 1.5/0.75/0.5: titanet embeddings are steadier over ~2s, and a 1.0s
        # minimum (filled with real neighboring audio, never silence) keeps even
        # short windows reliable.
        self.window_size = (
            window_size
            if window_size is not None
            else float(os.getenv("DIARIZATION_WINDOW_SIZE", "2.0"))
        )
        self.hop = hop if hop is not None else float(os.getenv("DIARIZATION_HOP", "1.0"))
        self.min_window_size = (
            min_window_size
            if min_window_size is not None
            else float(os.getenv("DIARIZATION_MIN_WINDOW_SIZE", "1.0"))
        )
        self.embed_batch_size = embed_batch_size

        self.model = EncDecSpeakerLabelModel.from_pretrained(model_name)
        self.model = self.model.to(device)
        self.model.eval()
        logger.info("titanet model loaded")

    @torch.inference_mode()
    def _embed_batch(self, chunks: list[np.ndarray]) -> np.ndarray:
        """Embed a batch of variable-length audio chunks; returns (B, D)."""
        min_len = int(self.min_window_size * SAMPLE_RATE)
        padded = [
            c if c.shape[0] >= min_len else np.pad(c, (0, min_len - c.shape[0])) for c in chunks
        ]
        max_len = max(c.shape[0] for c in padded)

        batch = np.zeros((len(padded), max_len), dtype=np.float32)
        lengths = np.empty(len(padded), dtype=np.int64)
        for i, c in enumerate(padded):
            batch[i, : c.shape[0]] = c
            lengths[i] = c.shape[0]

        signal = torch.from_numpy(batch).to(self.device)
        length = torch.from_numpy(lengths).to(self.device)
        # Call the module (not .forward) so nn.Module hooks / NeMo type-checks run.
        _logits, emb = self.model(input_signal=signal, input_signal_length=length)
        return emb.cpu().numpy()

    def _embed_windows(self, audio: np.ndarray, windows: list[Window], sr: int) -> np.ndarray:
        """Batch-embed every window; returns (n_windows, D)."""
        # Widen sub-`min_window_size` windows with real neighboring audio (not
        # silence) so short segments still get usable embeddings.
        chunks = [
            _slice_audio_min(audio, w.start, w.end, sr, self.min_window_size) for w in windows
        ]
        out: list[np.ndarray] = []
        for i in range(0, len(chunks), self.embed_batch_size):
            out.append(self._embed_batch(chunks[i : i + self.embed_batch_size]))
        return np.concatenate(out, axis=0)

    def diarize(
        self,
        audio: np.ndarray,
        segments: list[dict],
        sr: int = SAMPLE_RATE,
        min_speakers: int | None = None,
        max_speakers: int | None = None,
        num_speakers: int | None = None,
        distance_threshold: float | None = None,
        min_reliable_secs: float | None = None,
        min_total_secs: float | None = None,
    ) -> tuple[list[str | None], dict[str, list[float]]]:
        """Assign a speaker label per whisper segment.

        Short segments (< `min_reliable_secs`) are NOT clustered on their own — a
        titanet embedding from a sub-~1.5s clip is unreliable and tends to spawn
        spurious one-off "speakers" (a stray "amen", a breath, a page turn).
        Instead only reliable (long-enough) segments are clustered, and each short
        segment inherits the label of its nearest reliable segment IN TIME. Speaker
        centroids are built from reliable segments only, so the stored vector isn't
        polluted by short junk.

        Even among reliable segments a lone distinct ~1.6s clip can form its own
        cluster, so AFTER clustering any cluster whose TOTAL speech is shorter than
        `min_total_secs` is dissolved into the nearest stronger cluster by time —
        a real speaker talks for at least a few seconds total.

        All knobs are env-tunable (explicit args win): DIARIZATION_MAX_SPEAKERS,
        DIARIZATION_NUM_SPEAKERS (force exactly N — e.g. 1 for an audiobook),
        DIARIZATION_DISTANCE_THRESHOLD, DIARIZATION_MIN_RELIABLE_SECS,
        DIARIZATION_MIN_TOTAL_SECS.

        Returns:
            (per_segment_labels, speaker_vectors) where speaker_vectors maps
            "SPEAKER_NN" to a 192-dim list[float] representing that speaker's
            mean normalized titanet embedding.
        """
        if not segments:
            return [], {}

        # Resolve env-tunable knobs (explicit args take precedence).
        if max_speakers is None:
            max_speakers = int(os.getenv("DIARIZATION_MAX_SPEAKERS", "8"))
        if num_speakers is None:
            _ns = os.getenv("DIARIZATION_NUM_SPEAKERS")
            num_speakers = int(_ns) if _ns else None
        if distance_threshold is None:
            distance_threshold = float(os.getenv("DIARIZATION_DISTANCE_THRESHOLD", "0.8"))
        if min_reliable_secs is None:
            min_reliable_secs = float(os.getenv("DIARIZATION_MIN_RELIABLE_SECS", "1.5"))
        if min_total_secs is None:
            min_total_secs = float(os.getenv("DIARIZATION_MIN_TOTAL_SECS", "3.0"))

        # Build windows that cover every segment, tracking each window's segment.
        windows: list[Window] = []
        for i, seg in enumerate(segments):
            windows.extend(
                windows_for_segment(i, seg["start"], seg["end"], self.window_size, self.hop)
            )

        if not windows:
            return [None] * len(segments), {}

        # Batch-embed windows, L2-normalize, then pool into one embedding per segment.
        window_embeddings = normalize(self._embed_windows(audio, windows, sr))

        seg_to_window_idxs: dict[int, list[int]] = {}
        for wi, w in enumerate(windows):
            seg_to_window_idxs.setdefault(w.seg_index, []).append(wi)

        present_seg_indices = sorted(seg_to_window_idxs.keys())
        seg_embeddings = np.stack(
            [window_embeddings[seg_to_window_idxs[si]].mean(axis=0) for si in present_seg_indices]
        )
        seg_embeddings = normalize(seg_embeddings)

        n = len(present_seg_indices)
        starts = np.array([segments[si]["start"] for si in present_seg_indices], dtype=np.float64)
        ends = np.array([segments[si]["end"] for si in present_seg_indices], dtype=np.float64)
        reliable = (ends - starts) >= min_reliable_secs

        # A fixed speaker count (num_speakers, or min==max) forces n_clusters and
        # ignores the distance threshold.
        forced_n = num_speakers
        if forced_n is None and min_speakers is not None and min_speakers == max_speakers:
            forced_n = min_speakers

        # Cluster — reliable segments only when any exist, so short junk segments
        # never form their own speaker.
        cluster_of = np.full(n, -1, dtype=np.int64)
        if n == 1:
            cluster_of[0] = 0
        elif not reliable.any():
            cluster_of = _agglomerative(seg_embeddings, forced_n, distance_threshold, max_speakers)
        else:
            rel_pos = np.where(reliable)[0]
            cluster_of[rel_pos] = _agglomerative(
                seg_embeddings[rel_pos], forced_n, distance_threshold, max_speakers
            )
            durations = ends - starts
            # Dissolve weak clusters (total reliable speech < min_total_secs) into
            # the nearest strong cluster by time — a lone distinct ~1.6s segment
            # clears min_reliable_secs and clusters alone, but isn't a real speaker.
            # Skipped when the count is forced (the caller asked for exactly N).
            if forced_n is None:
                cluster_total = {
                    cid: float(durations[(cluster_of == cid) & reliable].sum())
                    for cid in set(cluster_of[rel_pos].tolist())
                }
                strong = {cid for cid, tot in cluster_total.items() if tot >= min_total_secs}
                if strong and len(strong) < len(cluster_total):
                    strong_pos = rel_pos[np.isin(cluster_of[rel_pos], list(strong))]
                    s_starts, s_ends = starts[strong_pos], ends[strong_pos]
                    for p in rel_pos:
                        if int(cluster_of[p]) in strong:
                            continue
                        gap = np.maximum.reduce(
                            [s_starts - ends[p], starts[p] - s_ends, np.zeros(len(strong_pos))]
                        )
                        cluster_of[p] = cluster_of[strong_pos[int(np.argmin(gap))]]
            # Absorb each short segment into the nearest reliable segment by time
            # (gap is 0 when they overlap, else the silence between them).
            rel_starts, rel_ends = starts[rel_pos], ends[rel_pos]
            for sp in np.where(~reliable)[0]:
                gap = np.maximum.reduce(
                    [rel_starts - ends[sp], starts[sp] - rel_ends, np.zeros(len(rel_pos))]
                )
                cluster_of[sp] = cluster_of[rel_pos[int(np.argmin(gap))]]

        # Stable SPEAKER_NN labels, ordered by first appearance in time.
        label_map: dict[int, str] = {}
        for pos in range(n):
            cid = int(cluster_of[pos])
            if cid not in label_map:
                label_map[cid] = f"SPEAKER_{len(label_map):02d}"

        per_segment_labels: list[str | None] = [None] * len(segments)
        for pos, si in enumerate(present_seg_indices):
            per_segment_labels[si] = label_map[int(cluster_of[pos])]

        # Speaker centroid vectors — from reliable segments only (fall back to all
        # of a cluster's segments if it somehow has none), then re-normalized.
        speaker_vectors: dict[str, list[float]] = {}
        for cid, spk in label_map.items():
            cluster_mask = cluster_of == cid
            use = cluster_mask & reliable
            if not use.any():
                use = cluster_mask
            centroid = seg_embeddings[use].mean(axis=0)
            nrm = np.linalg.norm(centroid)
            if nrm > 0:
                centroid = centroid / nrm
            speaker_vectors[spk] = centroid.astype(np.float32).tolist()

        return per_segment_labels, speaker_vectors


def _agglomerative(
    embeddings: np.ndarray,
    n_clusters: int | None,
    distance_threshold: float,
    max_speakers: int | None,
) -> np.ndarray:
    """Average-linkage cosine agglomerative clustering. With `n_clusters` set
    (capped to the sample count) it forces exactly that many; otherwise it cuts
    at `distance_threshold` and caps the result to `max_speakers`."""
    if embeddings.shape[0] == 1:
        return np.zeros(1, dtype=np.int64)
    if n_clusters is not None:
        n_clusters = min(n_clusters, embeddings.shape[0])
    clustering = AgglomerativeClustering(
        n_clusters=n_clusters,
        distance_threshold=None if n_clusters is not None else distance_threshold,
        metric="cosine",
        linkage="average",
    )
    labels = clustering.fit_predict(embeddings)
    if n_clusters is None and max_speakers is not None and len(set(labels)) > max_speakers:
        labels = _cap_clusters(embeddings, labels, max_speakers)
    return labels


def _cap_clusters(embeddings: np.ndarray, labels: np.ndarray, max_speakers: int) -> np.ndarray:
    """Reduce label count to at most `max_speakers` by merging smallest clusters first."""
    labels = labels.copy()
    while len(set(labels)) > max_speakers:
        # Count cluster sizes.
        unique, counts = np.unique(labels, return_counts=True)
        order = np.argsort(counts)
        smallest = unique[order[0]]

        # Centroid of `smallest`.
        small_centroid = embeddings[labels == smallest].mean(axis=0)
        small_centroid = small_centroid / max(np.linalg.norm(small_centroid), 1e-9)

        # Best other cluster to merge into.
        best_other, best_score = None, -np.inf
        for other in unique:
            if other == smallest:
                continue
            c = embeddings[labels == other].mean(axis=0)
            c = c / max(np.linalg.norm(c), 1e-9)
            score = float(np.dot(small_centroid, c))
            if score > best_score:
                best_score = score
                best_other = other

        if best_other is None:
            raise RuntimeError("no other cluster found to merge with")
        labels[labels == smallest] = best_other
    return labels


def assign_word_speakers(segments: list[dict]) -> None:
    """Propagate each segment's speaker to its words in-place."""
    for seg in segments:
        spk = seg.get("speaker")
        if spk is None:
            continue
        for word in seg.get("words", []):
            word["speaker"] = spk
