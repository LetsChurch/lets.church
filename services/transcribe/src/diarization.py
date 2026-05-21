"""Speaker diarization using NVIDIA NeMo titanet embeddings + clustering.

Pipeline:
  1. Slice each whisper segment into overlapping fixed-size windows.
  2. Extract a titanet_large embedding (192-dim) for each window.
  3. Agglomerative-cluster the L2-normalized embeddings using cosine distance.
  4. Assign each whisper segment / word the majority cluster of its windows.
  5. Per cluster, average the normalized window embeddings to produce a speaker vector.

This intentionally does not depend on pyannote — VAD is provided upstream by
faster-whisper's `vad_filter=True`, so whisper segment timings define the
candidate speech intervals.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import torch
from sklearn.cluster import AgglomerativeClustering
from sklearn.preprocessing import normalize

from .audio import SAMPLE_RATE

logger = logging.getLogger(__name__)


@dataclass
class _Window:
    seg_index: int
    start: float
    end: float


def _windows_for_segment(
    seg_index: int,
    start: float,
    end: float,
    window_size: float,
    hop: float,
) -> list[_Window]:
    duration = end - start
    if duration <= 0:
        return []
    if duration <= window_size:
        return [_Window(seg_index, start, end)]

    windows: list[_Window] = []
    t = start
    while t + window_size <= end:
        windows.append(_Window(seg_index, t, t + window_size))
        t += hop
    # Tail window so we cover up to `end`.
    if windows and windows[-1].end < end - 0.05:
        windows.append(_Window(seg_index, max(start, end - window_size), end))
    return windows


def _slice_audio(audio: np.ndarray, start: float, end: float, sr: int) -> np.ndarray:
    f1 = max(0, int(start * sr))
    f2 = min(audio.shape[0], int(end * sr))
    return audio[f1:f2]


class TitanetDiarizer:
    """Diarization built on top of NeMo's titanet_large speaker encoder."""

    def __init__(
        self,
        device: str = "cpu",
        model_name: str = "nvidia/speakerverification_en_titanet_large",
        window_size: float = 1.5,
        hop: float = 0.75,
        min_window_size: float = 0.5,
    ):
        from nemo.collections.asr.models import EncDecSpeakerLabelModel

        logger.info(f"Loading titanet speaker model: {model_name}")
        self.device = device
        self.window_size = window_size
        self.hop = hop
        self.min_window_size = min_window_size

        self.model = EncDecSpeakerLabelModel.from_pretrained(model_name)
        self.model = self.model.to(device)
        self.model.eval()
        logger.info("titanet model loaded")

    @torch.inference_mode()
    def _embed(self, chunk: np.ndarray) -> np.ndarray:
        """Compute a single titanet embedding for one audio chunk."""
        if chunk.shape[0] < int(self.min_window_size * SAMPLE_RATE):
            pad = int(self.min_window_size * SAMPLE_RATE) - chunk.shape[0]
            chunk = np.pad(chunk, (0, pad))

        signal = torch.from_numpy(chunk).unsqueeze(0).to(self.device).float()
        length = torch.tensor([chunk.shape[0]], device=self.device)
        _logits, emb = self.model.forward(input_signal=signal, input_signal_length=length)
        return emb.squeeze(0).cpu().numpy()

    def diarize(
        self,
        audio: np.ndarray,
        segments: list[dict],
        sr: int = SAMPLE_RATE,
        min_speakers: int | None = None,
        max_speakers: int | None = 8,
        distance_threshold: float = 0.7,
    ) -> tuple[list[str | None], dict[str, list[float]]]:
        """Assign a speaker label per whisper segment.

        Returns:
            (per_segment_labels, speaker_vectors) where speaker_vectors maps
            "SPEAKER_NN" to a 192-dim list[float] representing that speaker's
            mean normalized titanet embedding.
        """
        if not segments:
            return [], {}

        # Build windows that cover every segment.
        windows: list[_Window] = []
        for i, seg in enumerate(segments):
            windows.extend(
                _windows_for_segment(i, seg["start"], seg["end"], self.window_size, self.hop)
            )

        if not windows:
            return [None] * len(segments), {}

        # Embed each window.
        embeddings = np.stack(
            [self._embed(_slice_audio(audio, w.start, w.end, sr)) for w in windows]
        )
        embeddings = normalize(embeddings)

        # Cluster.
        n_unique = embeddings.shape[0]
        if n_unique == 1:
            cluster_labels = np.zeros(1, dtype=np.int64)
        else:
            n_clusters: int | None = None
            if min_speakers is not None and min_speakers == max_speakers:
                n_clusters = min_speakers

            clustering = AgglomerativeClustering(
                n_clusters=n_clusters,
                distance_threshold=None if n_clusters is not None else distance_threshold,
                metric="cosine",
                linkage="average",
            )
            cluster_labels = clustering.fit_predict(embeddings)

            # Cap the number of speakers if requested by merging the smallest clusters
            # into the nearest larger one. Cheap heuristic, matches what pyannote does
            # downstream when min/max_speakers are specified.
            if max_speakers is not None and len(set(cluster_labels)) > max_speakers:
                cluster_labels = _cap_clusters(embeddings, cluster_labels, max_speakers)
            if min_speakers is not None and len(set(cluster_labels)) < min_speakers:
                # Can't synthesize speakers; just leave as-is.
                pass

        # Map cluster ids to stable SPEAKER_NN labels, ordered by first appearance.
        label_map: dict[int, str] = {}
        for cid in cluster_labels:
            if cid not in label_map:
                label_map[cid] = f"SPEAKER_{len(label_map):02d}"

        # Per-segment label = majority window label, breaking ties by total window duration.
        per_segment_labels: list[str | None] = [None] * len(segments)
        seg_window_votes: list[dict[str, float]] = [{} for _ in segments]
        for w, cid in zip(windows, cluster_labels, strict=True):
            spk = label_map[int(cid)]
            seg_window_votes[w.seg_index][spk] = seg_window_votes[w.seg_index].get(spk, 0.0) + (
                w.end - w.start
            )
        for i, votes in enumerate(seg_window_votes):
            if votes:
                per_segment_labels[i] = max(votes.items(), key=lambda kv: kv[1])[0]

        # Speaker centroid vectors (mean of normalized embeddings, then re-normalized).
        speaker_vectors: dict[str, list[float]] = {}
        for cid, spk in label_map.items():
            mask = cluster_labels == cid
            if not mask.any():
                continue
            centroid = embeddings[mask].mean(axis=0)
            n = np.linalg.norm(centroid)
            if n > 0:
                centroid = centroid / n
            speaker_vectors[spk] = centroid.astype(np.float32).tolist()

        return per_segment_labels, speaker_vectors


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

        assert best_other is not None
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
